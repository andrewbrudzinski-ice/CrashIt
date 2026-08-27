import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { useGame } from '../../state/store';
import { ARCHETYPES, archetypeDims, buildArchetypeCar, type Archetype, type PaintFinish, type BodyDamage } from './carMesh3d';
import './vehicleShowcase.css';

const COLORS: { name: string; hex: string }[] = [
  { name: 'Silver', hex: '#c8ccd2' }, { name: 'Black', hex: '#15171b' }, { name: 'White', hex: '#e9ecef' },
  { name: 'Red', hex: '#c0202a' }, { name: 'Blue', hex: '#1f4fd0' }, { name: 'Gunmetal', hex: '#43494f' },
  { name: 'Green', hex: '#1f6f4a' }, { name: 'Orange', hex: '#d9631a' },
];
const FINISHES: PaintFinish[] = ['metallic', 'gloss', 'matte'];
type View = 'side' | 'front' | 'top' | '3q-front' | '3q-rear';
const VIEWS: { id: View; label: string; az: number; el: number }[] = [
  { id: '3q-front', label: '3/4 Front', az: -0.9, el: 0.28 },
  { id: 'side', label: 'Side', az: -Math.PI / 2, el: 0.12 },
  { id: 'front', label: 'Front', az: 0, el: 0.14 },
  { id: 'top', label: 'Top', az: -Math.PI / 2, el: 1.35 },
  { id: '3q-rear', label: '3/4 Rear', az: Math.PI - 0.9, el: 0.28 },
];

