import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { VehicleDef } from '../../game/vehicles/vehicleAssets';

/**
 * Vehicle asset loader — turns a {@link VehicleDef} GLB into a sim-ready object.
 *
 *   Visual model (GLB)  ──┐
 *   normalize + PBR       ├──▶ { group, deform, setPaint, wheels }
 *   zone deformation    ──┘
 *
 * The physics/collision representation stays separate (a simple box + wheel
 * cylinders in `crashSim.ts`); the returned `group` is just driven by the baked
 * chassis transform each frame, exactly like the old procedural mesh — so this
 * is a drop-in visual upgrade with no physics changes.
 *
 * Source models: Kenney "Car Kit" (CC0). Front faces +z, up is +y in the raw
 * asset; we re-orient to the app frame (+x front, +y up, +z left).
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
    p = new Promise<THREE.Group>((resolve, reject) => {
      loader.load(path, (gltf) => resolve(gltf.scene), undefined, reject);
    });
    sceneCache.set(path, p);
  }
  return p;
}

function jitter(i: number): number {
  const x = Math.sin(i * 12.9898) * 43758.5453;
  return (x - Math.floor(x)) - 0.5;
}

export interface LoadOpts {
  paint?: string;
  /** Target overall length in metres (the model is uniformly scaled to it). */
  targetLength: number;
  /** World-y the wheels should rest at, relative to the group origin (chassis
   *  centre). Defaults to -targetLength*0.11 (a sensible ride height). */
  groundY?: number;
}

export async function loadVehicleModel(def: VehicleDef, opts: LoadOpts): Promise<LoadedVehicle> {
  const base = await loadScene(def.modelPath);
  const inner = base.clone(true);

  // Re-orient: raw front is +z; rotate +90° about Y so front → +x.
  inner.rotation.y = Math.PI / 2;
  inner.updateMatrixWorld(true);

  // Uniform scale to the requested length (preserve real proportions).
  let bb = new THREE.Box3().setFromObject(inner);
  const size = bb.getSize(new THREE.Vector3());
  const modelLen = Math.max(size.x, 0.001);
  const scale = opts.targetLength / modelLen;
  inner.scale.setScalar(scale);
  inner.updateMatrixWorld(true);

  // Recentre on x/z and drop so the wheels rest at groundY.
  bb = new THREE.Box3().setFromObject(inner);
  const center = bb.getCenter(new THREE.Vector3());
  const groundY = opts.groundY ?? -opts.targetLength * 0.11;
  inner.position.x -= center.x;
  inner.position.z -= center.z;
  inner.position.y += groundY - bb.min.y;

  const group = new THREE.Group();
  group.add(inner);

  // ---- Materials: upgrade the flat colormap to automotive PBR; clone per mesh
  //      so the body can be tinted without touching wheels/glass. ----
  let bodyMat: THREE.MeshStandardMaterial | null = null;
  let bodyMesh: THREE.Mesh | null = null;
  const wheelRoots: THREE.Object3D[] = [];
  inner.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      const src = mesh.material as THREE.MeshStandardMaterial;
      const m = src.clone();
      const isWheel = /wheel/i.test(o.name) || /wheel/i.test(o.parent?.name ?? '');
      if (isWheel) {
        m.roughness = 0.8; m.metalness = 0.1; m.envMapIntensity = 0.6;
      } else {
        m.roughness = 0.5; m.metalness = 0.35; m.envMapIntensity = 1.0;
        if (!bodyMat) { bodyMat = m; bodyMesh = mesh; }
      }
      mesh.material = m;
    }
    if (/wheel/i.test(o.name)) wheelRoots.push(o);
  });
  // ---- Paint recolour. The whole car shares one palette-atlas texture, and
  //      the painted panels use one flat swatch. We detect that swatch from the
  //      body mesh's UVs and repaint only those pixels, so windows/lights/trim
  //      keep their colours. ----
  const repaint = buildRepainter(bodyMat, bodyMesh);
  if (repaint && opts.paint) repaint(opts.paint);

  const dims = { length: bb.getSize(new THREE.Vector3()).x, width: bb.getSize(new THREE.Vector3()).z, height: bb.getSize(new THREE.Vector3()).y };

  // ---- Deformation: crush the body mesh's vertices toward the impacted zone.
  //      Body geometry is still in raw asset space (front +z, width x, up y). ----
  let origPos: Float32Array | null = null;
  let bMin = new THREE.Vector3(), bMax = new THREE.Vector3();
  if (bodyMesh) {
    const g = (bodyMesh as THREE.Mesh).geometry as THREE.BufferGeometry;
    g.computeBoundingBox();
    bMin.copy(g.boundingBox!.min); bMax.copy(g.boundingBox!.max);
    origPos = new Float32Array(g.attributes.position.array as ArrayLike<number>);
  }
  const wheelBase = wheelRoots.map((w) => w.position.clone());

  const deform = (d: BodyDamage, t: number) => {
    if (bodyMesh && origPos) {
      const g = (bodyMesh as THREE.Mesh).geometry as THREE.BufferGeometry;
      const arr = g.attributes.position.array as Float32Array;
      const fr = d.front / 100, re = d.rear / 100, le = d.left / 100, ri = d.right / 100, ro = d.roof / 100;
      const any = Math.max(fr, re, le, ri, ro);
      const zL = bMax.z, zR = bMin.z, xW = Math.max(Math.abs(bMax.x), Math.abs(bMin.x)), yH = bMax.y;
      for (let i = 0; i < g.attributes.position.count; i++) {
        let x = origPos[i * 3], y = origPos[i * 3 + 1], z = origPos[i * 3 + 2];
        const j = jitter(i);
        // raw-asset frame: +z front, -z rear, ±x sides, +y roof
        if (z > zL * 0.2 && fr > 0) { z -= (z / zL) * fr * zL * 0.4 * t; y += j * 0.06 * fr * t; }
        if (z < zR * 0.2 && re > 0) { z -= (z / zR) * re * zR * 0.28 * t; }
        if (x > xW * 0.35 && le > 0) x -= (x / xW) * le * xW * 0.4 * t;
        if (x < -xW * 0.35 && ri > 0) x -= (x / xW) * ri * xW * 0.4 * t;
        if (y > yH * 0.35 && ro > 0) y -= (y / yH) * ro * yH * 0.5 * t;
        x += j * 0.02 * any * t; z += jitter(i + 7) * 0.02 * any * t;
        arr[i * 3] = x; arr[i * 3 + 1] = y; arr[i * 3 + 2] = z;
      }
      g.attributes.position.needsUpdate = true;
      g.computeVertexNormals();
    }
    // Splay wheels a little under front/side hits.
    const shift = (d.front + d.left + d.right) / 300 * t;
    wheelRoots.forEach((w, i) => {
      const b = wheelBase[i];
      w.position.set(b.x + jitter(i) * shift, b.y - shift * 0.4, b.z + jitter(i + 3) * shift);
      w.rotation.z = jitter(i + 9) * shift * 2;
    });
  };

  const setPaint = (hex: string) => { if (repaint) repaint(hex); };

  return { group, deform, setPaint, dims };
}

