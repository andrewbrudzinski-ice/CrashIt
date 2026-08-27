import * as THREE from 'three';
import { SILHOUETTES, type SilhouetteStyle } from './silhouetteProfiles';

/**
 * Procedural low-poly vehicles that read as real cars (not any specific brand).
 * The main sheet-metal body is extruded from the same side-profile silhouette
 * used by the 2.5D thumbnails, then dressed with bumpers, head/tail-lights,
 * wheel arches, mirrors and a rocker line. Distinct builders cover a pickup
 * (open bed) and a semi (tractor + box trailer with multiple axles).
 *
 * Local frame: +x = front, +y = up, +z = left. The group origin is the chassis
 * centre (matching the physics box) so it drops straight onto the baked transform.
 */

export interface BodyDamage {
  front: number; rear: number; left: number; right: number; roof: number;
}

interface Detail { obj: THREE.Object3D; base: THREE.Vector3; zone: keyof BodyDamage; }

function jitter(i: number): number {
  const x = Math.sin(i * 12.9898) * 43758.5453;
  return (x - Math.floor(x)) - 0.5;
}

/** Pick a readable accent (racing-stripe / caliper) colour from the paint:
 *  a bright complementary pop that stays legible on both light and dark paint. */
function accentFrom(paint: THREE.Color): THREE.Color {
  const hsl = { h: 0, s: 0, l: 0 };
  paint.getHSL(hsl);
  // Rotate hue, force it vivid and mid-bright regardless of the base tone.
  return new THREE.Color().setHSL((hsl.h + 0.5) % 1, 0.85, 0.55);
}

function makeMaterials(paintColor: string, accentColor?: string) {
  const paint = new THREE.Color(paintColor);
  const accent = accentColor ? new THREE.Color(accentColor) : accentFrom(paint);
  return {
    // Metallic clearcoat car paint — reads glossy under the studio env map,
    // with a lacquer coat over a coloured metallic base (not flat plastic).
    paint: new THREE.MeshPhysicalMaterial({
      color: paint, roughness: 0.48, metalness: 0.35,
      clearcoat: 0.4, clearcoatRoughness: 0.35, envMapIntensity: 0.4,
    }),
    paintDark: new THREE.MeshStandardMaterial({ color: paint.clone().multiplyScalar(0.4), roughness: 0.55, metalness: 0.55 }),
    accent: new THREE.MeshPhysicalMaterial({
      color: accent, roughness: 0.3, metalness: 0.55, clearcoat: 0.6, clearcoatRoughness: 0.25, envMapIntensity: 1.1,
    }),
    caliper: new THREE.MeshStandardMaterial({ color: accent, roughness: 0.4, metalness: 0.4 }),
    trim: new THREE.MeshStandardMaterial({ color: 0x14181d, roughness: 0.7, metalness: 0.35 }),
    chrome: new THREE.MeshStandardMaterial({ color: 0xc2cbd4, roughness: 0.16, metalness: 1, envMapIntensity: 1.4 }),
    glass: new THREE.MeshPhysicalMaterial({
      color: 0x070c11, roughness: 0.14, metalness: 0.1, clearcoat: 0.5, clearcoatRoughness: 0.12, envMapIntensity: 0.75,
    }),
    headlight: new THREE.MeshStandardMaterial({ color: 0xfff3cf, emissive: 0xfff0c0, emissiveIntensity: 0.9, roughness: 0.2, metalness: 0.2 }),
    taillight: new THREE.MeshStandardMaterial({ color: 0xff3324, emissive: 0xff2010, emissiveIntensity: 0.85, roughness: 0.3 }),
    tyre: new THREE.MeshStandardMaterial({ color: 0x0b0d11, roughness: 0.88, metalness: 0.05 }),
    rim: new THREE.MeshStandardMaterial({ color: 0x9aa4ae, roughness: 0.28, metalness: 0.95, envMapIntensity: 1.3 }),
    trailer: new THREE.MeshStandardMaterial({ color: 0xdbe0e6, roughness: 0.45, metalness: 0.4, envMapIntensity: 1.1 }),
  };
}
type Mats = ReturnType<typeof makeMaterials>;

