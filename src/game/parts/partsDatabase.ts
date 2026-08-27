import type { Part, PartCategory } from './types';

/**
 * The parts catalog. Data-driven: the builder UI, stat engine, and physics
 * all read from here. Add parts by adding data — no UI changes required.
 *
 * Cost is in dollars, mass in kg, power in hp, torque in N·m. Values are
 * tuned to feel plausible relative to one another rather than to model any
 * specific real vehicle. This is a simulation game, not a certification tool.
 */

export const CHASSIS: Part[] = [
  {
    id: 'chassis.compact',
    name: 'Compact Hatch',
    category: 'chassis',
    description: 'Short wheelbase, light shell. Nimble but little metal between you and the wall.',
    cost: 4200,
    durability: 0.45,
    startUnlocked: true,
    platform: {
      baseMass: 950, wheelbase: 2.5, trackWidth: 1.5, length: 4.0, height: 1.45,
      baseRideHeight: 14, baseCogHeight: 52, baseWeightDist: 0.62, baseDrag: 0.32,
      frontalArea: 2.1, baseChassisStrength: 46, seats: 4, baseCrumpleZone: 55,
    },
  },
  {
    id: 'chassis.sedan',
    name: 'Sedan Platform',
    category: 'chassis',
    description: 'Balanced family platform. Roomy crumple zones, moderate weight.',
    cost: 6800,
    durability: 0.58,
    startUnlocked: true,
    platform: {
      baseMass: 1250, wheelbase: 2.8, trackWidth: 1.58, length: 4.7, height: 1.46,
      baseRideHeight: 15, baseCogHeight: 53, baseWeightDist: 0.58, baseDrag: 0.29,
      frontalArea: 2.25, baseChassisStrength: 60, seats: 5, baseCrumpleZone: 75,
    },
  },
  {
    id: 'chassis.coupe',
    name: 'Sport Coupe',
    category: 'chassis',
    description: 'Low, wide, stiff. Superb handling geometry, tight cabin.',
    cost: 9500,
    durability: 0.55,
    startUnlocked: true,
    platform: {
      baseMass: 1180, wheelbase: 2.62, trackWidth: 1.62, length: 4.5, height: 1.3,
      baseRideHeight: 11, baseCogHeight: 45, baseWeightDist: 0.53, baseDrag: 0.28,
      frontalArea: 2.0, baseChassisStrength: 66, seats: 2, baseCrumpleZone: 60,
    },
  },
  {
    id: 'chassis.suv',
    name: 'SUV Body-on-Frame',
    category: 'chassis',
    description: 'Tall, heavy, commanding. High centre of gravity invites rollovers.',
    cost: 11200,
    durability: 0.7,
    startUnlocked: true,
    platform: {
      baseMass: 1950, wheelbase: 2.9, trackWidth: 1.66, length: 4.9, height: 1.78,
      baseRideHeight: 22, baseCogHeight: 72, baseWeightDist: 0.55, baseDrag: 0.36,
      frontalArea: 2.8, baseChassisStrength: 78, seats: 7, baseCrumpleZone: 80,
    },
  },
  {
    id: 'chassis.truck',
    name: 'Pickup Truck',
    category: 'chassis',
    description: 'Ladder frame, huge mass. Devastating in a collision — to the other guy.',
    cost: 13400,
    durability: 0.82,
    platform: {
      baseMass: 2300, wheelbase: 3.4, trackWidth: 1.7, length: 5.6, height: 1.9,
      baseRideHeight: 25, baseCogHeight: 78, baseWeightDist: 0.58, baseDrag: 0.42,
      frontalArea: 3.1, baseChassisStrength: 88, seats: 5, baseCrumpleZone: 90,
    },
  },
  {
    id: 'chassis.van',
    name: 'Cargo Van',
    category: 'chassis',
    description: 'Long, boxy, front-heavy. Enormous frontal area punishes top speed.',
    cost: 10800,
    durability: 0.66,
    platform: {
      baseMass: 2050, wheelbase: 3.2, trackWidth: 1.68, length: 5.4, height: 2.1,
      baseRideHeight: 18, baseCogHeight: 82, baseWeightDist: 0.6, baseDrag: 0.45,
      frontalArea: 3.6, baseChassisStrength: 70, seats: 3, baseCrumpleZone: 65,
    },
  },
  {
    id: 'chassis.semi',
    name: 'Semi Tractor-Trailer',
    category: 'chassis',
    description: 'An articulated big rig. Colossal mass and length — it flattens whatever it hits, but stops and turns like a building.',
    cost: 34000,
    durability: 0.9,
    tags: ['heavy'],
    platform: {
      baseMass: 12000, wheelbase: 6.0, trackWidth: 2.0, length: 15.0, height: 3.4,
      baseRideHeight: 34, baseCogHeight: 150, baseWeightDist: 0.42, baseDrag: 0.65,
      frontalArea: 8.5, baseChassisStrength: 130, seats: 2, baseCrumpleZone: 70,
    },
  },
  {
    id: 'chassis.monocoque',
    name: 'Carbon Monocoque',
    category: 'chassis',
    description: 'Featherweight competition tub. Immense rigidity, immense price.',
    cost: 28000,
    durability: 0.6,
    tags: ['exotic'],
    platform: {
      baseMass: 780, wheelbase: 2.7, trackWidth: 1.68, length: 4.4, height: 1.15,
      baseRideHeight: 8, baseCogHeight: 38, baseWeightDist: 0.47, baseDrag: 0.3,
      frontalArea: 1.85, baseChassisStrength: 95, seats: 2, baseCrumpleZone: 50,
    },
  },
];

