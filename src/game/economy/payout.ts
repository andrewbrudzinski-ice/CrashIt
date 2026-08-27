import type { CrashResult } from '../crash/crashModel';

/**
 * Destruction-derby economy: a crash pays out **credits** based on how much
 * carnage it produced. Bigger, faster, heavier crashes into tougher scenarios
 * pay more — so buying upgrades (more power, more mass, tougher targets) to do
 * more damage directly earns more credits. Credits are then spent to unlock
 * parts (see the store's `buyPart`).
 */

/** Starting wallet so a new player can afford a first upgrade or two. */
export const STARTING_CREDITS = 8000;

/** A crash's destruction score → credits. `tier` is the scenario difficulty. */
export function computePayout(result: CrashResult, tier = 1): number {
  // A clean braking stop is safe, not carnage.
  if (result.survivedClean) return 150;

  const d = result.damage;
  const zoneSum =
    d.front + d.rear + d.left + d.right + d.roof +
    d.wheels + d.engine + d.suspension + d.chassis;

  const energyScore = result.energyKj * 5;       // kinetic energy released
  const deformScore = result.deformationPct * 10; // how mangled the car got
  const carnageScore = zoneSum * 3;               // total component damage
  const gScore = result.peakDecelG * 12;          // violence of the hit
  const rollBonus = /Rolled/.test(result.notes.join(' ')) ? 1200 : 0;

  const tierMul = 1 + (tier - 1) * 0.2;
  const credits = (energyScore + deformScore + carnageScore + gScore + rollBonus) * tierMul;
  return Math.max(100, Math.min(500000, Math.round(credits / 10) * 10));
}

/** A short "carnage" rating label for flavour on the report. */
export function carnageRating(payout: number): string {
  if (payout >= 20000) return 'CATASTROPHIC';
  if (payout >= 10000) return 'DEVASTATING';
  if (payout >= 5000) return 'BRUTAL';
  if (payout >= 2000) return 'SOLID HIT';
  if (payout >= 600) return 'MINOR';
  return 'FENDER BENDER';
}
