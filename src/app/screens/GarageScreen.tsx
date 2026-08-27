import { useState } from 'react';
import { useGame } from '../../state/store';
import { deriveStats } from '../../game/vehicle/deriveStats';
import { shareCode } from '../../game/vehicle/vehicleModel';
import { getScenario } from '../../game/scenarios/scenarios';
import type { VehicleBuild } from '../../game/parts/types';
import { VehicleSilhouette } from '../../components/vehicle/VehicleSilhouette';
import { ShareCard } from '../../components/share/ShareCard';
import { SettingsSheet } from '../../components/settings/SettingsSheet';
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
  const crashHistory = useGame((s) => s.crashHistory);
  const startReplay = useGame((s) => s.startReplay);
  const [shareBuild, setShareBuild] = useState<VehicleBuild | null>(null);
  const [showSettings, setShowSettings] = useState(false);

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
        <button className="garage-gear" onClick={() => setShowSettings(true)} aria-label="Settings">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
          </svg>
        </button>
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
                  <button
                    className="garage-share"
                    onClick={(e) => { e.stopPropagation(); setShareBuild(b); }}
                    aria-label="Share build"
                  >🔗</button>
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

        {crashHistory.length > 0 && (
          <section className="garage-replays">
            <h3 className="garage-section-h">Recent Crashes</h3>
            <div className="replay-list">
              {crashHistory.slice(0, 12).map((rec) => {
                const scn = getScenario(rec.config.scenarioId);
                const survPct = Math.round(rec.result.survival * 100);
                const verdict = rec.result.survivedClean ? 'PASSED'
                  : survPct >= 60 ? 'SURVIVED' : survPct >= 25 ? 'CRITICAL' : 'FATAL';
                const vColor = rec.result.survivedClean || survPct >= 60 ? 'var(--c-lime)'
                  : survPct >= 25 ? 'var(--c-amber)' : 'var(--c-red)';
                return (
                  <button key={rec.id} className="replay-card" onClick={() => startReplay(rec)}>
                    <span className="replay-icon">{scn?.icon}</span>
                    <div className="replay-info">
                      <span className="replay-name">{rec.build.name}</span>
                      <span className="replay-scn">{scn?.name}{!rec.result.survivedClean && ` · ${rec.result.impactSpeedKmh} km/h`}</span>
                    </div>
                    <span className="replay-verdict" style={{ color: vColor }}>{verdict}</span>
                    <span className="replay-play">▶</span>
                  </button>
                );
              })}
            </div>
          </section>
        )}
      </div>

      {shareBuild && (
        <ShareCard
          build={shareBuild}
          result={crashHistory.find((c) => c.build.id === shareBuild.id)?.result}
          onClose={() => setShareBuild(null)}
        />
      )}
      {showSettings && <SettingsSheet onClose={() => setShowSettings(false)} />}
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
