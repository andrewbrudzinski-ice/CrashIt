import { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { VehicleBuild } from '../../game/parts/types';
import type { VehicleStats } from '../../game/vehicle/deriveStats';
import type { CrashResult } from '../../game/crash/crashModel';
import type { Scenario, ScenarioConfig } from '../../game/scenarios/scenarios';
import { initRapier, simulateCrash, type SimRecording } from '../../game/sim/crashSim';
import { audio } from '../../game/audio/audio';
import { useGame } from '../../state/store';
import { buildCarMesh } from '../vehicle/carMesh3d';
import { CHASSIS_STYLE } from '../vehicle/silhouetteProfiles';
import { getCondition } from '../../game/scenarios/conditions';
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
  const storeMuted = useGame((s) => s.settings.muted);
  const setMutedStore = useGame((s) => s.setMuted);
  const [muted, setMuted] = useState(storeMuted);

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
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.05;
      mount.appendChild(renderer.domElement);

      // ---- Image-based lighting: a soft studio env so metallic paint, chrome
      // and glass pick up glossy reflections instead of reading flat/plastic. ----
      const pmrem = new THREE.PMREMGenerator(renderer);
      const envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
      scene.environment = envRT.texture;
      cleanupFns.push(() => { envRT.dispose(); pmrem.dispose(); });

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
      const chassisStyle = CHASSIS_STYLE[build.parts.chassis ?? 'chassis.sedan'] ?? 'sedan';
      let chassisDeform: ((d: typeof result.damage, t: number) => void) | null = null;
      rec.bodies.forEach((b) => {
        const [L, H, W] = b.size;
        if (b.kind === 'chassis') {
          const aeroSet = new Set(build.aero);
          const aero = {
            spoiler: aeroSet.has('aero.spoiler'),
            wing: aeroSet.has('aero.wing') || aeroSet.has('aero.active'),
            splitter: aeroSet.has('aero.splitter'),
            diffuser: aeroSet.has('aero.diffuser'),
          };
          const sporty = chassisStyle === 'coupe' || chassisStyle === 'exotic';
          const { group: g, deform } = buildCarMesh(chassisStyle, L, H, W, build.color, rec.wheelRadius, rec.wheelLocal, {
            stripes: sporty || build.aero.length > 0,
            aero,
          });
          chassisDeform = deform;
          scene.add(g);
          bodyGroups.push(g);
        } else {
          // Opponent vehicles: a shaped sedan body in their own colour.
          const oppWheels: number[][] = [
            [L * 0.32, -H * 0.5 + 0.12, W * 0.5], [L * 0.32, -H * 0.5 + 0.12, -W * 0.5],
            [-L * 0.32, -H * 0.5 + 0.12, W * 0.5], [-L * 0.32, -H * 0.5 + 0.12, -W * 0.5],
          ];
          const { group: g } = buildCarMesh('sedan', L, H, W, b.color ?? '#c0392b', 0.3, oppWheels);
          scene.add(g);
          bodyGroups.push(g);
        }
      });

      // Impact flash light
      const flashLight = new THREE.PointLight(0xffaa55, 0, 30);
      scene.add(flashLight);

      // Precompute impact position of the tracked target for 'impact' camera.
      const targetIdx = Math.max(0, rec.bodies.findIndex((b) => b.id === rec.cameraTarget));
      const impactPos = new THREE.Vector3();
      readPos(rec, rec.impactFrame, targetIdx, impactPos);
      // Pull the camera back for long/tall vehicles (e.g. a semi) so they frame.
      const chassisLen = rec.bodies[0]?.size[0] ?? 4.7;
      const camScale = Math.max(1, Math.min(3.4, chassisLen / 5));

      // ---- Tyre skid marks: scan the recording for hard-decel frames and lay
      // dark decals under the wheels, revealed as the cursor passes them. ----
      const skidMeshes: { mesh: THREE.Mesh; frame: number }[] = [];
      {
        const skidMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.4, depthWrite: false });
        const p0 = new THREE.Vector3(), p1 = new THREE.Vector3();
        for (let f = 2; f < rec.frameCount; f += 3) {
          readPos(rec, f, targetIdx, p1);
          readPos(rec, f - 2, targetIdx, p0);
          const dv = (p0.distanceTo(p1) / (rec.dt * 2)) * 3.6; // km/h over the step
          readPos(rec, f - 1, targetIdx, p0); // reuse for the frame before speed calc
          const spd = p0.distanceTo(p1) / rec.dt * 3.6;
          // decelerating fast & still moving → skid
          if (spd > 6 && dv - spd > 3 && p1.y < 1.2) {
            for (const [wx, , wz] of rec.wheelLocal) {
              const mark = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.24), skidMat);
              mark.rotation.x = -Math.PI / 2;
              mark.position.set(p1.x + wx * 0.4, 0.012, p1.z + wz);
              mark.visible = false;
              scene.add(mark);
              skidMeshes.push({ mesh: mark, frame: f });
            }
          }
        }
      }

      // ---- Spark/debris burst emitted at impact (real-time transient). ----
      const SPARKS = 40;
      const sparkPos = new Float32Array(SPARKS * 3);
      const sparkVel: THREE.Vector3[] = [];
      for (let i = 0; i < SPARKS; i++) {
        const a = Math.random() * Math.PI * 2;
        const el = Math.random() * Math.PI * 0.5;
        const sp = 4 + Math.random() * 9;
        sparkVel.push(new THREE.Vector3(Math.cos(a) * Math.cos(el) * sp, Math.sin(el) * sp + 3, Math.sin(a) * Math.cos(el) * sp));
      }
      const sparkGeo = new THREE.BufferGeometry();
      sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
      const sparkMat = new THREE.PointsMaterial({ color: 0xffb24d, size: 0.22, transparent: true, opacity: 0 });
      const sparks = new THREE.Points(sparkGeo, sparkMat);
      sparks.visible = false;
      scene.add(sparks);

      // ---- Debris chunks: tumbling fragments that fly off & land on a big hit.
      // Timeline-driven so they scrub with the replay. ----
      const DEBRIS = 9;
      const debrisColor = new THREE.Color(build.color);
      const debris: { mesh: THREE.Mesh; vel: THREE.Vector3; spin: THREE.Vector3 }[] = [];
      for (let i = 0; i < DEBRIS; i++) {
        const sz = 0.12 + Math.random() * 0.22;
        const mat = new THREE.MeshStandardMaterial({
          color: i % 3 === 0 ? 0x1a1d22 : debrisColor, roughness: 0.6, metalness: 0.4,
        });
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(sz, sz * 0.6, sz * 0.8), mat);
        mesh.visible = false;
        scene.add(mesh);
        const a = Math.random() * Math.PI * 2;
        const sp = 3 + Math.random() * 6;
        debris.push({
          mesh,
          vel: new THREE.Vector3(Math.cos(a) * sp, 2 + Math.random() * 5, Math.sin(a) * sp),
          spin: new THREE.Vector3((Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12),
        });
      }

      // ---- Smoke plume: grey points that rise & fade after a heavy impact. ----
      const SMOKE = 24;
      const smokePos = new Float32Array(SMOKE * 3);
      const smokeSeed: THREE.Vector3[] = [];
      for (let i = 0; i < SMOKE; i++) {
        smokeSeed.push(new THREE.Vector3((Math.random() - 0.5) * 1.2, Math.random() * 0.4, (Math.random() - 0.5) * 1.2));
      }
      const smokeGeo = new THREE.BufferGeometry();
      smokeGeo.setAttribute('position', new THREE.BufferAttribute(smokePos, 3));
      const smokeMat = new THREE.PointsMaterial({ color: 0x3a3f45, size: 1.4, transparent: true, opacity: 0, depthWrite: false });
      const smoke = new THREE.Points(smokeGeo, smokeMat);
      smoke.visible = false;
      scene.add(smoke);

      // Start engine + wind ambience (electric = different voice).
      audio.setMuted(useGame.getState().settings.muted);
      const reduceMotion = useGame.getState().settings.reduceMotion;
      audio.startAmbient(stats.engineKind === 'electric');
      cleanupFns.push(() => audio.stopAmbient());

      // Debris/smoke only for a genuinely destructive crash.
      const severe = !rec.clean && result.deformationPct > 35;

      const setup = {
        scene, camera, renderer, bodyGroups, flashLight, targetIdx, impactPos,
        skidMeshes, sparks, sparkMat, sparkPos, sparkVel, sparkGeo,
        debris, smoke, smokeMat, smokePos, smokeSeed, smokeGeo, severe,
      };

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
      const shakeVec = new THREE.Vector3();
      let last = performance.now();
      let flashedAt = -1;
      let shake = 0;
      let sparkAge = -1; // seconds since spark burst; <0 = inactive
      let lastSpeed = result.impactSpeedKmh;

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

        // Crumple the chassis body toward its damaged zones as impact passes.
        if (!r.clean && chassisDeform) {
          const past = Math.max(0, Math.min(1, (cursorRef.current - r.impactFrame) / 16));
          chassisDeform(result.damage, past);
        }

        // Speed & screech from frame delta of the target.
        let spd = 0;
        if (f > 0) {
          readPos(r, f, setup.targetIdx, tmpTarget);
          readPos(r, f - 1, setup.targetIdx, tmpPrev);
          spd = tmpPrev.distanceTo(tmpTarget) / r.dt * 3.6;
          if (playingRef.current) setHudSpeed(Math.min(999, Math.round(spd)));
        }
        // Effective playback rate (for slow-mo engine pitch).
        const distToImpactNow = Math.abs(cursorRef.current - r.impactFrame);
        const effScale = speedRef.current * (distToImpactNow < 40 ? 0.18 : 1);
        // Screech: hard deceleration while still rolling (braking / pre-impact).
        const decel = Math.max(0, lastSpeed - spd);
        lastSpeed = spd;
        const screech = playingRef.current ? Math.min(1, (decel / 4) * (spd > 6 ? 1 : 0)) : 0;
        audio.updateAmbient(playingRef.current ? spd : 0, effScale, screech);

        // Reveal skid marks the cursor has passed.
        for (const s of setup.skidMeshes) s.mesh.visible = f >= s.frame;

        // impact flash + audio + sparks + camera shake
        if (flashedAt < 0 && cursorRef.current >= r.impactFrame && !r.clean) {
          flashedAt = now;
          setFlash(true);
          setTimeout(() => setFlash(false), 260);
          const intensity = Math.min(1, result.deformationPct / 100);
          audio.impact(intensity, { glass: result.deformationPct > 40, metal: result.peakDecelG > 20 });
          shake = reduceMotion ? 0 : 0.5 + intensity * 0.7;
          sparkAge = 0;
          setup.sparks.position.copy(setup.impactPos).add(new THREE.Vector3(r.bodies[0].size[0] * 0.4, 0.3, 0));
          setup.sparks.visible = true;
        }
        setup.flashLight.position.copy(setup.impactPos).add(new THREE.Vector3(0, 1.5, 0));
        setup.flashLight.intensity = flashedAt > 0 ? Math.max(0, 60 * (1 - (now - flashedAt) / 400)) : 0;

        // Animate spark burst (real-time transient).
        if (sparkAge >= 0) {
          sparkAge += dtReal;
          const life = 0.8;
          if (sparkAge > life) {
            setup.sparks.visible = false;
            sparkAge = -1;
          } else {
            const arr = setup.sparkPos;
            for (let i = 0; i < setup.sparkVel.length; i++) {
              const v = setup.sparkVel[i];
              arr[i * 3] = v.x * sparkAge;
              arr[i * 3 + 1] = Math.max(-0.2, v.y * sparkAge - 9.8 * 0.5 * sparkAge * sparkAge);
              arr[i * 3 + 2] = v.z * sparkAge;
            }
            setup.sparkGeo.attributes.position.needsUpdate = true;
            setup.sparkMat.opacity = Math.max(0, 1 - sparkAge / life);
          }
        }

        // Debris chunks + smoke plume — timeline-driven, so they scrub cleanly.
        if (setup.severe) {
          const it = Math.max(0, (cursorRef.current - r.impactFrame)) * r.dt; // s since impact
          const show = cursorRef.current >= r.impactFrame;
          for (const d of setup.debris) {
            d.mesh.visible = show;
            if (!show) continue;
            d.mesh.position.set(
              setup.impactPos.x + d.vel.x * it,
              Math.max(0.05, setup.impactPos.y + d.vel.y * it - 4.9 * it * it),
              setup.impactPos.z + d.vel.z * it,
            );
            d.mesh.rotation.set(d.spin.x * it, d.spin.y * it, d.spin.z * it);
          }
          setup.smoke.visible = show;
          if (show) {
            const arr = setup.smokePos;
            for (let i = 0; i < setup.smokeSeed.length; i++) {
              const s = setup.smokeSeed[i];
              arr[i * 3] = setup.impactPos.x + s.x * (1 + it * 0.8);
              arr[i * 3 + 1] = setup.impactPos.y + s.y + it * (1.1 + i * 0.03);
              arr[i * 3 + 2] = setup.impactPos.z + s.z * (1 + it * 0.8);
            }
            setup.smokeGeo.attributes.position.needsUpdate = true;
            setup.smokeMat.opacity = Math.max(0, 0.5 * Math.min(1, it * 3) - it * 0.16);
          }
        }

        // camera
        readPos(r, f, setup.targetIdx, tmpTarget);
        const mode = camRef.current;
        if (mode === 'impact') {
          desiredCam.copy(CAM_OFFSET.impact).multiplyScalar(camScale).add(setup.impactPos);
          tmpTarget.copy(setup.impactPos);
        } else {
          desiredCam.copy(CAM_OFFSET[mode]).multiplyScalar(camScale).add(tmpTarget);
        }
        setup.camera.position.lerp(desiredCam, mode === 'top' ? 0.12 : 0.09);
        // Impact camera shake (decays quickly).
        if (shake > 0.001) {
          shakeVec.set((Math.random() - 0.5), (Math.random() - 0.5), (Math.random() - 0.5)).multiplyScalar(shake);
          setup.camera.position.add(shakeVec);
          shake *= Math.pow(0.02, dtReal); // ~decay to near-zero in ~0.5s
        }
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
        <span className="mono sim3d-scn">
          {scenario.icon} {scenario.name}
          {config.conditions?.map((id) => (
            <span key={id} className="sim3d-cond" title={getCondition(id)?.name}>{getCondition(id)?.icon}</span>
          ))}
        </span>
        <div className="sim3d-hud-right">
          {!result.survivedClean && <span className="mono sim3d-spd">{hudSpeed} km/h</span>}
          <button
            className="sim3d-mute"
            onClick={() => {
              const m = !muted;
              setMuted(m);
              setMutedStore(m);
              audio.setMuted(m);
            }}
            aria-label={muted ? 'Unmute' : 'Mute'}
          >
            {muted ? '🔇' : '🔊'}
          </button>
        </div>
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