function box(w: number, h: number, d: number, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
}

/** A single wheel oriented with its axle along z. */
function makeWheel(r: number, mats: Mats): THREE.Group {
  const w = new THREE.Group();
  const width = r * 0.55;
  const tyre = new THREE.Mesh(new THREE.CylinderGeometry(r, r, width, 20), mats.tyre);
  tyre.rotation.x = Math.PI / 2;
  w.add(tyre);
  // Brake disc + accent caliper, tucked inside the rim on the outer face.
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.62, r * 0.62, width * 0.4, 16), mats.chrome);
  disc.rotation.x = Math.PI / 2;
  w.add(disc);
  const caliper = new THREE.Mesh(new THREE.BoxGeometry(r * 0.18, r * 0.34, width * 0.6), mats.caliper);
  caliper.position.set(0, r * 0.5, 0);
  w.add(caliper);
  // Alloy rim: a shallow dish plus multi-spoke face.
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.66, r * 0.66, width * 1.02, 24), mats.rim);
  rim.rotation.x = Math.PI / 2;
  w.add(rim);
  const dish = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.7, r * 0.66, width * 0.2, 24), mats.tyre);
  dish.rotation.x = Math.PI / 2;
  dish.position.z = width * 0.5;
  w.add(dish);
  // Spokes on the outer face for a wheel-ish read.
  for (let i = 0; i < 5; i++) {
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(r * 1.1, r * 0.15, width * 0.42), mats.rim);
    spoke.rotation.z = (i / 5) * Math.PI;
    spoke.position.z = width * 0.28;
    w.add(spoke);
  }
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.18, r * 0.18, width * 1.14, 10), mats.chrome);
  hub.rotation.x = Math.PI / 2;
  w.add(hub);
  return w;
}

function addWheelsAt(group: THREE.Group, positions: [number, number, number][], r: number, mats: Mats) {
  const template = makeWheel(r, mats);
  for (const [x, y, z] of positions) {
    const w = template.clone();
    w.position.set(x, y, z);
    group.add(w);
  }
}

/** Smooth a normalized outline into a rounded closed Shape (kills facets). */
function smoothShape(pts: [number, number][], toX: (n: number) => number, toY: (n: number) => number, samples: number): THREE.Shape {
  // Drop a duplicated closing point so the spline doesn't kink at the seam.
  const src = pts.slice();
  const a = src[0], b = src[src.length - 1];
  if (src.length > 2 && Math.abs(a[0] - b[0]) < 1e-4 && Math.abs(a[1] - b[1]) < 1e-4) src.pop();
  const v = src.map((p) => new THREE.Vector3(toX(p[0]), toY(p[1]), 0));
  // Centripetal Catmull-Rom rounds the roof/hood without overshooting the
  // steep nose and tail faces; closed so the underside seam is smooth too.
  const curve = new THREE.CatmullRomCurve3(v, true, 'centripetal', 0.5);
  const sampled = curve.getPoints(samples);
  const shape = new THREE.Shape();
  sampled.forEach((p, i) => (i === 0 ? shape.moveTo(p.x, p.y) : shape.lineTo(p.x, p.y)));
  shape.closePath();
  return shape;
}

/** Shape the extruded cross-section like a real car: near-flat vertical door
 *  sides through the middle, a rounded shoulder rolling into the roof
 *  (tumblehome), and a small rocker tuck at the very bottom. NOT a round tube. */
