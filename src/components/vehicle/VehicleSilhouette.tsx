import { useMemo } from 'react';
import type { VehicleBuild } from '../../game/parts/types';
import { CHASSIS_STYLE, SILHOUETTES, type SilhouetteStyle } from './silhouetteProfiles';

interface Props {
  build: VehicleBuild;
  /** Ground clearance in cm (from derived stats) to seat the body correctly. */
  rideHeight?: number;
  className?: string;
  /** Show blueprint measurement guides. */
  showGuides?: boolean;
}

const VB_W = 400;
const VB_H = 210;

/** Adjust a hex colour's lightness for shading. */
function shade(hex: string, amt: number): string {
  const h = hex.replace('#', '');
  const num = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  let r = (num >> 16) & 0xff;
  let g = (num >> 8) & 0xff;
  let b = num & 0xff;
  r = Math.max(0, Math.min(255, r + amt));
  g = Math.max(0, Math.min(255, g + amt));
  b = Math.max(0, Math.min(255, b + amt));
  return `rgb(${r}, ${g}, ${b})`;
}

function pointsToPath(pts: [number, number][], toX: (x: number) => number, toY: (y: number) => number) {
  return pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${toX(p[0]).toFixed(1)} ${toY(p[1]).toFixed(1)}`).join(' ') + ' Z';
}

/**
 * Parametric side-profile renderer. Proportions come from the chassis
 * silhouette scaled by the real body height so lowered / raised builds
 * visibly differ. Paint colour drives a layered gradient for a metallic look.
 */
export function VehicleSilhouette({ build, rideHeight = 15, className, showGuides }: Props) {
  const chassisId = build.parts.chassis ?? 'chassis.sedan';
  const style: SilhouetteStyle = CHASSIS_STYLE[chassisId] ?? 'sedan';
  const sil = SILHOUETTES[style];
  const color = build.color;
  const gid = useMemo(() => Math.random().toString(36).slice(2, 8), []);

  // Layout metrics within the viewBox.
  const marginX = 30;
  const bodyW = VB_W - marginX * 2;
  const groundY = VB_H - 30;
  const bodyMaxH = 120;
  // rideHeight raises the whole car; clamp to a small visual range.
  const lift = Math.max(0, Math.min(20, (rideHeight - 8) * 0.8));

  const toX = (x: number) => marginX + x * bodyW;
  const toY = (y: number) => groundY - lift - y * bodyMaxH;

  const bodyPath = pointsToPath(sil.body, toX, toY);
  const glassPath = pointsToPath(sil.glass, toX, toY);
  const wheelR = sil.wheelR * bodyMaxH * 0.55;
  const [wf, wr] = sil.wheels;
  const wheelY = groundY - wheelR + 4;

  const belt = sil.beltline.map((p) => `${toX(p[0]).toFixed(1)},${toY(p[1]).toFixed(1)}`).join(' ');

  const hazardStops = [
    { off: 0, c: shade(color, 55) },
    { off: 0.35, c: shade(color, 10) },
    { off: 0.72, c: shade(color, -30) },
    { off: 1, c: shade(color, -60) },
  ];

  const wheels = [wf, wr].map((wx) => toX(wx));

  return (
    <svg
      className={className}
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      role="img"
      aria-label={`${build.name} side profile`}
      style={{ display: 'block', width: '100%', height: 'auto' }}
    >
      <defs>
        <linearGradient id={`body-${gid}`} x1="0" y1="0" x2="0" y2="1">
          {hazardStops.map((s) => (
            <stop key={s.off} offset={s.off} stopColor={s.c} />
          ))}
        </linearGradient>
        <linearGradient id={`glass-${gid}`} x1="0" y1="0" x2="0.3" y2="1">
          <stop offset="0" stopColor="#c8e6f0" stopOpacity="0.85" />
          <stop offset="0.5" stopColor="#26323f" stopOpacity="0.95" />
          <stop offset="1" stopColor="#10161d" />
        </linearGradient>
        <radialGradient id={`tire-${gid}`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0.45" stopColor="#0c0e12" />
          <stop offset="0.62" stopColor="#1a1d22" />
          <stop offset="0.78" stopColor="#0a0c0f" />
          <stop offset="1" stopColor="#05070a" />
        </radialGradient>
        <linearGradient id={`floor-${gid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="rgba(55,224,216,0.10)" />
          <stop offset="1" stopColor="rgba(55,224,216,0)" />
        </linearGradient>
      </defs>

      {/* Reflection floor */}
      <rect x="0" y={groundY} width={VB_W} height={VB_H - groundY} fill={`url(#floor-${gid})`} />
      <line x1="8" y1={groundY} x2={VB_W - 8} y2={groundY} stroke="var(--c-line)" strokeWidth="1" />

      {/* Ground shadow */}
      <ellipse
        cx={VB_W / 2}
        cy={groundY + 6}
        rx={bodyW * 0.46}
        ry="8"
        fill="rgba(0,0,0,0.45)"
      />

      {/* Body */}
      <path d={bodyPath} fill={`url(#body-${gid})`} stroke={shade(color, -80)} strokeWidth="1.5" strokeLinejoin="round" />

      {/* Glass */}
      <path d={glassPath} fill={`url(#glass-${gid})`} stroke={shade(color, -60)} strokeWidth="1" strokeLinejoin="round" />

      {/* Beltline / panel accent */}
      <polyline points={belt} fill="none" stroke={shade(color, 40)} strokeWidth="1.5" strokeOpacity="0.5" strokeLinecap="round" />

      {/* Top specular highlight */}
      <path d={bodyPath} fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth="1" strokeLinejoin="round" clipPath="none" opacity="0.5" />

      {/* Wheels */}
      {wheels.map((cx, i) => (
        <g key={i}>
          <circle cx={cx} cy={wheelY} r={wheelR} fill={`url(#tire-${gid})`} stroke="#000" strokeWidth="1" />
          <circle cx={cx} cy={wheelY} r={wheelR * 0.52} fill="#20262e" stroke="#3a4450" strokeWidth="1" />
          <circle cx={cx} cy={wheelY} r={wheelR * 0.2} fill="#4a5560" />
          {[...Array(5)].map((_, s) => {
            const a = (s / 5) * Math.PI * 2;
            return (
              <line
                key={s}
                x1={cx + Math.cos(a) * wheelR * 0.24}
                y1={wheelY + Math.sin(a) * wheelR * 0.24}
                x2={cx + Math.cos(a) * wheelR * 0.5}
                y2={wheelY + Math.sin(a) * wheelR * 0.5}
                stroke="#5a6672"
                strokeWidth="2.2"
                strokeLinecap="round"
              />
            );
          })}
        </g>
      ))}

      {showGuides && (
        <g stroke="var(--c-cyan)" strokeWidth="0.75" strokeDasharray="3 3" opacity="0.5" fill="none">
          <line x1={wheels[0]} y1={wheelY} x2={wheels[1]} y2={wheelY} />
          <line x1={wheels[0]} y1={wheelY + 14} x2={wheels[0]} y2={wheelY - wheelR - 6} />
          <line x1={wheels[1]} y1={wheelY + 14} x2={wheels[1]} y2={wheelY - wheelR - 6} />
        </g>
      )}
    </svg>
  );
}