export const ENGINES: Part[] = [
  {
    id: 'engine.small.ice', name: 'Small ICE 1.4L', category: 'engine', engineKind: 'ice',
    description: 'Economical four-cylinder. Sips fuel, barely troubles the tires.',
    cost: 3200, durability: 0.7, startUnlocked: true,
    effects: { mass: 120, powerHp: 110, torqueNm: 150, powerband: 0.55, frontBiasDelta: 0.02 },
  },
  {
    id: 'engine.medium.ice', name: 'Medium ICE 2.0L Turbo', category: 'engine', engineKind: 'ice',
    description: 'Turbo four. A strong all-rounder with a useful mid-range.',
    cost: 6400, durability: 0.68, startUnlocked: true,
    effects: { mass: 165, powerHp: 250, torqueNm: 370, powerband: 0.45, frontBiasDelta: 0.03 },
  },
  {
    id: 'engine.large.ice', name: 'Large V8 5.0L', category: 'engine', engineKind: 'ice',
    description: 'Big naturally-aspirated eight. Heavy over the nose, endless torque.',
    cost: 12500, durability: 0.66, startUnlocked: true,
    effects: { mass: 260, powerHp: 460, torqueNm: 570, powerband: 0.5, frontBiasDelta: 0.06 },
  },
  {
    id: 'engine.electric.std', name: 'Electric Drive Unit', category: 'engine', engineKind: 'electric',
    description: 'Instant torque, low mounting. Battery mass sits deep in the floor.',
    cost: 14000, durability: 0.75, startUnlocked: true,
    effects: { mass: 430, powerHp: 340, torqueNm: 520, powerband: 0.05, cogHeightDelta: -8, frontBiasDelta: -0.04 },
  },
  {
    id: 'engine.electric.perf', name: 'Dual-Motor EV', category: 'engine', engineKind: 'electric',
    description: 'Two motors, brutal launch. Serious pack weight down low.',
    cost: 24000, durability: 0.72, tags: ['exotic'],
    effects: { mass: 560, powerHp: 680, torqueNm: 900, powerband: 0.02, cogHeightDelta: -10 },
  },
  {
    id: 'engine.hybrid', name: 'Hybrid Powertrain', category: 'engine', engineKind: 'hybrid',
    description: 'Combustion plus e-boost. Complex, heavy, endlessly flexible.',
    cost: 15500, durability: 0.7,
    effects: { mass: 340, powerHp: 400, torqueNm: 560, powerband: 0.2, cogHeightDelta: -4, frontBiasDelta: 0.02 },
  },
  {
    id: 'engine.race.v10', name: 'Competition V10', category: 'engine', engineKind: 'ice',
    description: 'Screaming, peaky race engine. All the power lives up top.',
    cost: 40000, durability: 0.5, tags: ['exotic'],
    effects: { mass: 210, powerHp: 720, torqueNm: 560, powerband: 0.9, frontBiasDelta: 0.04 },
  },
];

