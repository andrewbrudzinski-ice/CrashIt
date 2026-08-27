import { useState } from 'react';
import type { VehicleBuild } from '../../game/parts/types';
import type { CrashResult } from '../../game/crash/crashModel';
import { deriveStats } from '../../game/vehicle/deriveStats';
import { shareCode, BUILD_BUDGET } from '../../game/vehicle/vehicleModel';
import { buildShareUrl } from '../../game/vehicle/shareCodec';
import { VehicleSilhouette } from '../vehicle/VehicleSilhouette';
import { fmt, money, kmhToMph, ratingColor } from '../../lib/format';
import './shareCard.css';

interface Props {
  build: VehicleBuild;
  /** Last crash result for this build, if any (drives the verdict badge). */
  result?: CrashResult | null;
  onClose: () => void;
}

export function ShareCard({ build, result, onClose }: Props) {
  const s = deriveStats(build);
  const [copied, setCopied] = useState(false);
  const code = shareCode(build.id);

  const verdict = result
    ? result.survivedClean
      ? 'PASSED'
      : result.survival >= 0.6 ? 'SURVIVED' : result.survival >= 0.25 ? 'CRITICAL' : 'FATAL'
    : null;
  const verdictColor = !result
    ? 'var(--c-text-dim)'
    : result.survivedClean || result.survival >= 0.6 ? 'var(--c-lime)'
    : result.survival >= 0.25 ? 'var(--c-amber)' : 'var(--c-red)';

  const copyLink = async () => {
    const url = buildShareUrl(build);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard blocked — fall back to a prompt the user can copy from.
      window.prompt('Copy this build link:', url);
    }
  };

  return (
    <div className="sharecard-backdrop" onClick={onClose}>
      <div className="sharecard" onClick={(e) => e.stopPropagation()}>
        <div className="sharecard-inner blueprint-grid">
          <div className="sharecard-head">
            <span className="sharecard-eyebrow">CRASHIT · VEHICLE</span>
            <span className="sharecard-code mono">#{code}</span>
          </div>

          <h2 className="sharecard-name">{build.name}</h2>
          {build.sandbox && <span className="sharecard-sandbox">SANDBOX BUILD</span>}

          <div className="sharecard-art">
            <VehicleSilhouette build={build} rideHeight={s.rideHeight} />
          </div>

          <div className="sharecard-stats">
            <Cell label="WEIGHT" value={fmt(s.mass)} unit="kg" />
            <Cell label="POWER" value={fmt(s.wheelPowerHp)} unit="hp" />
            <Cell label="0–60" value={s.valid ? s.zeroToSixtyS.toFixed(1) : '—'} unit="s" />
            <Cell label="TOP" value={s.valid ? fmt(kmhToMph(s.topSpeedKmh)) : '—'} unit="mph" />
            <Cell label="COST" value={money(s.totalCost).replace('$', '$')} unit="" over={!build.sandbox && s.totalCost > BUILD_BUDGET} />
            {result ? (
              <Cell label="SAFETY" value={`${result.safety.overall}`} unit="/100" accent={ratingColor(result.safety.overall)} />
            ) : (
              <Cell label="GRIP" value={s.tireGrip.toFixed(2)} unit="μ" />
            )}
          </div>

          {verdict && (
            <div className="sharecard-verdict" style={{ color: verdictColor, borderColor: verdictColor }}>
              CRASH: {verdict}
              {!result?.survivedClean && result && <span className="sharecard-surv"> · {Math.round(result.survival * 100)}%</span>}
            </div>
          )}

          <div className="sharecard-foot">crashit · build a car → crash it</div>
        </div>

        <div className="sharecard-actions">
          <button className="btn btn-ghost" onClick={onClose}>Close</button>
          <button className="btn btn-primary" onClick={copyLink}>{copied ? 'Copied ✓' : 'Copy Link 🔗'}</button>
        </div>
      </div>
    </div>
  );
}

function Cell({ label, value, unit, accent, over }: { label: string; value: string; unit: string; accent?: string; over?: boolean }) {
  return (
    <div className="sharecard-cell">
      <span className="sharecard-cell-label">{label}</span>
      <span className="sharecard-cell-value mono" style={{ color: over ? 'var(--c-red)' : accent }}>
        {value}<span className="sharecard-cell-unit">{unit}</span>
      </span>
    </div>
  );
}
