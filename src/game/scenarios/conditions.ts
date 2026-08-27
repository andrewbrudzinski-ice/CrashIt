import type { VehicleStats } from '../vehicle/deriveStats';

/**
 * Environmental / random crash conditions — opt-in "simulation events" layered
 * on a scenario. Some (wet) adjust the scored stats through a clean grip
 * reduction; the dynamic ones (crosswind, blowout, brake fade) are applied
 * inside the 3D sim and are clearly flagged as simulation events, never real.
 */

export type ConditionId = 'wet' | 'crosswind' | 'blowout' | 'brakefade' | 'uneven';

export interface CrashCondition {
  id: ConditionId;
  name: string;
  icon: string;
  desc: string;
}

export const CONDITIONS: CrashCondition[] = [
  { id: 'wet', name: 'Wet Track', icon: '🌧️', desc: 'Standing water — grip drops, stopping distances grow.' },
  { id: 'crosswind', name: 'Crosswind', icon: '💨', desc: 'A steady side gust pushes the car off line.' },
  { id: 'blowout', name: 'Tire Blowout', icon: '💥', desc: 'A front tire lets go mid-run — the car pulls hard.' },
  { id: 'brakefade', name: 'Brake Fade', icon: '🔥', desc: 'Overheated brakes lose bite as the run goes on.' },
  { id: 'uneven', name: 'Uneven Surface', icon: '🪨', desc: 'A rough, broken surface unsettles the chassis.' },
];

export const CONDITION_INDEX = new Map(CONDITIONS.map((c) => [c.id, c]));

export function getCondition(id: string): CrashCondition | undefined {
  return CONDITION_INDEX.get(id as ConditionId);
}

/**
 * Returns a stats copy adjusted for the scored analysis. Only `wet` changes the
 * scoring (grip → braking/survival); the rest are sim-dynamic + narrative.
 */
export function conditionAdjustedStats(stats: VehicleStats, conditions: string[] | undefined): VehicleStats {
  if (!conditions || conditions.length === 0) return stats;
  let s = stats;
  if (conditions.includes('wet')) {
    const grip = s.tireGrip * 0.62;
    s = {
      ...s,
      tireGrip: grip,
      lateralG: grip,
      // Braking distance scales with 1/grip.
      brakingDistanceM: s.brakingDistanceM * (s.tireGrip / grip),
    };
  }
  return s;
}

/** Human notes appended to the crash report for the active conditions. */
export function conditionNotes(conditions: string[] | undefined): string[] {
  if (!conditions) return [];
  return conditions
    .map((id) => getCondition(id))
    .filter((c): c is CrashCondition => !!c)
    .map((c) => `${c.icon} ${c.name}: ${c.desc}`);
}

/** Deterministic 32-bit hash → seed, so a given condition set + scenario is reproducible. */
export function seedFrom(...parts: (string | number)[]): number {
  let h = 2166136261;
  const str = parts.join('|');
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Tiny seeded PRNG (mulberry32). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
