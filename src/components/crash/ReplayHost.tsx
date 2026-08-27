import { lazy, Suspense, useMemo, useState } from 'react';
import { useGame, type CrashRecord } from '../../state/store';
import { deriveStats } from '../../game/vehicle/deriveStats';
import { getScenario } from '../../game/scenarios/scenarios';
import { CrashReport } from './CrashReport';

const CrashSim3D = lazy(() => import('./CrashSim3D'));

/**
 * Plays back a saved crash as a full-screen overlay. The sim is re-run
 * deterministically from the stored build + config (no recording needed);
 * finishing reveals the same engineering report.
 */
export function ReplayHost() {
  const replay = useGame((s) => s.replay);
  const endReplay = useGame((s) => s.endReplay);
  if (!replay) return null;
  return <ReplayInner record={replay} onExit={endReplay} />;
}

function ReplayInner({ record, onExit }: { record: CrashRecord; onExit: () => void }) {
  const [mode, setMode] = useState<'sim' | 'report'>('sim');
  const stats = useMemo(() => deriveStats(record.build), [record]);
  const scenario = getScenario(record.config.scenarioId);
  if (!scenario) {
    onExit();
    return null;
  }
  if (mode === 'report') {
    return (
      <CrashReport
        result={record.result}
        payout={record.payout}
        onClose={onExit}
        onModify={onExit}
        onRerun={() => setMode('sim')}
      />
    );
  }
  return (
    <Suspense fallback={<div className="sim3d-fallback">Loading replay…</div>}>
      <CrashSim3D
        build={record.build}
        stats={stats}
        scenario={scenario}
        config={record.config}
        result={record.result}
        onComplete={() => setMode('report')}
      />
    </Suspense>
  );
}
