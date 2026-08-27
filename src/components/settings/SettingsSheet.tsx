import { useState } from 'react';
import { useGame } from '../../state/store';
import { audio } from '../../game/audio/audio';
import './settingsSheet.css';

interface Props {
  onClose: () => void;
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button className="settings-toggle" data-on={on} onClick={() => onChange(!on)} role="switch" aria-checked={on}>
      <span className="settings-knob" />
    </button>
  );
}

export function SettingsSheet({ onClose }: Props) {
  const settings = useGame((s) => s.settings);
  const setMuted = useGame((s) => s.setMuted);
  const setSandbox = useGame((s) => s.setSandbox);
  const setReduceMotion = useGame((s) => s.setReduceMotion);
  const resetProgress = useGame((s) => s.resetProgress);
  const setShowcaseOpen = useGame((s) => s.setShowcaseOpen);
  const challengeCount = useGame((s) => Object.keys(s.challengeProgress).length);
  const crashCount = useGame((s) => s.crashHistory.length);
  const [confirmReset, setConfirmReset] = useState(false);

  return (
    <div className="settings-backdrop" onClick={onClose}>
      <div className="settings-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="settings-handle" />
        <h2 className="settings-title">Settings</h2>

        <div className="settings-row">
          <div className="settings-row-text">
            <span className="settings-label">Sound</span>
            <span className="settings-desc">Engine, tyres, and impact audio.</span>
          </div>
          <Toggle on={!settings.muted} onChange={(v) => { setMuted(!v); audio.setMuted(!v); }} />
        </div>

        <div className="settings-row">
          <div className="settings-row-text">
            <span className="settings-label">Reduce Motion</span>
            <span className="settings-desc">Calmer transitions and less camera shake.</span>
          </div>
          <Toggle on={settings.reduceMotion} onChange={setReduceMotion} />
        </div>

        <div className="settings-row">
          <div className="settings-row-text">
            <span className="settings-label">Sandbox Mode</span>
            <span className="settings-desc">No budget or unlocks; tuning sliders.</span>
          </div>
          <Toggle on={settings.sandbox} onChange={setSandbox} />
        </div>

        <div className="settings-divider" />

        <div className="settings-row">
          <div className="settings-row-text">
            <span className="settings-label">Vehicle Lab</span>
            <span className="settings-desc">Preview every car model, paint, wheel & damage.</span>
          </div>
          <button className="btn btn-ghost" onClick={() => { setShowcaseOpen(true); onClose(); }}>Open</button>
        </div>

        <div className="settings-divider" />

        <div className="settings-reset">
          <div className="settings-row-text">
            <span className="settings-label">Reset Progress</span>
            <span className="settings-desc">
              Clears {challengeCount} challenge{challengeCount === 1 ? '' : 's'} & {crashCount} saved crash{crashCount === 1 ? '' : 'es'}. Vehicles are kept.
            </span>
          </div>
          {confirmReset ? (
            <div className="settings-reset-confirm">
              <button className="btn btn-ghost" onClick={() => setConfirmReset(false)}>Cancel</button>
              <button className="btn settings-danger" onClick={() => { resetProgress(); setConfirmReset(false); }}>Confirm</button>
            </div>
          ) : (
            <button className="btn btn-ghost settings-reset-btn" onClick={() => setConfirmReset(true)}>Reset</button>
          )}
        </div>

        <div className="settings-about">CRASHIT · a physics crash-test sandbox. Simulated, not a safety tool.</div>

        <button className="btn btn-primary btn-block settings-done" onClick={onClose}>Done</button>
      </div>
    </div>
  );
}