function crownGeometry(geo: THREE.BufferGeometry, shoulder = 0.62, topTaper = 0.5) {
  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  const y0 = bb.min.y, y1 = bb.max.y, span = Math.max(1e-4, y1 - y0);
  const rocker = 0.12;
  const pos = geo.attributes.position.array as Float32Array;
  for (let i = 0; i < geo.attributes.position.count; i++) {
    const h = (pos[i * 3 + 1] - y0) / span;
    let f = 1;
    if (h > shoulder) { const t = (h - shoulder) / (1 - shoulder); f = 1 - topTaper * t * t; }
    else if (h < rocker) { const t = (rocker - h) / rocker; f = 1 - 0.2 * t; }
    else { f = 1 + 0.02 * (1 - Math.abs((h - (rocker + shoulder) / 2) / ((shoulder - rocker) / 2))); } // faint shoulder crown
    pos[i * 3 + 2] *= f;
  }
  geo.attributes.position.needsUpdate = true;
}

/** Extrude a normalized side profile into the deformable sheet-metal body. */
function buildProfileBody(
  group: THREE.Group, style: SilhouetteStyle, mats: Mats, L: number, bodyH: number, W: number, reg: (o: THREE.Object3D, z: keyof BodyDamage) => void,
) {
  const sil = SILHOUETTES[style];
  const yBottom = -bodyH * 0.5;
  const ySpan = bodyH * 1.5;
  const toX = (sx: number) => (0.5 - sx) * L;
  const toY = (sy: number) => yBottom + sy * ySpan;

  const shape = smoothShape(sil.body, toX, toY, 96);
  const bevel = Math.min(0.07, W * 0.055);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: W - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, steps: 1, curveSegments: 24,
  });
  geo.translate(0, 0, -W / 2 + bevel);
  crownGeometry(geo);
  geo.computeVertexNormals();
  const body = new THREE.Mesh(geo, mats.paint);
  group.add(body);

  // Glass greenhouse — a flush, dark daylight-opening set well inside the
  // shoulders (strong tumblehome), lightly rounded, no bubble.
  const gs = smoothShape(sil.glass, toX, toY, 48);
  const gW = W * 0.86;
  const gGeo = new THREE.ExtrudeGeometry(gs, { depth: gW, bevelEnabled: true, bevelThickness: W * 0.015, bevelSize: W * 0.015, bevelSegments: 1, steps: 1, curveSegments: 16 });
  gGeo.translate(0, 0, -gW / 2);
  crownGeometry(gGeo, 0.15, 0.55);
  gGeo.computeVertexNormals();
  const glass = new THREE.Mesh(gGeo, mats.glass);
  group.add(glass);
  reg(glass, 'roof');

  // Floating roof: a body-colour cap over the top of the greenhouse so the
  // roof reads as painted metal and the pillars blacken out (modern look).
  const gxs = sil.glass.map((p) => toX(p[0]));
  const gx0 = Math.min(...gxs), gx1 = Math.max(...gxs);
  const gyTop = toY(Math.max(...sil.glass.map((p) => p[1])));
  const roof = box((gx1 - gx0) * 0.9, bodyH * 0.06, gW * 0.9, mats.paint, (gx0 + gx1) / 2, gyTop, 0);
  reg(add(group, roof), 'roof');

  const origPos = new Float32Array(geo.attributes.position.array as ArrayLike<number>);
  const hx = L / 2, hz = W / 2;
  const crumple = (d: BodyDamage, t: number) => {
    const arr = geo.attributes.position.array as Float32Array;
    const fr = d.front / 100, re = d.rear / 100, le = d.left / 100, ri = d.right / 100, ro = d.roof / 100;
    const any = Math.max(fr, re, le, ri, ro);
    for (let i = 0; i < geo.attributes.position.count; i++) {
      let x = origPos[i * 3], y = origPos[i * 3 + 1], z = origPos[i * 3 + 2];
      const j = jitter(i);
      if (x > 0 && fr > 0) { x -= (x / hx) * fr * L * 0.3 * t; y += j * 0.08 * fr * t; }
      if (x < 0 && re > 0) { x += (-x / hx) * re * L * 0.22 * t; }
      if (z > hz * 0.3 && le > 0) z -= (z / hz) * le * W * 0.32 * t;
      if (z < -hz * 0.3 && ri > 0) z += (-z / hz) * ri * W * 0.32 * t;
      if (y > bodyH * 0.3 && ro > 0) y -= (y / bodyH) * ro * bodyH * 0.45 * t;
      x += j * 0.03 * any * t;
      z += jitter(i + 7) * 0.02 * any * t;
      arr[i * 3] = x; arr[i * 3 + 1] = y; arr[i * 3 + 2] = z;
    }
    geo.attributes.position.needsUpdate = true;
    geo.computeVertexNormals();
  };
  return crumple;
}

