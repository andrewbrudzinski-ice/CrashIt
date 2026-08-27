import { useState } from 'react';
import { useGame } from '../../state/store';
import type { PartCategory, VehicleBuild } from '../../game/parts/types';
import {
  CATEGORY_LABELS,
  PARTS_BY_CATEGORY,
  getPart,
} from '../../game/parts/partsDatabase';
import { deriveStats, type VehicleStats } from '../../game/vehicle/deriveStats';
import { BUILD_BUDGET, PAINT_COLORS } from '../../game/vehicle/vehicleModel';
import { getChallenge, PART_UNLOCK_SOURCE } from '../../game/challenges/challenges';
import { VehicleSilhouette } from '../../components/vehicle/VehicleSilhouette';
import { fmt, money, signed } from '../../lib/format';
import './builder.css';

const CATEGORY_ORDER: PartCategory[] = [
  'chassis', 'engine', 'transmission', 'drivetrain', 'suspension',
  'tires', 'brakes', 'body', 'safety', 'aero',
];

/** Which derived metric a category most affects — drives the delta preview. */
const CATEGORY_METRIC: Record<PartCategory, { key: keyof VehicleStats; label: string; unit: string; digits: number; better: 'up' | 'down' }> = {
  chassis: { key: 'mass', label: 'Mass', unit: 'kg', digits: 0, better: 'down' },
  engine: { key: 'wheelPowerHp', label: 'Power', unit: 'hp', digits: 0, better: 'up' },
  transmission: { key: 'wheelPowerHp', label: 'Wheel Power', unit: 'hp', digits: 0, better: 'up' },
  drivetrain: { key: 'tireGrip', label: 'Grip', unit: 'μ', digits: 2, better: 'up' },
  suspension: { key: 'steeringResponse', label: 'Response', unit: '', digits: 2, better: 'up' },
  tires: { key: 'tireGrip', label: 'Grip', unit: 'μ', digits: 2, better: 'up' },
  brakes: { key: 'brakingDistanceM', label: 'Braking', unit: 'm', digits: 1, better: 'down' },
  body: { key: 'chassisStrength', label: 'Structure', unit: '', digits: 0, better: 'up' },
  safety: { key: 'cabinStrength', label: 'Cabin', unit: '', digits: 0, better: 'up' },
  aero: { key: 'downforceCoef', label: 'Downforce', unit: '', digits: 2, better: 'up' },
};

