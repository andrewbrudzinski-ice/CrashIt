import * as THREE from 'three';
import { SILHOUETTES, type SilhouetteStyle } from './silhouetteProfiles';

/**
 * Builds a low-poly 3D car body by extruding the same side-profile silhouette
 * used for the 2.5D thumbnails — so the crash vehicle matches the garage art.
 * Returns the group plus the body mesh (for crush scaling).
 *
 * Local frame: +x = front, +y = up, +z = left. The group origin is the chassis
 * centre (matching the physics box), so it can be positioned directly from the
 * baked transform.
 */
/** Per-zone damage 0..100 used to crumple the body mesh. */
export interface BodyDamage {
  front: number; rear: number; left: number; right: number; roof: number;
}

/** Deterministic per-index jitter in [-0.5, 0.5] for a crumpled, non-smooth look. */
function jitter(i: number): number {
  const x = Math.sin(i * 12.9898) * 43758.5453;
  return (x - Math.floor(x)) - 0.5;
}

export function buildCarMesh(
  style: SilhouetteStyle,
  L: number,
  bodyH: number,
  W: number,
  paintColor: string,
): { group: THREE.Group; body: THREE.Mesh; deform: (damage: BodyDamage, t: number) => void } {
  const sil = SILHOUETTES[style];
  const group = new THREE.Group();

  // Map normalized silhouette (x: front→rear, y: ground→roof) into local space.
  const yBottom = -bodyH * 0.5;
  const ySpan = bodyH * 1.5; // roof rises above the collider box for presence
  const toX = (sx: number) => (0.5 - sx) * L; // front (0) → +x
  const toY = (sy: number) => yBottom + sy * ySpan;

  // ---- Body ----
  const bodyShape = new THREE.Shape();
  sil.body.forEach((p, i) => {
    const x = toX(p[0]);
    const y = toY(p[1]);
    if (i === 0) bodyShape.moveTo(x, y);
    else bodyShape.lineTo(x, y);
  });
  bodyShape.closePath();

  const bevel = Math.min(0.06, W * 0.04);
  const bodyGeo = new THREE.ExtrudeGeometry(bodyShape, {
    depth: W - bevel * 2,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 1,
    steps: 1,
  });
  bodyGeo.translate(0, 0, -W / 2 + bevel);
  bodyGeo.computeVertexNormals();

  const paint = new THREE.MeshStandardMaterial({
    color: new THREE.Color(paintColor),
    roughness: 0.35,
    metalness: 0.65,
  });
  const body = new THREE.Mesh(bodyGeo, paint);
  group.add(body);

  // Snapshot undeformed vertex positions for the crush function.
  const origPos = new Float32Array((bodyGeo.attributes.position.array as ArrayLike<number>));
  const hx = L / 2, hz = W / 2;

  /** Crumple the body toward the damaged zones. `t` ramps 0→1 through impact. */
  const deform = (dmg: BodyDamage, t: number) => {
    const attr = bodyGeo.attributes.position;
    const arr = attr.array as Float32Array;
    const fr = dmg.front / 100, re = dmg.rear / 100, le = dmg.left / 100, ri = dmg.right / 100, ro = dmg.roof / 100;
    const anyDmg = Math.max(fr, re, le, ri, ro);
    for (let i = 0; i < attr.count; i++) {
      let x = origPos[i * 3], y = origPos[i * 3 + 1], z = origPos[i * 3 + 2];
      const j = jitter(i);
      if (x > 0 && fr > 0) { x -= (x / hx) * fr * L * 0.3 * t; y += j * 0.08 * fr * t; }
      if (x < 0 && re > 0) { x += (-x / hx) * re * L * 0.22 * t; }
      if (z > hz * 0.3 && le > 0) { z -= (z / hz) * le * W * 0.32 * t; }
      if (z < -hz * 0.3 && ri > 0) { z += (-z / hz) * ri * W * 0.32 * t; }
      if (y > bodyH * 0.3 && ro > 0) { y -= (y / bodyH) * ro * bodyH * 0.45 * t; }
      // overall crumpled jitter
      x += j * 0.03 * anyDmg * t;
      z += jitter(i + 7) * 0.02 * anyDmg * t;
      arr[i * 3] = x; arr[i * 3 + 1] = y; arr[i * 3 + 2] = z;
    }
    attr.needsUpdate = true;
    bodyGeo.computeVertexNormals();
  };

  // ---- Glass greenhouse (slightly proud of the body sides) ----
  const glassShape = new THREE.Shape();
  sil.glass.forEach((p, i) => {
    const x = toX(p[0]);
    const y = toY(p[1]);
    if (i === 0) glassShape.moveTo(x, y);
    else glassShape.lineTo(x, y);
  });
  glassShape.closePath();
  const glassGeo = new THREE.ExtrudeGeometry(glassShape, {
    depth: W * 1.02,
    bevelEnabled: false,
    steps: 1,
  });
  glassGeo.translate(0, 0, -W * 0.51);
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x0d1a22,
    roughness: 0.08,
    metalness: 0.4,
  });
  group.add(new THREE.Mesh(glassGeo, glassMat));

  // ---- Subtle belt/panel accent line ----
  const beltGeo = new THREE.BufferGeometry().setFromPoints(
    sil.beltline.map((p) => new THREE.Vector3(toX(p[0]), toY(p[1]), W / 2 + 0.005)),
  );
  const belt = new THREE.Line(
    beltGeo,
    new THREE.LineBasicMaterial({ color: new THREE.Color(paintColor).offsetHSL(0, 0, 0.15), transparent: true, opacity: 0.5 }),
  );
  group.add(belt);
  const belt2 = belt.clone();
  belt2.position.z = -W - 0.01;
  group.add(belt2);

  return { group, body, deform };
}

/** Add four wheels to a car group at the given local offsets. */
export function addWheelMeshes(group: THREE.Group, offsets: number[][], radius: number): void {
  const geo = new THREE.CylinderGeometry(radius, radius, radius * 0.7, 18);
  const tyre = new THREE.MeshStandardMaterial({ color: 0x0c0e12, roughness: 0.85 });
  const hub = new THREE.MeshStandardMaterial({ color: 0x3a4450, roughness: 0.4, metalness: 0.7 });
  for (const [wx, wy, wz] of offsets) {
    const wheel = new THREE.Mesh(geo, tyre);
    wheel.rotation.x = Math.PI / 2;
    wheel.position.set(wx, wy, wz);
    group.add(wheel);
    // simple hub cap
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.4, radius * 0.4, radius * 0.72, 10), hub);
    cap.rotation.x = Math.PI / 2;
    cap.position.set(wx, wy, wz);
    group.add(cap);
  }
}
