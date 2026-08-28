import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { VehicleDef } from '../../game/vehicles/vehicleAssets';

/**
 * Vehicle asset loader — turns a {@link VehicleDef} GLB into a sim-ready object.
 *
 *   Visual model (GLB)  ──┐
 *   normalize + PBR       ├──▶ { group, deform, setPaint, dims }
 *   zone deformation    ──┘
 *
 * The physics/collision representation stays separate (a simple box + wheel
 * cylinders in `crashSim.ts`); the returned `group` is just driven by the baked
 * chassis transform each frame — a drop-in visual layer, no physics changes.
 *
 * Source models: CC0 Quaternius packs. Each part is its own flat-colour material
 * (Body / Windows / Black / lights…), which we upgrade to PBR and recolour by
 * repainting the body material only. Raw front faces +z, up is +y; we re-orient
 * to the app frame (+x front, +y up, +z left).
 */

export interface BodyDamage { front: number; rear: number; left: number; right: number; roof: number; }

export interface LoadedVehicle {
  group: THREE.Group;
  deform: (d: BodyDamage, t: number) => void;
  setPaint: (hex: string) => void;
  dims: { length: number; width: number; height: number };
}

const loader = new GLTFLoader();
const sceneCache = new Map<string, Promise<THREE.Group>>();

function loadScene(path: string): Promise<THREE.Group> {
  let p = sceneCache.get(path);
  if (!p) {
    p = new Promise<THREE.Group>((resolve, reject) => loader.load(path, (g) => resolve(g.scene), undefined, reject));
    sceneCache.set(path, p);
  }
  return p;
}

function jitter(i: number): number {
  const x = Math.sin(i * 12.9898) * 43758.5453;
  return (x - Math.floor(x)) - 0.5;
}

function triAreaSum(geom: THREE.BufferGeometry): number {
  const pos = geom.attributes.position as THREE.BufferAttribute;
  const idx = geom.index;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), ab = new THREE.Vector3(), ac = new THREE.Vector3();
  let sum = 0;
  const n = idx ? idx.count : pos.count;
  for (let i = 0; i < n; i += 3) {
    const i0 = idx ? idx.getX(i) : i, i1 = idx ? idx.getX(i + 1) : i + 1, i2 = idx ? idx.getX(i + 2) : i + 2;
    a.fromBufferAttribute(pos, i0); b.fromBufferAttribute(pos, i1); c.fromBufferAttribute(pos, i2);
    sum += ab.subVectors(b, a).cross(ac.subVectors(c, a)).length() * 0.5;
  }
  return sum;
}

export interface LoadOpts {
  paint?: string;
  /** Target overall length in metres (uniform scale, proportions preserved). */
  targetLength: number;
  /** World-y the wheels rest at, relative to the group origin (chassis centre). */
  groundY?: number;
}

const isWheelName = (s: string) => /wheel/i.test(s);
const isGlassMat = (m: THREE.Material) => /window|glass|windshield|windscreen/i.test(m.name);
const isLightMat = (m: THREE.Material) => /light|lamp|head|tail|indicator|blink/i.test(m.name);

