import RAPIER from '@dimforge/rapier3d-compat';
import type { VehicleStats } from '../vehicle/deriveStats';
import { getScenario, type ScenarioConfig } from '../scenarios/scenarios';
import { seedFrom, mulberry32 } from '../scenarios/conditions';

/**
 * Deterministic 3D crash pre-simulation.
 *
 * The whole crash is simulated once, up front, at a fixed timestep, and every
 * tracked-body transform is baked into a Float32Array. The renderer then just
 * plays the recording back — so scrubbing, slow-motion and replay are free and
 * identical every time, and physics never runs on the render thread. Because we
 * store the baked frames, a replay is bit-identical regardless of Rapier's own
 * determinism guarantees.
 *
 * Coordinate frame: +x = vehicle forward/travel, +y = up, +z = left.
 * Wheels are physics colliders welded to the chassis compound; they are not
 * tracked separately — the renderer places wheel meshes from the chassis
 * transform + `wheelLocal` offsets.
 */

const DT = 1 / 120;
const MAX_SECONDS = 5;
const MAX_FRAMES = Math.ceil(MAX_SECONDS / DT);
const FLOATS_PER_BODY = 7; // px,py,pz, qx,qy,qz,qw

export type BodyKind = 'chassis' | 'barrier' | 'car' | 'ramp' | 'pole';

export interface BodyDef {
  id: string;
  kind: BodyKind;
  /** Full box dimensions [x,y,z]. */
  size: [number, number, number];
  color?: string;
}

/** Static scenery (not simulated) that the renderer must draw. */
export interface PropDef {
  kind: 'ground' | 'barrier' | 'ramp' | 'curb' | 'pole';
  pos: [number, number, number];
  /** Full dimensions [x,y,z]. */
  size: [number, number, number];
  rot?: [number, number, number, number];
  color?: string;
}

export interface SimRecording {
  bodies: BodyDef[];
  frameCount: number;
  dt: number;
  /** frameCount × bodies.length × 7 floats. */
  transforms: Float32Array;
  /** Local wheel offsets from the chassis origin, for the renderer. */
  wheelLocal: number[][];
  wheelRadius: number;
  impactFrame: number;
  peakAccelG: number;
  impactSpeedKmh: number;
  scenarioKind: string;
  cameraTarget: string;
  clean: boolean;
  props: PropDef[];
}

let rapierReady: Promise<void> | null = null;
export function initRapier(): Promise<void> {
  if (!rapierReady) rapierReady = RAPIER.init();
  return rapierReady;
}

interface Tracked {
  def: BodyDef;
  rb: RAPIER.RigidBody;
}

const WHEEL_R = 0.32;
/** Wheel radius for a build (sandbox wheel-scale aware). */
function wheelR(stats: VehicleStats): number {
  return WHEEL_R * (stats.wheelScale ?? 1);
}

function quatAxis(x: number, y: number, z: number, angle: number) {
  const h = angle / 2, s = Math.sin(h);
  return { x: x * s, y: y * s, z: z * s, w: Math.cos(h) };
}

function chassisDims(stats: VehicleStats) {
  const L = Math.max(2, stats.length);
  const W = Math.max(1.2, stats.trackWidth + 0.25);
  const bodyH = Math.max(0.7, stats.height - 0.35);
  return { L, W, bodyH, hx: L / 2, hy: bodyH / 2, hz: W / 2 };
}

export function wheelLocalOffsets(stats: VehicleStats): number[][] {
  const { hx, hy, hz } = chassisDims(stats);
  const r = wheelR(stats);
  const wx = hx * 0.66, wz = hz + 0.02, wy = -hy + r * 0.4;
  return [[wx, wy, wz], [wx, wy, -wz], [-wx, wy, wz], [-wx, wy, -wz]];
}

