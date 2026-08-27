import { useGame } from '../../state/store';
import { deriveStats } from '../../game/vehicle/deriveStats';
import { shareCode } from '../../game/vehicle/vehicleModel';
import { VehicleSilhouette } from '../../components/vehicle/VehicleSilhouette';
import { fmt, money, ratingColor } from '../../lib/format';
import { BUILD_BUDGET } from '../../game/vehicle/vehicleModel';
import './garage.css';

export function GarageScreen() {
  const builds = useGame((s) => s.builds);
  const createBuild = useGame((s) => s.createBuild);
  const openBuilder = useGame((s) => s.openBuilder);
  const duplicateBuild = useGame((s) => s.duplicateBuild);
  const deleteBuild = useGame((s) => s.deleteBuild);
  const sandbox = useGame((s) => s.settings.sandbox);
  const setSandbox = useGame((s) => s.setSandbox);
  const updateBuild = useGame((s) => s.updateBuild);

  const handleNew = () => {
    const id = createBuild();
    if (sandbox) updateBuild(id, { sandbox: true });
    openBuilder(id);
  };

  return (
    <div className="screen">
      <header className="screen-header">
        <div style={{ flex: 1 }}>
          <div className="screen-eyebrow">{sandbox ? 'Experiment Lab' : 'Crash Lab'}</div>
          <div className="garage-brand mono">{sandbox ? 'SANDBOX' : 'MY GARAGE'}</div>
        </div>
        <span className="pill">{builds.length} builds</span>
      </header>

      <div className="screen-body">
        <div className="mode-toggle" role="tablist" aria-label="Game mode">
          <button className="mode-opt" data-active={!sandbox} onClick={() => setSandbox(false)}>Career</button>
          <button className="mode-opt" data-active={sandbox} onClick={() => setSandbox(true)}>Sandbox</button>
        </div>
        {sandbox && (
          <p className="mode-hint">No budget, no locks. Build something absurd — then break it.</p>
        )}

        <button className="btn btn-primary btn-block garage-new" onClick={handleNew}>
          + New Vehicle
        </button>

        <div className="garage-list">
          {builds.map((b) => {
            const stats = deriveStats(b);
            const overBudget = !sandbox && !b.sandbox && stats.totalCost > BUILD_BUDGET;
            return (
              <article key={b.id} className="card garage-card" onClick={() => openBuilder(b.id)}>
                <div className="garage-thumb blueprint-grid">
                  <VehicleSilhouette build={b} rideHeight={stats.rideHeight} />
                  <span className="garage-code mono">#{shareCode(b.id)}</span>
                </div>
                <div className="garage-meta">
                  <div className="garage-row">
                    <h3 className="garage-name">{b.name}</h3>
                    <span
                      className="mono garage-cost"
                      style={{ color: overBudget ? 'var(--c-red)' : 'var(--c-text-dim)' }}
                    >
                      {money(stats.totalCost)}
                    </span>
                  </div>
                  <div className="garage-stats">
                    <Stat label="POWER" value={`${fmt(stats.wheelPowerHp)}`} unit="hp" />
                    <Stat label="MASS" value={`${fmt(stats.mass)}`} unit="kg" />
                    <Stat
                      label="0–60"
                      value={stats.valid ? stats.zeroToSixtyS.toFixed(1) : '—'}
                      unit="s"
                    />
                    <Stat
                      label="TOP"
                      value={stats.valid ? fmt(kmhMph(stats.topSpeedKmh)) : '—'}
                      unit="mph"
                      accent={ratingColor(Math.min(100, stats.topSpeedKmh / 3))}
                    />
                  </div>
                  <div className="garage-actions" onClick={(e) => e.stopPropagation()}>
                    <button className="garage-action" onClick={() => duplicateBuild(b.id)}>Clone</button>
                    <button
                      className="garage-action danger"
                      onClick={() => {
                        if (confirm(`Delete "${b.name}"?`)) deleteBuild(b.id);
                      }}
                    >
                      Delete
                    </button>
                    <button className="garage-action primary" onClick={() => openBuilder(b.id)}>
                      Open ›
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>

        {builds.length === 0 && (
          <div className="garage-empty">
            <p>No vehicles yet.</p>
            <p className="dim">Build one, then send it into a wall.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function kmhMph(kmh: number) {
  return kmh * 0.621371;
}

function Stat({ label, value, unit, accent }: { label: string; value: string; unit: string; accent?: string }) {
  return (
    <div className="mini-stat">
      <span className="mini-stat-label">{label}</span>
      <span className="mini-stat-value mono" style={accent ? { color: accent } : undefined}>
        {value}
        <span className="mini-stat-unit">{unit}</span>
      </span>
    </div>
  );
}
