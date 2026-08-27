import * as THREE from 'three';
import { CHASSIS_STYLE, type SilhouetteStyle } from './silhouetteProfiles';

/**
 * Procedural stylized-realistic vehicles.
 *
 * The main sheet-metal body is a single lofted shell: a side-profile silhouette
 * is extruded, then its cross-section is shaped two ways at once — a vertical
 * "crown" (flat door sides rolling into a rounded, narrower roof) and a
 * longitudinal "plan taper" (the body pinches in at the nose and tail the way a
 * real car narrows toward its ends). That plan taper is the thing that turns a
 * slab/blob into an automobile. On top of the shell go separated glass panels
 * with pillars, low-profile multi-spoke wheels, fitted arches, LED lighting,
 * body-colour bumpers, a grille, mirrors, door shut-lines and handles.
 *
 * Everything is generated from a per-archetype {@link CarSpec}, so a sports car,
 * a sedan, a muscle car, an SUV, a pickup and a hatch have genuinely different
 * silhouettes rather than one shape in different colours.
 *
 * Local frame: +x = front, +y = up, +z = left. The group origin is the chassis
 * centre (matching the physics box) so it drops onto the baked transform.
 */

export interface BodyDamage {
  front: number; rear: number; left: number; right: number; roof: number;
}

export type Archetype = 'sports' | 'sedan' | 'muscle' | 'suv' | 'pickup' | 'hatch' | 'van' | 'super';
export const ARCHETYPES: Archetype[] = ['sports', 'sedan', 'muscle', 'suv', 'pickup', 'hatch', 'van', 'super'];

/** Which archetype a chassis silhouette maps to. */
const STYLE_ARCHETYPE: Record<SilhouetteStyle, Archetype> = {
  hatch: 'hatch', sedan: 'sedan', coupe: 'sports', suv: 'suv',
  pickup: 'pickup', van: 'van', semi: 'van', exotic: 'super',
};

// ------------------------------------------------------------------ materials

export type PaintFinish = 'metallic' | 'gloss' | 'matte';

function accentFrom(paint: THREE.Color): THREE.Color {
  const hsl = { h: 0, s: 0, l: 0 };
  paint.getHSL(hsl);
  return new THREE.Color().setHSL((hsl.h + 0.5) % 1, 0.8, 0.55);
}

function makeMaterials(paintColor: string, accentColor?: string, finish: PaintFinish = 'metallic') {
  const paint = new THREE.Color(paintColor);
  const accent = accentColor ? new THREE.Color(accentColor) : accentFrom(paint);
  const rough = finish === 'matte' ? 0.7 : finish === 'gloss' ? 0.28 : 0.42;
  const metal = finish === 'matte' ? 0.1 : finish === 'gloss' ? 0.25 : 0.55;
  const clear = finish === 'matte' ? 0.1 : finish === 'gloss' ? 0.85 : 0.45;
  return {
    paint: new THREE.MeshPhysicalMaterial({
      color: paint, roughness: rough, metalness: metal,
      clearcoat: clear, clearcoatRoughness: 0.3, envMapIntensity: 0.5,
    }),
    // Dark body-colour for lower cladding.
    paintDark: new THREE.MeshStandardMaterial({ color: paint.clone().multiplyScalar(0.4), roughness: 0.5, metalness: 0.5, envMapIntensity: 0.4 }),
    accent: new THREE.MeshStandardMaterial({ color: accent, roughness: 0.4, metalness: 0.4 }),
    caliper: new THREE.MeshStandardMaterial({ color: accent, roughness: 0.4, metalness: 0.3 }),
    // Satin black plastics (bumper inserts, pillars, trim).
    trim: new THREE.MeshStandardMaterial({ color: 0x14171b, roughness: 0.65, metalness: 0.2 }),
    black: new THREE.MeshStandardMaterial({ color: 0x0a0c0f, roughness: 0.55, metalness: 0.3 }),
    chrome: new THREE.MeshStandardMaterial({ color: 0xc4ccd4, roughness: 0.2, metalness: 1, envMapIntensity: 1.2 }),
    glass: new THREE.MeshPhysicalMaterial({
      color: 0x121a24, roughness: 0.08, metalness: 0.25, clearcoat: 0.8, clearcoatRoughness: 0.08, envMapIntensity: 1.3,
    }),
    headlight: new THREE.MeshStandardMaterial({ color: 0xeaf2ff, emissive: 0xcfe4ff, emissiveIntensity: 0.7, roughness: 0.2, metalness: 0.3 }),
    drl: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xdff0ff, emissiveIntensity: 1.2, roughness: 0.3 }),
    taillight: new THREE.MeshStandardMaterial({ color: 0x2a0605, emissive: 0xff1a10, emissiveIntensity: 0.9, roughness: 0.35 }),
    tyre: new THREE.MeshStandardMaterial({ color: 0x0c0e11, roughness: 0.85, metalness: 0.05 }),
    rim: new THREE.MeshStandardMaterial({ color: 0x9aa4ae, roughness: 0.3, metalness: 0.9, envMapIntensity: 1.1 }),
  };
}
type Mats = ReturnType<typeof makeMaterials>;

