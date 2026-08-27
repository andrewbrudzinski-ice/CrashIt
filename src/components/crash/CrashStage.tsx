import { useEffect, useRef, useState } from 'react';
import type { VehicleBuild } from '../../game/parts/types';
import type { CrashResult } from '../../game/crash/crashModel';
import type { Scenario } from '../../game/scenarios/scenarios';
import { VehicleSilhouette } from '../vehicle/VehicleSilhouette';
import './crashStage.css';

interface Props {
  build: VehicleBuild;
  scenario: Scenario;
  result: CrashResult;
  onComplete: () => void;
}

type Phase = 'countdown' | 'approach' | 'impact' | 'settle';

/**
 * Lightweight pre-physics crash cinematic. Runs a deterministic approach,
 * an impact flash + shake + spark burst, then settles and reveals the report.
 * (The Rapier-based deformable simulation & scrubber replace this in a later
 * phase; the analytical `result` already drives the outcome.)
 */
export function CrashStage({ build, scenario, result, onComplete }: Props) {
  const [phase, setPhase] = useState<Phase>('countdown');
  const [count, setCount] = useState(3);
  const carRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const severe = result.survivedClean ? 0 : Math.min(1, result.deformationPct / 100);
  const clean = result.survivedClean;

  useEffect(() => {
    let raf = 0;
    const timers: number[] = [];

    // Countdown 3..1
    let c = 3;
    const tick = () => {
      c -= 1;
      if (c > 0) {
        setCount(c);
        timers.push(window.setTimeout(tick, 450));
      } else {
        setPhase('approach');
      }
    };
    timers.push(window.setTimeout(tick, 450));

    return () => {
      timers.forEach(clearTimeout);
      cancelAnimationFrame(raf);
    };
  }, []);

  useEffect(() => {
    if (phase !== 'approach') return;
    const timers: number[] = [];
    // Approach animation handled by CSS; schedule impact.
    timers.push(window.setTimeout(() => setPhase('impact'), clean ? 1300 : 1050));
    return () => timers.forEach(clearTimeout);
  }, [phase, clean]);

  useEffect(() => {
    if (phase !== 'impact') return;
    // haptics
    if (!clean && 'vibrate' in navigator) {
      try { navigator.vibrate([0, 40, 30, 60]); } catch { /* ignore */ }
    }
    const t = window.setTimeout(() => setPhase('settle'), 700);
    return () => clearTimeout(t);
  }, [phase, clean]);

  useEffect(() => {
    if (phase !== 'settle') return;
    const t = window.setTimeout(onComplete, clean ? 900 : 1200);
    return () => clearTimeout(t);
  }, [phase, clean, onComplete]);

  const sparks = phase === 'impact' && !clean;

  return (
    <div className={`stage stage-${phase}`} ref={rootRef} data-clean={clean}>
      <div className="stage-sky" />
      <div className="stage-scanline" />

      <div className="stage-track">
        <div className="stage-road" />
        {/* Wall / barrier (not shown for clean braking stop) */}
        {!clean && <div className="stage-wall" data-kind={scenario.primaryAxis} />}
        {clean && <div className="stage-finish" />}

        <div
          ref={carRef}
          className="stage-car"
          data-phase={phase}
          style={{
            '--severe': severe,
            '--deform': clean ? 1 : 1 - severe * 0.32,
          } as React.CSSProperties}
        >
          <VehicleSilhouette build={build} rideHeight={12} />
          {sparks && (
            <div className="stage-sparks">
              {[...Array(14)].map((_, i) => (
                <span key={i} className="spark" style={{ '--i': i } as React.CSSProperties} />
              ))}
            </div>
          )}
        </div>

        {phase === 'impact' && !clean && <div className="stage-flash" />}
        {phase === 'impact' && !clean && <div className="stage-shockwave" />}
      </div>

      <div className="stage-hud">
        <span className="stage-scn mono">{scenario.icon} {scenario.name}</span>
        {phase !== 'countdown' && !clean && (
          <span className="stage-speed mono">{result.impactSpeedKmh} km/h</span>
        )}
      </div>

      {phase === 'countdown' && (
        <div className="stage-count mono" key={count}>{count}</div>
      )}
      {phase === 'impact' && !clean && (
        <div className="stage-impact-label mono">IMPACT</div>
      )}
      {phase === 'settle' && clean && (
        <div className="stage-impact-label mono" style={{ color: 'var(--c-lime)' }}>STOPPED</div>
      )}
    </div>
  );
}
