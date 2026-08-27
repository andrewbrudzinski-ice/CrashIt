import { useEffect, useState } from 'react';
import { useGame } from './state/store';
import { BottomNav } from './app/navigation/BottomNav';
import { GarageScreen } from './app/screens/GarageScreen';
import { BuilderScreen } from './app/screens/BuilderScreen';
import { TestScreen } from './app/screens/TestScreen';
import { LabScreen } from './app/screens/LabScreen';
import { ChallengesScreen } from './app/screens/ChallengesScreen';
import { ReplayHost } from './components/crash/ReplayHost';
import type { VehicleBuild } from './game/parts/types';
import { readSharedBuildFromUrl, clearSharedBuildFromUrl } from './game/vehicle/shareCodec';
import './app/app.css';

export function App() {
  const screen = useGame((s) => s.screen);
  const importBuild = useGame((s) => s.importBuild);
  const [shared, setShared] = useState<VehicleBuild | null>(null);

  // On first load, offer to import a build shared via URL hash.
  useEffect(() => {
    const b = readSharedBuildFromUrl();
    if (b) setShared(b);
    clearSharedBuildFromUrl();
  }, []);

  return (
    <div className="app-frame">
      <main className="app-main">
        {screen === 'garage' && <GarageScreen />}
        {screen === 'builder' && <BuilderScreen />}
        {screen === 'test' && <TestScreen />}
        {screen === 'lab' && <LabScreen />}
        {screen === 'challenges' && <ChallengesScreen />}
      </main>
      <BottomNav />
      <ReplayHost />

      {shared && (
        <div className="import-backdrop" onClick={() => setShared(null)}>
          <div className="import-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="import-title">Shared vehicle</div>
            <div className="import-name">{shared.name}</div>
            <p className="import-desc">Someone sent you a build. Add it to your garage?</p>
            <div className="import-actions">
              <button className="btn btn-ghost" onClick={() => setShared(null)}>Dismiss</button>
              <button
                className="btn btn-primary"
                onClick={() => { importBuild(shared, true); setShared(null); }}
              >
                Import & Open
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