export function BuilderScreen() {
  const activeId = useGame((s) => s.activeBuildId);
  const build = useGame((s) => s.builds.find((b) => b.id === activeId));
  const selectPart = useGame((s) => s.selectPart);
  const toggleMultiPart = useGame((s) => s.toggleMultiPart);
  const setColor = useGame((s) => s.setColor);
  const renameBuild = useGame((s) => s.renameBuild);
  const setScreen = useGame((s) => s.setScreen);
  const isPartUnlocked = useGame((s) => s.isPartUnlocked);
  const activeChallengeId = useGame((s) => s.activeChallengeId);
  const exitChallenge = useGame((s) => s.exitChallenge);
  const challenge = getChallenge(activeChallengeId);

  const [cat, setCat] = useState<PartCategory>('chassis');
  const [editingName, setEditingName] = useState(false);

  if (!build) {
    return (
      <div className="screen">
        <div className="builder-noselect">
          <p>No build selected.</p>
          <button className="btn btn-primary" onClick={() => setScreen('garage')}>Go to Garage</button>
        </div>
      </div>
    );
  }

  const stats = deriveStats(build);
  const overBudget = !build.sandbox && stats.totalCost > BUILD_BUDGET;
  const budgetPct = Math.min(100, (stats.totalCost / BUILD_BUDGET) * 100);
  const isMulti = cat === 'safety' || cat === 'aero';
  const parts = PARTS_BY_CATEGORY[cat];
  const metric = CATEGORY_METRIC[cat];

  /** Stats if `partId` replaced the current selection in `cat`. */
  const hypothetical = (partId: string): VehicleStats => {
    let next: VehicleBuild;
    if (isMulti) {
      const list = build[cat as 'safety' | 'aero'];
      const nextList = list.includes(partId) ? list.filter((p) => p !== partId) : [...list, partId];
      next = { ...build, [cat]: nextList };
    } else {
      next = { ...build, parts: { ...build.parts, [cat]: partId } };
    }
    return deriveStats(next);
  };

  const currentMetricVal = stats[metric.key] as number;

  return (
    <div className="screen builder">
      <header className="screen-header builder-header">
        <button className="builder-back" onClick={() => setScreen('garage')} aria-label="Back to garage">‹</button>
        {editingName ? (
          <input
            className="builder-name-input mono"
            defaultValue={build.name}
            autoFocus
            onBlur={(e) => { renameBuild(build.id, e.target.value.trim() || build.name); setEditingName(false); }}
            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
          />
        ) : (
          <button className="builder-name" onClick={() => setEditingName(true)}>
            {build.name} <span className="builder-edit">✎</span>
          </button>
        )}
        <button className="btn btn-primary builder-test-btn" onClick={() => setScreen('test')} disabled={!stats.valid}>
          {challenge ? 'Run ›' : 'Test ›'}
        </button>
      </header>

      {challenge && (
        <div className="builder-challenge">
          <span className="bc-icon">{challenge.icon}</span>
          <span className="bc-brief">{challenge.brief}</span>
          <button className="bc-exit" onClick={() => exitChallenge()} aria-label="Exit challenge">✕</button>
        </div>
      )}

      {/* Preview */}
      <div className="builder-preview blueprint-grid">
        <VehicleSilhouette build={build} rideHeight={stats.rideHeight} showGuides />
        <div className="builder-colors">
          {PAINT_COLORS.map((c) => (
            <button
              key={c}
              className="color-dot"
              data-active={build.color === c}
              style={{ background: c }}
              onClick={() => setColor(build.id, c)}
              aria-label={`Paint ${c}`}
            />
          ))}
        </div>
      </div>

      {/* Budget */}
      <div className="builder-budget">
        <div className="budget-track">
          <div
            className="budget-fill"
            style={{ width: `${budgetPct}%`, background: overBudget ? 'var(--c-red)' : 'var(--c-hazard)' }}
          />
        </div>
        <div className="budget-labels">
          <span className="mono" style={{ color: overBudget ? 'var(--c-red)' : 'var(--c-text)' }}>
            {money(stats.totalCost)}
          </span>
          <span className="mono dim">/ {money(BUILD_BUDGET)}{build.sandbox ? ' (sandbox)' : ''}</span>
        </div>
      </div>

      {/* Live stat strip */}
      <div className="builder-strip">
        <LiveStat label="POWER" value={fmt(stats.wheelPowerHp)} unit="hp" />
        <LiveStat label="MASS" value={fmt(stats.mass)} unit="kg" />
        <LiveStat label="0–60" value={stats.valid ? stats.zeroToSixtyS.toFixed(1) : '—'} unit="s" />
        <LiveStat label="GRIP" value={stats.tireGrip.toFixed(2)} unit="μ" />
        <LiveStat label="P/W" value={fmt(stats.powerToWeight)} unit="hp/t" />
      </div>

      {/* Category tabs */}
      <div className="builder-tabs chip-row">
        {CATEGORY_ORDER.map((c) => {
          const chosen = c === 'safety' || c === 'aero'
            ? build[c].length > 0
            : !!build.parts[c];
          const need = !chosen && (c !== 'safety' && c !== 'aero');
          return (
            <button
              key={c}
              className="builder-tab"
              data-active={cat === c}
              data-need={need}
              onClick={() => setCat(c)}
            >
              {CATEGORY_LABELS[c]}
              {need && <span className="tab-dot" />}
            </button>
          );
        })}
      </div>

      {/* Parts list */}
      <div className="screen-body builder-parts">
        {parts.map((p) => {
          const selected = isMulti
            ? build[cat as 'safety' | 'aero'].includes(p.id)
            : build.parts[cat] === p.id;
          const hyp = hypothetical(p.id);
          const hypVal = hyp[metric.key] as number;
          const delta = hypVal - currentMetricVal;
          const showDelta = !selected && Math.abs(delta) > (metric.digits === 2 ? 0.005 : 0.05);
          const good = metric.better === 'up' ? delta > 0 : delta < 0;
          const wouldOverBudget = !build.sandbox && !selected && hyp.totalCost > BUILD_BUDGET;
          const locked = !selected && !isPartUnlocked(p.id);
          const unlockSrc = PART_UNLOCK_SOURCE.get(p.id);

          return (
            <button
              key={p.id}
              className="part-card"
              data-selected={selected}
              data-locked={locked}
              disabled={locked}
              onClick={() =>
                isMulti
                  ? toggleMultiPart(build.id, cat as 'safety' | 'aero', p.id)
                  : selectPart(build.id, cat, p.id)
              }
            >
              <div className="part-main">
                <div className="part-top">
                  <span className="part-name">{p.name}</span>
                  {selected && <span className="part-check">✓</span>}
                  {locked && <span className="part-lock-badge">🔒</span>}
                  {p.tags?.includes('exotic') && <span className="part-tag">EXOTIC</span>}
                </div>
                <p className="part-desc">{p.description}</p>
                <div className="part-foot">
                  <span className="part-spec mono">{money(p.cost)}</span>
                  {p.effects?.mass !== undefined && (
                    <span className="part-spec mono dim">{signed(p.effects.mass)}kg</span>
                  )}
                  <span className="part-spec mono dim">dur {Math.round(p.durability * 100)}%</span>
                </div>
              </div>
              <div className="part-delta">
                {locked ? (
                  <span className="part-unlock-hint">{unlockSrc ? `Win “${unlockSrc.name}”` : 'Locked'}</span>
                ) : (
                  <>
                    <span className="part-delta-label">{metric.label}</span>
                    {showDelta ? (
                      <span className="part-delta-val mono" style={{ color: good ? 'var(--c-lime)' : 'var(--c-red)' }}>
                        {signed(delta, metric.digits)}{metric.unit}
                      </span>
                    ) : (
                      <span className="part-delta-val mono dim">
                        {fmt(hypVal, metric.digits)}{metric.unit}
                      </span>
                    )}
                    {wouldOverBudget && <span className="part-over">over budget</span>}
                  </>
                )}
              </div>
            </button>
          );
        })}

        {stats.missing.length > 0 && (
          <div className="builder-missing">
            Needs: {stats.missing.map((m) => CATEGORY_LABELS[m as PartCategory]).join(', ')}
          </div>
        )}
      </div>
    </div>
  );
}

function LiveStat({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="live-stat">
      <span className="live-stat-label">{label}</span>
      <span className="live-stat-value mono">{value}<span className="live-stat-unit">{unit}</span></span>
    </div>
  );
}

// re-export for external use if needed
export { getPart };