// ------------------------------------------------------------------ specs

interface CarSpec {
  /** Closed side outline, front→rear over the top; xFrac 0=front,1=rear; yFrac 0..1 of the vertical span. */
  outline: [number, number][];
  /** Plan half-width vs xFrac (1 = full track): narrows the nose & tail. */
  plan: [number, number][];
  /** Beltline height (glass sits above this), as yFrac. */
  belt: number;
  /** Greenhouse x-range [front, rear] in xFrac. */
  glass: [number, number];
  /** Ride/stance: rocker (lower body) yFrac. */
  rocker: number;
  grille: 'wide' | 'split' | 'mesh' | 'slat';
  exhaust: 'dual' | 'quad' | 'single' | 'hidden';
  roofRails?: boolean;
  bed?: boolean;
  spoiler?: 'none' | 'lip' | 'ducktail' | 'wing';
  bulgeHood?: boolean;
}

const SPECS: Record<Archetype, CarSpec> = {
  sports: {
    outline: [
      [0.0, 0.14], [0.04, 0.28], [0.18, 0.33], [0.36, 0.38], [0.45, 0.58],
      [0.53, 0.76], [0.64, 0.78], [0.8, 0.54], [0.92, 0.44], [1.0, 0.34], [1.0, 0.12],
    ],
    plan: [[0, 0.58], [0.12, 0.88], [0.3, 0.99], [0.5, 1.0], [0.72, 0.99], [0.9, 0.9], [1.0, 0.6]],
    belt: 0.5, glass: [0.42, 0.84], rocker: 0.08, grille: 'wide', exhaust: 'quad', spoiler: 'ducktail',
  },
  sedan: {
    outline: [
      [0.0, 0.16], [0.03, 0.40], [0.13, 0.46], [0.31, 0.5], [0.41, 0.8],
      [0.46, 0.87], [0.66, 0.9], [0.73, 0.66], [0.87, 0.56], [0.98, 0.52], [1.0, 0.4], [1.0, 0.16],
    ],
    plan: [[0, 0.6], [0.14, 0.9], [0.32, 0.99], [0.5, 1.0], [0.7, 0.99], [0.88, 0.92], [1.0, 0.66]],
    belt: 0.52, glass: [0.38, 0.72], rocker: 0.12, grille: 'wide', exhaust: 'dual', spoiler: 'none',
  },
  muscle: {
    outline: [
      [0.0, 0.2], [0.03, 0.44], [0.22, 0.47], [0.44, 0.49], [0.51, 0.74],
      [0.58, 0.81], [0.68, 0.82], [0.82, 0.6], [0.93, 0.54], [1.0, 0.46], [1.0, 0.2],
    ],
    plan: [[0, 0.68], [0.18, 0.95], [0.5, 1.0], [0.82, 0.97], [1.0, 0.72]],
    belt: 0.53, glass: [0.5, 0.82], rocker: 0.12, grille: 'slat', exhaust: 'quad', spoiler: 'lip', bulgeHood: true,
  },
  suv: {
    outline: [
      [0.0, 0.24], [0.03, 0.54], [0.1, 0.6], [0.24, 0.64], [0.3, 0.92],
      [0.35, 0.99], [0.82, 1.0], [0.9, 0.94], [0.98, 0.72], [1.0, 0.58], [1.0, 0.24],
    ],
    plan: [[0, 0.72], [0.15, 0.93], [0.5, 1.0], [0.85, 0.95], [1.0, 0.76]],
    belt: 0.6, glass: [0.32, 0.9], rocker: 0.2, grille: 'mesh', exhaust: 'dual', roofRails: true, spoiler: 'lip',
  },
  pickup: {
    outline: [
      [0.0, 0.22], [0.02, 0.5], [0.12, 0.56], [0.28, 0.6], [0.34, 0.92],
      [0.38, 0.97], [0.52, 0.96], [0.56, 0.62], [0.98, 0.62], [1.0, 0.54], [1.0, 0.22],
    ],
    plan: [[0, 0.74], [0.15, 0.95], [0.5, 1.0], [0.85, 0.98], [1.0, 0.82]],
    belt: 0.6, glass: [0.34, 0.55], rocker: 0.22, grille: 'mesh', exhaust: 'single', bed: true, spoiler: 'none',
  },
  hatch: {
    outline: [
      [0.0, 0.18], [0.02, 0.44], [0.12, 0.5], [0.26, 0.54], [0.34, 0.82],
      [0.4, 0.9], [0.66, 0.93], [0.84, 0.82], [0.95, 0.5], [1.0, 0.42], [1.0, 0.18],
    ],
    plan: [[0, 0.62], [0.14, 0.9], [0.4, 1.0], [0.7, 0.99], [0.9, 0.9], [1.0, 0.68]],
    belt: 0.52, glass: [0.34, 0.86], rocker: 0.14, grille: 'wide', exhaust: 'single', spoiler: 'lip',
  },
  van: {
    outline: [
      [0.0, 0.24], [0.01, 0.6], [0.06, 0.82], [0.16, 0.95], [0.22, 1.0],
      [0.9, 1.0], [0.98, 0.9], [1.0, 0.6], [1.0, 0.24], [0.0, 0.24],
    ],
    plan: [[0, 0.78], [0.12, 0.96], [0.5, 1.0], [0.88, 0.97], [1.0, 0.82]],
    belt: 0.62, glass: [0.1, 0.4], rocker: 0.22, grille: 'mesh', exhaust: 'single', roofRails: true, spoiler: 'none',
  },
  super: {
    outline: [
      [0.0, 0.12], [0.06, 0.22], [0.2, 0.26], [0.36, 0.34], [0.43, 0.5],
      [0.5, 0.6], [0.62, 0.61], [0.74, 0.54], [0.88, 0.44], [1.0, 0.38], [1.0, 0.12],
    ],
    plan: [[0, 0.5], [0.12, 0.86], [0.3, 1.0], [0.5, 1.0], [0.72, 1.0], [0.9, 0.86], [1.0, 0.56]],
    belt: 0.46, glass: [0.42, 0.74], rocker: 0.06, grille: 'split', exhaust: 'quad', spoiler: 'wing',
  },
};

