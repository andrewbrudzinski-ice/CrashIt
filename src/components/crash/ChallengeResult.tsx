import type { Challenge, ChallengeEval } from '../../game/challenges/challenges';
import { formatGoalValue } from '../../game/challenges/challenges';
import './challengeResult.css';

interface Props {
  challenge: Challenge;
  evaluation: ChallengeEval;
  rewardGranted: boolean;
  onModify: () => void;
  onRetry: () => void;
  onReport: () => void;
  onDone: () => void;
}

export function ChallengeResult({ challenge, evaluation, rewardGranted, onModify, onRetry, onReport, onDone }: Props) {
  const { passed, stars, goals } = evaluation;

  return (
    <div className="chres">
      <div className="chres-scroll">
        <div className="chres-band" data-passed={passed}>
          <span className="chres-eyebrow">{challenge.icon} {challenge.name}</span>
          <div className="chres-verdict mono" data-passed={passed}>
            {passed ? 'CHALLENGE COMPLETE' : 'CHALLENGE FAILED'}
          </div>
          {passed && (
            <div className="chres-stars">
              {[0, 1, 2].map((i) => (
                <span key={i} className={i < stars ? 'chres-star on' : 'chres-star'} style={{ animationDelay: `${i * 140}ms` }}>★</span>
              ))}
            </div>
          )}
        </div>

        <div className="chres-goals">
          {goals.map((g, i) => (
            <div key={i} className="chres-goal" data-ok={g.ok}>
              <span className="chres-goal-check">{g.ok ? '✓' : '✗'}</span>
              <span className="chres-goal-label">{g.goal.label}</span>
              <span className="chres-goal-val mono">
                {formatGoalValue(g.goal.metric, g.value)}
                <span className="chres-goal-sep">{g.goal.cmp === 'lte' ? ' ≤ ' : ' ≥ '}</span>
                {formatGoalValue(g.goal.metric, g.goal.target)}
                {g.goal.unit && g.goal.unit !== '$' ? ` ${g.goal.unit}` : ''}
              </span>
            </div>
          ))}
        </div>

        {passed && rewardGranted && challenge.reward && (
          <div className="chres-reward">
            <span className="chres-reward-icon">🔓</span>
            <div>
              <div className="chres-reward-title">UNLOCKED</div>
              <div className="chres-reward-name">{challenge.reward.label}</div>
            </div>
          </div>
        )}
        {passed && !rewardGranted && (
          <div className="chres-note">Already unlocked — beat your best for more stars.</div>
        )}
        {!passed && (
          <div className="chres-note">Adjust the build to meet every objective, then run it again.</div>
        )}
      </div>

      <div className="chres-actions">
        <button className="btn btn-ghost" onClick={onReport}>Report</button>
        <button className="btn btn-ghost" onClick={onModify}>Modify ✎</button>
        {passed
          ? <button className="btn btn-primary" onClick={onDone}>Done ✓</button>
          : <button className="btn btn-primary" onClick={onRetry}>Retry ↻</button>}
      </div>
    </div>
  );
}