function buildChassis(
  world: RAPIER.World,
  stats: VehicleStats,
  spawn: { x: number; y: number; z: number },
  vel: { x: number; y: number; z: number },
  angVel?: { x: number; y: number; z: number },
): { rb: RAPIER.RigidBody; def: BodyDef } {
  const { L, W, bodyH, hx, hy, hz } = chassisDims(stats);

  const desc = RAPIER.RigidBodyDesc.dynamic()
    .setTranslation(spawn.x, spawn.y, spawn.z)
    .setLinvel(vel.x, vel.y, vel.z)
    .setLinearDamping(0.05)
    .setAngularDamping(0.05)
    .setCcdEnabled(true);
  if (angVel) desc.setAngvel(angVel);
  const rb = world.createRigidBody(desc);

  // Body shell + a cabin block up top (near-zero density; real mass is set
  // explicitly below so CoG and inertia are physically meaningful).
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(hx, hy, hz).setDensity(0.0001).setFriction(0.6).setRestitution(0.2),
    rb,
  );
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(hx * 0.5, 0.28, hz * 0.86)
      .setTranslation(-L * 0.05, hy + 0.28, 0)
      .setDensity(0.0001).setFriction(0.6).setRestitution(0.2),
    rb,
  );
  // Welded wheels (physics contact + look).
  const r = wheelR(stats);
  for (const [px, py, pz] of wheelLocalOffsets(stats)) {
    world.createCollider(
      RAPIER.ColliderDesc.cylinder(0.12, r)
        .setRotation(quatAxis(1, 0, 0, Math.PI / 2))
        .setTranslation(px, py, pz)
        .setDensity(0.0001).setFriction(Math.max(0.7, Math.min(2, stats.tireGrip))).setRestitution(0.1),
      rb,
    );
  }

  // Explicit mass properties: mass, CoG height, box inertia.
  const m = stats.mass;
  const comY = stats.cogHeight / 100 - spawn.y;
  const Ix = (m / 12) * (bodyH * bodyH + W * W);
  const Iy = (m / 12) * (L * L + W * W);
  const Iz = (m / 12) * (L * L + bodyH * bodyH);
  rb.setAdditionalMassProperties(
    m,
    { x: 0, y: Math.max(-hy * 0.9, Math.min(hy * 1.5, comY)), z: 0 },
    { x: Ix, y: Iy, z: Iz },
    { x: 0, y: 0, z: 0, w: 1 },
    true,
  );

  return { rb, def: { id: 'chassis', kind: 'chassis', size: [L, bodyH, W], color: '#cfd6dd' } };
}

function staticBox(
  world: RAPIER.World, x: number, y: number, z: number,
  hx: number, hy: number, hz: number, friction = 0.8,
  rot?: { x: number; y: number; z: number; w: number },
) {
  const d = RAPIER.RigidBodyDesc.fixed().setTranslation(x, y, z);
  if (rot) d.setRotation(rot);
  const rb = world.createRigidBody(d);
  world.createCollider(RAPIER.ColliderDesc.cuboid(hx, hy, hz).setFriction(friction).setRestitution(0.1), rb);
  return rb;
}

function dynamicCar(
  world: RAPIER.World, x: number, y: number, z: number,
  hx: number, hy: number, hz: number, mass: number,
  vel: { x: number; y: number; z: number },
) {
  const rb = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic().setTranslation(x, y, z).setLinvel(vel.x, vel.y, vel.z).setCcdEnabled(true),
  );
  const vol = 8 * hx * hy * hz;
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(hx, hy, hz).setDensity(mass / vol).setFriction(0.6).setRestitution(0.15),
    rb,
  );
  return rb;
}