// ------------------------------------------------------------------ helpers

function box(w: number, h: number, d: number, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
}
function add<T extends THREE.Object3D>(group: THREE.Group, obj: T): T { group.add(obj); return obj; }

function jitter(i: number): number {
  const x = Math.sin(i * 12.9898) * 43758.5453;
  return (x - Math.floor(x)) - 0.5;
}

/** Piecewise-linear lookup over [xFrac, value] control points. */
function lerpTable(table: [number, number][], x: number): number {
  if (x <= table[0][0]) return table[0][1];
  const last = table[table.length - 1];
  if (x >= last[0]) return last[1];
  for (let i = 1; i < table.length; i++) {
    const [x1, v1] = table[i];
    if (x <= x1) { const [x0, v0] = table[i - 1]; const t = (x - x0) / (x1 - x0 || 1); return v0 + (v1 - v0) * t; }
  }
  return last[1];
}

/** Smooth a normalized outline into a rounded closed Shape. */
function smoothShape(pts: [number, number][], toX: (n: number) => number, toY: (n: number) => number, samples: number): THREE.Shape {
  const src = pts.slice();
  const a = src[0], b = src[src.length - 1];
  if (src.length > 2 && Math.abs(a[0] - b[0]) < 1e-4 && Math.abs(a[1] - b[1]) < 1e-4) src.pop();
  const v = src.map((p) => new THREE.Vector3(toX(p[0]), toY(p[1]), 0));
  const curve = new THREE.CatmullRomCurve3(v, true, 'centripetal', 0.5);
  const sampled = curve.getPoints(samples);
  const shape = new THREE.Shape();
  sampled.forEach((p, i) => (i === 0 ? shape.moveTo(p.x, p.y) : shape.lineTo(p.x, p.y)));
  shape.closePath();
  return shape;
}

/**
 * Shape the extruded slab into a car cross-section: flat vertical door sides,
 * a rounded shoulder into a narrower roof, a rocker tuck — AND a longitudinal
 * plan taper so the nose and tail pinch in. Modifies z in place.
 */
