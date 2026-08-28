import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { useGame } from '../../state/store';
import { VEHICLES } from '../../game/vehicles/vehicleAssets';
import { loadVehicleModel, type BodyDamage, type LoadedVehicle } from './vehicleModel3d';
import './vehicleShowcase.css';

const COLORS: { name: string; hex: string }[] = [
  { name: 'Silver', hex: '#c8ccd2' }, { name: 'Black', hex: '#1a1d21' }, { name: 'White', hex: '#e9ecef' },
  { name: 'Red', hex: '#c0202a' }, { name: 'Blue', hex: '#2f6df0' }, { name: 'Gunmetal', hex: '#434951' },
  { name: 'Green', hex: '#1f6f4a' }, { name: 'Orange', hex: '#d9631a' },
];
type View = 'side' | 'front' | 'rear' | 'top' | '3q';
const VIEWS: { id: View; label: string; az: number; el: number }[] = [
  { id: '3q', label: '3/4', az: -0.9, el: 0.28 },
  { id: 'side', label: 'Side', az: -Math.PI / 2, el: 0.12 },
  { id: 'front', label: 'Front', az: 0, el: 0.16 },
  { id: 'rear', label: 'Rear', az: Math.PI, el: 0.16 },
  { id: 'top', label: 'Top', az: -Math.PI / 2, el: 1.35 },
];
// Showroom display length per vehicle category (metres).
const LEN: Record<string, number> = { compact: 3.9, sedan: 4.7, muscle: 4.9, sports: 4.4, suv: 4.8, pickup: 5.3, van: 5.0 };

export function VehicleShowcase() {
  const close = useGame((s) => s.setShowcaseOpen);
  const mountRef = useRef<HTMLDivElement>(null);
  const [vehIdx, setVehIdx] = useState(0);
  const [colorIdx, setColorIdx] = useState(0);
  const [damage, setDamage] = useState(0);
  const [view, setView] = useState<View>('3q');
  const [loading, setLoading] = useState(true);

  const orbit = useRef({ az: -0.9, el: 0.28, radius: 11, target: new THREE.Vector3() });
  const loadedRef = useRef<LoadedVehicle | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cfg = useRef({ vehIdx, colorIdx, damage });
  cfg.current = { vehIdx, colorIdx, damage };

  // --- scene setup (once) ---
  useEffect(() => {
    const mount = mountRef.current!;
    const scene = new THREE.Scene();
    sceneRef.current = scene;
    scene.background = new THREE.Color('#0c1118');

    const camera = new THREE.PerspectiveCamera(40, mount.clientWidth / mount.clientHeight, 0.1, 200);
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mount.appendChild(renderer.domElement);

    const pmrem = new THREE.PMREMGenerator(renderer);
    const envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = envRT.texture;

    scene.add(new THREE.HemisphereLight(0xdfeaff, 0x0a0d12, 1.0));
    const key = new THREE.DirectionalLight(0xffffff, 1.7);
    key.position.set(-6, 11, 6);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.near = 1; key.shadow.camera.far = 40;
    key.shadow.camera.left = -8; key.shadow.camera.right = 8; key.shadow.camera.top = 8; key.shadow.camera.bottom = -8;
    key.shadow.bias = -0.0004; key.shadow.normalBias = 0.03;
    scene.add(key);
    scene.add(new THREE.DirectionalLight(0x88b0ff, 0.4).translateX(8).translateY(3).translateZ(-7));

    const ground = new THREE.Mesh(new THREE.CircleGeometry(40, 56), new THREE.MeshStandardMaterial({ color: 0x161b22, roughness: 0.92, metalness: 0 }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    let dragging = false, lx = 0, ly = 0;
    const down = (e: PointerEvent) => { dragging = true; lx = e.clientX; ly = e.clientY; };
    const upFn = () => { dragging = false; };
    const move = (e: PointerEvent) => {
      if (!dragging) return;
      orbit.current.az -= (e.clientX - lx) * 0.008;
      orbit.current.el = Math.max(0.03, Math.min(1.5, orbit.current.el + (e.clientY - ly) * 0.006));
      lx = e.clientX; ly = e.clientY;
    };
    renderer.domElement.addEventListener('pointerdown', down);
    window.addEventListener('pointerup', upFn);
    window.addEventListener('pointermove', move);

    let raf = 0;
    const loop = () => {
      const o = orbit.current;
      camera.position.set(
        o.target.x + o.radius * Math.cos(o.el) * Math.cos(o.az),
        o.target.y + o.radius * Math.sin(o.el),
        o.target.z + o.radius * Math.cos(o.el) * Math.sin(o.az),
      );
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
      window.removeEventListener('pointerup', upFn);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('resize', onResize);
      envRT.dispose(); pmrem.dispose(); renderer.dispose();
      if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
    };
  }, []);

  // --- (re)load vehicle when selection/paint changes ---
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const def = VEHICLES[vehIdx];
    const targetLength = LEN[def.category] ?? 4.6;
    loadVehicleModel(def, { paint: COLORS[colorIdx].hex, targetLength, groundY: -targetLength * 0.115 }).then((veh) => {
      if (cancelled) { veh.group.traverse((o) => { const m = o as THREE.Mesh; if (m.geometry) m.geometry.dispose(); }); return; }
      const scene = sceneRef.current!;
      if (loadedRef.current) scene.remove(loadedRef.current.group);
      loadedRef.current = veh;
      scene.add(veh.group);
      orbit.current.target.set(0, targetLength * 0.16, 0);
      orbit.current.radius = targetLength * 2.9;
      veh.deform(dmgMap(cfg.current.damage), 1);
      setLoading(false);
    }).catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [vehIdx, colorIdx]);

  // live damage
  useEffect(() => { loadedRef.current?.deform(dmgMap(damage), 1); }, [damage]);
  // view preset
  useEffect(() => { const v = VIEWS.find((x) => x.id === view)!; orbit.current.az = v.az; orbit.current.el = v.el; }, [view]);

  const def = VEHICLES[vehIdx];
  return (
    <div className="vs-root">
      <div className="vs-stage" ref={mountRef} />
      {loading && <div className="vs-loading">Loading model…</div>}
      <div className="vs-top">
        <div><span className="vs-title">{def.name}</span> <span className="vs-cat">{def.category}</span></div>
        <button className="vs-close" onClick={() => close(false)} aria-label="Close">✕</button>
      </div>

      <div className="vs-views">
        {VIEWS.map((v) => (
          <button key={v.id} className="vs-chip" data-active={view === v.id} onClick={() => setView(v.id)}>{v.label}</button>
        ))}
      </div>

      <div className="vs-panel">
        <div className="vs-blurb">{def.blurb}</div>
        <div className="vs-group">
          <span className="vs-lab">Vehicle</span>
          <div className="vs-row">
            {VEHICLES.map((v, i) => (
              <button key={v.id} className="vs-chip" data-active={vehIdx === i} onClick={() => setVehIdx(i)}>{v.name}</button>
            ))}
          </div>
        </div>
        <div className="vs-group">
          <span className="vs-lab">Paint</span>
          <div className="vs-row">
            {COLORS.map((c, i) => (
              <button key={c.hex} className="vs-sw" data-active={colorIdx === i} style={{ background: c.hex }} onClick={() => setColorIdx(i)} aria-label={c.name} />
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
  return { front: v, rear: v * 0.25, left: v * 0.45, right: v * 0.2, roof: v * 0.3 };
}
