import { MULTI_CATEGORIES, SINGLE_CATEGORIES } from '../parts/types';
import type { Drivetrain, EngineKind, Part, PartEffects, Platform, VehicleBuild } from '../parts/types';
import { getPart } from '../parts/partsDatabase';

const G = 9.81; // m/s^2
const AIR_DENSITY = 1.225; // kg/m^3
const HP_TO_W = 745.7;

/** Fully derived, simulation-ready vehicle statistics. */
export interface VehicleStats {
  valid: boolean;
  /** Categories that still need a part selected before the build is testable. */
  missing: string[];

  // --- Mass & geometry ---
  mass: number; // kg
  wheelbase: number; // m
  trackWidth: number; // m
  length: number; // m
  height: number; // m
  cogHeight: number; // cm above ground
  rideHeight: number; // cm
  wheelScale: number; // wheel-radius multiplier (sandbox); 1 = stock
  weightDistFront: number; // 0..1 fraction on front axle
  /** Static rollover threshold ~ trackWidth / (2 * cogHeight). Higher = harder to tip. */
  rolloverThreshold: number;

  // --- Powertrain ---
  engineKind: EngineKind | null;
  drivetrain: Drivetrain | null;
  crankPowerHp: number;
  wheelPowerHp: number; // after driveline loss
  torqueNm: number;
  powerband: number; // 0 low-end .. 1 peaky
  drivetrainLoss: number; // 0..1

  // --- Grip / aero ---
  tireGrip: number; // effective peak friction coefficient
  dragCoefficient: number; // Cd
  frontalArea: number; // m^2
  downforceCoef: number; // N per (m/s)^2

  // --- Chassis / structure ---
  chassisStrength: number;
  cabinStrength: number;
  crumpleZone: number; // cm
  suspensionTravel: number; // cm
  suspensionStiffness: number; // N/mm
  rollResistance: number;
  steeringResponse: number; // 0..1
  durability: number; // 0..1 mean structural durability

  // --- Occupant protection inputs (0..1) ---
  restraint: number;
  rolloverProtection: number;
  sideProtection: number;

  // --- Derived performance ---
  powerToWeight: number; // hp per tonne
  topSpeedKmh: number;
  zeroToSixtyS: number; // 0-60 mph
  brakingDistanceM: number; // 100 km/h -> 0
  lateralG: number; // steady-state cornering grip in g