function shapeBody(geo: THREE.BufferGeometry, L: number, plan: [number, number][]) {
  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  const y0 = bb.min.y, y1 = bb.max.y, span = Math.max(1e-4, y1 - y0);
  const shoulder = 0.66, rocker = 0.1;
  const pos = geo.attributes.position.array as Float32Array;
  for (let i = 0; i < geo.attributes.position.count; i++) {
    const x = pos[i * 3], h = (pos[i * 3 + 1] - y0) / span;
    // vertical crown
    let f = 1;
    if (h > shoulder) { const t = (h - shoulder) / (1 - shoulder); f = 1 - 0.52 * t * t; }
    else if (h < rocker) { const t = (rocker - h) / rocker; f = 1 - 0.22 * t; }
    else f = 1 + 0.02 * (1 - Math.abs((h - (rocker + shoulder) / 2) / ((shoulder - rocker) / 2)));
    // longitudinal plan taper
    const xFrac = Math.min(1, Math.max(0, 0.5 - x / L));
    f *= lerpTable(plan, xFrac);
    pos[i * 3 + 2] *= f;
  }
  geo.attributes.position.needsUpdate = true;
}

// ------------------------------------------------------------------ wheels

/** Low-profile tyre on a multi-spoke alloy, axle along z. */
function makeWheel(r: number, mats: Mats, spokes = 10): THREE.Group {
  const w = new THREE.Group();
  const width = r * 0.62;
  const rimR = r * 0.78;
  const tyre = new THREE.Mesh(new THREE.CylinderGeometry(r, r, width, 32), mats.tyre);
  tyre.rotation.x = Math.PI / 2; w.add(tyre);
  const shoulder = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.99, r * 0.99, width * 1.02, 32), mats.tyre);
  shoulder.rotation.x = Math.PI / 2; w.add(shoulder);
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(rimR * 0.82, rimR * 0.82, width * 0.34, 24), mats.chrome);
  disc.rotation.x = Math.PI / 2; w.add(disc);
  const caliper = new THREE.Mesh(new THREE.BoxGeometry(r * 0.14, r * 0.3, width * 0.5), mats.caliper);
  caliper.position.set(0, rimR * 0.6, 0); w.add(caliper);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(rimR, rimR, width * 0.94, 32), mats.rim);
  barrel.rotation.x = Math.PI / 2; w.add(barrel);
  const face = new THREE.Mesh(new THREE.CylinderGeometry(rimR * 0.97, rimR * 0.97, width * 0.1, 32), mats.black);
  face.rotation.x = Math.PI / 2; face.position.z = width * 0.44; w.add(face);
  for (let i = 0; i < spokes; i++) {
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(rimR * 1.72, rimR * 0.11, width * 0.26), mats.rim);
    spoke.rotation.z = (i / spokes) * Math.PI;
    spoke.position.z = width * 0.46; w.add(spoke);
  }
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.15, r * 0.15, width, 12), mats.chrome);
  hub.rotation.x = Math.PI / 2; hub.position.z = width * 0.5; w.add(hub);
  return w;
}

function addWheels(group: THREE.Group, offsets: [number, number, number][], r: number, mats: Mats, spokes = 10) {
  const template = makeWheel(r, mats, spokes);
  for (const [x, y, z] of offsets) { const c = template.clone(); c.position.set(x, y, z); group.add(c); }
}

/** Flared body-colour arches with a dark lip, fitted over each wheel. */
function addArches(group: THREE.Group, offsets: [number, number, number][], r: number, W: number, mats: Mats) {
  const hz = W / 2;
  const flare = new THREE.TorusGeometry(r * 1.2, r * 0.22, 8, 18, Math.PI);
  const lip = new THREE.TorusGeometry(r * 1.22, r * 0.06, 6, 18, Math.PI);
  for (const [x, y, z] of offsets) {
    const s = Math.sign(z) || 1;
    const a = new THREE.Mesh(flare, mats.paint); a.position.set(x, y, s * (hz - r * 0.06)); group.add(a);
    const l = new THREE.Mesh(lip, mats.trim); l.position.set(x, y, s * (hz + r * 0.04)); group.add(l);
  }
}

// ------------------------------------------------------------------ detail registry

interface Detail { obj: THREE.Object3D; base: THREE.Vector3; zone: keyof BodyDamage; }

// ------------------------------------------------------------------ body + greenhouse

