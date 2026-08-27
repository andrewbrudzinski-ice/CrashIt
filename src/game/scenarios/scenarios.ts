/**
 * Crash-test scenario definitions. Each scenario declares tunable parameters
 * (with ranges) and a `kind` the crash model & future physics simulation read.
 * Data-driven: add a scenario by adding an entry.
 */

export type ScenarioKind =
  | 'frontal' | 'offset' | 'side' | 'rear' | 'rollover'
  | 'wall' | 'headon' | 'braking' | 'jump' | 'drop' | 'multicar';

export type ImpactAxis = 'front' | 'rear' | 'left' | 'right' | 'roof';

export interface ScenarioParam {
  key: string;
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  default: number;
}

export interface Scenario {
  id: string;
  kind: ScenarioKind;
  name: string;
  tagline: string;
  /** Which structural zone takes the primary hit. */
  primaryAxis: ImpactAxis;
  /** Fraction of the front structure engaged (1 = full width, 0.4 = offset). */
  overlap: number;
  /** Emoji/marker for the picker. */
  icon: string;
  params: ScenarioParam[];
  /** Difficulty tier for progression (1 = intro). */
  tier: number;
  startUnlocked?: boolean;
}

const speedParam = (def = 64, max = 160): ScenarioParam => ({
  key: 'speed', label: 'Impact Speed', unit: 'km/h', min: 20, max, step: 2, default: def,
});

export const SCENARIOS: Scenario[] = [
  {
    id: 'frontal', kind: 'frontal', name: 'Frontal Barrier', tagline: 'Full-width rigid wall',
    primaryAxis: 'front', overlap: 1, icon: '🧱', tier: 1, startUnlocked: true,
    params: [
      speedParam(56),
      { key: 'angle', label: 'Impact Angle', unit: '°', min: 0, max: 30, step: 5, default: 0 },
    ],
  },
  {
    id: 'offset', kind: 'offset', name: 'Offset Deformable', tagline: '40% overlap frontal',
    primaryAxis: 'front', overlap: 0.4, icon: '⬛', tier: 2, startUnlocked: true,
    params: [speedParam(64)],
  },
  {
    id: 'side', kind: 'side', name: 'Side Impact', tagline: 'Perpendicular pole / barrier',
    primaryAxis: 'left', overlap: 0.5, icon: '🚙', tier: 2, startUnlocked: true,
    params: [
      speedParam(50, 100),
      { key: 'barrierMass', label: 'Barrier Mass', unit: 'kg', min: 500, max: 3000, step: 100, default: 1400 },
    ],
  },
  {
    id: 'rear', kind: 'rear', name: 'Rear Impact', tagline: 'Struck from behind',
    primaryAxis: 'rear', overlap: 1, icon: '💥', tier: 1, startUnlocked: true,
    params: [speedParam(50, 120)],
  },
  {
    id: 'rollover', kind: 'rollover', name: 'Rollover', tagline: 'Trip & roll on a curved ramp',
    primaryAxis: 'roof', overlap: 1, icon: '🔄', tier: 3,
    params: [
      speedParam(80, 140),
      { key: 'turnAngle', label: 'Steering', unit: '°', min: 10, max: 45, step: 5, default: 25 },
    ],
  },
  {
    id: 'wall', kind: 'wall', name: 'High-Speed Wall', tagline: 'Terminal velocity, zero mercy',
    primaryAxis: 'front', overlap: 1, icon: '🏎️', tier: 4,
    params: [speedParam(120, 320)],
  },
  {
    id: 'headon', kind: 'headon', name: 'Head-On', tagline: 'Two cars, one closing speed',
    primaryAxis: 'front', overlap: 0.7, icon: '🚗', tier: 3,
    params: [
      speedParam(80, 160),
      { key: 'oncomingMass', label: 'Oncoming Mass', unit: 'kg', min: 800, max: 4000, step: 100, default: 1500 },
    ],
  },
  {
    id: 'braking', kind: 'braking', name: 'Braking Test', tagline: 'Stop before the line',
    primaryAxis: 'front', overlap: 1, icon: '🛑', tier: 1, startUnlocked: true,
    params: [speedParam(100, 200)],
  },
  {
    id: 'jump', kind: 'jump', name: 'Ramp Jump', tagline: 'Launch & landing',
    primaryAxis: 'front', overlap: 0.8, icon: '🛫', tier: 3,
    params: [
      speedParam(90, 180),
      { key: 'rampAngle', label: 'Ramp Angle', unit: '°', min: 10, max: 45, step: 5, default: 20 },
    ],
  },
  {
    id: 'drop', kind: 'drop', name: 'Vertical Drop', tagline: 'Gravity test',
    primaryAxis: 'front', overlap: 1, icon: '⬇️', tier: 2,
    params: [{ key: 'height', label: 'Drop Height', unit: 'm', min: 2, max: 40, step: 1, default: 10 }],
  },
  {
    id: 'multicar', kind: 'multicar', name: 'Multi-Car Pileup', tagline: 'Chain reaction chaos',
    primaryAxis: 'front', overlap: 0.9, icon: '🚦', tier: 4,
    params: [
      speedParam(70, 140),
      { key: 'cars', label: 'Vehicles', unit: '', min: 2, max: 6, step: 1, default: 3 },
    ],
  },
];

export const SCENARIO_INDEX = new Map(SCENARIOS.map((s) => [s.id, s]));

export function getScenario(id: string): Scenario | undefined {
  return SCENARIO_INDEX.get(id);
}

/** A concrete scenario run: id + chosen parameter values. */
export interface ScenarioConfig {
  scenarioId: string;
  params: Record<string, number>;
  /** Active environmental/random condition ids (see conditions.ts). */
  conditions?: string[];
  /** Deterministic seed for random events, so replays reproduce. */
  seed?: number;
}

export function defaultConfig(s: Scenario): ScenarioConfig {
  const params: Record<string, number> = {};
  for (const p of s.params) params[p.key] = p.default;
  return { scenarioId: s.id, params };
}
