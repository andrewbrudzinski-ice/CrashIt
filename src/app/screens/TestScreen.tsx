import { lazy, Suspense, useMemo, useState } from 'react';
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
import { getChallenge, evaluateChallenge, type ChallengeEval } from '../../game/challenges/challenges';
import { CONDITIONS, getCondition } from '../../game/scenarios/conditions';
import { computePayout } from '../../game/economy/payout';
import { audio } from '../../game/audio/audio';
import { VehiclePreview3D } from '../../components/vehicle/VehiclePreview3D';
import { CrashReport } from '../../components/crash/CrashReport';
import { ChallengeResult } from '../../components/crash/ChallengeResult';
import './test.css';

// Heavy 3D + physics chunk — loaded only when a crash is launched.
const CrashSim3D = lazy(() => import('../../components/crash/CrashSim3D'));

type Mode = 'select' | 'running' | 'report' | 'challengeResult';

export function TestScreen() {
  const activeId = useGame((s) => s.activeBuildId);
  const build = useGame((s) => s.builds.find((b) => b.id === activeId));
  const setScreen = useGame((s) => s.setScreen);
  const activeChallengeId = useGame((s) => s.activeChallengeId);
  const exitChallenge = useGame((s) => s.exitChallenge);
  const completeChallenge = useGame((s) => s.completeChallenge);
  const recordCrash = useGame((s) => s.recordCrash);
  const earnCredits = useGame((s) => s.earnCredits);
  const challenge = getChallenge(activeChallengeId);

  const [scenarioId, setScenarioId] = useState<string>('frontal');
  const [config, setConfig] = useState<ScenarioConfig>(() => defaultConfig(SCENARIOS[0]));
  const [conditions, setConditions] = useState<string[]>([]);
  const [runConfig, setRunConfig] = useState<ScenarioConfig | null>(null);
  const [mode, setMode] = useState<Mode>('select');
  const [result, setResult] = useState<CrashResult | null>(null);
  const [challengeEval, setChallengeEval] = useState<ChallengeEval | null>(null);
  const [rewardGranted, setRewardGranted] = useState(false);
  const [payout, setPayout] = useState(0);

  const stats = useMemo(() => (build ? deriveStats(build) : null), [build]);

  // In challenge mode the scenario & params are locked to the challenge.
  const effScenarioId = challenge ? challenge.scenarioId : scenarioId;
  const effConfig: ScenarioConfig = challenge
    ? { scenarioId: challenge.scenarioId, params: challenge.params }
    : config;
  const scenario = getScenario(effScenarioId)!;

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

  const toggleCondition = (id: string) =>
    setConditions((cs) => (cs.includes(id) ? cs.filter((c) => c !== id) : [...cs, id]));
  const randomizeConditions = () => {
    const picked = CONDITIONS.filter(() => Math.random() < 0.4).map((c) => c.id);
    setConditions(picked);
  };

  const launch = () => {
    // Fold conditions + a fresh seed into the run config (challenges stay clean).
    const rc: ScenarioConfig = challenge
      ? effConfig
      : { ...config, conditions, seed: Math.floor(Math.random() * 1e9) };
    const r = computeCrash(stats, rc);
    if (!r) return;
    audio.unlock(); // resume AudioContext within the user gesture
    setRunConfig(rc);
    setResult(r);
    setMode('running');
  };

  const activeConfig = runConfig ?? effConfig;

  const onSimComplete = () => {
    if (result) {
      const pay = computePayout(result, scenario.tier);
      setPayout(pay);
      earnCredits(pay);
      recordCrash(build, activeConfig, result, pay);
    }
    if (challenge && result) {
      const ev = evaluateChallenge(challenge, stats, result);
      setChallengeEval(ev);
      if (ev.passed) {
        const firstTime = completeChallenge(challenge.id, ev.stars, challenge.reward?.parts);
        setRewardGranted(firstTime && !!challenge.reward);
      } else {
        setRewardGranted(false);
      }
      setMode('challengeResult');
    } else {
      setMode('report');
    }
  };

  return (
    <div className="screen test">
      <header className="screen-header">
        <div style={{ flex: 1 }}>
          <div className="screen-eyebrow">{challenge ? 'Challenge' : 'Crash Facility'}</div>
          <div className="garage-brand mono">{challenge ? challenge.name.toUpperCase() : 'CRASH TEST'}</div>
        </div>
        {!stats.valid && <span className="pill" style={{ color: 'var(--c-red)' }}>Incomplete build</span>}
      </header>

      <div className="screen-body">
        {challenge && (
          <div className="test-challenge-banner">
            <div className="tcb-top">
              <span className="tcb-icon">{challenge.icon}</span>
              <span className="tcb-brief">{challenge.brief}</span>
              <button className="tcb-exit" onClick={() => { exitChallenge(); }} aria-label="Exit challenge">✕</button>
            </div>
            <div className="tcb-goals">
              {challenge.goals.map((g, i) => (
                <span key={i} className="tcb-goal mono">
                  {g.label} {g.cmp === 'lte' ? '≤' : '≥'} {g.unit === '$' ? '$' : ''}{g.target.toLocaleString('en-US')}{g.unit !== '$' ? g.unit : ''}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Vehicle chip */}
        <div className="card test-vehicle">
          <div className="test-vehicle-thumb blueprint-grid">
            <VehiclePreview3D build={build} />
          </div>
          <div className="test-vehicle-info">
            <span className="test-vehicle-name">{build.name}</span>
            <span className="mono dim">{Math.round(stats.mass)} kg · {Math.round(stats.wheelPowerHp)} hp</span>
            <button className="test-swap" onClick={() => setScreen('builder')}>Change build ›</button>
          </div>
        </div>

        {!challenge && (
          <>
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
          </>
        )}

        {/* Parameters */}
        <div className="card test-params">
          <h3 className="test-h" style={{ marginTop: 0 }}>
            {scenario.name} · {challenge ? 'Fixed Parameters' : 'Parameters'}
          </h3>
          {scenario.params.map((p) => (
            <div key={p.key} className="param">
              <div className="param-head">
                <span className="param-label">{p.label}</span>
                <span className="param-value mono">{effConfig.params[p.key] ?? p.default}{p.unit && ` ${p.unit}`}</span>
              </div>
              <input
                type="range"
                className="param-slider"
                min={p.min}
                max={p.max}
                step={p.step}
                value={effConfig.params[p.key] ?? p.default}
                disabled={!!challenge}
                onChange={(e) => setParam(p.key, Number(e.target.value))}
              />
            </div>
          ))}
        </div>

        {!challenge && (
          <div className="card test-conditions">
            <div className="test-cond-head">
              <h3 className="test-h" style={{ margin: 0 }}>Simulation Events</h3>
              <button className="test-cond-random" onClick={randomizeConditions}>🎲 Randomize</button>
            </div>
            <div className="test-cond-list">
              {CONDITIONS.map((c) => {
                const on = conditions.includes(c.id);
                return (
                  <button
                    key={c.id}
                    className="cond-chip"
                    data-active={on}
                    onClick={() => toggleCondition(c.id)}
                  >
                    <span className="cond-icon">{c.icon}</span>
                    <span className="cond-name">{c.name}</span>
                  </button>
                );
              })}
            </div>
            {conditions.length > 0 && (
              <p className="test-cond-note">
                {getCondition(conditions[0])?.desc}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Launch bar */}
      <div className="test-launch">
        <button className="btn btn-primary btn-block test-crash-btn" onClick={launch} disabled={!stats.valid}>
          {challenge ? '🏁 RUN CHALLENGE' : '🔥 CRASH IT'}
        </button>
      </div>

      {mode === 'running' && result && (
        <Suspense fallback={<div className="sim3d-fallback">Loading simulator…</div>}>
          <CrashSim3D
            build={build}
            stats={stats}
            scenario={scenario}
            config={activeConfig}
            result={result}
            onComplete={onSimComplete}
          />
        </Suspense>
      )}

      {mode === 'challengeResult' && challenge && challengeEval && (
        <ChallengeResult
          challenge={challenge}
          evaluation={challengeEval}
          rewardGranted={rewardGranted}
          onReport={() => setMode('report')}
          onModify={() => { setMode('select'); setScreen('builder'); }}
          onRetry={() => { const r = computeCrash(stats, activeConfig); if (r) { setResult(r); setMode('running'); } }}
          onDone={() => { exitChallenge(); setMode('select'); setScreen('challenges'); }}
        />
      )}

      {mode === 'report' && result && (
        <CrashReport
          result={result}
          payout={payout}
          onClose={() => setMode(challenge ? 'challengeResult' : 'select')}
          onModify={() => { setMode('select'); setScreen('builder'); }}
          onRerun={() => { const r = computeCrash(stats, activeConfig); if (r) { setResult(r); setMode('running'); } }}
        />
      )}
    </div>
  );
}