function buildBody(
  group: THREE.Group, spec: CarSpec, mats: Mats, L: number, bodyH: number, W: number,
  reg: (o: THREE.Object3D, z: keyof BodyDamage) => void,
) {
  const yBottom = -bodyH * 0.5;
  const ySpan = bodyH * 1.5;
  const toX = (sx: number) => (0.5 - sx) * L;
  const toY = (sy: number) => yBottom + sy * ySpan;

  // --- main shell ---
  const shape = smoothShape(spec.outline, toX, toY, 128);
  const bevel = Math.min(0.06, W * 0.05);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: W - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, steps: 8, curveSegments: 36,
  });
  geo.translate(0, 0, -W / 2 + bevel);
  shapeBody(geo, L, spec.plan);
  geo.computeVertexNormals();
  const body = new THREE.Mesh(geo, mats.paint);
  group.add(body);

  // --- greenhouse: the body already forms the (painted) roof & pillars; inset
  //     dark glass panels as windows, the way a real car reads. ---
  const cabFront = toX(spec.glass[0]);           // world x, front of cabin (+x)
  const cabRear = toX(spec.glass[1]);            // world x, rear of cabin
  const cabinCx = (cabFront + cabRear) / 2, cabinLen = cabFront - cabRear;
  const beltY = toY(spec.belt);
  const topTable: [number, number][] = [];
  for (const p of spec.outline) { if (topTable.length && p[0] < topTable[topTable.length - 1][0]) break; topTable.push([p[0], p[1]]); }
  const localTopY = (xf: number) => toY(lerpTable(topTable, xf));
  const roofY = localTopY((spec.glass[0] + spec.glass[1]) / 2);
  // Approximate greenhouse half-width after tumblehome, so glass hugs the sides.
  const sideZ = (W / 2) * lerpTable(spec.plan, (spec.glass[0] + spec.glass[1]) / 2) * 0.77;
  const glassInset = W * 0.01;
  const winBase = beltY + bodyH * 0.03; // glass sits above the belt

  const multiWin = spec.glass[1] - spec.glass[0] > 0.4;
  const sideWins = multiWin
    ? [{ cx: cabinCx + cabinLen * 0.24, len: cabinLen * 0.26 }, { cx: cabinCx - cabinLen * 0.17, len: cabinLen * 0.3 }]
    : [{ cx: cabinCx - cabinLen * 0.02, len: cabinLen * 0.5 }];
  for (const s of [1, -1]) {
    for (const w of sideWins) {
      const top = localTopY(0.5 - w.cx / L) - bodyH * 0.08;
      if (top <= winBase + bodyH * 0.02) continue;
      const h = (top - winBase) * 0.9;
      reg(add(group, box(w.len, h, glassInset, mats.glass, w.cx, winBase + (top - winBase) * 0.5, s * sideZ)), 'roof');
    }
    // chrome belt strip under the side glass
    reg(add(group, box(cabinLen * 0.9, bodyH * 0.012, glassInset * 1.2, mats.chrome, cabinCx, winBase - bodyH * 0.005, s * sideZ * 1.01)), 'roof');
  }

  // Windshield & backlight as thin dark plates tilted to the roofline.
  const tilt = (baseX: number, topDX: number): THREE.Mesh => {
    const topX = baseX + topDX;
    const topY = localTopY(0.5 - topX / L) - bodyH * 0.05;
    const len = Math.hypot(topX - baseX, topY - winBase);
    const ang = Math.atan2(topY - winBase, topX - baseX);
    const pane = box(len * 0.92, glassInset, sideZ * 2 * 0.8, mats.glass, (baseX + topX) / 2, (winBase + topY) / 2, 0);
    pane.rotation.z = ang;
    return pane;
  };
  reg(add(group, tilt(cabFront - cabinLen * 0.03, -cabinLen * 0.24)), 'roof'); // windshield
  reg(add(group, tilt(cabRear + cabinLen * 0.03, cabinLen * 0.2)), 'roof');    // backlight

  // Capture rest positions for zone crumpling.
  const origPos = new Float32Array(geo.attributes.position.array as ArrayLike<number>);
  const hx = L / 2, hz = W / 2;
  const crumple = (d: BodyDamage, t: number) => {
    const arr = geo.attributes.position.array as Float32Array;
    const fr = d.front / 100, re = d.rear / 100, le = d.left / 100, ri = d.right / 100, ro = d.roof / 100;
    const any = Math.max(fr, re, le, ri, ro);
    for (let i = 0; i < geo.attributes.position.count; i++) {
      let x = origPos[i * 3], y = origPos[i * 3 + 1], z = origPos[i * 3 + 2];
      const j = jitter(i);
      if (x > hx * 0.2 && fr > 0) { x -= ((x - hx * 0.2) / hx) * fr * L * 0.34 * t; y += j * 0.09 * fr * t; }
      if (x < -hx * 0.2 && re > 0) { x += ((-x - hx * 0.2) / hx) * re * L * 0.24 * t; }
      if (z > hz * 0.35 && le > 0) z -= (z / hz) * le * W * 0.34 * t;
      if (z < -hz * 0.35 && ri > 0) z += (-z / hz) * ri * W * 0.34 * t;
      if (y > bodyH * 0.3 && ro > 0) y -= (y / bodyH) * ro * bodyH * 0.5 * t;
      x += j * 0.03 * any * t; z += jitter(i + 7) * 0.02 * any * t;
      arr[i * 3] = x; arr[i * 3 + 1] = y; arr[i * 3 + 2] = z;
    }
    geo.attributes.position.needsUpdate = true;
    geo.computeVertexNormals();
  };
  return { crumple, beltY, roofY, cabinCx, cabinLen };
}