/** Bumpers, lights, grille, mirrors, rocker line — the details that sell it. */
function addCommonDetails(
  group: THREE.Group, style: SilhouetteStyle, mats: Mats, L: number, bodyH: number, W: number, reg: (o: THREE.Object3D, z: keyof BodyDamage) => void,
) {
  const hx = L / 2, hz = W / 2;
  const yBottom = -bodyH * 0.5;
  const tall = style === 'suv' || style === 'van' || style === 'pickup';
  const beltY = yBottom + bodyH * (tall ? 0.5 : 0.42);

  // --- Front fascia: body-colour cap, dark lower intake, slim LED headlights + DRL. ---
  reg(add(group, box(L * 0.03, bodyH * 0.34, W * 0.98, mats.paint, hx * 0.99, yBottom + bodyH * 0.32, 0)), 'front');
  reg(add(group, box(L * 0.035, bodyH * 0.16, W * 0.82, mats.trim, hx * 0.985, yBottom + bodyH * 0.13, 0)), 'front'); // lower intake
  reg(add(group, box(L * 0.02, bodyH * 0.14, W * 0.42, mats.trim, hx * 0.995, beltY - bodyH * 0.04, 0)), 'front'); // slim grille
  for (const s of [1, -1]) {
    // Wraparound headlight cluster + a thin DRL accent line beneath it.
    reg(add(group, box(L * 0.02, bodyH * 0.09, W * 0.24, mats.headlight, hx * 0.995, beltY + bodyH * 0.02, s * hz * 0.62)), 'front');
    reg(add(group, box(L * 0.015, bodyH * 0.025, W * 0.26, mats.headlight, hx * 1.0, beltY - bodyH * 0.06, s * hz * 0.6)), 'front');
  }

  // --- Rear fascia: full-width LED light bar (the strongest modern cue) + valance. ---
  reg(add(group, box(L * 0.02, bodyH * 0.06, W * 0.9, mats.taillight, -hx * 0.99, beltY + bodyH * 0.02, 0)), 'rear');
  reg(add(group, box(L * 0.035, bodyH * 0.15, W * 0.8, mats.trim, -hx * 0.985, yBottom + bodyH * 0.12, 0)), 'rear'); // lower valance

  // Rocker / lower-body cladding (dark), tucked in.
  add(group, box(L * 0.86, bodyH * 0.13, W * 0.97, mats.paintDark, 0, yBottom + bodyH * 0.085, 0));
  // Aero side-mirror caps on stalks near the A-pillar.
  const mirrorX = hx * (style === 'coupe' || style === 'exotic' ? 0.14 : 0.26);
  for (const s of [1, -1]) {
    add(group, box(L * 0.045, bodyH * 0.08, W * 0.05, mats.paint, mirrorX, yBottom + bodyH * 0.6, s * (hz + W * 0.05)));
  }
  // Roof rails for the tall wagons.
  if (style === 'suv' || style === 'van') {
    for (const s of [1, -1]) add(group, box(L * 0.5, bodyH * 0.04, W * 0.04, mats.trim, -L * 0.05, bodyH * 0.98, s * hz * 0.68));
  }
}

