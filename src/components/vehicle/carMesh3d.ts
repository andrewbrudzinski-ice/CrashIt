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
export function buildCarMesh(
  style: SilhouetteStyle,
  L: number,
  bodyH: number,
  W: number,
  paintColor: string,
): { group: THREE.Group; body: THREE.Mesh } {
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

  return { group, body };
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
