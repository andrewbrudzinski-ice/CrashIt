import type { VehicleStats } from '../vehicle/deriveStats';
import { getScenario, type ScenarioConfig, type ImpactAxis, type Scenario } from '../scenarios/scenarios';

/**
 * Analytical crash model. Turns a vehicle's derived stats + a scenario into
 * an engineering outcome using physically-motivated relationships (energy,
 * crush work, occupant deceleration). Fully deterministic — the same build
 * and scenario always produce the same result, which is what makes replays
 * and shareable crashes reproducible.
 *
 * This is a game simulation, not a real-world safety certification.
 */

const G = 9.81;
/** Newtons of crush resistance per unit of structural strength. Tuned for feel. */
const FORCE_PER_STRENGTH = 3600;
/** Cabin cell resists harder than crumple structure per unit. */
const CABIN_FORCE_MULT = 2.4;
/** Max plausible cabin intrusion depth, metres. */
const MAX_INTRUSION = 0.7;

export interface DamageMap {
  front: number; rear: number; left: number; right: number; roof: number;
  wheels: number; engine: number; battery: number; suspension: number;
  chassis: number; cabinIntrusion: number; // cm
}

export interface OccupantForces {
  headG: number;
  chestG: number;
  neckLoad: number; // 0..1 normalized
  legIntrusion: number; // cm
}

export interface SafetyScore {
  overall: number;
  structural: number;
  restraints: number;
  crumple: number;
  cabin: number;
  rollover: number;
}

export interface CrashResult {
  scenarioId: string;
  scenarioName: string;
  /** Impact/entry speed in km/h. */
  impactSpeedKmh: number;
  /** Peak vehicle deceleration in G. */
  peakDecelG: number;
  /** Peak deceleration the belted occupant experiences, in G. */
  occupantG: number;
  /** Cabin intrusion in cm. */
  cabinIntrusionCm: number;
  /** Primary deformation percentage 0..100. */
  deformationPct: number;
  /** Impact energy in kJ. */
  energyKj: number;
  /** 0..1 driver survival probability. */
  survival: number;
  /** 0..100 overall structural integrity remaining. */
  structuralIntegrity: number;
  primaryFailure: string;
  secondaryFailure: string | null;
  damage: DamageMap;
  occupant: OccupantForces;
  safety: SafetyScore;
  /** Extra scenario-specific outcome flags (e.g. rolls, stopped). */
  notes: string[];
  /** True for tests that ended without a destructive impact (clean stop). */
  survivedClean: boolean;
  weightDistLabel: string;
}

function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)); }
function logistic(x: number) { return 1 / (1 + Math.exp(-x)); }

const zeroDamage = (): DamageMap => ({
  front: 0, rear: 0, left: 0, right: 0, roof: 0, wheels: 0, engine: 0,
  battery: 0, suspension: 0, chassis: 0, cabinIntrusion: 0,
});

interface ImpactSolution {
  peakDecelG: number;
  crushUsedM: number;
  deformationPct: number;
  intrusionM: number;
  structureFailed: boolean;
}

/**
 * Core 1-D impact solver. Energy is absorbed first by the crumple structure
 * (force `crushForce` over `maxCrush`); any surplus intrudes into the cabin
 * cell (a stiffer, shorter-travel structure). Returns peak decel & intrusion.
 */
function solveImpact(
  massKg: number,
  vMs: number,
  crumpleM: number,
  chassisStrength: number,
  cabinStrength: number,
  crumpleEfficiency: number,
): ImpactSolution {
  const energy = 0.5 * massKg * vMs * vMs;
  const crushForce = chassisStrength * FORCE_PER_STRENGTH;
  const maxCrush = Math.max(0.05, crumpleM * crumpleEfficiency);
  const crumpleCapacity = crushForce * maxCrush;

  if (energy <= crumpleCapacity) {
    const crushUsed = energy / crushForce;
    return {
      peakDecelG: crushForce / massKg / G,
      crushUsedM: crushUsed,
      deformationPct: clamp((crushUsed / maxCrush) * 100, 0, 100),
      intrusionM: 0,
      structureFailed: false,
    };
  }

  // Crumple fully consumed; remaining energy attacks the cabin.
  const eRem = energy - crumpleCapacity;
  const cabinForce = cabinStrength * FORCE_PER_STRENGTH * CABIN_FORCE_MULT;
  const intrusion = clamp(eRem / cabinForce, 0, MAX_INTRUSION);
  // Peak decel is governed by the stiffer cabin once it engages.
  const peak = cabinForce / massKg / G;
  return {
    peakDecelG: peak,
    crushUsedM: maxCrush,
    deformationPct: 100,
    intrusionM: intrusion,
    structureFailed: intrusion > 0.12,
  };
}