// ------------------------------------------------------------------ details

function addDetails(
  group: THREE.Group, spec: CarSpec, mats: Mats, L: number, bodyH: number, W: number, ctx: { beltY: number },
  reg: (o: THREE.Object3D, z: keyof BodyDamage) => void,
) {
  const hx = L / 2, hz = W / 2;
  const yB = -bodyH * 0.5;
  const noseY = yB + (spec.rocker + 0.42) * bodyH * 1.0;
  // Local body width at the nose & tail, so fascias/lights hug the taper
  // instead of shelving out past it.
  const fw = W * lerpTable(spec.plan, 0.05);   // full width at nose
  const rw = W * lerpTable(spec.plan, 0.95);   // full width at tail
  const fhz = fw / 2;

  // --- Front fascia ---
  reg(add(group, box(L * 0.03, bodyH * 0.34, fw * 0.99, mats.paint, hx * 0.985, yB + bodyH * 0.34, 0)), 'front'); // cap
  reg(add(group, box(L * 0.04, bodyH * 0.15, fw * 0.86, mats.trim, hx * 0.985, yB + bodyH * 0.14, 0)), 'front'); // lower intake
  // Grille
  if (spec.grille === 'split') {
    for (const s of [1, -1]) reg(add(group, box(L * 0.02, bodyH * 0.13, fw * 0.3, mats.trim, hx * 0.995, yB + bodyH * 0.3, s * fhz * 0.42)), 'front');
  } else {
    reg(add(group, box(L * 0.02, bodyH * 0.14, fw * (spec.grille === 'wide' ? 0.5 : 0.62), mats.trim, hx * 0.995, yB + bodyH * 0.3, 0)), 'front');
    if (spec.grille === 'slat') for (let i = -2; i <= 2; i++) reg(add(group, box(L * 0.025, bodyH * 0.015, fw * 0.58, mats.chrome, hx * 1.0, yB + bodyH * (0.3 + i * 0.03), 0)), 'front');
  }
  // Headlights + DRL accent
  for (const s of [1, -1]) {
    reg(add(group, box(L * 0.03, bodyH * 0.08, fw * 0.2, mats.headlight, hx * 0.99, noseY, s * fhz * 0.66)), 'front');
    reg(add(group, box(L * 0.02, bodyH * 0.02, fw * 0.22, mats.drl, hx * 1.0, noseY - bodyH * 0.06, s * fhz * 0.64)), 'front');
  }
  if (spec.bulgeHood) add(group, box(L * 0.22, bodyH * 0.05, W * 0.4, mats.paint, hx * 0.5, yB + bodyH * 0.48, 0));

  // --- Rear fascia: full-width LED bar + valance ---
  reg(add(group, box(L * 0.02, bodyH * 0.07, rw * 0.9, mats.taillight, -hx * 0.99, noseY, 0)), 'rear');
  reg(add(group, box(L * 0.035, bodyH * 0.14, rw * 0.8, mats.trim, -hx * 0.985, yB + bodyH * 0.13, 0)), 'rear'); // valance

  // Exhaust
  if (spec.exhaust !== 'hidden') {
    const tips = spec.exhaust === 'quad' ? [-0.34, -0.2, 0.2, 0.34] : spec.exhaust === 'dual' ? [-0.3, 0.3] : [0.34];
    for (const tz of tips) {
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(bodyH * 0.05, bodyH * 0.05, L * 0.04, 12), mats.chrome);
      pipe.rotation.z = Math.PI / 2;
      pipe.position.set(-hx * 0.985, yB + bodyH * 0.08, tz * rw);
      group.add(pipe);
    }
  }

  // --- Rocker / lower cladding (dark), tucked in ---
  add(group, box(L * 0.82, bodyH * 0.12, W * 0.96, mats.paintDark, 0, yB + (spec.rocker + 0.02) * bodyH, 0));

  // --- Door shut-lines + handles on both sides ---
  // Confined to the lower door panel (rocker→belt) so a shut-line never pokes
  // above a low rear deck into open air. Handles sit mid-door where the side is
  // full-width, so they stay flush instead of floating off the crowned top.
  const doorX = spec.glass[1] - spec.glass[0] > 0.4 ? [0.16, -0.08] : [0.02];
  const doorTop = ctx.beltY - bodyH * 0.03, doorBot = yB + bodyH * 0.22;
  for (const s of [1, -1]) {
    for (const dx of doorX) {
      const lhz = (W * lerpTable(spec.plan, 0.5 - dx)) / 2;
      reg(add(group, box(L * 0.003, doorTop - doorBot, W * 0.004, mats.black, dx * L, (doorTop + doorBot) / 2, s * lhz * 0.985)), s > 0 ? 'left' : 'right');
      const hx2 = dx * L + L * 0.05;
      const hhz = (W * lerpTable(spec.plan, 0.5 - hx2 / L)) / 2;
      add(group, box(L * 0.045, bodyH * 0.022, W * 0.016, mats.chrome, hx2, yB + bodyH * 0.38, s * hhz * 1.0));
    }
  }

  // --- Mirrors on short stalks at the base of the A-pillar ---
  const mxFrac = spec.glass[0] + 0.02;
  const mX = (0.5 - mxFrac) * L;
  const mHz = (W * lerpTable(spec.plan, mxFrac)) / 2;
  for (const s of [1, -1]) {
    add(group, box(L * 0.02, bodyH * 0.025, W * 0.05, mats.black, mX + L * 0.01, ctx.beltY - bodyH * 0.01, s * (mHz + W * 0.02)));
    add(group, box(L * 0.04, bodyH * 0.07, W * 0.028, mats.paint, mX, ctx.beltY, s * (mHz + W * 0.05)));
  }

  // --- Roof rails ---
  if (spec.roofRails) for (const s of [1, -1]) add(group, box(L * 0.4, bodyH * 0.03, W * 0.03, mats.black, -L * 0.05, bodyH * 0.98, s * hz * 0.62));

  // --- Spoiler ---
  if (spec.spoiler === 'wing') {
    const deckY = yB + bodyH * 0.6;
    for (const s of [1, -1]) add(group, box(L * 0.03, bodyH * 0.22, W * 0.04, mats.trim, -hx * 0.82, deckY, s * hz * 0.6));
    reg(add(group, box(L * 0.12, bodyH * 0.035, W * 0.96, mats.trim, -hx * 0.84, deckY + bodyH * 0.12, 0)), 'rear');
  } else if (spec.spoiler === 'ducktail') {
    reg(add(group, box(L * 0.1, bodyH * 0.05, W * 0.92, mats.paint, -hx * 0.82, yB + bodyH * 0.5, 0)), 'rear');
  } else if (spec.spoiler === 'lip') {
    reg(add(group, box(L * 0.05, bodyH * 0.03, W * 0.9, mats.paint, -hx * 0.86, ctx.beltY + bodyH * 0.02, 0)), 'rear');
  }

  // --- Pickup bed ---
  if (spec.bed) {
    const bedFloor = yB + bodyH * 0.62;
    const bedX = -L * 0.24, bedLen = L * 0.42, wall = bodyH * 0.24;
    for (const s of [1, -1]) add(group, box(bedLen, wall, W * 0.05, mats.paint, bedX, bedFloor + wall * 0.5, s * hz * 0.92));
    reg(add(group, box(L * 0.03, wall, W * 0.92, mats.paint, -hx * 0.95, bedFloor + wall * 0.5, 0)), 'rear');
    add(group, box(bedLen, bodyH * 0.04, W * 0.86, mats.black, bedX, bedFloor, 0));
  }
}

