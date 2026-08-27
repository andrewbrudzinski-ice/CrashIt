import { useGame } from '../../state/store';
import { deriveStats } from '../../game/vehicle/deriveStats';
import { getPart } from '../../game/parts/partsDatabase';
import { VehicleSilhouette } from '../../components/vehicle/VehicleSilhouette';
import { fmt, kmhToMph } from '../../lib/format';
import './lab.css';

export function LabScreen() {
  const activeId = useGame((s) => s.activeBuildId);
  const build = useGame((s) => s.builds.find((b) => b.id === activeId));
  const setScreen = useGame((s) => s.setScreen);

  if (!build) {
    return (
      <div className="screen">
        <div className="lab-empty">
          <p>Select a vehicle to inspect.</p>
          <button className="btn btn-primary" onClick={() => setScreen('garage')}>Go to Garage</button>
        </div>
      </div>
    );
  }

  const s = deriveStats(build);
  const frontPct = Math.round(s.weightDistFront * 100);
  const rearPct = 100 - frontPct;

  return (
    <div className="screen">
      <header className="screen-header">
        <div style={{ flex: 1 }}>
          <div className="screen-eyebrow">Engineering Lab</div>
          <div className="garage-brand mono">{build.name}</div>
        </div>
      </header>

      <div className="screen-body lab-body">
        <div className="card lab-preview blueprint-grid">
          <VehicleSilhouette build={build} rideHeight={s.rideHeight} showGuides />
        </div>

        {/* Weight distribution */}
        <Panel title="Weight Distribution" hint={`${fmt(s.mass)} kg total`}>
          <div className="wd-bar">
            <div className="wd-front" style={{ width: `${frontPct}%` }}>
              <span className="mono">{frontPct}%</span>
            </div>
            <div className="wd-rear" style={{ width: `${rearPct}%` }}>
              <span className="mono">{rearPct}%</span>
            </div>
          </div>
          <div className="wd-legend">
            <span>FRONT AXLE</span>
            <span>REAR AXLE</span>
          </div>
          <div className="lab-note">
            {frontPct > 60 ? 'Nose-heavy — expect understeer.'
              : frontPct < 45 ? 'Tail-heavy — lively, watch for oversteer.'
              : 'Well balanced.'}
          </div>
        </Panel>

        {/* Center of gravity + rollover */}
        <Panel title="Stability" hint={`CoG ${fmt(s.cogHeight)} cm`}>
          <Gauge
            label="Rollover Threshold"
            value={s.rolloverThreshold}
            min={0.8}
            max={1.6}
            format={(v) => v.toFixed(2) + ' g'}
            zones={[[0.8, 1.0], [1.0, 1.2], [1.2, 1.6]]}
          />
          <div className="lab-note">
            {s.rolloverThreshold < 1.05 ? 'Tall and tippy — high rollover risk.'
              : s.rolloverThreshold > 1.3 ? 'Low and planted — very stable.'
              : 'Moderate rollover resistance.'}
          </div>
        </Panel>

        {/* Power curve */}
        <Panel title="Power Delivery" hint={`${fmt(s.wheelPowerHp)} hp @ wheels`}>
          <PowerCurve powerband={s.powerband} power={s.wheelPowerHp} torque={s.torqueNm} electric={s.engineKind === 'electric'} />
        </Panel>

        {/* Braking */}
        <Panel title="Braking 100→0" hint={`${s.brakingDistanceM.toFixed(1)} m`}>
          <BrakingVis distance={s.brakingDistanceM} />
        </Panel>

        {/* Performance grid */}
        <div className="lab-grid">
          <Metric label="TOP SPEED" value={s.valid ? fmt(kmhToMph(s.topSpeedKmh)) : '—'} unit="mph" />
          <Metric label="0–60 MPH" value={s.valid ? s.zeroToSixtyS.toFixed(1) : '—'} unit="s" />
          <Metric label="POWER/WEIGHT" value={fmt(s.powerToWeight)} unit="hp/t" />
          <Metric label="LATERAL GRIP" value={s.lateralG.toFixed(2)} unit="g" />
          <Metric label="DRAG Cd" value={s.dragCoefficient.toFixed(3)} unit="" />
          <Metric label="DOWNFORCE" value={s.downforceCoef.toFixed(2)} unit="" />
        </div>

        {/* Structure bars */}
        <Panel title="Structural Integrity">
          <StatBar label="Chassis Strength" value={s.chassisStrength} max={140} />
          <StatBar label="Cabin Cell" value={s.cabinStrength} max={90} />
          <StatBar label="Crumple Zone" value={s.crumpleZone} max={200} unit="cm" />
          <StatBar label="Suspension Travel" value={s.suspensionTravel} max={40} unit="cm" />
        </Panel>

        {/* Installed parts summary */}
        <Panel title="Configuration">
          <div className="lab-config">
            {Object.entries(build.parts).map(([cat, id]) => {
              const p = getPart(id);
              if (!p) return null;
              return (
                <div key={cat} className="config-row">
                  <span className="config-cat">{cat}</span>
                  <span className="config-part">{p.name}</span>
                </div>
              );
            })}
            {[...build.safety, ...build.aero].map((id) => {
              const p = getPart(id);
              if (!p) return null;
              return (
                <div key={id} className="config-row">
                  <span className="config-cat">{p.category}</span>
                  <span className="config-part">{p.name}</span>
                </div>
              );
            })}
          </div>
        </Panel>
      </div>
    </div>
  );
}

