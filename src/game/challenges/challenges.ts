import type { VehicleStats } from '../vehicle/deriveStats';
import type { CrashResult } from '../crash/crashModel';
import { kmhToMph } from '../../lib/format';

/**
 * Challenge system. Each challenge pins a scenario and a set of measurable
 * goals evaluated against the build's stats + crash result. Data-driven: add a
 * challenge by adding an entry. Completing a challenge can unlock parts and
 * gate later challenges — this is the game's progression spine.
 */

export type GoalMetric =
  | 'survival' | 'cabinIntrusion' | 'peakDecel' | 'safetyOverall'
  | 'brakingDistance' | 'topSpeed' | 'zeroToSixty'
  | 'cost' | 'mass' | 'powerToWeight';

export interface ChallengeGoal {
  metric: GoalMetric;
  cmp: 'lte' | 'gte';
  target: number;
  label: string;
  unit: string;
}

export interface Challenge {
  id: string;
  name: string;
  brief: string;
  icon: string;
  scenarioId: string;
  /** Locked scenario parameters for this challenge. */
  params: Record<string, number>;
  goals: ChallengeGoal[];
  tier: number;
  /** Available from the start? */
  startUnlocked?: boolean;
  /** Prerequisite challenge id (must be completed to unlock this one). */
  requires?: string;
  /** Rewards granted on first completion. */
  reward?: { parts?: string[]; label: string };
}

// Design rule: every challenge must be completable with parts that are already
// unlocked when it becomes available — a challenge never requires the part it
// itself rewards. Rewards unlock parts that help *later* challenges.
export const CHALLENGES: Challenge[] = [
  {
    id: 'ch.first-crash', name: 'First Contact', icon: '🚧',
    brief: 'Survive a 40 mph frontal barrier.',
    scenarioId: 'frontal', params: { speed: 64, angle: 0 },
    tier: 1, startUnlocked: true,
    goals: [
      { metric: 'survival', cmp: 'gte', target: 60, label: 'Driver survives', unit: '%' },
    ],
    reward: { parts: ['safety.rollcage'], label: 'Roll Cage' },
  },
  {
    id: 'ch.budget-tank', name: 'Budget Tank', icon: '💰',
    brief: 'Survive 50 mph — build under $20,000.',
    scenarioId: 'frontal', params: { speed: 80, angle: 0 },
    tier: 1, startUnlocked: true,
    goals: [
      { metric: 'cost', cmp: 'lte', target: 20000, label: 'Build cost', unit: '$' },
      { metric: 'survival', cmp: 'gte', target: 55, label: 'Driver survives', unit: '%' },
    ],
    reward: { parts: ['safety.cabin'], label: 'Reinforced Cabin Cell' },
  },
  {
    id: 'ch.short-stop', name: 'Short Stop', icon: '🛑',
    brief: 'Stop from 100 km/h in under 38 m.',
    scenarioId: 'braking', params: { speed: 100 },
    tier: 1, startUnlocked: true,
    goals: [
      { metric: 'brakingDistance', cmp: 'lte', target: 38, label: 'Braking distance', unit: 'm' },
    ],
    reward: { parts: ['brake.race'], label: 'Carbon-Ceramic Brakes' },
  },
  {
    id: 'ch.lightweight', name: 'Featherweight', icon: '🪶',
    brief: 'Survive 45 mph under 1,300 kg.',
    scenarioId: 'frontal', params: { speed: 72, angle: 0 },
    tier: 2, requires: 'ch.first-crash',
    goals: [
      { metric: 'mass', cmp: 'lte', target: 1300, label: 'Mass', unit: 'kg' },
      { metric: 'survival', cmp: 'gte', target: 50, label: 'Driver survives', unit: '%' },
    ],
    reward: { parts: ['susp.race'], label: 'Race Coilovers' },
  },
  {
    id: 'ch.rollover', name: 'Stay Upright', icon: '🔄',
    brief: 'Take a rollover and keep the cabin intact.',
    scenarioId: 'rollover', params: { speed: 80, turnAngle: 25 },
    tier: 2, requires: 'ch.first-crash',
    goals: [
      { metric: 'survival', cmp: 'gte', target: 55, label: 'Driver survives', unit: '%' },
      { metric: 'safetyOverall', cmp: 'gte', target: 60, label: 'Safety rating', unit: '' },
    ],
    reward: { parts: ['trans.dct'], label: 'Performance DCT' },
  },
  {
    id: 'ch.power', name: 'Power Trip', icon: '⚡',
    brief: 'Reach 300+ hp/tonne, then survive 60 mph.',
    scenarioId: 'frontal', params: { speed: 96, angle: 0 },
    tier: 2, requires: 'ch.budget-tank',
    goals: [
      { metric: 'powerToWeight', cmp: 'gte', target: 300, label: 'Power-to-weight', unit: 'hp/t' },
      { metric: 'survival', cmp: 'gte', target: 45, label: 'Driver survives', unit: '%' },
    ],
    reward: { parts: ['engine.electric.perf'], label: 'Dual-Motor EV' },
  },
  {
    id: 'ch.speed', name: 'Top End', icon: '🏁',
    brief: 'Build a 300 km/h car that survives the wall.',
    scenarioId: 'wall', params: { speed: 200 },
    tier: 3, requires: 'ch.power',
    goals: [
      { metric: 'topSpeed', cmp: 'gte', target: 300, label: 'Top speed', unit: 'km/h' },
      { metric: 'survival', cmp: 'gte', target: 30, label: 'Driver survives', unit: '%' },
    ],
    reward: { parts: ['aero.active'], label: 'Active Aero' },
  },
  {
    id: 'ch.fortress', name: 'The Fortress', icon: '🏰',
    brief: 'Head-on at 80 mph. Peak decel under 45 G.',
    scenarioId: 'headon', params: { speed: 128, oncomingMass: 2000 },
    tier: 3, requires: 'ch.rollover',
    goals: [
      { metric: 'survival', cmp: 'gte', target: 65, label: 'Driver survives', unit: '%' },
      { metric: 'peakDecel', cmp: 'lte', target: 45, label: 'Peak deceleration', unit: 'G' },
    ],
    reward: { parts: ['chassis.monocoque'], label: 'Carbon Monocoque' },
  },
];

