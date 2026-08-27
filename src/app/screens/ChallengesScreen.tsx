import { useState } from 'react';
import { useGame } from '../../state/store';
import {
  CHALLENGES,
  getChallenge,
  isChallengeUnlocked,
  type Challenge,
} from '../../game/challenges/challenges';
import { getScenario } from '../../game/scenarios/scenarios';
import { getPart } from '../../game/parts/partsDatabase';
import './challenges.css';

function Stars({ n, size = 14 }: { n: number; size?: number }) {
  return (
    <span className="stars" style={{ fontSize: size }}>
      {[0, 1, 2].map((i) => (
        <span key={i} className={i < n ? 'star on' : 'star'}>★</span>
      ))}
    </span>
  );
}

export function ChallengesScreen() {
  const progress = useGame((s) => s.challengeProgress);
  const builds = useGame((s) => s.builds);
  const activeBuildId = useGame((s) => s.activeBuildId);
  const createBuild = useGame((s) => s.createBuild);
  const startChallenge = useGame((s) => s.startChallenge);
  const [selected, setSelected] = useState<Challenge | null>(null);

  const completed = new Set(Object.keys(progress));
  const doneCount = completed.size;

  const attempt = (c: Challenge) => {
    let buildId = activeBuildId;
    if (!buildId || !builds.find((b) => b.id === buildId)) {
      buildId = createBuild(`${c.name} Build`);
    }
    startChallenge(c.id, buildId);
  };

  return (
    <div className="screen">
      <header className="screen-header">
        <div style={{ flex: 1 }}>
          <div className="screen-eyebrow">Test Program</div>
          <div className="garage-brand mono">CHALLENGES</div>
        </div>
        <span className="pill">{doneCount}/{CHALLENGES.length}</span>
      </header>

      <div className="screen-body">
        <div className="ch-grid">
          {CHALLENGES.map((c) => {
            const unlocked = isChallengeUnlocked(c, completed);
            const rec = progress[c.id];
            const scn = getScenario(c.scenarioId);
            return (
              <button
                key={c.id}
                className="ch-card"
                data-locked={!unlocked}
                data-done={!!rec}
                onClick={() => unlocked && setSelected(c)}
              >
                <div className="ch-card-top">
                  <span className="ch-icon">{c.icon}</span>
                  <span className="ch-tier">TIER {c.tier}</span>
                </div>
                <span className="ch-name">{c.name}</span>
                <span className="ch-brief">{c.brief}</span>
                <div className="ch-card-foot">
                  {rec ? <Stars n={rec.stars} /> : <span className="ch-scn">{scn?.icon} {scn?.name}</span>}
                </div>
                {!unlocked && (
                  <div className="ch-lock">
                    <span className="ch-lock-icon">🔒</span>
                    <span className="ch-lock-text">
                      Complete “{getChallenge(c.requires ?? null)?.name ?? '—'}”
                    </span>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {selected && (
        <div className="ch-sheet-backdrop" onClick={() => setSelected(null)}>
          <div className="ch-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="ch-sheet-handle" />
            <div className="ch-sheet-head">
              <span className="ch-icon big">{selected.icon}</span>
              <div>
                <h3 className="ch-sheet-name">{selected.name}</h3>
                <p className="ch-sheet-brief">{selected.brief}</p>
              </div>
            </div>

            <div className="ch-sheet-scn">
              <span className="ch-sheet-label">SCENARIO</span>
              <span>{getScenario(selected.scenarioId)?.icon} {getScenario(selected.scenarioId)?.name}</span>
              <span className="mono dim">
                {Object.entries(selected.params).map(([k, v]) => `${k} ${v}`).join(' · ')}
              </span>
            </div>

            <div className="ch-goals">
              <span className="ch-sheet-label">OBJECTIVES</span>
              {selected.goals.map((g, i) => (
                <div key={i} className="ch-goal">
                  <span className="ch-goal-dot" />
                  <span className="ch-goal-label">{g.label}</span>
                  <span className="ch-goal-target mono">
                    {g.cmp === 'lte' ? '≤' : '≥'} {g.unit === '$' ? '$' : ''}
                    {g.target.toLocaleString('en-US')}{g.unit !== '$' ? ` ${g.unit}` : ''}
                  </span>
                </div>
              ))}
            </div>

            {selected.reward && (
              <div className="ch-reward">
                <span className="ch-sheet-label">REWARD</span>
                <div className="ch-reward-row">
                  <span className="ch-reward-icon">🔓</span>
                  <span>{selected.reward.label}</span>
                  {selected.reward.parts?.map((p) => {
                    const part = getPart(p);
                    return part ? <span key={p} className="ch-reward-cat">{part.category}</span> : null;
                  })}
                </div>
              </div>
            )}

            {progress[selected.id] && (
              <div className="ch-best">
                Best: <Stars n={progress[selected.id].stars} size={16} />
              </div>
            )}

            <button className="btn btn-primary btn-block ch-attempt" onClick={() => attempt(selected)}>
              {progress[selected.id] ? 'Retry Challenge' : 'Attempt Challenge'} ›
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