// ------------------------------------------------------------------ public API

export interface CarMeshOpts {
  accent?: string;
  finish?: PaintFinish;
  wheelSpokes?: number;
  /** Installed aero parts (overrides spec spoiler when present). */
  aero?: { spoiler?: boolean; wing?: boolean; splitter?: boolean; diffuser?: boolean };
}

/** Build a car for a given archetype at explicit dimensions. */
export function buildArchetypeCar(
  archetype: Archetype, L: number, bodyH: number, W: number, paintColor: string,
  wheelRadius: number, wheelOffsets: number[][], opts: CarMeshOpts = {},
): { group: THREE.Group; deform: (damage: BodyDamage, t: number) => void } {
  const group = new THREE.Group();
  const mats = makeMaterials(paintColor, opts.accent, opts.finish);
  const spec: CarSpec = { ...SPECS[archetype] };
  if (opts.aero) {
    if (opts.aero.wing) spec.spoiler = 'wing';
    else if (opts.aero.spoiler) spec.spoiler = 'ducktail';
  }
  const details: Detail[] = [];
  const reg = (obj: THREE.Object3D, zone: keyof BodyDamage) => { details.push({ obj, base: obj.position.clone(), zone }); };

  const { crumple, beltY } = buildBody(group, spec, mats, L, bodyH, W, reg);
  addDetails(group, spec, mats, L, bodyH, W, { beltY }, reg);

  const offs = wheelOffsets.map((o) => [o[0], o[1], o[2]] as [number, number, number]);
  addWheels(group, offs, wheelRadius, mats, opts.wheelSpokes ?? 10);
  addArches(group, offs, wheelRadius, W, mats);

  const glassBase = new THREE.Color(0x0a1016);
  const glassShattered = new THREE.Color(0xaebac4);
  const deform = (d: BodyDamage, t: number) => {
    crumple(d, t);
    const shatter = Math.max(0, Math.min(1, (Math.max(d.front, d.roof) / 100) * t));
    mats.glass.color.copy(glassBase).lerp(glassShattered, shatter);
    mats.glass.roughness = 0.12 + 0.7 * shatter;
    for (const it of details) {
      const fr = d.front / 100, re = d.rear / 100, ro = d.roof / 100, le = d.left / 100, ri = d.right / 100;
      let dx = 0, dy = 0, dz = 0;
      if (it.zone === 'front') { dx = -fr * L * 0.24 * t; dy = -fr * bodyH * 0.08 * t; }
      else if (it.zone === 'rear') { dx = re * L * 0.2 * t; }
      else if (it.zone === 'roof') { dy = -ro * bodyH * 0.34 * t; }
      else if (it.zone === 'left') { dz = -le * W * 0.22 * t; }
      else if (it.zone === 'right') { dz = ri * W * 0.22 * t; }
      it.obj.position.set(it.base.x + dx, it.base.y + dy, it.base.z + dz);
    }
  };
  return { group, deform };
}

