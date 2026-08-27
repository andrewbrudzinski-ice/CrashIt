import type { VehicleBuild } from '../parts/types';

/** Default build budget in dollars. */
export const BUILD_BUDGET = 30000;

const PAINT_COLORS = [
  '#d92b2b', '#2b6cd9', '#ffcc33', '#2fbf71', '#e8edf4',
  '#1a1d24', '#ff6b1a', '#9b7bff', '#37e0d8', '#8a3ffc',
];

let counter = 0;
/** Compact unique id (timestamp + counter + random), URL-safe. */
export function makeId(prefix = 'v'): string {
  counter = (counter + 1) % 0xffff;
  const t = Date.now().toString(36);
  const r = Math.floor(Math.random() * 0xffff).toString(36);
  return `${prefix}_${t}${counter.toString(36)}${r}`;
}

/** Short human-facing share code, e.g. "7F42A". Derived from the build id. */
export function shareCode(id: string): string {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const hex = (h >>> 0).toString(16).toUpperCase().padStart(8, '0');
  return hex.slice(0, 5);
}

export function randomPaint(): string {
  return PAINT_COLORS[Math.floor(Math.random() * PAINT_COLORS.length)];
}

export { PAINT_COLORS };

/** A sensible starter build the player can immediately tweak. */
export function createDefaultBuild(name = 'New Build'): VehicleBuild {
  const now = Date.now();
  return {
    id: makeId(),
    name,
    color: randomPaint(),
    parts: {
      chassis: 'chassis.sedan',
      engine: 'engine.medium.ice',
      transmission: 'trans.auto',
      drivetrain: 'drive.fwd',
      suspension: 'susp.normal',
      tires: 'tire.street',
      brakes: 'brake.standard',
      body: 'body.standard',
    },
    safety: ['safety.belts', 'safety.airbags'],
    aero: [],
    createdAt: now,
    updatedAt: now,
  };
}

/** An empty build for from-scratch construction. */
export function createEmptyBuild(name = 'Untitled'): VehicleBuild {
  const now = Date.now();
  return {
    id: makeId(),
    name,
    color: randomPaint(),
    parts: {},
    safety: [],
    aero: [],
    createdAt: now,
    updatedAt: now,
  };
}

/** Deep-ish clone of a build with a fresh id/name. */
export function cloneBuild(build: VehicleBuild, name?: string): VehicleBuild {
  const now = Date.now();
  return {
    ...build,
    id: makeId(),
    name: name ?? `${build.name} copy`,
    parts: { ...build.parts },
    safety: [...build.safety],
    aero: [...build.aero],
    createdAt: now,
    updatedAt: now,
  };
}
