import { useMemo, useState } from 'react';
import { useGame } from '../../state/store';
import { deriveStats } from '../../game/vehicle/deriveStats';
import {
  SCENARIOS,
  defaultConfig,
  getScenario,
  type Scenario,
  type ScenarioConfig,
} from '../../game/scenarios/scenarios';
import { computeCrash, type CrashResult } from '../../game/crash/crashModel';
import { VehicleSilhouette } from '../../components/vehicle/VehicleSilhouette';
import { CrashStage } from '../../components/crash/CrashStage';
import { CrashReport } from '../../components/crash/CrashReport';
import './test.css';

type Mode = 'select' | 'running' | 'report';

export function TestScreen() {
  const activeId = useGame((s) => s.activeBuildId);
  const build = useGame((s) => s.builds.find((b) => b.id === activeId));
  const setScreen = useGame((s) => s.setScreen);

  const [scenarioId, setScenarioId] = useState<string>('frontal');
  const [config, setConfig] = useState<ScenarioConfig>(() => defaultConfig(SCENARIOS[0]));
  const [mode, setMode] = useState<Mode>('select');
  const [result, setResult] = useState<CrashResult | null>(null);

  const stats = useMemo(() => (build ? deriveStats(build) : null), [build]);
  const scenario = getScenario(scenarioId)!;

  if (!build || !stats) {
    return (
      <div className="screen">
        <div className="test-empty">
          <p>Select a vehicle to crash-test.</p>
          <button className="btn btn-primary" onClick={() => setScreen('garage')}>Go to Garage</button>
        </div>
      </div>
    );
  }

  const selectScenario = (s: Scenario) => {
    setScenarioId(s.id);
    setConfig(defaultConfig(s));
  };

  const setParam = (key: string, value: number) => {
    setConfig((c) => ({ ...c, params: { ...c.params, [key]: value } }));
  };

  const launch = () => {
    const r = computeCrash(stats, config);
    if (!r) return;
    setResult(r);
    setMode('running');
  };

  return (
    <div className="screen test">
      <header className="screen-header">
        <div style={{ flex: 1 }}>
          <div className="screen-eyebrow">Crash Facility</div>
          <div className="garage-brand mono">CRASH TEST</div>
        </div>
        {!stats.valid && <span className="pill" style={{ color: 'var(--c-red)' }}>Incomplete build</span>}
      </header>

      <div className="screen-body">
        {/* Vehicle chip */}
        <div className="card test-vehicle">
          <div className="test-vehicle-thumb blueprint-grid">
            <VehicleSilhouette build={build} rideHeight={stats.rideHeight} />
          </div>
          <div className="test-vehicle-info">
            <span className="test-vehicle-name">{build.name}</span>
            <span className="mono dim">{Math.round(stats.mass)} kg · {Math.round(stats.wheelPowerHp)} hp</span>
            <button className="test-swap" onClick={() => setScreen('builder')}>Change build ›</button>
          </div>
        </div>

        <h3 className="test-h">Choose Scenario</h3>
        <div className="test-scenarios">
          {SCENARIOS.map((s) => (
            <button
              key={s.id}
              className="scenario-card"
              data-active={s.id === scenarioId}
              onClick={() => selectScenario(s)}
            >
              <span className="scenario-icon">{s.icon}</span>
              <span className="scenario-name">{s.name}</span>
              <span className="scenario-tag">{s.tagline}</span>
              <span className="scenario-tier">T{s.tier}</span>
            </button>
          ))}
        </div>

        {/* Parameters */}
        <div className="card test-params">
          <h3 className="test-h" style={{ marginTop: 0 }}>{scenario.name} · Parameters</h3>
          {scenario.params.map((p) => (
            <div key={p.key} className="param">
              <div className="param-head">
                <span className="param-label">{p.label}</span>
                <span className="param-value mono">{config.params[p.key]}{p.unit && ` ${p.unit}`}</span>
              </div>
              <input
                type="range"
                className="param-slider"
                min={p.min}
                max={p.max}
                step={p.step}
                value={config.params[p.key]}
                onChange={(e) => setParam(p.key, Number(e.target.value))}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Launch bar */}
      <div className="test-launch">
        <button className="btn btn-primary btn-block test-crash-btn" onClick={launch} disabled={!stats.valid}>
          🔥 CRASH IT
        </button>
      </div>

      {mode === 'running' && result && (
        <CrashStage
          build={build}
          scenario={scenario}
          result={result}
          onComplete={() => setMode('report')}
        />
      )}
      {mode === 'report' && result && (
        <CrashReport
          result={result}
          onClose={() => setMode('select')}
          onModify={() => { setMode('select'); setScreen('builder'); }}
          onRerun={() => { const r = computeCrash(stats, config); if (r) { setResult(r); setMode('running'); } }}
        />
      )}
    </div>
  );
}