export function VehicleShowcase() {
  const close = useGame((s) => s.setShowcaseOpen);
  const mountRef = useRef<HTMLDivElement>(null);
  const [archetype, setArchetype] = useState<Archetype>('sports');
  const [colorIdx, setColorIdx] = useState(0);
  const [finish, setFinish] = useState<PaintFinish>('metallic');
  const [spokes, setSpokes] = useState(10);
  const [damage, setDamage] = useState(0);
  const [view, setView] = useState<View>('3q-front');

  // Orbit state shared with the render loop.
  const orbit = useRef({ az: -0.9, el: 0.28, radius: 9, target: new THREE.Vector3() });
  const deformRef = useRef<((d: BodyDamage, t: number) => void) | null>(null);
  const rebuildRef = useRef<(() => void) | null>(null);
  // Current config mirrored into refs so the (once-mounted) build reads live values.
  const cfg = useRef({ archetype, colorIdx, finish, spokes });
  cfg.current = { archetype, colorIdx, finish, spokes };

  useEffect(() => {
    const mount = mountRef.current!;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#0c1118');

    const camera = new THREE.PerspectiveCamera(42, mount.clientWidth / mount.clientHeight, 0.1, 200);
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.95;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mount.appendChild(renderer.domElement);

    const pmrem = new THREE.PMREMGenerator(renderer);
    const envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = envRT.texture;

    scene.add(new THREE.HemisphereLight(0xdfeaff, 0x0a0d12, 0.9));
    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(-7, 12, 6);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.near = 1; key.shadow.camera.far = 40;
    key.shadow.camera.left = -8; key.shadow.camera.right = 8;
    key.shadow.camera.top = 8; key.shadow.camera.bottom = -8;
    key.shadow.bias = -0.0004; key.shadow.normalBias = 0.03;
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x88b0ff, 0.4);
    rim.position.set(8, 3, -7);
    scene.add(rim);

    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(30, 48),
      new THREE.MeshStandardMaterial({ color: 0x161b22, roughness: 0.9, metalness: 0 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    let carGroup: THREE.Group | null = null;
    const build = () => {
      if (carGroup) { scene.remove(carGroup); carGroup.traverse((o) => { const m = o as THREE.Mesh; if (m.geometry) m.geometry.dispose(); }); }
      const c = cfg.current;
      const dims = archetypeDims(c.archetype);
      const { group, deform } = buildArchetypeCar(
        c.archetype, dims.L, dims.bodyH, dims.W, COLORS[c.colorIdx].hex, dims.wheelR, dims.wheelOffsets,
        { finish: c.finish, wheelSpokes: c.spokes, aero: c.archetype === 'super' ? { wing: true } : undefined },
      );
      group.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      // Rest the wheels on the ground.
      const wy = dims.wheelOffsets[0][1];
      group.position.y = dims.wheelR - wy;
      scene.add(group);
      carGroup = group;
      deformRef.current = deform;
      orbit.current.target.set(0, dims.bodyH * 0.35, 0);
      orbit.current.radius = dims.L * 2.7;
      deform(dmgMap(damageRef.current), 1);
    };
    rebuildRef.current = build;
    build();

    // Pointer-drag orbit.
    let dragging = false, lx = 0, ly = 0;
    const down = (e: PointerEvent) => { dragging = true; lx = e.clientX; ly = e.clientY; };
    const up = () => { dragging = false; };
    const move = (e: PointerEvent) => {
      if (!dragging) return;
      orbit.current.az -= (e.clientX - lx) * 0.008;
      orbit.current.el = Math.max(0.02, Math.min(1.5, orbit.current.el + (e.clientY - ly) * 0.006));
      lx = e.clientX; ly = e.clientY;
    };
    renderer.domElement.addEventListener('pointerdown', down);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointermove', move);

    let raf = 0;
    const loop = () => {
      const o = orbit.current;
      const cx = o.target.x + o.radius * Math.cos(o.el) * Math.cos(o.az);
      const cy = o.target.y + o.radius * Math.sin(o.el);
      const cz = o.target.z + o.radius * Math.cos(o.el) * Math.sin(o.az);
      camera.position.set(cx, cy, cz);
      camera.lookAt(o.target);
      renderer.render(scene, camera);
      raf = requestAnimationFrame(loop);
    };
    loop();

    const onResize = () => {
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    };
    window.addEventListener('resize', onResize);

    return () => {
      cancelAnimationFrame(raf);
      renderer.domElement.removeEventListener('pointerdown', down);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('resize', onResize);
      envRT.dispose(); pmrem.dispose(); renderer.dispose();
      if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Rebuild when the car config changes.
  const damageRef = useRef(damage);
  damageRef.current = damage;
  useEffect(() => { rebuildRef.current?.(); /* eslint-disable-next-line */ }, [archetype, colorIdx, finish, spokes]);
  // Live-apply damage without a full rebuild.
  useEffect(() => { deformRef.current?.(dmgMap(damage), 1); }, [damage]);
  // Apply a view preset.
  useEffect(() => {
    const v = VIEWS.find((x) => x.id === view)!;
    orbit.current.az = v.az; orbit.current.el = v.el;
  }, [view]);

  return (
    <div className="vs-root">
      <div className="vs-stage" ref={mountRef} />
      <div className="vs-top">
        <span className="vs-title">Vehicle Lab</span>
        <button className="vs-close" onClick={() => close(false)} aria-label="Close">✕</button>
      </div>

      <div className="vs-views">
        {VIEWS.map((v) => (
          <button key={v.id} className="vs-chip" data-active={view === v.id} onClick={() => setView(v.id)}>{v.label}</button>
        ))}
      </div>

      <div className="vs-panel">
        <div className="vs-group">
          <span className="vs-lab">Type</span>
          <div className="vs-row">
            {ARCHETYPES.map((a) => (
              <button key={a} className="vs-chip" data-active={archetype === a} onClick={() => setArchetype(a)}>{a}</button>
            ))}
          </div>
        </div>
        <div className="vs-group">
          <span className="vs-lab">Paint</span>
          <div className="vs-row">
            {COLORS.map((c, i) => (
              <button key={c.hex} className="vs-sw" data-active={colorIdx === i} style={{ background: c.hex }} onClick={() => setColorIdx(i)} aria-label={c.name} />
            ))}
            {FINISHES.map((f) => (
              <button key={f} className="vs-chip" data-active={finish === f} onClick={() => setFinish(f)}>{f}</button>
            ))}
          </div>
        </div>
        <div className="vs-group">
          <span className="vs-lab">Wheels</span>
          <div className="vs-row">
            {[5, 8, 10, 12].map((n) => (
              <button key={n} className="vs-chip" data-active={spokes === n} onClick={() => setSpokes(n)}>{n}-spoke</button>
            ))}
          </div>
        </div>
        <div className="vs-group">
          <span className="vs-lab">Damage {damage}%</span>
          <input className="vs-slider" type="range" min={0} max={100} value={damage} onChange={(e) => setDamage(Number(e.target.value))} />
        </div>
        <div className="vs-hint">Drag to orbit · pick a preset above</div>
      </div>
    </div>
  );
}

function dmgMap(v: number): BodyDamage {
  return { front: v, rear: v * 0.25, left: v * 0.4, right: v * 0.15, roof: v * 0.3 };
}