function assemble(world: RAPIER.World, stats: VehicleStats, cfg: ScenarioConfig, kind: string, impactMs: number, clean: boolean, conds: Set<string>) {
  const props: PropDef[] = [];
  staticBox(world, 0, -1, 0, 200, 1, 60, Math.max(0.7, stats.tireGrip)); // ground
  props.push({ kind: 'ground', pos: [0, -1, 0], size: [400, 2, 120], color: '#12161d' });
  const rideY = wheelR(stats) + stats.rideHeight / 100 + chassisDims(stats).bodyH / 2 - 0.1;

  /** Static box that also records a visual prop. */
  const prop = (
    kind: PropDef['kind'], x: number, y: number, z: number,
    hx: number, hy: number, hz: number, friction: number,
    rot?: { x: number; y: number; z: number; w: number }, color?: string,
  ) => {
    staticBox(world, x, y, z, hx, hy, hz, friction, rot);
    props.push({ kind, pos: [x, y, z], size: [hx * 2, hy * 2, hz * 2], rot: rot ? [rot.x, rot.y, rot.z, rot.w] : undefined, color });
  };

  const tracked: Tracked[] = [];
  const cameraTarget = 'chassis';

  const addChassis = (
    spawn: { x: number; y: number; z: number },
    vel: { x: number; y: number; z: number },
    angVel?: { x: number; y: number; z: number },
  ) => {
    const { rb, def } = buildChassis(world, stats, spawn, vel, angVel);
    tracked.push({ def, rb });
    return rb;
  };
  const addCar = (id: string, x: number, z: number, mass: number, vel: { x: number; y: number; z: number }, color: string) => {
    // Full-size opponents (~3.8 m) so they read at the same scale as the player.
    const rb = dynamicCar(world, x, rideY, z, 1.9, 0.6, 0.925, mass, vel);
    tracked.push({ def: { id, kind: 'car', size: [3.8, 1.2, 1.85], color }, rb });
  };

  switch (kind) {
    case 'drop':
      addChassis({ x: 0, y: (cfg.params.height ?? 10) + rideY, z: 0 }, { x: 0.4, y: 0, z: 0 }, { x: 0.15, y: 0, z: 0.1 });
      break;
    case 'jump': {
      const a = ((cfg.params.rampAngle ?? 20) * Math.PI) / 180;
      addChassis({ x: -10, y: rideY, z: 0 }, { x: impactMs, y: 0, z: 0 });
      prop('ramp', -2, Math.sin(a) * 1.5, 0, 2.5, 0.2, 4, 0.8, quatAxis(0, 0, 1, a), '#3a4450');
      break;
    }
    case 'rollover':
      addChassis({ x: -4, y: rideY, z: 0 }, { x: impactMs * 0.7, y: 0, z: impactMs * 0.5 });
      prop('curb', 3, 0.12, 3.2, 6, 0.12, 0.25, 1.2, undefined, '#5a6672'); // trip curb
      break;
    case 'side':
      addChassis({ x: 0, y: rideY, z: 0 }, { x: 0, y: 0, z: 0 });
      addCar('car', 0.2, 6, cfg.params.barrierMass ?? 1400, { x: 0, y: 0, z: -impactMs }, '#c0392b');
      break;
    case 'rear':
      addChassis({ x: 0, y: rideY, z: 0 }, { x: 0, y: 0, z: 0 });
      addCar('car', -6, 0, 1600, { x: impactMs, y: 0, z: 0 }, '#c0392b');
      break;
    case 'headon':
      addChassis({ x: -6, y: rideY, z: 0 }, { x: impactMs * 0.6, y: 0, z: 0 });
      addCar('car', 6, 0.1, cfg.params.oncomingMass ?? 1500, { x: -impactMs * 0.6, y: 0, z: 0 }, '#c0392b');
      break;
    case 'multicar': {
      addChassis({ x: -7, y: rideY, z: 0 }, { x: impactMs, y: 0, z: 0 });
      const cars = Math.round(cfg.params.cars ?? 3);
      for (let i = 0; i < cars - 1; i++) addCar(`car${i}`, 3 + i * 4.4, 0, 1400, { x: 0, y: 0, z: 0 }, i % 2 ? '#2980b9' : '#c0392b');
      break;
    }
    case 'offset':
      addChassis({ x: -6, y: rideY, z: 0 }, { x: impactMs, y: 0, z: 0 });
      prop('barrier', 2.4, 1, stats.trackWidth * 0.55, 0.4, 1.2, 1.2, 0.8, undefined, '#8a9099');
      break;
    case 'braking': {
      const runway = 55; // metres, matches the analytical model
      const stopDist = Math.max(3, stats.brakingDistanceM * Math.pow(impactMs / (100 / 3.6), 2));
      const startX = -20;
      const rb = addChassis({ x: startX, y: rideY, z: 0 }, { x: impactMs, y: 0, z: 0 });
      // Exponential damping tuned so the car sheds speed over ~stopDist.
      // Brake fade reduces the effective deceleration.
      rb.setLinearDamping((impactMs / stopDist) * (conds.has('brakefade') ? 0.55 : 1));
      // Finish line marker on the road.
      prop('curb', startX + runway, 0.02, 0, 0.15, 0.02, 3.4, 0.9, undefined, '#e8edf4');
      if (!clean) prop('barrier', startX + runway + 0.6, 1.2, 0, 0.5, 1.4, 3.2, 0.8, undefined, '#8a9099');
      break;
    }
    default: // frontal / wall
      addChassis({ x: -6, y: rideY, z: 0 }, { x: impactMs, y: 0, z: 0 });
      prop('barrier', 2.4, 1.2, 0, 0.5, 1.4, 3.2, 0.8, undefined, '#8a9099');
      break;
  }

  return { tracked, chassis: tracked[0].rb, cameraTarget, props };
}