export const CHALLENGE_INDEX = new Map(CHALLENGES.map((c) => [c.id, c]));
export function getChallenge(id: string | null): Challenge | undefined {
  return id ? CHALLENGE_INDEX.get(id) : undefined;
}

/** Read a goal metric's value from stats + result. */
export function metricValue(metric: GoalMetric, stats: VehicleStats, result: CrashResult | null): number {
  switch (metric) {
    case 'survival': return result ? result.survival * 100 : 0;
    case 'cabinIntrusion': return result ? result.cabinIntrusionCm : 0;
    case 'peakDecel': return result ? result.peakDecelG : 0;
    case 'safetyOverall': return result ? result.safety.overall : 0;
    case 'brakingDistance': return stats.brakingDistanceM;
    case 'topSpeed': return stats.topSpeedKmh;
    case 'zeroToSixty': return stats.zeroToSixtyS;
    case 'cost': return stats.totalCost;
    case 'mass': return stats.mass;
    case 'powerToWeight': return stats.powerToWeight;
  }
}

export interface GoalEval {
  goal: ChallengeGoal;
  value: number;
  ok: boolean;
  /** 0..1 headroom past the target (0 = just met, 1 = smashed it). */
  headroom: number;
}

export interface ChallengeEval {
  passed: boolean;
  stars: number; // 0..3
  goals: GoalEval[];
}

function goalHeadroom(g: ChallengeGoal, value: number): number {
  // Normalize how far past the target we are, relative to the target's scale.
  const t = g.target || 1;
  if (g.cmp === 'gte') return Math.max(0, Math.min(1, (value - g.target) / (Math.abs(t) * 0.5)));
  return Math.max(0, Math.min(1, (g.target - value) / (Math.abs(t) * 0.5)));
}

/** Evaluate a build+result against a challenge. `result` may be null pre-crash. */
export function evaluateChallenge(
  challenge: Challenge,
  stats: VehicleStats,
  result: CrashResult | null,
): ChallengeEval {
  const goals: GoalEval[] = challenge.goals.map((goal) => {
    const value = metricValue(goal.metric, stats, result);
    const ok = goal.cmp === 'lte' ? value <= goal.target : value >= goal.target;
    return { goal, value, ok, headroom: goalHeadroom(goal, value) };
  });
  const passed = goals.every((g) => g.ok);
  let stars = 0;
  if (passed) {
    const quality = goals.reduce((s, g) => s + g.headroom, 0) / goals.length;
    stars = quality > 0.5 ? 3 : quality > 0.2 ? 2 : 1;
  }
  return { passed, stars, goals };
}

/** Whether a challenge is unlocked given the set of completed challenge ids. */
export function isChallengeUnlocked(c: Challenge, completed: Set<string>): boolean {
  if (c.startUnlocked) return true;
  return c.requires ? completed.has(c.requires) : false;
}

/** Format a goal value for display. */
export function formatGoalValue(metric: GoalMetric, value: number): string {
  switch (metric) {
    case 'cost': return '$' + Math.round(value).toLocaleString('en-US');
    case 'survival': case 'safetyOverall': return Math.round(value) + '';
    case 'topSpeed': return Math.round(value) + '';
    case 'mass': return Math.round(value).toLocaleString('en-US');
    case 'powerToWeight': case 'brakingDistance': case 'peakDecel': return value.toFixed(1);
    case 'cabinIntrusion': return Math.round(value) + '';
    case 'zeroToSixty': return value.toFixed(1);
    default: return Math.round(value) + '';
  }
}

/** Map each rewarded part id → the challenge that grants it (for unlock hints). */
export const PART_UNLOCK_SOURCE: Map<string, Challenge> = (() => {
  const m = new Map<string, Challenge>();
  for (const c of CHALLENGES) {
    for (const p of c.reward?.parts ?? []) m.set(p, c);
  }
  return m;
})();

export { kmhToMph };