/** Distribute a base severity to zones according to the impacted axis. */
function distributeDamage(base: number, axis: ImpactAxis, stats: VehicleStats): DamageMap {
  const d = zeroDamage();
  const wheelHit = clamp(base * 0.5, 0, 100);
  switch (axis) {
    case 'front':
      d.front = base;
      d.engine = stats.engineKind === 'electric' ? base * 0.4 : base * 0.8;
      d.battery = stats.engineKind !== 'ice' ? base * 0.5 : 0;
      d.wheels = wheelHit;
      d.suspension = base * 0.6;
      break;
    case 'rear':
      d.rear = base;
      d.battery = stats.engineKind === 'electric' ? base * 0.7 : 0;
      d.suspension = base * 0.4;
      break;
    case 'left':
      d.left = base;
      d.wheels = base * 0.3;
      break;
    case 'right':
      d.right = base;
      d.wheels = base * 0.3;
      break;
    case 'roof':
      d.roof = base;
      break;
  }
  d.chassis = base * 0.7;
  return d;
}

function safetyScore(stats: VehicleStats, res: Pick<CrashResult, 'peakDecelG' | 'cabinIntrusionCm' | 'occupantG'>): SafetyScore {
  const structural = clamp(20 + stats.chassisStrength * 0.85, 0, 100);
  const restraints = clamp(stats.restraint * 100, 0, 100);
  const crumple = clamp((stats.crumpleZone / 200) * 100, 0, 100);
  const cabin = clamp(100 - res.cabinIntrusionCm * 3 + stats.cabinStrength * 0.3, 0, 100);
  const rollover = clamp((stats.rolloverThreshold - 0.8) * 110 + stats.rolloverProtection * 30, 0, 100);
  const overall = clamp(
    structural * 0.22 + restraints * 0.24 + crumple * 0.18 + cabin * 0.24 + rollover * 0.12,
    0, 100,
  );
  return {
    overall: Math.round(overall),
    structural: Math.round(structural),
    restraints: Math.round(restraints),
    crumple: Math.round(crumple),
    cabin: Math.round(cabin),
    rollover: Math.round(rollover),
  };
}

function occupantForces(peakG: number, restraint: number, intrusionM: number, axis: ImpactAxis): OccupantForces {
  // Restraints spread deceleration over time, cutting the peak felt by the body.
  const reduction = 1 - restraint * 0.55;
  const bodyG = peakG * reduction;
  const neckEmphasis = axis === 'rear' ? 1.4 : axis === 'roof' ? 1.2 : 1;
  return {
    headG: Math.round(bodyG * 1.1 * 10) / 10,
    chestG: Math.round(bodyG * 10) / 10,
    neckLoad: clamp((bodyG / 60) * neckEmphasis, 0, 1),
    legIntrusion: Math.round(intrusionM * 100),
  };
}

function survivalProb(occupantG: number, intrusionCm: number, sideVuln = 0): number {
  // Logistic falloff: comfortable below ~35 G with no intrusion, grim above ~60 G.
  const x = 5.5 - occupantG * 0.11 - intrusionCm * 0.06 - sideVuln;
  return clamp(logistic(x), 0, 0.999);
}

function weightLabel(front: number): string {
  if (front > 0.6) return 'Front heavy';
  if (front < 0.46) return 'Rear heavy';
  return 'Balanced';
}