  // --- Economics ---
  totalCost: number;
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

/** Resolve every installed part for a build (single + multi categories). */
export function resolveInstalledParts(build: VehicleBuild): Part[] {
  const parts: Part[] = [];
  for (const cat of SINGLE_CATEGORIES) {
    const p = getPart(build.parts[cat]);
    if (p) parts.push(p);
  }
  for (const cat of MULTI_CATEGORIES) {
    const ids = (build as unknown as Record<string, string[]>)[cat] ?? [];
    for (const id of ids) {
      const p = getPart(id);
      if (p) parts.push(p);
    }
  }
  return parts;
}

/** Sum a numeric effect field across parts (additive). */
function sumEffect(parts: Part[], key: keyof PartEffects): number {
  let total = 0;
  for (const p of parts) {
    const v = p.effects?.[key];
    if (typeof v === 'number') total += v;
  }
  return total;
}

/** Multiply an effect field across parts (identity 1). */
function mulEffect(parts: Part[], key: keyof PartEffects): number {
  let total = 1;
  for (const p of parts) {
    const v = p.effects?.[key];
    if (typeof v === 'number') total *= v;
  }
  return total;
}

/**
 * Estimate 0-60 mph time via lightweight forward integration.
 * Blends a traction-limited launch (grip on the driven axle, with a crude
 * dynamic weight-transfer term) into a power-limited pull.
 */
function estimateZeroToSixty(
  massKg: number,
  wheelPowerW: number,
  grip: number,
  drivetrain: Drivetrain | null,
  weightDistFront: number,
  cogHeight: number,
  wheelbase: number,
): number {
  const target = 26.82; // 60 mph in m/s
  const cogM = cogHeight / 100;
  let v = 0.001;
  let t = 0;
  const dt = 0.01;
  const maxT = 30;
  while (v < target && t < maxT) {
    // Longitudinal weight transfer under acceleration (approx, uses prev accel).
    const aPrev = wheelPowerW / (massKg * Math.max(v, 1)); // rough
    const transfer = clamp((aPrev * cogM) / (G * wheelbase), -0.35, 0.35);
    let drivenFrac: number;
    if (drivetrain === 'AWD') drivenFrac = 1;
    else if (drivetrain === 'RWD') drivenFrac = 1 - weightDistFront + transfer;
    else drivenFrac = weightDistFront - transfer; // FWD loses front load as it squats
    drivenFrac = clamp(drivenFrac, 0.15, 1);

    const tractionForce = grip * G * massKg * drivenFrac;
    const powerForce = wheelPowerW / v;
    const drag = 0.5 * AIR_DENSITY * 0.3 * 2.2 * v * v; // nominal aero resist
    const force = Math.min(tractionForce, powerForce) - drag;
    const a = force / massKg;
    if (a <= 0) break;
    v += a * dt;
    t += dt;
  }
  return t >= maxT ? maxT : t;
}

/** Solve top speed where power output balances drag + rolling resistance. */
function estimateTopSpeed(
  wheelPowerW: number,
  massKg: number,
  cd: number,
  frontalArea: number,
  downforceCoef: number,
  rollRes: number,
): number {
  // Bisection on v where P = (dragForce + rollForce + downforceDrag) * v.
  let lo = 1;
  let hi = 180; // m/s upper bound (~648 km/h)
  for (let i = 0; i < 40; i++) {
    const v = (lo + hi) / 2;
    const dragF = 0.5 * AIR_DENSITY * cd * frontalArea * v * v;
    const normal = massKg * G + downforceCoef * v * v;
    const rollF = rollRes * normal;
    const needed = (dragF + rollF) * v;
    if (needed > wheelPowerW) hi = v;
    else lo = v;
  }
  return lo * 3.6; // km/h
}

export function deriveStats(build: VehicleBuild): VehicleStats {
  // Determine missing required categories.
  const missing: string[] = [];
  for (const cat of SINGLE_CATEGORIES) {
    if (!getPart(build.parts[cat])) missing.push(cat);
  }

  const parts = resolveInstalledParts(build);
  const chassis = getPart(build.parts.chassis);
  const platform: Platform = chassis?.platform ?? {
    baseMass: 1000, wheelbase: 2.6, trackWidth: 1.55, length: 4.3, height: 1.45,
    baseRideHeight: 15, baseCogHeight: 55, baseWeightDist: 0.58, baseDrag: 0.32,
    frontalArea: 2.2, baseChassisStrength: 50, seats: 4, baseCrumpleZone: 60,
  };

  const engine = getPart(build.parts.engine);
  const driveP = getPart(build.parts.drivetrain);

  // Sandbox tuning (identity when absent).
  const tun = build.tuning;
  const wheelScale = tun ? clamp(tun.wheelScale, 0.3, 3) : 1;

  // --- Mass & geometry ---
  let mass = Math.max(300, platform.baseMass + sumEffect(parts, 'mass'));
  const weightDistFront = clamp(platform.baseWeightDist + sumEffect(parts, 'frontBiasDelta'), 0.35, 0.72);
  let cogHeight = Math.max(20, platform.baseCogHeight + sumEffect(parts, 'cogHeightDelta'));
  const rideHeight = Math.max(4, platform.baseRideHeight + sumEffect(parts, 'rideHeightDelta'));

  // --- Powertrain ---
  const drivetrainLoss = clamp(sumEffect(parts, 'drivetrainLoss'), 0, 0.5);
  let crankPowerHp = sumEffect(parts, 'powerHp');
  const torqueNm = sumEffect(parts, 'torqueNm');
  const powerband = clamp(sumEffect(parts, 'powerband'), 0, 1);

  // --- Grip / aero ---
  let tireGrip = clamp(sumEffect(parts, 'gripAdd') * mulEffect(parts, 'gripMul'), 0.4, 1.8);
  const dragCoefficient = clamp(platform.baseDrag * mulEffect(parts, 'dragMul'), 0.15, 0.7);
  let downforceCoef = Math.max(0, sumEffect(parts, 'downforce'));
  const frontalArea = platform.frontalArea;

  // Apply sandbox tuning to the physical inputs before deriving performance.
  if (tun) {
    mass = Math.max(150, mass * clamp(tun.massMul, 0.2, 4));
    crankPowerHp *= clamp(tun.powerMul, 0.1, 6);
    tireGrip = clamp(tireGrip * clamp(tun.gripMul, 0.2, 3), 0.1, 4);
    downforceCoef = Math.max(0, downforceCoef * clamp(tun.downforceMul, 0, 6));
    cogHeight = Math.max(8, cogHeight + tun.cogDelta);
  }
  const wheelPowerHp = crankPowerHp * (1 - drivetrainLoss);
  const rolloverThreshold = (platform.trackWidth * 100) / (2 * cogHeight);

  // --- Structure ---
  const chassisStrength = Math.max(10, platform.baseChassisStrength + sumEffect(parts, 'chassisStrength'));
  const cabinStrength = Math.max(10, platform.baseChassisStrength * 0.6 + sumEffect(parts, 'cabinStrength'));
  const crumpleZone = Math.max(10, platform.baseCrumpleZone + sumEffect(parts, 'crumpleZone'));
  const suspensionTravel = Math.max(2, sumEffect(parts, 'suspTravel'));
  const suspensionStiffness = Math.max(5, sumEffect(parts, 'suspStiffness'));
  const rollResistance = clamp(sumEffect(parts, 'rollResistance') || 0.012, 0.008, 0.03);
  const steeringResponse = clamp(0.5 + sumEffect(parts, 'steeringResponse'), 0.1, 1);
  const durability = parts.length
    ? clamp(parts.reduce((s, p) => s + p.durability, 0) / parts.length, 0, 1)
    : 0.5;

  const restraint = clamp(sumEffect(parts, 'restraint'), 0, 1);
  const rolloverProtection = clamp(sumEffect(parts, 'rolloverProtection'), 0, 1);
  const sideProtection = clamp(sumEffect(parts, 'sideProtection'), 0, 1);

  // --- Derived performance ---
  const powerToWeight = wheelPowerHp / (mass / 1000);
  const wheelPowerW = wheelPowerHp * HP_TO_W;
  const drivetrain = driveP?.drivetrain ?? null;

  const valid = missing.length === 0 && wheelPowerHp > 0;

  const topSpeedKmh = valid
    ? estimateTopSpeed(wheelPowerW, mass, dragCoefficient, frontalArea, downforceCoef, rollResistance)
    : 0;
  const zeroToSixtyS = valid
    ? estimateZeroToSixty(mass, wheelPowerW, tireGrip, drivetrain, weightDistFront, cogHeight, platform.wheelbase)
    : 0;

  // Braking 100->0 km/h. decel limited by min(brake capacity, grip*g).
  const brakingKn = sumEffect(parts, 'brakingKn');
  const v100 = 100 / 3.6;
  const gripDecel = tireGrip * G; // ignore downforce at low decel speeds for simplicity
  const brakeDecel = (brakingKn * 1000) / mass;
  const decel = Math.max(0.5, Math.min(gripDecel, brakeDecel));
  const brakingDistanceM = (v100 * v100) / (2 * decel);

  const lateralG = tireGrip; // steady-state ~ grip coefficient (in g)

  const totalCost = parts.reduce((s, p) => s + p.cost, 0);

  return {
    valid,
    missing,
    mass,
    wheelbase: platform.wheelbase,
    trackWidth: platform.trackWidth,
    length: platform.length,
    height: platform.height,
    cogHeight,
    rideHeight,
    wheelScale,
    weightDistFront,
    rolloverThreshold,
    engineKind: engine?.engineKind ?? null,
    drivetrain,
    crankPowerHp,
    wheelPowerHp,
    torqueNm,
    powerband,
    drivetrainLoss,
    tireGrip,
    dragCoefficient,
    frontalArea,
    downforceCoef,
    chassisStrength,
    cabinStrength,
    crumpleZone,
    suspensionTravel,
    suspensionStiffness,
    rollResistance,
    steeringResponse,
    durability,
    restraint,
    rolloverProtection,
    sideProtection,
    powerToWeight,
    topSpeedKmh,
    zeroToSixtyS,
    brakingDistanceM,
    lateralG,
    totalCost,
  };
}