/** Open cargo bed for the pickup. */
function addBed(group: THREE.Group, mats: Mats, L: number, bodyH: number, W: number, reg: (o: THREE.Object3D, z: keyof BodyDamage) => void) {
  const hx = L / 2, hz = W / 2;
  const bedFloorY = -bodyH * 0.5 + bodyH * 0.58;
  const bedX = -L * 0.22;
  const bedLen = L * 0.42;
  const wallH = bodyH * 0.3;
  // Side walls + tailgate.
  for (const s of [1, -1]) add(group, box(bedLen, wallH, W * 0.06, mats.paint, bedX, bedFloorY + wallH * 0.5, s * hz * 0.94));
  reg(add(group, box(L * 0.04, wallH, W * 0.94, mats.paint, -hx * 0.96, bedFloorY + wallH * 0.5, 0)), 'rear');
  add(group, box(bedLen, bodyH * 0.05, W * 0.9, mats.paintDark, bedX, bedFloorY, 0)); // bed floor
}

/** Flared body-colour wheel arches (with a dark cladding lip) over each wheel. */
function addArches(group: THREE.Group, offsets: [number, number, number][], r: number, W: number, mats: Mats) {
  const hz = W / 2;
  const flare = new THREE.TorusGeometry(r * 1.24, r * 0.2, 8, 16, Math.PI);  // painted flare
  const lip = new THREE.TorusGeometry(r * 1.26, r * 0.07, 6, 16, Math.PI);   // dark trim lip
  for (const [x, y] of offsets) {
    for (const s of [1, -1]) {
      const a = new THREE.Mesh(flare, mats.paint);
      a.position.set(x, y, s * (hz - r * 0.08));
      group.add(a);
      const l = new THREE.Mesh(lip, mats.trim);
      l.position.set(x, y, s * (hz + r * 0.02));
      group.add(l);
    }
  }
}

/** Twin racing stripes running nose-to-tail over the centre of the body. */
function addStripes(group: THREE.Group, style: SilhouetteStyle, mats: Mats, L: number, bodyH: number, W: number, reg: (o: THREE.Object3D, z: keyof BodyDamage) => void) {
  const topY = bodyH * (style === 'suv' || style === 'van' || style === 'pickup' ? 0.72 : 0.6);
  const stripeW = W * 0.1;
  const gap = W * 0.14;
  for (const s of [1, -1]) {
    const stripe = box(L * 0.94, bodyH * 0.02, stripeW, mats.accent, 0, topY, s * gap * 0.5);
    reg(add(group, stripe), 'roof');
  }
}

/** Bolt-on aero: reflects the installed parts so a race build looks the part. */
function addAero(
  group: THREE.Group, mats: Mats, L: number, bodyH: number, W: number,
  aero: { spoiler?: boolean; wing?: boolean; splitter?: boolean; diffuser?: boolean },
  reg: (o: THREE.Object3D, z: keyof BodyDamage) => void,
) {
  const hx = L / 2, hz = W / 2;
  const base = -bodyH * 0.5;
  // Big fixed race wing wins over a lip spoiler if both somehow set.
  if (aero.wing) {
    const deckY = base + bodyH * 0.92;
    for (const s of [1, -1]) {
      add(group, box(L * 0.04, bodyH * 0.34, W * 0.05, mats.trim, -hx * 0.86, deckY - bodyH * 0.14, s * hz * 0.6));
    }
    const plane = box(L * 0.14, bodyH * 0.04, W * 1.04, mats.trim, -hx * 0.88, deckY + bodyH * 0.04, 0);
    plane.rotation.z = -0.18;
    reg(add(group, plane), 'rear');
  } else if (aero.spoiler) {
    // Ducktail lip on the rear deck.
    reg(add(group, box(L * 0.1, bodyH * 0.06, W * 0.98, mats.paint, -hx * 0.84, base + bodyH * 0.7, 0)), 'rear');
  }
  if (aero.splitter) {
    const blade = box(L * 0.12, bodyH * 0.03, W * 1.06, mats.trim, hx * 0.9, base + bodyH * 0.08, 0);
    reg(add(group, blade), 'front');
  }
  if (aero.diffuser) {
    for (let i = -2; i <= 2; i++) {
      add(group, box(L * 0.08, bodyH * 0.16, W * 0.04, mats.trim, -hx * 0.9, base + bodyH * 0.14, i * W * 0.18));
    }
  }
}