export function simulateCrash(stats: VehicleStats, cfg: ScenarioConfig, clean: boolean): SimRecording {
  const scn = getScenario(cfg.scenarioId);
  const kind = scn?.kind ?? 'frontal';
  const impactMs = Math.max(1, (cfg.params.speed ?? 60) / 3.6);

  // Environmental conditions & seeded random events (reproducible for replays).
  const conds = new Set(cfg.conditions ?? []);
  const seed = cfg.seed ?? seedFrom(cfg.scenarioId, Math.round(cfg.params.speed ?? 0), [...conds].join(','));
  const rng = mulberry32(seed);
  // Wet reduces grip → lower collider friction throughout.
  const simStats: VehicleStats = conds.has('wet')
    ? { ...stats, tireGrip: Math.max(0.2, stats.tireGrip * 0.55) }
    : stats;

  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  world.timestep = DT;
  const { tracked, chassis, cameraTarget, props } = assemble(world, simStats, cfg, kind, impactMs, clean, conds);

  const n = tracked.length;
  const transforms = new Float32Array(MAX_FRAMES * n * FLOATS_PER_BODY);

  // Dynamic-event parameters.
  const mass = simStats.mass;
  const windForce = conds.has('crosswind') ? mass * 2.6 * (rng() < 0.5 ? 1 : -1) : 0;
  const blowout = conds.has('blowout');
  const blowoutFrame = blowout ? 24 + Math.floor(rng() * 70) : -1;
  const blowoutSide = rng() < 0.5 ? 1 : -1;
  const uneven = conds.has('uneven');

  let prevV = Math.hypot(chassis.linvel().x, chassis.linvel().y, chassis.linvel().z);
  let peakAccel = 0, impactFrame = 0, impactSpeed = prevV, frameCount = 0, calm = 0;
  // Environmental forces only apply while the car is still travelling freely —
  // adding them after a hard impact makes the constraint solver eject the body.
  let impacted = false;

  for (let f = 0; f < MAX_FRAMES; f++) {
    // Apply continuous / event forces before stepping (pre-impact only).
    if (!impacted) {
      if (windForce) chassis.addForce({ x: 0, y: 0, z: windForce }, true);
      if (uneven && f % 7 === 0) {
        chassis.applyTorqueImpulse({ x: (rng() - 0.5) * mass * 0.02, y: 0, z: (rng() - 0.5) * mass * 0.02 }, true);
      }
      if (f === blowoutFrame) {
        chassis.applyImpulse({ x: 0, y: 0, z: blowoutSide * mass * 2.2 }, true);
        chassis.applyTorqueImpulse({ x: 0, y: blowoutSide * mass * 0.12, z: 0 }, true);
      }
    }
    world.step();
    frameCount++;
    for (let b = 0; b < n; b++) {
      const t = tracked[b].rb.translation();
      const q = tracked[b].rb.rotation();
      const base = (f * n + b) * FLOATS_PER_BODY;
      transforms[base] = t.x; transforms[base + 1] = t.y; transforms[base + 2] = t.z;
      transforms[base + 3] = q.x; transforms[base + 4] = q.y; transforms[base + 5] = q.z; transforms[base + 6] = q.w;
    }
    const lv = chassis.linvel();
    const v = Math.hypot(lv.x, lv.y, lv.z);
    const accel = Math.abs(v - prevV) / DT;
    if (accel > peakAccel) { peakAccel = accel; impactFrame = f; impactSpeed = prevV; }
    if (accel > 90) impacted = true; // hard hit → stop applying event forces
    prevV = v;
    if (f > 60 && v < 0.6) { if (++calm > 45) break; } else calm = 0;
  }

  world.free();

  const used = Math.min(frameCount, MAX_FRAMES);
  return {
    bodies: tracked.map((t) => t.def),
    frameCount: used,
    dt: DT,
    transforms: transforms.subarray(0, used * n * FLOATS_PER_BODY),
    wheelLocal: wheelLocalOffsets(stats),
    wheelRadius: wheelR(stats),
    impactFrame,
    peakAccelG: peakAccel / 9.81,
    impactSpeedKmh: Math.round(impactSpeed * 3.6),
    scenarioKind: kind,
    cameraTarget,
    clean,
    props,
  };
}
