import type { CrashResult } from '../../game/crash/crashModel';
import { fmt, ratingColor } from '../../lib/format';
import './crashReport.css';

interface Props {
  result: CrashResult;
  onClose: () => void;
  onModify: () => void;
  onRerun: () => void;
}

export function CrashReport({ result: r, onClose, onModify, onRerun }: Props) {
  const survivalPct = Math.round(r.survival * 100);
  const survColor = ratingColor(survivalPct);
  const verdict = r.survivedClean
    ? 'PASSED'
    : survivalPct >= 60 ? 'SURVIVED' : survivalPct >= 25 ? 'CRITICAL' : 'FATAL';
  const verdictColor = r.survivedClean || survivalPct >= 60 ? 'var(--c-lime)'
    : survivalPct >= 25 ? 'var(--c-amber)' : 'var(--c-red)';

  return (
    <div className="report">
      <div className="report-scroll">
        <div className="report-verdict-band" style={{ '--vc': verdictColor } as React.CSSProperties}>
          <span className="report-eyebrow">Crash Analysis · {r.scenarioName}</span>
          <div className="report-verdict mono" style={{ color: verdictColor }}>{verdict}</div>
          {!r.survivedClean && (
            <div className="report-survival">
              Driver survival probability
              <span className="mono" style={{ color: survColor }}> {survivalPct}%</span>
            </div>
          )}
        </div>

        {!r.survivedClean && (
          <div className="report-hero-grid">
            <Big label="IMPACT SPEED" value={fmt(r.impactSpeedKmh)} unit="km/h" />
            <Big label="PEAK DECEL" value={r.peakDecelG.toFixed(1)} unit="G" accent={r.peakDecelG > 50 ? 'var(--c-red)' : undefined} />
            <Big label="CABIN INTRUSION" value={fmt(r.cabinIntrusionCm)} unit="cm" accent={r.cabinIntrusionCm > 15 ? 'var(--c-red)' : undefined} />
            <Big label="DEFORMATION" value={fmt(r.deformationPct)} unit="%" />
            <Big label="ENERGY" value={fmt(r.energyKj)} unit="kJ" />
            <Big label="STRUCTURE LEFT" value={fmt(r.structuralIntegrity)} unit="%" accent={ratingColor(r.structuralIntegrity)} />
          </div>
        )}

        {/* Failure analysis */}
        <section className="report-section">
          <h4 className="report-h">Failure Analysis</h4>
          <div className="report-fail">
            <span className="fail-tag primary">PRIMARY</span>
            <span>{r.primaryFailure}</span>
          </div>
          {r.secondaryFailure && (
            <div className="report-fail">
              <span className="fail-tag secondary">SECONDARY</span>
              <span>{r.secondaryFailure}</span>
            </div>
          )}
          {r.notes.map((n, i) => (
            <div key={i} className="report-note">› {n}</div>
          ))}
          <div className="report-note dim">Weight distribution: {r.weightDistLabel}</div>
        </section>

        {/* Safety score */}
        <section className="report-section">
          <h4 className="report-h">Safety Rating</h4>
          <div className="safety-overall">
            <svg viewBox="0 0 120 120" className="safety-ring">
              <circle cx="60" cy="60" r="52" fill="none" stroke="var(--c-surface-3)" strokeWidth="10" />
              <circle
                cx="60" cy="60" r="52" fill="none"
                stroke={ratingColor(r.safety.overall)} strokeWidth="10" strokeLinecap="round"
                strokeDasharray={`${(r.safety.overall / 100) * 326.7} 326.7`}
                transform="rotate(-90 60 60)"
              />
            </svg>
            <div className="safety-overall-num">
              <span className="mono" style={{ color: ratingColor(r.safety.overall) }}>{r.safety.overall}</span>
              <span className="safety-overall-den">/ 100</span>
            </div>
          </div>
          <div className="safety-bars">
            <SafetyBar label="Structural" value={r.safety.structural} />
            <SafetyBar label="Restraints" value={r.safety.restraints} />
            <SafetyBar label="Crumple Zones" value={r.safety.crumple} />
            <SafetyBar label="Cabin Integrity" value={r.safety.cabin} />
            <SafetyBar label="Rollover Protection" value={r.safety.rollover} />
          </div>
        </section>

        {/* Occupant */}
        {!r.survivedClean && (
          <section className="report-section">
            <h4 className="report-h">Crash-Test Dummy <span className="report-sim">SIMULATED</span></h4>
            <div className="dummy-grid">
              <DummyStat label="Head Impact" value={`${r.occupant.headG} G`} bad={r.occupant.headG > 80} />
              <DummyStat label="Chest Force" value={`${r.occupant.chestG} G`} bad={r.occupant.chestG > 60} />
              <DummyStat label="Neck Load" value={`${Math.round(r.occupant.neckLoad * 100)}%`} bad={r.occupant.neckLoad > 0.7} />
              <DummyStat label="Leg Intrusion" value={`${r.occupant.legIntrusion} cm`} bad={r.occupant.legIntrusion > 20} />
            </div>
          </section>
        )}

        {/* Damage map */}
        <section className="report-section">
          <h4 className="report-h">Component Damage</h4>
          <div className="damage-grid">
            {([
              ['Front', r.damage.front], ['Rear', r.damage.rear],
              ['Left', r.damage.left], ['Right', r.damage.right],
              ['Roof', r.damage.roof], ['Wheels', r.damage.wheels],
              ['Engine', r.damage.engine], ['Suspension', r.damage.suspension],
              ['Chassis', r.damage.chassis],
            ] as [string, number][]).map(([label, val]) => (
              <div key={label} className="damage-cell">
                <span className="damage-label">{label}</span>
                <div className="damage-track">
                  <div className="damage-fill" style={{ width: `${Math.round(val)}%`, background: ratingColor(100 - val) }} />
                </div>
                <span className="damage-val mono">{Math.round(val)}%</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="report-actions">
        <button className="btn btn-ghost" onClick={onClose}>Close</button>
        <button className="btn btn-ghost" onClick={onModify}>Modify ✎</button>
        <button className="btn btn-primary" onClick={onRerun}>Run Again ↻</button>
      </div>
    </div>
  );
}

function Big({ label, value, unit, accent }: { label: string; value: string; unit: string; accent?: string }) {
  return (
    <div className="report-big">
      <span className="report-big-label">{label}</span>
      <span className="report-big-value mono" style={accent ? { color: accent } : undefined}>
        {value}<span className="report-big-unit">{unit}</span>
      </span>
    </div>
  );
}

function SafetyBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="sbar">
      <span className="sbar-label">{label}</span>
      <div className="sbar-track">
        <div className="sbar-fill" style={{ width: `${value}%`, background: ratingColor(value) }} />
      </div>
      <span className="sbar-val mono">{value}</span>
    </div>
  );
}

function DummyStat({ label, value, bad }: { label: string; value: string; bad: boolean }) {
  return (
    <div className="dummy-stat" data-bad={bad}>
      <span className="dummy-label">{label}</span>
      <span className="dummy-value mono">{value}</span>
    </div>
  );
}
