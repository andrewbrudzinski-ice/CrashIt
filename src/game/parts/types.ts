/**
 * Part & vehicle type system.
 *
 * Everything the builder offers is data. A `Part` contributes to a set of
 * raw physical accumulators via `effects`; the special `chassis` category
 * additionally defines the vehicle `platform` (the base geometry & mass).
 * Derived stats (top speed, 0-60, braking distance, safety inputs…) are
 * computed from these accumulators in `deriveStats.ts`. Nothing here is
 * cosmetic-only: every field feeds the simulation.
 */

export type PartCategory =
  | 'chassis'
  | 'engine'
  | 'transmission'
  | 'drivetrain'
  | 'suspension'
  | 'tires'
  | 'brakes'
  | 'body'
  | 'safety'
  | 'aero';

/** Categories where exactly one part is selected at a time. */
export const SINGLE_CATEGORIES: PartCategory[] = [
  'chassis',
  'engine',
  'transmission',
  'drivetrain',
  'suspension',
  'tires',
  'brakes',
  'body',
];

/** Categories where any number of parts may be installed together. */
export const MULTI_CATEGORIES: PartCategory[] = ['safety', 'aero'];

export type Drivetrain = 'FWD' | 'RWD' | 'AWD';
export type EngineKind = 'ice' | 'electric' | 'hybrid';

/**
 * Base geometry & mass a chassis establishes. These are NOT accumulated —
 * the selected chassis is the single source of truth for them, then parts
 * nudge them via deltas in {@link PartEffects}.
 */
export interface Platform {
  /** Bare rolling-shell mass in kg (before other parts). */
  baseMass: number;
  /** Distance between axles, metres. */
  wheelbase: number;
  /** Distance between left/right wheels, metres. */
  trackWidth: number;
  /** Overall body length, metres (used for visualisation & scenarios). */
  length: number;
  /** Overall body height, metres. */
  height: number;
  /** Ground clearance, cm. */
  baseRideHeight: number;
  /** Centre-of-gravity height above ground, cm (empty shell). */
  baseCogHeight: number;
  /** Fraction of static weight on the front axle, 0..1. */
  baseWeightDist: number;
  /** Aerodynamic drag coefficient (Cd) of the bare shell. */
  baseDrag: number;
  /** Frontal area, m^2 (affects drag force). */
  frontalArea: number;
  /** Structural strength baseline of the shell (arbitrary units, ~higher = stiffer). */
  baseChassisStrength: number;
  /** Occupant capacity. */
  seats: number;
  /** Length of the deformable front structure, cm. */
  baseCrumpleZone: number;
}

/**
 * Additive contributions to the raw accumulators. Multipliers are applied
 * multiplicatively across all installed parts. All fields optional; omitted
 * fields contribute their identity (0 for additive, 1 for multiplicative).
 */
export interface PartEffects {
  /** kg added to vehicle mass. */
  mass?: number;
  /** Peak engine power, hp (added). */
  powerHp?: number;
  /** Peak torque, N·m (added). */
  torqueNm?: number;
  /** How high in the rev/speed range power arrives, 0 (low-end) .. 1 (peaky). */
  powerband?: number;
  /** Braking force capacity, kN (added). */
  brakingKn?: number;
  /** Additive grip coefficient. */
  gripAdd?: number;
  /** Multiplier on total grip. */
  gripMul?: number;
  /** Multiplier on drag coefficient (spoilers etc. raise it). */
  dragMul?: number;
  /** Downforce coefficient added (N per (m/s)^2, scaled). */
  downforce?: number;
  /** Structural strength added to the chassis. */
  chassisStrength?: number;
  /** Strength of the occupant cell / safety cage. */
  cabinStrength?: number;
  /** Extra crumple-zone length, cm. */
  crumpleZone?: number;
  /** Suspension vertical travel, cm (added). */
  suspTravel?: number;
  /** Suspension stiffness, N/mm (added). */
  suspStiffness?: number;
  /** Rolling resistance coefficient (added, small numbers). */
  rollResistance?: number;
  /** Steering response 0..1 (added; clamped later). */
  steeringResponse?: number;
  /** Change to CoG height, cm (+ raises, − lowers). */
  cogHeightDelta?: number;
  /** Change to ride height, cm. */
  rideHeightDelta?: number;
  /** Shift in front weight bias, fraction (+ = more front). */
  frontBiasDelta?: number;
  /** Transmission drivetrain-loss factor 0..1 (fraction of power lost). */
  drivetrainLoss?: number;
  /** Occupant-protection quality for restraints, 0..1 (added, clamped). */
  restraint?: number;
  /** Rollover-protection quality, 0..1 (added, clamped). */
  rolloverProtection?: number;
  /** Side-impact protection quality, 0..1 (added, clamped). */
  sideProtection?: number;
}

export interface Part {
  id: string;
  name: string;
  category: PartCategory;
  /** Short flavour / engineering description shown in the builder. */
  description: string;
  /** Purchase cost in dollars. */
  cost: number;
  /** 0..1 durability rating (resistance to damage in a crash). */
  durability: number;
  /** Tokens for filtering, unlock gating, and visual variants. */
  tags?: string[];
  /** Present only on chassis parts. */
  platform?: Platform;
  /** Drivetrain layout — present on drivetrain parts. */
  drivetrain?: Drivetrain;
  /** Engine kind — present on engine parts. */
  engineKind?: EngineKind;
  /** Physical/statistical contributions. */
  effects?: PartEffects;
  /** Whether this part is available from the start (progression gating). */
  startUnlocked?: boolean;
}

/** A concrete vehicle configuration authored by the player. */
export interface VehicleBuild {
  id: string;
  name: string;
  /** Hex paint colour. */
  color: string;
  /** Selected part id per single-select category. */
  parts: Record<string, string | undefined>;
  /** Installed part ids for multi-select categories. */
  safety: string[];
  aero: string[];
  createdAt: number;
  updatedAt: number;
  /** True for sandbox/experiment builds that ignore the budget. */
  sandbox?: boolean;
}
