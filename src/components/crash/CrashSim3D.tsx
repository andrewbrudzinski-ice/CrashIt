import { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import type { VehicleBuild } from '../../game/parts/types';
import type { VehicleStats } from '../../game/vehicle/deriveStats';
import type { CrashResult } from '../../game/crash/crashModel';
import type { Scenario, ScenarioConfig } from '../../game/scenarios/scenarios';
import { initRapier, simulateCrash, type SimRecording } from '../../game/sim/crashSim';
import './crashSim3d.css';

interface Props {
  build: VehicleBuild;
  stats: VehicleStats;
  scenario: Scenario;
  config: ScenarioConfig;
  result: CrashResult;
  onComplete: () => void;
}

type CameraMode = 'chase' | 'side' | 'top' | 'front' | 'impact';
const CAMERA_MODES: CameraMode[] = ['chase', 'side', 'front', 'top', 'impact'];
const SPEEDS = [1, 0.5, 0.25, 0.1, 0.05];
const FLOATS = 7;

/** Camera world-offset per mode (relative to the tracked target). */
const CAM_OFFSET: Record<CameraMode, THREE.Vector3> = {
  chase: new THREE.Vector3(-9, 4.5, 7),
  side: new THREE.Vector3(0.5, 2.2, 13),
  front: new THREE.Vector3(12, 3.2, 0.6),
  top: new THREE.Vector3(1.5, 16, 0.01),
  impact: new THREE.Vector3(2, 3, 11),
};

export default function CrashSim3D({ build, stats, scenario, config, result, onComplete }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<'loading' | 'ready'>('loading');
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [camMode, setCamMode] = useState<CameraMode>('chase');
  const [cursor, setCursor] = useState(0); // frame index (for scrubber UI)
  const [hudSpeed, setHudSpeed] = useState(result.impactSpeedKmh);
  const [flash, setFlash] = useState(false);

  // Imperative refs the animation loop reads (avoids re-renders per frame).
  const recRef = useRef<SimRecording | null>(null);
  const cursorRef = useRef(0);
  const playingRef = useRef(true);
  const speedRef = useRef(1);
  const camRef = useRef<CameraMode>('chase');
  const scrubbingRef = useRef(false);

  useEffect(() => { playingRef.current = playing; }, [playing]);
  useEffect(() => { speedRef.current = speed; }, [speed]);
  useEffect(() => { camRef.current = camMode; }, [camMode]);

  const replay = useCallback(() => {
    cursorRef.current = 0;
    setCursor(0);
    setPlaying(true);
    setCamMode('chase');
  }, []);

  useEffect(() => {
    let disposed = false;
    let raf = 0;
    const mount = mountRef.current!;
    const cleanupFns: (() => void)[] = [];

    (async () => {
      await initRapier();
      if (disposed) return;
      const rec = simulateCrash(stats, config, result.survivedClean);
      recRef.current = rec;

      // ---- Three setup ----
      const scene = new THREE.Scene();
      scene.background = new THREE.Color('#0a0f16');
      scene.fog = new THREE.Fog('#0a0f16', 30, 90);

      const camera = new THREE.PerspectiveCamera(52, mount.clientWidth / mount.clientHeight, 0.1, 400);
      camera.position.set(-9, 5, 7);

      const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
      renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
      renderer.setSize(mount.clientWidth, mount.clientHeight);
      mount.appendChild(renderer.domElement);

      // ---- Lights ----
      scene.add(new THREE.HemisphereLight(0xcfe6ff, 0x0a0d12, 1.1));
      const key = new THREE.DirectionalLight(0xffffff, 1.4);
      key.position.set(-6, 14, 8);
      scene.add(key);
      const rim = new THREE.DirectionalLight(0x37e0d8, 0.5);
      rim.position.set(10, 4, -8);
      scene.add(rim);

      // ---- Ground + grid ----
      const groundProp = rec.props.find((p) => p.kind === 'ground');
      const gW = groundProp?.size[0] ?? 400;
      const ground = new THREE.Mesh(
        new THREE.PlaneGeometry(gW, groundProp?.size[2] ?? 120),
        new THREE.MeshStandardMaterial({ color: 0x12161d, roughness: 0.95, metalness: 0 }),
      );
      ground.rotation.x = -Math.PI / 2;
      ground.position.y = 0;
      scene.add(ground);
      const grid = new THREE.GridHelper(gW, gW / 2, 0x2b3542, 0x1a212b);
      (grid.material as THREE.Material).transparent = true;
      (grid.material as THREE.Material).opacity = 0.5;
      grid.position.y = 0.01;
      scene.add(grid);

      // ---- Static props (barrier / ramp / curb) ----
      for (const p of rec.props) {
        if (p.kind === 'ground') continue;
        const mat = new THREE.MeshStandardMaterial({
          color: new THREE.Color(p.color ?? '#8a9099'),
          roughness: 0.6, metalness: p.kind === 'barrier' ? 0.5 : 0.2,
        });
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(p.size[0], p.size[1], p.size[2]), mat);
        mesh.position.set(p.pos[0], p.pos[1], p.pos[2]);
        if (p.rot) mesh.quaternion.set(p.rot[0], p.rot[1], p.rot[2], p.rot[3]);
        if (p.kind === 'barrier') {
          // hazard stripes via emissive edge
          const edges = new THREE.LineSegments(
            new THREE.EdgesGeometry(mesh.geometry),
            new THREE.LineBasicMaterial({ color: 0xffcc33 }),
          );
          mesh.add(edges);
        }
        scene.add(mesh);
      }

      // ---- Dynamic body meshes ----
      const bodyGroups: THREE.Group[] = [];
      const bodyMain: (THREE.Mesh | null)[] = [];
      rec.bodies.forEach((b) => {
        const g = new THREE.Group();
        if (b.kind === 'chassis') {
          const [L, H, W] = b.size;
          const paint = new THREE.MeshStandardMaterial({
            color: new THREE.Color(build.color), roughness: 0.35, metalness: 0.6,
          });
          const body = new THREE.Mesh(new THREE.BoxGeometry(L, H, W), paint);
          g.add(body);
          bodyMain.push(body);
          // cabin greenhouse
          const glass = new THREE.MeshStandardMaterial({ color: 0x11202a, roughness: 0.1, metalness: 0.3 });
          const cabin = new THREE.Mesh(new THREE.BoxGeometry(L * 0.5, 0.56, W * 0.86), glass);
          cabin.position.set(-L * 0.05, H / 2 + 0.28, 0);
          g.add(cabin);
          // wheels
          const wheelGeo = new THREE.CylinderGeometry(rec.wheelRadius, rec.wheelRadius, 0.24, 16);
          const wheelMat = new THREE.MeshStandardMaterial({ color: 0x0c0e12, roughness: 0.8 });
          for (const [wx, wy, wz] of rec.wheelLocal) {
            const wheel = new THREE.Mesh(wheelGeo, wheelMat);
            wheel.rotation.x = Math.PI / 2;
            wheel.position.set(wx, wy, wz);
            g.add(wheel);
          }
        } else {
          const [L, H, W] = b.size;
          const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(b.color ?? '#c0392b'), roughness: 0.5, metalness: 0.4 });
          const body = new THREE.Mesh(new THREE.BoxGeometry(L, H, W), mat);
          g.add(body);
          const cabin = new THREE.Mesh(
            new THREE.BoxGeometry(L * 0.5, 0.5, W * 0.85),
            new THREE.MeshStandardMaterial({ color: 0x11151b, roughness: 0.2 }),
          );
          cabin.position.y = H / 2 + 0.25;
          g.add(cabin);
          bodyMain.push(body);
        }
        scene.add(g);
        bodyGroups.push(g);
      });

      // Impact flash light
      const flashLight = new THREE.PointLight(0xffaa55, 0, 30);
      scene.add(flashLight);

      // Precompute impact position of the tracked target for 'impact' camera.
      const targetIdx = Math.max(0, rec.bodies.findIndex((b) => b.id === rec.cameraTarget));
      const impactPos = new THREE.Vector3();
      readPos(rec, rec.impactFrame, targetIdx, impactPos);

      const setup = { scene, camera, renderer, bodyGroups, bodyMain, flashLight, targetIdx, impactPos };

      // ---- resize ----
      const onResize = () => {
        if (!mount) return;
        camera.aspect = mount.clientWidth / mount.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(mount.clientWidth, mount.clientHeight);
      };
      window.addEventListener('resize', onResize);
      cleanupFns.push(() => window.removeEventListener('resize', onResize));

      setPhase('ready');

      // ---- animation loop ----
      const tmpTarget = new THREE.Vector3();
      const tmpPrev = new THREE.Vector3();
      const desiredCam = new THREE.Vector3();
      const q = new THREE.Quaternion();
      let last = performance.now();
      let flashedAt = -1;

      const loop = () => {
        if (disposed) return;
        raf = requestAnimationFrame(loop);
        const now = performance.now();
        const dtReal = Math.min(0.05, (now - last) / 1000);
        last = now;

        const r = recRef.current!;
        // advance cursor
        if (playingRef.current && !scrubbingRef.current) {
          // auto slow-mo window around impact for drama
          const distToImpact = Math.abs(cursorRef.current - r.impactFrame);
          const autoScale = distToImpact < 40 ? 0.18 : 1;
          const framesPerSec = 1 / r.dt;
          cursorRef.current += dtReal * framesPerSec * speedRef.current * autoScale;
          if (cursorRef.current >= r.frameCount - 1) {
            cursorRef.current = r.frameCount - 1;
            playingRef.current = false;
            setPlaying(false);
          }
          setCursor(Math.floor(cursorRef.current));
        }

        const f = Math.min(r.frameCount - 1, Math.max(0, Math.floor(cursorRef.current)));

        // apply transforms
        for (let b = 0; b < r.bodies.length; b++) {
          const g = setup.bodyGroups[b];
          const base = (f * r.bodies.length + b) * FLOATS;
          g.position.set(r.transforms[base], r.transforms[base + 1], r.transforms[base + 2]);
          g.quaternion.set(r.transforms[base + 3], r.transforms[base + 4], r.transforms[base + 5], r.transforms[base + 6]);
        }

        // visual crush on the chassis after impact
        if (!r.clean && setup.bodyMain[0]) {
          const past = Math.max(0, Math.min(1, (cursorRef.current - r.impactFrame) / 20));
          const crush = 1 - (result.deformationPct / 100) * 0.28 * past;
          setup.bodyMain[0].scale.x = crush;
          setup.bodyMain[0].position.x = ((1 - crush) * r.bodies[0].size[0]) / 2; // keep rear fixed
        }

        // HUD speed from frame delta of the target
        if (f > 0) {
          readPos(r, f, setup.targetIdx, tmpTarget);
          readPos(r, f - 1, setup.targetIdx, tmpPrev);
          const spd = tmpPrev.distanceTo(tmpTarget) / r.dt * 3.6;
          if (playingRef.current) setHudSpeed(Math.round(spd));
        }

        // impact flash
        if (flashedAt < 0 && cursorRef.current >= r.impactFrame && !r.clean) {
          flashedAt = now;
          setFlash(true);
          setTimeout(() => setFlash(false), 260);
        }
        setup.flashLight.position.copy(setup.impactPos).add(new THREE.Vector3(0, 1.5, 0));
        setup.flashLight.intensity = flashedAt > 0 ? Math.max(0, 60 * (1 - (now - flashedAt) / 400)) : 0;

        // camera
        readPos(r, f, setup.targetIdx, tmpTarget);
        const mode = camRef.current;
        if (mode === 'impact') {
          desiredCam.copy(setup.impactPos).add(CAM_OFFSET.impact);
          tmpTarget.copy(setup.impactPos);
        } else {
          desiredCam.copy(tmpTarget).add(CAM_OFFSET[mode]);
        }
        setup.camera.position.lerp(desiredCam, mode === 'top' ? 0.12 : 0.09);
        q.identity();
        setup.camera.lookAt(tmpTarget);

        renderer.render(scene, camera);
      };
      raf = requestAnimationFrame(loop);

      cleanupFns.push(() => {
        cancelAnimationFrame(raf);
        renderer.dispose();
        scene.traverse((o) => {
          const m = o as THREE.Mesh;
          if (m.geometry) m.geometry.dispose();
          const mat = m.material as THREE.Material | THREE.Material[] | undefined;
          if (Array.isArray(mat)) mat.forEach((mm) => mm.dispose());
          else mat?.dispose();
        });
        if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
      });
    })();

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      cleanupFns.forEach((fn) => fn());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rec = recRef.current;
  const timePct = rec ? (cursor / Math.max(1, rec.frameCount - 1)) * 100 : 0;

  return (
    <div className="sim3d">
      <div className="sim3d-canvas" ref={mountRef} />
      {flash && <div className="sim3d-flash" />}

      {phase === 'loading' && (
        <div className="sim3d-loading">
          <div className="sim3d-spinner" />
          <span className="mono">SIMULATING…</span>
        </div>
      )}

      {/* Top HUD */}
      <div className="sim3d-hud">
        <span className="mono sim3d-scn">{scenario.icon} {scenario.name}</span>
        {!result.survivedClean && <span className="mono sim3d-spd">{hudSpeed} km/h</span>}
      </div>

      {/* Camera modes */}
      <div className="sim3d-cams">
        {CAMERA_MODES.map((m) => (
          <button key={m} className="sim3d-cam" data-active={camMode === m} onClick={() => setCamMode(m)}>
            {m}
          </button>
        ))}
      </div>

      {/* Bottom controls */}
      {phase === 'ready' && (
        <div className="sim3d-controls">
          <div className="sim3d-scrub-row">
            <button
              className="sim3d-play"
              onClick={() => {
                if (rec && cursorRef.current >= rec.frameCount - 1) replay();
                else { const p = !playing; setPlaying(p); }
              }}
            >
              {playing ? '❚❚' : (rec && cursor >= rec.frameCount - 1 ? '↻' : '▶')}
            </button>
            <input
              className="sim3d-scrub"
              type="range"
              min={0}
              max={rec ? rec.frameCount - 1 : 100}
              value={cursor}
              onPointerDown={() => { scrubbingRef.current = true; setPlaying(false); }}
              onPointerUp={() => { scrubbingRef.current = false; }}
              onChange={(e) => {
                const v = Number(e.target.value);
                cursorRef.current = v;
                setCursor(v);
              }}
            />
            <span className="sim3d-time mono">{rec ? (cursor * rec.dt).toFixed(2) : '0.00'}s</span>
          </div>

          <div className="sim3d-speeds">
            {SPEEDS.map((s) => (
              <button key={s} className="sim3d-speed" data-active={speed === s} onClick={() => setSpeed(s)}>
                {s}×
              </button>
            ))}
            <div className="sim3d-spacer" />
            <button className="sim3d-btn ghost" onClick={replay}>Replay ↻</button>
            <button className="sim3d-btn primary" onClick={onComplete}>Report ›</button>
          </div>
        </div>
      )}

      <div className="sim3d-simbadge mono">SIMULATION</div>
      <div className="sim3d-progress" style={{ width: `${timePct}%` }} />
    </div>
  );
}

function readPos(rec: SimRecording, frame: number, bodyIdx: number, out: THREE.Vector3) {
  const f = Math.min(rec.frameCount - 1, Math.max(0, frame));
  const base = (f * rec.bodies.length + bodyIdx) * FLOATS;
  out.set(rec.transforms[base], rec.transforms[base + 1], rec.transforms[base + 2]);
}
