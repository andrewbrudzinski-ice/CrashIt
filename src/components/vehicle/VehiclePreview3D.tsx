import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { VehicleBuild } from '../../game/parts/types';
import { vehicleForChassis, type VehicleCategory } from '../../game/vehicles/vehicleAssets';
import { loadVehicleModel, type LoadedVehicle } from './vehicleModel3d';
import './vehiclePreview3d.css';

/** Display length per category so previews sit at believable proportions. */
const LEN: Record<VehicleCategory, number> = {
  compact: 3.9, sedan: 4.7, muscle: 4.9, sports: 4.4, suv: 4.8, pickup: 5.3, van: 5.0,
};

/**
 * A small live 3D preview of the actual GLB vehicle for a build — the same car
 * that will enter the crash, recoloured to the build's paint, slowly spinning.
 * Shares the GLTF cache with the crash view so it loads instantly after first use.
 */
export function VehiclePreview3D({ build, className }: { build: VehicleBuild; className?: string }) {
  const mountRef = useRef<HTMLDivElement>(null);
  const loadedRef = useRef<LoadedVehicle | null>(null);
  const spinRef = useRef<THREE.Group | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);

  const chassis = build.parts.chassis;
  const color = build.color;

  // scene setup (once)
  useEffect(() => {
    const mount = mountRef.current!;
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(38, mount.clientWidth / Math.max(1, mount.clientHeight), 0.1, 100);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.setClearAlpha(0);
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
    key.position.set(-5, 9, 5);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.near = 1; key.shadow.camera.far = 30;
    key.shadow.camera.left = -6; key.shadow.camera.right = 6; key.shadow.camera.top = 6; key.shadow.camera.bottom = -6;
    key.shadow.bias = -0.0005; key.shadow.normalBias = 0.03;
    scene.add(key);

    // Contact-shadow catcher on the transparent background.
    const shadowPlane = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.ShadowMaterial({ opacity: 0.32 }));
    shadowPlane.rotation.x = -Math.PI / 2;
    shadowPlane.receiveShadow = true;
    scene.add(shadowPlane);

    const spin = new THREE.Group();
    spinRef.current = spin;
    scene.add(spin);

    let raf = 0;
    let t = 0;
    const loop = () => {
      t += 0.004;
      spin.rotation.y = -0.5 + Math.sin(t) * 0.9; // gentle sweep, mostly 3/4
      const r = 9.5;
      camera.position.set(r * 0.62, 4.6, r * 0.78);
      camera.lookAt(0, 0.5, 0);
      renderer.render(scene, camera);
      raf = requestAnimationFrame(loop);
    };
    loop();

    const onResize = () => {
      if (!mount.clientWidth) return;
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    };
    window.addEventListener('resize', onResize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      envRT.dispose(); pmrem.dispose(); renderer.dispose();
      if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
    };
  }, []);

  // (re)load model when the chassis changes
  useEffect(() => {
    let cancelled = false;
    const def = vehicleForChassis(chassis);
    const targetLength = LEN[def.category] ?? 4.6;
    loadVehicleModel(def, { paint: color, targetLength, groundY: 0 }).then((veh) => {
      if (cancelled) return;
      const spin = spinRef.current!;
      if (loadedRef.current) spin.remove(loadedRef.current.group);
      loadedRef.current = veh;
      spin.add(veh.group);
    }).catch(() => {});
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chassis]);

  // recolour without reloading
  useEffect(() => { loadedRef.current?.setPaint(color); }, [color]);

  return <div className={`veh-preview3d${className ? ' ' + className : ''}`} ref={mountRef} />;
}