/** Dedicated tractor + box-trailer semi. Returns null (crumple via details). */
function buildSemi(group: THREE.Group, mats: Mats, L: number, bodyH: number, W: number, r: number, reg: (o: THREE.Object3D, z: keyof BodyDamage) => void) {
  const hx = L / 2, hz = W / 2;
  const base = -bodyH * 0.5;
  const wy = base + r * 0.4;

  // Chassis rail.
  add(group, box(L * 0.98, bodyH * 0.12, W * 0.7, mats.trim, 0, base + bodyH * 0.18, 0));

  // Hood (engine) up front.
  reg(add(group, box(L * 0.14, bodyH * 0.42, W * 0.9, mats.paint, hx - L * 0.08, base + bodyH * 0.42, 0)), 'front');
  // Grille + bumper + lights.
  reg(add(group, box(L * 0.02, bodyH * 0.4, W * 0.86, mats.chrome, hx - L * 0.005, base + bodyH * 0.42, 0)), 'front');
  reg(add(group, box(L * 0.03, bodyH * 0.16, W * 0.98, mats.trim, hx - L * 0.005, base + bodyH * 0.16, 0)), 'front');
  for (const s of [1, -1]) reg(add(group, box(L * 0.02, bodyH * 0.14, W * 0.14, mats.headlight, hx - L * 0.01, base + bodyH * 0.34, s * hz * 0.72)), 'front');

  // Cab (tall, behind the hood).
  reg(add(group, box(L * 0.16, bodyH * 1.15, W * 0.96, mats.paint, hx - L * 0.24, base + bodyH * 0.62, 0)), 'roof');
  // Windshield + side glass.
  reg(add(group, box(L * 0.03, bodyH * 0.5, W * 0.86, mats.glass, hx - L * 0.165, base + bodyH * 0.95, 0)), 'roof');
  for (const s of [1, -1]) add(group, box(L * 0.12, bodyH * 0.42, W * 0.02, mats.glass, hx - L * 0.24, base + bodyH * 0.9, s * hz * 0.97));

  // Twin exhaust stacks behind the cab.
  for (const s of [1, -1]) {
    const stack = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.18, r * 0.18, bodyH * 1.5, 8), mats.chrome);
    stack.position.set(hx - L * 0.32, base + bodyH * 0.9, s * hz * 0.85);
    group.add(stack);
  }
  // Fuel tanks (sides, between axles).
  for (const s of [1, -1]) {
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.5, r * 0.5, L * 0.1, 12), mats.chrome);
    tank.rotation.z = Math.PI / 2;
    tank.position.set(hx - L * 0.34, base + bodyH * 0.3, s * hz * 0.95);
    group.add(tank);
  }

  // Box trailer.
  reg(add(group, box(L * 0.58, bodyH * 1.35, W * 1.0, mats.trailer, -hx + L * 0.29, base + bodyH * 0.9, 0)), 'roof');
  reg(add(group, box(L * 0.02, bodyH * 1.3, W * 0.98, mats.trim, -hx + L * 0.01, base + bodyH * 0.9, 0)), 'rear'); // rear doors
  for (const s of [1, -1]) reg(add(group, box(L * 0.02, bodyH * 0.12, W * 0.12, mats.taillight, -hx + L * 0.005, base + bodyH * 0.34, s * hz * 0.7)), 'rear');

  // Axles: steer (2) + drive tandem (4) + trailer tandem (4).
  const pos: [number, number, number][] = [];
  const rows = [hx - L * 0.06, hx - L * 0.34, hx - L * 0.42, -hx + L * 0.16, -hx + L * 0.08];
  for (const rx of rows) for (const s of [1, -1]) pos.push([rx, wy, s * hz * 0.98]);
  addWheelsAt(group, pos, r, mats);

  return null;
}

