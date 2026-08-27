import type { Tuning, VehicleBuild } from '../parts/types';
import { createEmptyBuild } from './vehicleModel';

/**
 * Compact, URL-safe encoding of a build so vehicles can be shared by link with
 * no backend. The encoded string carries only the authored choices (name,
 * paint, part ids, tuning); the decoder rebuilds a fresh `VehicleBuild` (new id,
 * new timestamps) so an imported car is a genuine copy.
 */

interface Packed {
  n: string;                       // name
  c: string;                       // colour
  p: Record<string, string | undefined>; // parts
  s: string[];                     // safety
  a: string[];                     // aero
  t?: Tuning;                      // tuning
  sb?: boolean;                    // sandbox
}

function b64urlEncode(str: string): string {
  const b64 = btoa(unescape(encodeURIComponent(str)));
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(s: string): string {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  return decodeURIComponent(escape(atob(b64)));
}

export function encodeBuild(build: VehicleBuild): string {
  const packed: Packed = {
    n: build.name,
    c: build.color,
    p: build.parts,
    s: build.safety,
    a: build.aero,
    t: build.tuning,
    sb: build.sandbox,
  };
  return b64urlEncode(JSON.stringify(packed));
}

export function decodeBuild(code: string): VehicleBuild | null {
  try {
    const packed = JSON.parse(b64urlDecode(code)) as Packed;
    if (!packed || typeof packed !== 'object' || !packed.p) return null;
    const build = createEmptyBuild(packed.n || 'Shared Build');
    build.color = packed.c || build.color;
    build.parts = packed.p || {};
    build.safety = Array.isArray(packed.s) ? packed.s : [];
    build.aero = Array.isArray(packed.a) ? packed.a : [];
    if (packed.t) build.tuning = packed.t;
    if (packed.sb) build.sandbox = true;
    return build;
  } catch {
    return null;
  }
}

/** Full shareable URL for a build (uses the current origin + path). */
export function buildShareUrl(build: VehicleBuild): string {
  const base = typeof window !== 'undefined' ? window.location.origin + window.location.pathname : '';
  return `${base}#b=${encodeBuild(build)}`;
}

/** Read a shared build from the current URL hash, if present. */
export function readSharedBuildFromUrl(): VehicleBuild | null {
  if (typeof window === 'undefined') return null;
  const m = window.location.hash.match(/[#&]b=([A-Za-z0-9\-_]+)/);
  if (!m) return null;
  return decodeBuild(m[1]);
}

/** Remove the shared-build param from the URL without reloading. */
export function clearSharedBuildFromUrl() {
  if (typeof window === 'undefined') return;
  if (window.location.hash.includes('b=')) {
    history.replaceState(null, '', window.location.pathname + window.location.search);
  }
}