export const TRANSMISSIONS: Part[] = [
  {
    id: 'trans.manual', name: '6-Speed Manual', category: 'transmission',
    description: 'Direct and light. Lowest driveline loss.',
    cost: 1800, durability: 0.8, startUnlocked: true,
    effects: { mass: 55, drivetrainLoss: 0.1 },
  },
  {
    id: 'trans.auto', name: 'Automatic', category: 'transmission',
    description: 'Smooth torque converter. Convenient, a little lossy.',
    cost: 2600, durability: 0.78, startUnlocked: true,
    effects: { mass: 85, drivetrainLoss: 0.16 },
  },
  {
    id: 'trans.cvt', name: 'CVT', category: 'transmission',
    description: 'Keeps the engine on the boil. Not fond of big torque.',
    cost: 2400, durability: 0.6, startUnlocked: true,
    effects: { mass: 70, drivetrainLoss: 0.14 },
  },
  {
    id: 'trans.dct', name: 'Performance DCT', category: 'transmission',
    description: 'Dual-clutch. Lightning shifts, minimal loss, premium price.',
    cost: 6200, durability: 0.72,
    effects: { mass: 75, drivetrainLoss: 0.08 },
  },
];

export const DRIVETRAINS: Part[] = [
  {
    id: 'drive.fwd', name: 'Front-Wheel Drive', category: 'drivetrain', drivetrain: 'FWD',
    description: 'Cheap, light, stable understeer. Traction limited under power.',
    cost: 900, durability: 0.75, startUnlocked: true,
    effects: { mass: 20, frontBiasDelta: 0.03, gripMul: 0.97, steeringResponse: 0.05 },
  },
  {
    id: 'drive.rwd', name: 'Rear-Wheel Drive', category: 'drivetrain', drivetrain: 'RWD',
    description: 'Balanced and playful. Rewards a delicate throttle.',
    cost: 1600, durability: 0.74, startUnlocked: true,
    effects: { mass: 40, frontBiasDelta: -0.02, steeringResponse: 0.1 },
  },
  {
    id: 'drive.awd', name: 'All-Wheel Drive', category: 'drivetrain', drivetrain: 'AWD',
    description: 'Traction everywhere. Extra hardware weight and drag.',
    cost: 3800, durability: 0.8, startUnlocked: true,
    effects: { mass: 95, gripMul: 1.08, drivetrainLoss: 0.04, steeringResponse: 0.06 },
  },
];

export const SUSPENSIONS: Part[] = [
  {
    id: 'susp.soft', name: 'Soft Comfort', category: 'suspension',
    description: 'Long, plush travel. Wallows and leans; forgiving over bumps.',
    cost: 1400, durability: 0.7, startUnlocked: true,
    effects: { mass: 45, suspTravel: 18, suspStiffness: 22, steeringResponse: -0.05, rideHeightDelta: 2 },
  },
  {
    id: 'susp.normal', name: 'Standard', category: 'suspension',
    description: 'The sensible default. Nothing to prove, nothing to fear.',
    cost: 2000, durability: 0.72, startUnlocked: true,
    effects: { mass: 42, suspTravel: 14, suspStiffness: 32 },
  },
  {
    id: 'susp.sport', name: 'Sport Lowered', category: 'suspension',
    description: 'Firmer, lower. Flatter cornering, sharper response.',
    cost: 3600, durability: 0.7, startUnlocked: true,
    effects: { mass: 40, suspTravel: 10, suspStiffness: 48, steeringResponse: 0.08, cogHeightDelta: -3, rideHeightDelta: -4 },
  },
  {
    id: 'susp.race', name: 'Race Coilovers', category: 'suspension',
    description: 'Stiff, adjustable, unforgiving. Track-day precision.',
    cost: 7800, durability: 0.62,
    effects: { mass: 36, suspTravel: 7, suspStiffness: 70, steeringResponse: 0.14, cogHeightDelta: -5, rideHeightDelta: -7 },
  },
  {
    id: 'susp.heavy', name: 'Heavy-Duty Off-Road', category: 'suspension',
    description: 'Enormous travel and lift. Soaks up jumps, tips in corners.',
    cost: 4200, durability: 0.85,
    effects: { mass: 90, suspTravel: 28, suspStiffness: 40, steeringResponse: -0.08, cogHeightDelta: 8, rideHeightDelta: 12 },
  },
];