function add<T extends THREE.Object3D>(group: THREE.Group, obj: T): T {
  group.add(obj);
  return obj;
}

export interface CarMeshOpts {
  /** Accent colour for stripes/calipers/wing (defaults to a complementary pop). */
  accent?: string;
  /** Paint centre-stripes (sporty look). */
  stripes?: boolean;
  /** Installed aero parts to render as bolt-ons. */
  aero?: { spoiler?: boolean; wing?: boolean; splitter?: boolean; diffuser?: boolean };
}

export function buildCarMesh(
  style: SilhouetteStyle,
  L: number,
  bodyH: number,
  W: number,
  paintColor: string,
  wheelRadius: number,
  wheelOffsets: number[][],
  opts: CarMeshOpts = {},
): { group: THREE.Group; deform: (damage: BodyDamage, t: number) => void } {
  const group = new THREE.Group();
  const mats = makeMaterials(paintColor, opts.accent);
  const details: Detail[] = [];
  const reg = (obj: THREE.Object3D, zone: keyof BodyDamage) => { details.push({ obj, base: obj.position.clone(), zone }); };

  let crumple: ((d: BodyDamage, t: number) => void) | null = null;

  if (style === 'semi') {
    crumple = buildSemi(group, mats, L, bodyH, W, wheelRadius, reg);
  } else {
    crumple = buildProfileBody(group, style, mats, L, bodyH, W, reg);
    addCommonDetails(group, style, mats, L, bodyH, W, reg);
    if (style === 'pickup') addBed(group, mats, L, bodyH, W, reg);
    if (opts.stripes) addStripes(group, style, mats, L, bodyH, W, reg);
    if (opts.aero) addAero(group, mats, L, bodyH, W, opts.aero, reg);
    // Big wheels that fill the arches (modern proportions) — visual only, the
    // physics wheels are separate colliders.
    const vr = wheelRadius * 1.12;
    const offs = wheelOffsets.map((o) => [o[0], o[1] - (vr - wheelRadius) * 0.5, o[2]] as [number, number, number]);
    addWheelsAt(group, offs, vr, mats);
    addArches(group, offs, vr, W, mats);
  }

  const glassBase = new THREE.Color(0x0b1a24);
  const glassShattered = new THREE.Color(0xaebac4);

  const deform = (d: BodyDamage, t: number) => {
    if (crumple) crumple(d, t);
    // Frost/shatter the glass under heavy front or roof damage.
    const shatter = Math.max(0, Math.min(1, (Math.max(d.front, d.roof) / 100) * t));
    mats.glass.color.copy(glassBase).lerp(glassShattered, shatter);
    mats.glass.roughness = 0.08 + 0.74 * shatter;
    mats.glass.metalness = 0.5 - 0.35 * shatter;
    for (const it of details) {
      const fr = d.front / 100, re = d.rear / 100, ro = d.roof / 100, le = d.left / 100, ri = d.right / 100;
      let dx = 0, dy = 0, dz = 0;
      if (it.zone === 'front') { dx = -fr * L * 0.22 * t; dy = -fr * bodyH * 0.08 * t; }
      else if (it.zone === 'rear') { dx = re * L * 0.18 * t; }
      else if (it.zone === 'roof') { dy = -ro * bodyH * 0.32 * t; }
      else if (it.zone === 'left') { dz = -le * W * 0.2 * t; }
      else if (it.zone === 'right') { dz = ri * W * 0.2 * t; }
      it.obj.position.set(it.base.x + dx, it.base.y + dy, it.base.z + dz);
    }
  };

  return { group, deform };
}
