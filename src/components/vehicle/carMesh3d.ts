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

function makeMaterials(paintColor: string) {
  const paint = new THREE.Color(paintColor);
  return {
    paint: new THREE.MeshStandardMaterial({ color: paint, roughness: 0.34, metalness: 0.6 }),
    paintDark: new THREE.MeshStandardMaterial({ color: paint.clone().multiplyScalar(0.45), roughness: 0.5, metalness: 0.5 }),
    trim: new THREE.MeshStandardMaterial({ color: 0x14181d, roughness: 0.75, metalness: 0.2 }),
    chrome: new THREE.MeshStandardMaterial({ color: 0xb7c0c9, roughness: 0.25, metalness: 0.95 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x0b1a24, roughness: 0.08, metalness: 0.5 }),
    headlight: new THREE.MeshStandardMaterial({ color: 0xfff3cf, emissive: 0xfff0c0, emissiveIntensity: 0.9, roughness: 0.3 }),
    taillight: new THREE.MeshStandardMaterial({ color: 0xff3324, emissive: 0xff2010, emissiveIntensity: 0.8, roughness: 0.4 }),
    tyre: new THREE.MeshStandardMaterial({ color: 0x0b0d11, roughness: 0.9 }),
    rim: new THREE.MeshStandardMaterial({ color: 0x2a3038, roughness: 0.35, metalness: 0.85 }),
    trailer: new THREE.MeshStandardMaterial({ color: 0xdbe0e6, roughness: 0.5, metalness: 0.35 }),
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
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.6, r * 0.6, width * 1.04, 6), mats.rim);
  rim.rotation.x = Math.PI / 2;
  w.add(rim);
  // A few spokes on the outer face for a wheel-ish read.
  for (let i = 0; i < 5; i++) {
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(r * 1.0, r * 0.14, width * 0.5), mats.rim);
    spoke.rotation.z = (i / 5) * Math.PI;
    w.add(spoke);
  }
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.16, r * 0.16, width * 1.1, 8), mats.chrome);
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

/** Extrude a normalized side profile into the deformable sheet-metal body. */
function buildProfileBody(
  group: THREE.Group, style: SilhouetteStyle, mats: Mats, L: number, bodyH: number, W: number, reg: (o: THREE.Object3D, z: keyof BodyDamage) => void,
) {
  const sil = SILHOUETTES[style];
  const yBottom = -bodyH * 0.5;
  const ySpan = bodyH * 1.5;
  const toX = (sx: number) => (0.5 - sx) * L;
  const toY = (sy: number) => yBottom + sy * ySpan;

  const shape = new THREE.Shape();
  sil.body.forEach((p, i) => (i === 0 ? shape.moveTo(toX(p[0]), toY(p[1])) : shape.lineTo(toX(p[0]), toY(p[1]))));
  shape.closePath();
  const bevel = Math.min(0.06, W * 0.04);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: W - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, steps: 1,
  });
  geo.translate(0, 0, -W / 2 + bevel);
  geo.computeVertexNormals();
  const body = new THREE.Mesh(geo, mats.paint);
  group.add(body);

  // Glass greenhouse, standing slightly proud of the sides; drops on roof crush.
  const gs = new THREE.Shape();
  sil.glass.forEach((p, i) => (i === 0 ? gs.moveTo(toX(p[0]), toY(p[1])) : gs.lineTo(toX(p[0]), toY(p[1]))));
  gs.closePath();
  const gGeo = new THREE.ExtrudeGeometry(gs, { depth: W * 1.02, bevelEnabled: false, steps: 1 });
  gGeo.translate(0, 0, -W * 0.51);
  const glass = new THREE.Mesh(gGeo, mats.glass);
  group.add(glass);
  reg(glass, 'roof');

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
  const lightY = yBottom + bodyH * (style === 'suv' || style === 'van' || style === 'pickup' ? 0.5 : 0.42);

  // Bumpers.
  reg(add(group, box(L * 0.05, bodyH * 0.26, W * 1.02, mats.trim, hx * 0.98, yBottom + bodyH * 0.16, 0)), 'front');
  reg(add(group, box(L * 0.05, bodyH * 0.24, W * 1.0, mats.trim, -hx * 0.98, yBottom + bodyH * 0.16, 0)), 'rear');
  // Grille.
  reg(add(group, box(L * 0.02, bodyH * 0.22, W * 0.55, mats.trim, hx * 0.99, yBottom + bodyH * 0.34, 0)), 'front');
  // Head- & tail-lights (paired).
  for (const s of [1, -1]) {
    reg(add(group, box(L * 0.03, bodyH * 0.14, W * 0.16, mats.headlight, hx * 0.97, lightY, s * hz * 0.72)), 'front');
    reg(add(group, box(L * 0.025, bodyH * 0.12, W * 0.15, mats.taillight, -hx * 0.97, lightY, s * hz * 0.74)), 'rear');
  }
  // Rocker panel (dark lower strip).
  add(group, box(L * 0.9, bodyH * 0.14, W * 1.01, mats.paintDark, 0, yBottom + bodyH * 0.09, 0));
  // Side mirrors near the A-pillar.
  const mirrorX = hx * (style === 'coupe' || style === 'exotic' ? 0.15 : 0.28);
  for (const s of [1, -1]) {
    add(group, box(L * 0.04, bodyH * 0.1, W * 0.06, mats.trim, mirrorX, yBottom + bodyH * 0.62, s * (hz + W * 0.06)));
  }
  // Roof rails for the tall wagons.
  if (style === 'suv' || style === 'van') {
    for (const s of [1, -1]) add(group, box(L * 0.5, bodyH * 0.05, W * 0.05, mats.trim, -L * 0.05, bodyH * 0.98, s * hz * 0.7));
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

/** Dark wheel-arch trims arcing over each wheel, on both body sides. */
function addArches(group: THREE.Group, offsets: [number, number, number][], r: number, W: number, mats: Mats) {
  const hz = W / 2;
  const geo = new THREE.TorusGeometry(r * 1.15, r * 0.11, 6, 12, Math.PI); // top-half ring in XY
  for (const [x, y] of offsets) {
    for (const s of [1, -1]) {
      const arch = new THREE.Mesh(geo, mats.trim);
      arch.position.set(x, y, s * hz);
      group.add(arch);
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

export function buildCarMesh(
  style: SilhouetteStyle,
  L: number,
  bodyH: number,
  W: number,
  paintColor: string,
  wheelRadius: number,
  wheelOffsets: number[][],
): { group: THREE.Group; deform: (damage: BodyDamage, t: number) => void } {
  const group = new THREE.Group();
  const mats = makeMaterials(paintColor);
  const details: Detail[] = [];
  const reg = (obj: THREE.Object3D, zone: keyof BodyDamage) => { details.push({ obj, base: obj.position.clone(), zone }); };

  let crumple: ((d: BodyDamage, t: number) => void) | null = null;

  if (style === 'semi') {
    crumple = buildSemi(group, mats, L, bodyH, W, wheelRadius, reg);
  } else {
    crumple = buildProfileBody(group, style, mats, L, bodyH, W, reg);
    addCommonDetails(group, style, mats, L, bodyH, W, reg);
    if (style === 'pickup') addBed(group, mats, L, bodyH, W, reg);
    const offs = wheelOffsets.map((o) => [o[0], o[1], o[2]] as [number, number, number]);
    addWheelsAt(group, offs, wheelRadius, mats);
    addArches(group, offs, wheelRadius, W, mats);
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