export const TIRES: Part[] = [
  {
    id: 'tire.economy', name: 'Economy', category: 'tires',
    description: 'Hard, cheap, low grip. Long stopping distances.',
    cost: 400, durability: 0.6, startUnlocked: true,
    effects: { mass: 30, gripAdd: 0.75, rollResistance: 0.014 },
  },
  {
    id: 'tire.street', name: 'Street', category: 'tires',
    description: 'All-season everyman rubber. Dependable in the dry and wet.',
    cost: 900, durability: 0.68, startUnlocked: true,
    effects: { mass: 34, gripAdd: 0.9, rollResistance: 0.012 },
  },
  {
    id: 'tire.sport', name: 'Sport', category: 'tires',
    description: 'Softer compound, wider contact patch. Grippy, wears fast.',
    cost: 1900, durability: 0.6, startUnlocked: true,
    effects: { mass: 38, gripAdd: 1.05, rollResistance: 0.013 },
  },
  {
    id: 'tire.racing', name: 'Racing Slicks', category: 'tires',
    description: 'Maximum dry grip. Treacherous when the track turns wet.',
    cost: 4200, durability: 0.45,
    effects: { mass: 40, gripAdd: 1.25, rollResistance: 0.015 },
  },
  {
    id: 'tire.offroad', name: 'Off-Road', category: 'tires',
    description: 'Knobbly, tall, tough. Grip on dirt, vagueness on tarmac.',
    cost: 1600, durability: 0.8,
    effects: { mass: 52, gripAdd: 0.85, rollResistance: 0.02, cogHeightDelta: 2 },
  },
];

export const BRAKES: Part[] = [
  {
    id: 'brake.standard', name: 'Standard Discs', category: 'brakes',
    description: 'Adequate for everyday speeds. Fades under abuse.',
    cost: 800, durability: 0.7, startUnlocked: true,
    effects: { mass: 30, brakingKn: 14 },
  },
  {
    id: 'brake.performance', name: 'Performance Big-Brake', category: 'brakes',
    description: 'Larger rotors, better bite and cooling.',
    cost: 3200, durability: 0.72, startUnlocked: true,
    effects: { mass: 42, brakingKn: 22 },
  },
  {
    id: 'brake.race', name: 'Carbon-Ceramic', category: 'brakes',
    description: 'Race-grade stopping power that shrugs off heat. Costly.',
    cost: 9500, durability: 0.68,
    effects: { mass: 34, brakingKn: 30 },
  },
];

export const BODIES: Part[] = [
  {
    id: 'body.light', name: 'Lightweight Panels', category: 'body',
    description: 'Aluminium & composite skin. Saves mass, dents easily.',
    cost: 3400, durability: 0.5, startUnlocked: true,
    effects: { mass: -60, chassisStrength: -4, dragMul: 0.99 },
  },
  {
    id: 'body.standard', name: 'Standard Steel', category: 'body',
    description: 'Ordinary stamped-steel bodywork. The honest baseline.',
    cost: 1500, durability: 0.68, startUnlocked: true,
    effects: { mass: 0, chassisStrength: 0 },
  },
  {
    id: 'body.reinforced', name: 'Reinforced High-Strength', category: 'body',
    description: 'Thicker gauge, extra bracing. Heavy but takes a hit.',
    cost: 5200, durability: 0.85, startUnlocked: true,
    effects: { mass: 130, chassisStrength: 20, cabinStrength: 10, dragMul: 1.01 },
  },
];

