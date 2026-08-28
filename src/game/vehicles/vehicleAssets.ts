/**
 * Vehicle asset catalog — the data layer of the GLB/GLTF asset pipeline.
 *
 * The crash sim no longer builds car bodies from primitives; each vehicle is a
 * pre-modelled 3D asset (CC0 Quaternius "Realistic Car Pack" / "Public Transport
 * Pack", see LICENSE in the models dir) loaded at runtime and driven by the
 * existing physics. This file is the `Vehicle Definition` layer:
 *
 *   VehicleDef ──▶ GLB asset ──▶ loader ──▶ sim object ──▶ crash/damage
 *
 * Designs are fictional (renamed, non-brand) inspired by real categories.
 */

export type VehicleCategory = 'compact' | 'sedan' | 'muscle' | 'sports' | 'suv' | 'pickup' | 'van';

export interface VehicleDef {
  id: string;
  /** Fictional model name shown in UI. */
  name: string;
  category: VehicleCategory;
  /** Public URL of the GLB asset. */
  modelPath: string;
  /** Default paint tint (hex). */
  paint: string;
  /** Relative structural resilience (informational / future scoring hook). */
  damageMultiplier: number;
  blurb: string;
}

const BASE = `${import.meta.env.BASE_URL}models/vehicles`;

export const VEHICLES: VehicleDef[] = [
  { id: 'metro', name: 'Metro', category: 'compact', modelPath: `${BASE}/metro.glb`, paint: '#e0e3e7', damageMultiplier: 1.15, blurb: 'City compact — light, nimble, crumples early.' },
  { id: 'aria', name: 'Aria', category: 'sedan', modelPath: `${BASE}/aria.glb`, paint: '#2f6df0', damageMultiplier: 1.0, blurb: 'Modern four-door sedan — the everyday benchmark.' },
  { id: 'vortex', name: 'Vortex', category: 'muscle', modelPath: `${BASE}/vortex.glb`, paint: '#c0202a', damageMultiplier: 0.92, blurb: 'Low, wide sports sedan — long hood, big power.' },
  { id: 'falcon', name: 'Falcon S', category: 'sports', modelPath: `${BASE}/falcon.glb`, paint: '#d9631a', damageMultiplier: 1.05, blurb: 'Sports coupe — low, wide, track-bred silhouette.' },
  { id: 'atlas', name: 'Atlas', category: 'suv', modelPath: `${BASE}/atlas.glb`, paint: '#3a4149', damageMultiplier: 0.85, blurb: 'Full-size SUV — tall, heavy, protective cabin.' },
  { id: 'titan', name: 'Titan', category: 'pickup', modelPath: `${BASE}/titan.glb`, paint: '#2d7dc4', damageMultiplier: 0.82, blurb: 'Work pickup — long wheelbase, open cargo bed.' },
  { id: 'transit', name: 'Transit', category: 'van', modelPath: `${BASE}/transit.glb`, paint: '#e9ecef', damageMultiplier: 0.9, blurb: 'High-roof utility van — big box, upright cabin.' },
  { id: 'interceptor', name: 'Interceptor', category: 'sedan', modelPath: `${BASE}/interceptor.glb`, paint: '#15171b', damageMultiplier: 0.95, blurb: 'Pursuit-spec sedan — reinforced, quick off the line.' },
  { id: 'hauler', name: 'Hauler', category: 'van', modelPath: `${BASE}/hauler.glb`, paint: '#d9a41a', damageMultiplier: 0.7, blurb: 'City bus — huge mass, unstoppable momentum.' },
];

export const VEHICLE_BY_ID: Record<string, VehicleDef> = Object.fromEntries(VEHICLES.map((v) => [v.id, v]));

/** Chassis part id → vehicle asset id. */
export const CHASSIS_VEHICLE: Record<string, string> = {
  'chassis.compact': 'metro',
  'chassis.sedan': 'aria',
  'chassis.coupe': 'falcon',
  'chassis.suv': 'atlas',
  'chassis.truck': 'titan',
  'chassis.van': 'transit',
  'chassis.semi': 'hauler',
  'chassis.monocoque': 'vortex',
};

export function vehicleForChassis(chassisId?: string): VehicleDef {
  const id = (chassisId && CHASSIS_VEHICLE[chassisId]) || 'aria';
  return VEHICLE_BY_ID[id] ?? VEHICLES[1];
}

export function vehicleById(id: string): VehicleDef {
  return VEHICLE_BY_ID[id] ?? VEHICLES[1];
}
