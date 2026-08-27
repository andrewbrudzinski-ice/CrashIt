/**
 * Side-profile silhouettes for each chassis style, expressed as normalized
 * control points in a 0..1 box (x = front→rear, y = ground→roof). The
 * renderer scales these to the vehicle's real length/height so a "lowered
 * sport" build actually sits lower than an SUV. Data, not drawing code.
 *
 * The 3D crash mesh (`carMesh3d.ts`) reads the same profiles, so the wrecked
 * car matches its garage thumbnail.
 */
export interface Silhouette {
  /** Outer body outline: front-lower → over the top → rear-lower. */
  body: [number, number][];
  /** Greenhouse / cabin glass polygon. */
  glass: [number, number][];
  /** Fractional x positions of the two wheel centres. */
  wheels: [number, number];
  /** Belt/panel accent line, as [x,y] pairs. */
  beltline: [number, number][];
  /** Relative wheel radius (fraction of body height). */
  wheelR: number;
}

export type SilhouetteStyle =
  | 'hatch' | 'sedan' | 'coupe' | 'suv' | 'pickup' | 'van' | 'semi' | 'exotic';

export const CHASSIS_STYLE: Record<string, SilhouetteStyle> = {
  'chassis.compact': 'hatch',
  'chassis.sedan': 'sedan',
  'chassis.coupe': 'coupe',
  'chassis.suv': 'suv',
  'chassis.truck': 'pickup',
  'chassis.van': 'van',
  'chassis.semi': 'semi',
  'chassis.monocoque': 'exotic',
};

// Points go front→rear around the top of the body.
export const SILHOUETTES: Record<SilhouetteStyle, Silhouette> = {
  hatch: {
    body: [
      [0.0, 0.18], [0.02, 0.42], [0.1, 0.5], [0.22, 0.55], [0.3, 0.92],
      [0.62, 1.0], [0.86, 0.95], [0.98, 0.6], [1.0, 0.42], [1.0, 0.18],
    ],
    glass: [[0.32, 0.9], [0.58, 0.95], [0.8, 0.9], [0.7, 0.6], [0.4, 0.58]],
    wheels: [0.2, 0.82],
    beltline: [[0.05, 0.5], [0.95, 0.58]],
    wheelR: 0.3,
  },
  sedan: {
    body: [
      [0.0, 0.16], [0.02, 0.4], [0.12, 0.48], [0.3, 0.52], [0.42, 0.86],
      [0.66, 0.9], [0.8, 0.66], [0.95, 0.55], [1.0, 0.4], [1.0, 0.16],
    ],
    glass: [[0.44, 0.83], [0.63, 0.86], [0.75, 0.68], [0.5, 0.6]],
    wheels: [0.2, 0.83],
    beltline: [[0.05, 0.48], [0.97, 0.52]],
    wheelR: 0.29,
  },
  coupe: {
    body: [
      [0.0, 0.14], [0.03, 0.36], [0.16, 0.42], [0.34, 0.46], [0.5, 0.78],
      [0.68, 0.8], [0.86, 0.56], [0.97, 0.46], [1.0, 0.36], [1.0, 0.14],
    ],
    glass: [[0.5, 0.74], [0.66, 0.76], [0.8, 0.56], [0.54, 0.52]],
    wheels: [0.22, 0.82],
    beltline: [[0.06, 0.44], [0.96, 0.48]],
    wheelR: 0.31,
  },
  suv: {
    body: [
      [0.0, 0.2], [0.02, 0.5], [0.1, 0.58], [0.24, 0.62], [0.32, 0.95],
      [0.72, 1.0], [0.9, 0.95], [0.98, 0.7], [1.0, 0.5], [1.0, 0.2],
    ],
    glass: [[0.34, 0.92], [0.68, 0.96], [0.86, 0.9], [0.78, 0.66], [0.4, 0.64]],
    wheels: [0.19, 0.82],
    beltline: [[0.04, 0.6], [0.96, 0.66]],
    wheelR: 0.34,
  },
  pickup: {
    // Cab up front (to ~0.58 x), then an open bed floor at belt height.
    body: [
      [0.0, 0.18], [0.02, 0.46], [0.14, 0.52], [0.3, 0.56], [0.36, 0.9],
      [0.55, 0.92], [0.57, 0.6], [0.98, 0.6], [1.0, 0.5], [1.0, 0.18],
    ],
    glass: [[0.38, 0.87], [0.53, 0.89], [0.55, 0.64], [0.4, 0.62]],
    wheels: [0.2, 0.82],
    beltline: [[0.04, 0.56], [0.57, 0.6]],
    wheelR: 0.34,
  },
  van: {
    body: [
      [0.0, 0.22], [0.01, 0.6], [0.06, 0.78], [0.16, 0.92], [0.2, 1.0],
      [0.9, 1.0], [0.98, 0.9], [1.0, 0.6], [1.0, 0.22], [0.0, 0.22],
    ],
    glass: [[0.14, 0.9], [0.28, 0.94], [0.3, 0.72], [0.12, 0.7]],
    wheels: [0.16, 0.84],
    beltline: [[0.03, 0.66], [0.97, 0.7]],
    wheelR: 0.3,
  },
  semi: {
    // Conventional tractor (long hood + tall cab) up front, box trailer behind.
    body: [
      [0.0, 0.2], [0.02, 0.55], [0.08, 0.58], [0.11, 0.95], [0.2, 1.0],
      [0.22, 0.5], [0.26, 0.5], [0.26, 0.95], [1.0, 0.95], [1.0, 0.18],
    ],
    glass: [[0.12, 0.92], [0.19, 0.95], [0.2, 0.66], [0.12, 0.64]],
    wheels: [0.13, 0.9],
    beltline: [[0.26, 0.5], [1.0, 0.5]],
    wheelR: 0.32,
  },
  exotic: {
    body: [
      [0.0, 0.12], [0.06, 0.28], [0.2, 0.34], [0.4, 0.4], [0.52, 0.62],
      [0.66, 0.64], [0.88, 0.44], [0.98, 0.36], [1.0, 0.28], [1.0, 0.12],
    ],
    glass: [[0.5, 0.58], [0.64, 0.6], [0.78, 0.46], [0.56, 0.44]],
    wheels: [0.22, 0.82],
    beltline: [[0.05, 0.4], [0.97, 0.42]],
    wheelR: 0.33,
  },
};