/** Effective closing/impact velocity (m/s) for the scenario. */
function impactVelocity(scn: Scenario, cfg: ScenarioConfig, stats: VehicleStats): { v: number; notes: string[]; clean?: boolean; residual?: number } {
  const notes: string[] = [];
  const speedKmh = cfg.params.speed ?? 0;
  const v = speedKmh / 3.6;
  switch (scn.kind) {
    case 'drop': {
      const h = cfg.params.height ?? 10;
      return { v: Math.sqrt(2 * G * h), notes: [`Fell ${h} m`] };
    }
    case 'jump': {
      const ramp = ((cfg.params.rampAngle ?? 20) * Math.PI) / 180;
      const vUp = v * Math.sin(ramp);
      const h = (vUp * vUp) / (2 * G);
      notes.push(`Airborne ~${h.toFixed(1)} m`);
      return { v: vUp, notes };
    }
    case 'headon': {
      const om = cfg.params.oncomingMass ?? 1500;
      // Effective barrier velocity via momentum sharing.
      const closing = v * (1 + om / (om + stats.mass));
      return { v: closing, notes: [`Closing ${(closing * 3.6).toFixed(0)} km/h`] };
    }
    case 'multicar': {
      const cars = cfg.params.cars ?? 3;
      notes.push(`${cars}-vehicle pileup`);
      return { v: v * (1 + (cars - 1) * 0.12), notes };
    }
    case 'side': {
      const bm = cfg.params.barrierMass ?? 1400;
      const eff = v * (bm / (bm + stats.mass)) * 1.6;
      return { v: eff, notes: [`${bm} kg barrier`] };
    }
    case 'braking': {
      const runway = 55; // metres of available road before the wall
      const decel = Math.max(0.5, (stats.brakingDistanceM > 0 ? (v * v) / (2 * stats.brakingDistanceM * Math.pow(v / (100 / 3.6), 0)) : 0));
      const stopDist = (stats.brakingDistanceM * (v * v)) / Math.pow(100 / 3.6, 2);
      if (stopDist <= runway) {
        notes.push(`Stopped in ${stopDist.toFixed(1)} m (${(runway - stopDist).toFixed(1)} m to spare)`);
        return { v: 0, notes, clean: true };
      }
      const residual = Math.sqrt(Math.max(0, v * v - 2 * decel * runway));
      notes.push(`Could not stop — ${stopDist.toFixed(0)} m needed, only ${runway} m`);
      return { v: residual, notes, residual };
    }
    default:
      if (cfg.params.angle) notes.push(`${cfg.params.angle}° oblique`);
      return { v, notes };
  }
}

