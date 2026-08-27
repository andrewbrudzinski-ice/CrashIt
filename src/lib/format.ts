/** Display formatters. Metric-first with imperial companions where useful. */

export const kmhToMph = (kmh: number) => kmh * 0.621371;
export const kgToLb = (kg: number) => kg * 2.20462;

export function fmt(n: number, digits = 0): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

export function money(n: number): string {
  return '$' + Math.round(n).toLocaleString('en-US');
}

export function signed(n: number, digits = 0): string {
  const s = fmt(Math.abs(n), digits);
  if (n > 0) return `+${s}`;
  if (n < 0) return `−${s}`;
  return s;
}

/** Map a 0..100 rating to a colour token. */
export function ratingColor(score: number): string {
  if (score >= 85) return 'var(--rate-great)';
  if (score >= 70) return 'var(--rate-good)';
  if (score >= 50) return 'var(--rate-mid)';
  if (score >= 30) return 'var(--rate-poor)';
  return 'var(--rate-bad)';
}