/**
 * Detect the body's painted swatch from its UVs and return a function that
 * repaints just that swatch in a cloned atlas — leaving glass, lights and trim
 * untouched. Returns null if the texture can't be read.
 */
function buildRepainter(bodyMat: THREE.MeshStandardMaterial | null, bodyMesh: THREE.Mesh | null): ((hex: string) => void) | null {
  if (!bodyMat || !bodyMesh || !bodyMat.map || !bodyMat.map.image) return null;
  const img = bodyMat.map.image as HTMLImageElement | HTMLCanvasElement;
  const w = (img as HTMLImageElement).naturalWidth || img.width;
  const h = (img as HTMLImageElement).naturalHeight || img.height;
  if (!w || !h) return null;
  const src = document.createElement('canvas');
  src.width = w; src.height = h;
  const sctx = src.getContext('2d')!;
  sctx.drawImage(img as CanvasImageSource, 0, 0, w, h);
  let base: ImageData;
  try { base = sctx.getImageData(0, 0, w, h); } catch { return null; }

  // Find the paint swatches by SURFACE AREA (not vertex count — thin trims have
  // lots of verts but little area). Sum each face's 3D area onto the atlas
  // swatch it samples; the big panels dominate, glass/lights don't.
  const map = bodyMat.map;
  const geom = bodyMesh.geometry;
  const pos = geom.attributes.position as THREE.BufferAttribute;
  const uv = geom.attributes.uv as THREE.BufferAttribute | undefined;
  if (!uv) return null;
  const idx = geom.index;
  const swatchAt = (u: number, v: number): [number, string] => {
    let x = u * map.repeat.x + map.offset.x, y = v * map.repeat.y + map.offset.y;
    x = ((x % 1) + 1) % 1; y = ((y % 1) + 1) % 1;
    const px = Math.min(w - 1, Math.max(0, Math.floor(x * w)));
    // GLTF textures load with flipY=false, so v=0 is the top row of the image.
    const yy = map.flipY ? (1 - y) : y;
    const py = Math.min(h - 1, Math.max(0, Math.floor(yy * h)));
    const i = (py * w + px) * 4;
    return [i, `${base.data[i]},${base.data[i + 1]},${base.data[i + 2]}`];
  };
  // Cluster near-identical pixels (anti-aliasing splits a swatch into many
  // colours) and sum face area per cluster + a representative colour.
  type Bucket = { area: number; r: number; g: number; b: number };
  const buckets = new Map<string, Bucket>();
  let total = 0;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), ab = new THREE.Vector3(), ac = new THREE.Vector3();
  const triCount = (idx ? idx.count : pos.count) / 3;
  for (let f = 0; f < triCount; f++) {
    const i0 = idx ? idx.getX(f * 3) : f * 3, i1 = idx ? idx.getX(f * 3 + 1) : f * 3 + 1, i2 = idx ? idx.getX(f * 3 + 2) : f * 3 + 2;
    a.fromBufferAttribute(pos, i0); b.fromBufferAttribute(pos, i1); c.fromBufferAttribute(pos, i2);
    const area = ab.subVectors(b, a).cross(ac.subVectors(c, a)).length() * 0.5;
    const [i] = swatchAt((uv.getX(i0) + uv.getX(i1) + uv.getX(i2)) / 3, (uv.getY(i0) + uv.getY(i1) + uv.getY(i2)) / 3);
    const r = base.data[i], g = base.data[i + 1], bl = base.data[i + 2];
    const key = `${r >> 4},${g >> 4},${bl >> 4}`;
    const bk = buckets.get(key) ?? { area: 0, r, g, b: bl };
    bk.area += area; buckets.set(key, bk);
    total += area;
  }
  const sat = (r: number, g: number, bl: number) => { const mx = Math.max(r, g, bl), mn = Math.min(r, g, bl); return mx === 0 ? 0 : (mx - mn) / mx; };
  // Prefer the saturated paint swatches (Kenney bodies default to a vivid
  // colour); fall back to the largest swatch if none are colourful.
  let bases: [number, number, number][] = [];
  for (const bk of buckets.values()) {
    if (bk.area / total < 0.05) continue;
    const s = sat(bk.r, bk.g, bk.b), lum = Math.max(bk.r, bk.g, bk.b) / 255;
    if (s > 0.3 && lum > 0.2 && lum < 0.95) bases.push([bk.r, bk.g, bk.b]);
  }
  if (!bases.length) {
    const big = [...buckets.values()].sort((x, y) => y.area - x.area)[0];
    if (big) bases = [[big.r, big.g, big.b]];
  }
  if (!bases.length) return null;

  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const target = new THREE.Color();
  return (hex: string) => {
    target.set(hex);
    const tr = Math.round(target.r * 255), tg = Math.round(target.g * 255), tb = Math.round(target.b * 255);
    const out = ctx.createImageData(w, h);
    const s = base.data, o = out.data;
    for (let i = 0; i < s.length; i += 4) {
      let hit = false;
      for (const [pr, pg, pb] of bases) {
        const dr = s[i] - pr, dg = s[i + 1] - pg, db = s[i + 2] - pb;
        if (dr * dr + dg * dg + db * db < 700) { hit = true; break; }
      }
      if (hit) { o[i] = tr; o[i + 1] = tg; o[i + 2] = tb; }
      else { o[i] = s[i]; o[i + 1] = s[i + 1]; o[i + 2] = s[i + 2]; }
      o[i + 3] = s[i + 3];
    }
    ctx.putImageData(out, 0, 0);
    const tex = new THREE.CanvasTexture(canvas);
    tex.flipY = map.flipY; tex.colorSpace = map.colorSpace; tex.wrapS = map.wrapS; tex.wrapT = map.wrapT;
    tex.offset.copy(map.offset); tex.repeat.copy(map.repeat); tex.center.copy(map.center); tex.rotation = map.rotation;
    bodyMat.map = tex;
    bodyMat.needsUpdate = true;
  };
}