export function computeCrash(stats: VehicleStats, cfg: ScenarioConfig): CrashResult | null {
  const scn = getScenario(cfg.scenarioId);
  if (!scn || !stats.valid) return null;

  const { v, notes, clean } = impactVelocity(scn, cfg, stats);
  const energyKj = (0.5 * stats.mass * v * v) / 1000;

  // ---- Clean stop (braking success) ----
  if (clean) {
    const safety = safetyScore(stats, { peakDecelG: 0, cabinIntrusionCm: 0, occupantG: 0 });
    return {
      scenarioId: scn.id, scenarioName: scn.name,
      impactSpeedKmh: 0, peakDecelG: 0, occupantG: 0, cabinIntrusionCm: 0,
      deformationPct: 0, energyKj: 0, survival: 0.999, structuralIntegrity: 100,
      primaryFailure: 'None — controlled stop', secondaryFailure: null,
      damage: zeroDamage(), occupant: occupantForces(0, stats.restraint, 0, 'front'),
      safety, notes, survivedClean: true, weightDistLabel: weightLabel(stats.weightDistFront),
    };
  }

  // ---- Rollover branch ----
  if (scn.kind === 'rollover') {
    const turn = ((cfg.params.turnAngle ?? 25) * Math.PI) / 180;
    const radius = Math.max(6, stats.wheelbase / Math.tan(turn));
    const lateralG = (v * v) / (radius * G);
    const rolls = lateralG > stats.rolloverThreshold;
    const excess = clamp((lateralG - stats.rolloverThreshold) / stats.rolloverThreshold, 0, 3);
    const rollCount = rolls ? Math.max(1, Math.round(excess * 2.2)) : 0;
    const base = rolls ? clamp(30 + excess * 35 - stats.rolloverProtection * 25, 0, 100) : clamp(lateralG * 20, 0, 40);
    const damage = distributeDamage(base, 'roof', stats);
    damage.roof = base;
    damage.wheels = clamp(base * 0.6, 0, 100);
    const peakG = rolls ? clamp(12 + excess * 14, 0, 60) : lateralG;
    const occ = occupantForces(peakG, stats.restraint, damage.cabinIntrusion / 100, 'roof');
    const survival = rolls
      ? survivalProb(occ.chestG, base * 0.3, (1 - stats.rolloverProtection) * 1.2)
      : 0.995;
    const safety = safetyScore(stats, { peakDecelG: peakG, cabinIntrusionCm: base * 0.3, occupantG: occ.chestG });
    notes.push(rolls ? `Rolled ${rollCount}× (${lateralG.toFixed(2)} g > ${stats.rolloverThreshold.toFixed(2)} g threshold)` : `Held the road (${lateralG.toFixed(2)} g)`);
    return {
      scenarioId: scn.id, scenarioName: scn.name,
      impactSpeedKmh: Math.round(v * 3.6), peakDecelG: Math.round(peakG * 10) / 10,
      occupantG: occ.chestG, cabinIntrusionCm: Math.round(base * 0.3),
      deformationPct: Math.round(base), energyKj: Math.round(energyKj),
      survival, structuralIntegrity: Math.round(clamp(100 - base, 0, 100)),
      primaryFailure: rolls ? 'Vehicle rollover' : 'None — maintained control',
      secondaryFailure: rolls && stats.rolloverProtection < 0.3 ? 'Roof crush — no rollover protection' : null,
      damage, occupant: occ, safety, notes, survivedClean: !rolls,
      weightDistLabel: weightLabel(stats.weightDistFront),
    };
  }

  // ---- Standard impact branch ----
  const crumpleEfficiency = clamp(scn.overlap * 1.0 + (scn.primaryAxis === 'left' || scn.primaryAxis === 'right' ? -0.6 : 0), 0.2, 1);
  // Side/roof impacts rely on cabin strength, not the front crumple structure.
  const isSide = scn.primaryAxis === 'left' || scn.primaryAxis === 'right';
  const structureForCrush = isSide ? stats.cabinStrength * 0.6 : stats.chassisStrength;
  const crumpleForImpact = isSide ? 0.1 : stats.crumpleZone / 100;

  const sol = solveImpact(
    stats.mass, v, crumpleForImpact, structureForCrush, stats.cabinStrength, crumpleEfficiency,
  );

  const intrusionCm = Math.round(sol.intrusionM * 100);
  const occ = occupantForces(sol.peakDecelG, stats.restraint, sol.intrusionM, scn.primaryAxis);
  const sideVuln = isSide ? (1 - stats.sideProtection) * 1.4 : 0;
  const survival = survivalProb(occ.chestG, intrusionCm, sideVuln);

  const base = clamp(sol.deformationPct * (0.5 + scn.overlap * 0.5) + (sol.structureFailed ? 20 : 0), 0, 100);
  const damage = distributeDamage(base, scn.primaryAxis, stats);
  damage.cabinIntrusion = intrusionCm;

  const structuralIntegrity = Math.round(clamp(100 - base * 0.7 - intrusionCm * 1.5, 0, 100));
  const safety = safetyScore(stats, { peakDecelG: sol.peakDecelG, cabinIntrusionCm: intrusionCm, occupantG: occ.chestG });

  // Failure diagnosis.
  let primary = 'Front structure absorbed impact';
  let secondary: string | null = null;
  if (sol.structureFailed) {
    primary = isSide ? 'Cabin cell breach — side intrusion' : 'Cabin intrusion — crumple zone overwhelmed';
  } else if (base > 80) {
    primary = 'Severe front-end deformation';
  } else if (base < 30) {
    primary = 'Minor deformation — structure held';
  }
  if (occ.chestG > 55) secondary = 'Occupant deceleration exceeded survivable limit';
  else if (damage.wheels > 70) secondary = 'Front suspension & wheel assembly destroyed';
  else if (stats.restraint < 0.3) secondary = 'Inadequate occupant restraint';
  else if (damage.battery > 60) secondary = 'Battery pack compromised';

  return {
    scenarioId: scn.id, scenarioName: scn.name,
    impactSpeedKmh: Math.round(v * 3.6),
    peakDecelG: Math.round(sol.peakDecelG * 10) / 10,
    occupantG: occ.chestG,
    cabinIntrusionCm: intrusionCm,
    deformationPct: Math.round(base),
    energyKj: Math.round(energyKj),
    survival,
    structuralIntegrity,
    primaryFailure: primary,
    secondaryFailure: secondary,
    damage,
    occupant: occ,
    safety,
    notes,
    survivedClean: false,
    weightDistLabel: weightLabel(stats.weightDistFront),
  };
}