export const SAFETY: Part[] = [
  {
    id: 'safety.belts', name: 'Seat Belts', category: 'safety',
    description: 'Three-point restraints. The single most effective safety device.',
    cost: 300, durability: 0.9, startUnlocked: true,
    effects: { mass: 8, restraint: 0.35 },
  },
  {
    id: 'safety.airbags', name: 'Airbag Array', category: 'safety',
    description: 'Front and curtain airbags. Cushions the occupant at peak decel.',
    cost: 2200, durability: 0.8, startUnlocked: true,
    effects: { mass: 18, restraint: 0.3 },
  },
  {
    id: 'safety.crumple', name: 'Engineered Crumple Zones', category: 'safety',
    description: 'Programmed front/rear collapse that eats crash energy.',
    cost: 3000, durability: 0.6, startUnlocked: true,
    effects: { mass: 40, crumpleZone: 35, chassisStrength: 4 },
  },
  {
    id: 'safety.rollcage', name: 'Roll Cage', category: 'safety',
    description: 'Welded tubular cage. Superb rollover & cabin protection.',
    cost: 4800, durability: 0.9,
    effects: { mass: 75, cabinStrength: 24, rolloverProtection: 0.5, chassisStrength: 8 },
  },
  {
    id: 'safety.cabin', name: 'Reinforced Cabin Cell', category: 'safety',
    description: 'Ultra-high-strength survival cell around the occupants.',
    cost: 5600, durability: 0.92,
    effects: { mass: 90, cabinStrength: 30, sideProtection: 0.3 },
  },
  {
    id: 'safety.side', name: 'Side-Impact Beams', category: 'safety',
    description: 'Door bars and B-pillar bracing for lateral hits.',
    cost: 2600, durability: 0.82, startUnlocked: true,
    effects: { mass: 45, sideProtection: 0.45, cabinStrength: 8 },
  },
];

export const AERO: Part[] = [
  {
    id: 'aero.spoiler', name: 'Rear Spoiler', category: 'aero',
    description: 'Modest rear downforce for a little more stability up top.',
    cost: 1200, durability: 0.6, startUnlocked: true,
    effects: { mass: 12, downforce: 0.4, dragMul: 1.03 },
  },
  {
    id: 'aero.splitter', name: 'Front Splitter', category: 'aero',
    description: 'Bites the air at the nose. Front-end grip, a touch more drag.',
    cost: 1500, durability: 0.5, startUnlocked: true,
    effects: { mass: 10, downforce: 0.35, dragMul: 1.02, frontBiasDelta: 0.01 },
  },
  {
    id: 'aero.diffuser', name: 'Rear Diffuser', category: 'aero',
    description: 'Accelerates underbody flow. Downforce with little drag penalty.',
    cost: 2600, durability: 0.55,
    effects: { mass: 14, downforce: 0.5, dragMul: 1.005 },
  },
  {
    id: 'aero.wing', name: 'Fixed Race Wing', category: 'aero',
    description: 'Big downforce, big drag. Glues the car down in fast corners.',
    cost: 3400, durability: 0.5,
    effects: { mass: 20, downforce: 1.1, dragMul: 1.08 },
  },
  {
    id: 'aero.active', name: 'Active Aero', category: 'aero',
    description: 'Motorised wing that trims drag on straights, adds grip in corners.',
    cost: 8800, durability: 0.55, tags: ['exotic'],
    effects: { mass: 34, downforce: 1.3, dragMul: 1.02 },
  },
];

/** Every category's parts, in display order. */
export const PARTS_BY_CATEGORY: Record<PartCategory, Part[]> = {
  chassis: CHASSIS,
  engine: ENGINES,
  transmission: TRANSMISSIONS,
  drivetrain: DRIVETRAINS,
  suspension: SUSPENSIONS,
  tires: TIRES,
  brakes: BRAKES,
  body: BODIES,
  safety: SAFETY,
  aero: AERO,
};

/** Flat list of all parts. */
export const ALL_PARTS: Part[] = Object.values(PARTS_BY_CATEGORY).flat();

const PART_INDEX: Map<string, Part> = new Map(ALL_PARTS.map((p) => [p.id, p]));

export function getPart(id: string | undefined): Part | undefined {
  if (!id) return undefined;
  return PART_INDEX.get(id);
}

/** Human-readable category labels. */
export const CATEGORY_LABELS: Record<PartCategory, string> = {
  chassis: 'Chassis',
  engine: 'Engine',
  transmission: 'Transmission',
  drivetrain: 'Drivetrain',
  suspension: 'Suspension',
  tires: 'Tires',
  brakes: 'Brakes',
  body: 'Body',
  safety: 'Safety',
  aero: 'Aerodynamics',
};