/**
 * Back-compatible entry used by the crash renderer: maps a chassis silhouette
 * style to an archetype and forwards.
 */
export function buildCarMesh(
  style: SilhouetteStyle, L: number, bodyH: number, W: number, paintColor: string,
  wheelRadius: number, wheelOffsets: number[][], opts: CarMeshOpts = {},
): { group: THREE.Group; deform: (damage: BodyDamage, t: number) => void } {
  const archetype = STYLE_ARCHETYPE[style] ?? 'sedan';
  return buildArchetypeCar(archetype, L, bodyH, W, paintColor, wheelRadius, wheelOffsets, opts);
}

export { CHASSIS_STYLE };

/** Sensible standalone dimensions per archetype (for the showcase). */
export function archetypeDims(a: Archetype): { L: number; bodyH: number; W: number; wheelR: number; wheelOffsets: number[][] } {
  const table: Record<Archetype, [number, number, number, number]> = {
    sports: [4.4, 1.15, 1.95, 0.32], sedan: [4.8, 1.34, 1.9, 0.31], muscle: [4.9, 1.3, 2.0, 0.33],
    suv: [4.7, 1.7, 1.98, 0.37], pickup: [5.4, 1.66, 2.0, 0.37], hatch: [3.9, 1.38, 1.85, 0.3],
    van: [5.0, 1.95, 1.95, 0.32], super: [4.5, 1.05, 2.0, 0.33],
  };
  const [L, bodyH, W, wheelR] = table[a];
  const hx = L / 2, hz = W / 2, wx = hx * 0.72, wz = hz + 0.02, wy = -bodyH * 0.5 + wheelR * 0.5;
  return { L, bodyH, W, wheelR, wheelOffsets: [[wx, wy, wz], [wx, wy, -wz], [-wx, wy, wz], [-wx, wy, -wz]] };
}