export async function loadVehicleModel(def: VehicleDef, opts: LoadOpts): Promise<LoadedVehicle> {
  const base = await loadScene(def.modelPath);
  const inner = base.clone(true);

  // Re-orient: raw front is +z; rotate +90° about Y so front → +x.
  inner.rotation.y = Math.PI / 2;
  inner.updateMatrixWorld(true);

  // Uniform scale to the requested length (preserve proportions).
  let bb = new THREE.Box3().setFromObject(inner);
  const size = bb.getSize(new THREE.Vector3());
  inner.scale.setScalar(opts.targetLength / Math.max(size.x, 0.001));
  inner.updateMatrixWorld(true);

  // Recentre on x/z; drop so the wheels rest at groundY.
  bb = new THREE.Box3().setFromObject(inner);
  const center = bb.getCenter(new THREE.Vector3());
  const groundY = opts.groundY ?? -opts.targetLength * 0.11;
  inner.position.x -= center.x;
  inner.position.z -= center.z;
  inner.position.y += groundY - bb.min.y;

  const group = new THREE.Group();
  group.add(inner);

  // ---- Materials: clone once per source material, upgrade to PBR, classify. ----
  const matClones = new Map<string, THREE.MeshStandardMaterial>();
  const areaByMat = new Map<string, number>();
  const bodyMeshes: THREE.Mesh[] = [];
  const wheelRoots = new Set<THREE.Object3D>();

  inner.traverse((o) => { if (isWheelName(o.name)) wheelRoots.add(o); });
  const onWheel = (o: THREE.Object3D): boolean => {
    let p: THREE.Object3D | null = o;
    while (p) { if (wheelRoots.has(p)) return true; p = p.parent; }
    return false;
  };

  inner.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true; mesh.receiveShadow = true;
    const src = mesh.material as THREE.MeshStandardMaterial;
    let m = matClones.get(src.uuid);
    if (!m) {
      m = src.clone();
      const wheelPart = onWheel(mesh);
      const maxCh = Math.max(m.color.r, m.color.g, m.color.b);
      if (isGlassMat(m)) {
        m.color.setHex(0x0b131b); m.roughness = 0.08; m.metalness = 0.25; m.envMapIntensity = 1.4;
      } else if (isLightMat(m)) {
        m.emissive = m.color.clone(); m.emissiveIntensity = 0.7; m.roughness = 0.3; m.metalness = 0.2;
      } else if (wheelPart || maxCh < 0.06) {
        m.roughness = 0.85; m.metalness = 0.05; m.envMapIntensity = 0.5;
      } else {
        m.roughness = 0.46; m.metalness = 0.4; m.envMapIntensity = 1.0;
      }
      matClones.set(src.uuid, m);
    }
    mesh.material = m;
    // Track area of body-panel materials (candidate paint), and body meshes.
    if (!onWheel(mesh)) {
      bodyMeshes.push(mesh);
      const maxCh = Math.max(m.color.r, m.color.g, m.color.b);
      if (!isGlassMat(m) && !isLightMat(m) && maxCh >= 0.12) {
        areaByMat.set(src.uuid, (areaByMat.get(src.uuid) ?? 0) + triAreaSum(mesh.geometry as THREE.BufferGeometry));
      }
    }
  });

  // Body paint = the largest-area eligible material.
  let bodyMat: THREE.MeshStandardMaterial | null = null;
  let bestArea = -1;
  for (const [uuid, area] of areaByMat) if (area > bestArea) { bestArea = area; bodyMat = matClones.get(uuid) ?? null; }
  if (bodyMat && opts.paint) bodyMat.color.set(opts.paint);

  const dims = { length: size.x, width: size.z, height: size.y };

  // ---- Deformation: crush each body-panel mesh toward the impacted zone, in
  //      its own local frame (front +z, width x, up y). Splay the wheels. ----
  const panels = bodyMeshes.map((mesh) => {
    const g = mesh.geometry as THREE.BufferGeometry;
    g.computeBoundingBox();
    return { mesh, g, orig: new Float32Array(g.attributes.position.array as ArrayLike<number>), bbox: g.boundingBox!.clone() };
  });
  const wheelArr = [...wheelRoots];
  const wheelBase = wheelArr.map((w) => w.position.clone());

  const deform = (d: BodyDamage, t: number) => {
    const fr = d.front / 100, re = d.rear / 100, le = d.left / 100, ri = d.right / 100, ro = d.roof / 100;
    const any = Math.max(fr, re, le, ri, ro);
    for (const p of panels) {
      const arr = p.g.attributes.position.array as Float32Array;
      const zL = Math.max(0.05, p.bbox.max.z), zR = Math.min(-0.05, p.bbox.min.z);
      const xW = Math.max(0.05, Math.abs(p.bbox.max.x), Math.abs(p.bbox.min.x));
      const yH = Math.max(0.05, p.bbox.max.y);
      for (let i = 0; i < p.g.attributes.position.count; i++) {
        let x = p.orig[i * 3], y = p.orig[i * 3 + 1], z = p.orig[i * 3 + 2];
        const j = jitter(i);
        if (z > zL * 0.15 && fr > 0) { z -= (z / zL) * fr * zL * 0.42 * t; y += j * 0.05 * fr * t; }
        if (z < zR * 0.15 && re > 0) { z -= (z / zR) * re * zR * 0.3 * t; }
        if (x > xW * 0.4 && le > 0) x -= (x / xW) * le * xW * 0.4 * t;
        if (x < -xW * 0.4 && ri > 0) x -= (x / xW) * ri * xW * 0.4 * t;
        if (y > yH * 0.45 && ro > 0) y -= (y / yH) * ro * yH * 0.5 * t;
        x += j * 0.015 * any * t; z += jitter(i + 7) * 0.015 * any * t;
        arr[i * 3] = x; arr[i * 3 + 1] = y; arr[i * 3 + 2] = z;
      }
      p.g.attributes.position.needsUpdate = true;
      p.g.computeVertexNormals();
    }
    const shift = (d.front + d.left + d.right) / 300 * t;
    wheelArr.forEach((w, i) => {
      const b = wheelBase[i];
      w.position.set(b.x + jitter(i) * shift, b.y - shift * 0.3, b.z + jitter(i + 3) * shift);
      w.rotation.z = jitter(i + 9) * shift * 1.5;
    });
  };

  const setPaint = (hex: string) => { if (bodyMat) bodyMat.color.set(hex); };

  return { group, deform, setPaint, dims };
}