function Panel({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="card lab-panel">
      <div className="lab-panel-head">
        <h3 className="lab-panel-title">{title}</h3>
        {hint && <span className="lab-panel-hint mono">{hint}</span>}
      </div>
      {children}
    </section>
  );
}

function Metric({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="card lab-metric">
      <span className="lab-metric-label">{label}</span>
      <span className="lab-metric-value mono">{value}<span className="lab-metric-unit">{unit}</span></span>
    </div>
  );
}

function StatBar({ label, value, max, unit }: { label: string; value: number; max: number; unit?: string }) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div className="statbar">
      <div className="statbar-head">
        <span className="statbar-label">{label}</span>
        <span className="statbar-val mono">{fmt(value)}{unit ? ` ${unit}` : ''}</span>
      </div>
      <div className="statbar-track">
        <div className="statbar-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function Gauge({ label, value, min, max, format, zones }: {
  label: string; value: number; min: number; max: number;
  format: (v: number) => string; zones: [number, number][];
}) {
  const pct = Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
  const colors = ['var(--c-red)', 'var(--c-amber)', 'var(--c-lime)'];
  return (
    <div className="gauge">
      <div className="gauge-head">
        <span className="statbar-label">{label}</span>
        <span className="statbar-val mono">{format(value)}</span>
      </div>
      <div className="gauge-track">
        {zones.map((z, i) => {
          const w = ((z[1] - z[0]) / (max - min)) * 100;
          return <div key={i} className="gauge-zone" style={{ width: `${w}%`, background: colors[i] }} />;
        })}
        <div className="gauge-needle" style={{ left: `${pct}%` }} />
      </div>
    </div>
  );
}

function PowerCurve({ powerband, power, torque, electric }: { powerband: number; power: number; torque: number; electric: boolean }) {
  const W = 300, H = 110, pad = 6;
  const n = 40;
  // Torque curve: electric = flat then falloff; ICE = peak near powerband.
  const pts: { x: number; t: number; p: number }[] = [];
  for (let i = 0; i <= n; i++) {
    const rpm = i / n; // normalized rev/speed
    let tq: number;
    if (electric) {
      tq = rpm < 0.25 ? 1 : Math.max(0.2, 1 - (rpm - 0.25) * 0.9);
    } else {
      const peak = 0.35 + powerband * 0.4;
      tq = Math.max(0.12, 1 - Math.pow((rpm - peak) / 0.55, 2));
    }
    const pw = tq * rpm; // power ∝ torque × rev
    pts.push({ x: rpm, t: tq, p: pw });
  }
  const maxP = Math.max(...pts.map((q) => q.p));
  const toX = (x: number) => pad + x * (W - pad * 2);
  const toY = (v: number) => H - pad - v * (H - pad * 2);
  const tPath = pts.map((q, i) => `${i ? 'L' : 'M'} ${toX(q.x).toFixed(1)} ${toY(q.t).toFixed(1)}`).join(' ');
  const pPath = pts.map((q, i) => `${i ? 'L' : 'M'} ${toX(q.x).toFixed(1)} ${toY(q.p / maxP).toFixed(1)}`).join(' ');
  return (
    <div className="powercurve">
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }}>
        {[0.25, 0.5, 0.75].map((g) => (
          <line key={g} x1={pad} y1={toY(g)} x2={W - pad} y2={toY(g)} stroke="var(--c-line-soft)" strokeWidth="1" />
        ))}
        <path d={pPath} fill="none" stroke="var(--c-hazard)" strokeWidth="2.5" strokeLinejoin="round" />
        <path d={tPath} fill="none" stroke="var(--c-cyan)" strokeWidth="2" strokeDasharray="4 3" strokeLinejoin="round" />
      </svg>
      <div className="powercurve-legend">
        <span><i style={{ background: 'var(--c-hazard)' }} />Power {fmt(power)} hp</span>
        <span><i style={{ background: 'var(--c-cyan)' }} />Torque {fmt(torque)} N·m</span>
      </div>
    </div>
  );
}

function BrakingVis({ distance }: { distance: number }) {
  const pct = Math.min(100, (distance / 60) * 100);
  return (
    <div className="braking">
      <div className="braking-track">
        <div className="braking-car" style={{ left: `calc(${pct}% - 14px)` }}>🚗</div>
        <div className="braking-wall" />
      </div>
      <div className="braking-scale">
        <span>0 m</span><span>30 m</span><span>60 m</span>
      </div>
    </div>
  );
}
