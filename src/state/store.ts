import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { PartCategory, Tuning, VehicleBuild } from '../game/parts/types';
import { IDENTITY_TUNING } from '../game/parts/types';
import { getPart } from '../game/parts/partsDatabase';
import {
  cloneBuild,
  createDefaultBuild,
  makeId,
} from '../game/vehicle/vehicleModel';
import type { ScenarioConfig } from '../game/scenarios/scenarios';
import type { CrashResult } from '../game/crash/crashModel';
import { STARTING_CREDITS } from '../game/economy/payout';

export type Screen = 'garage' | 'builder' | 'test' | 'lab' | 'challenges';

export interface ChallengeRecord {
  stars: number;
  completedAt: number;
}

/** A saved crash — a build snapshot + scenario + result. Replays by re-simming
 * deterministically from the build + config, so no recording is stored. */
export interface CrashRecord {
  id: string;
  build: VehicleBuild;
  config: ScenarioConfig;
  result: CrashResult;
  /** Credits earned from this crash. */
  payout: number;
  at: number;
}

const MAX_HISTORY = 24;

interface Settings {
  muted: boolean;
  sandbox: boolean;
  reduceMotion: boolean;
}

interface GameState {
  /** Persistence/versioning for future migrations. */
  version: number;
  builds: VehicleBuild[];
  activeBuildId: string | null;
  screen: Screen;
  settings: Settings;

  // --- progression ---
  /** Earned currency, spent to unlock parts. */
  credits: number;
  /** Part ids unlocked beyond the default `startUnlocked` set. */
  unlockedParts: string[];
  /** challengeId → best result. */
  challengeProgress: Record<string, ChallengeRecord>;
  /** The challenge currently being attempted (locks scenario, adds goals). */
  activeChallengeId: string | null;
  /** Saved crashes, newest first. */
  crashHistory: CrashRecord[];
  /** A crash currently being replayed as a full-screen overlay. */
  replay: CrashRecord | null;
  /** Dev-only vehicle showcase overlay (not persisted). */
  showcaseOpen: boolean;

  // --- navigation ---
  setScreen: (s: Screen) => void;
  openBuilder: (buildId: string) => void;

  // --- challenges / progression ---
  startChallenge: (challengeId: string, buildId?: string) => void;
  exitChallenge: () => void;
  completeChallenge: (challengeId: string, stars: number, rewardParts?: string[]) => boolean;
  isPartUnlocked: (partId: string) => boolean;

  // --- economy ---
  earnCredits: (amount: number) => void;
  /** Unlock a part by paying its cost in credits. Returns true on success. */
  buyPart: (partId: string) => boolean;

  // --- crash history / replay / sharing ---
  recordCrash: (build: VehicleBuild, config: ScenarioConfig, result: CrashResult, payout: number) => void;
  startReplay: (record: CrashRecord) => void;
  endReplay: () => void;
  setShowcaseOpen: (v: boolean) => void;
  deleteCrash: (id: string) => void;
  importBuild: (build: VehicleBuild, open?: boolean) => string;

  // --- build CRUD ---
  createBuild: (name?: string) => string;
  duplicateBuild: (id: string) => string | null;
  deleteBuild: (id: string) => void;
  renameBuild: (id: string, name: string) => void;
  setActiveBuild: (id: string | null) => void;
  updateBuild: (id: string, patch: Partial<VehicleBuild>) => void;

  // --- part selection ---
  selectPart: (buildId: string, category: PartCategory, partId: string) => void;
  toggleMultiPart: (buildId: string, category: 'safety' | 'aero', partId: string) => void;
  setColor: (buildId: string, color: string) => void;
  setTuning: (buildId: string, patch: Partial<Tuning>) => void;
  resetTuning: (buildId: string) => void;

  // --- settings ---
  setMuted: (m: boolean) => void;
  setSandbox: (s: boolean) => void;
  setReduceMotion: (r: boolean) => void;
  resetProgress: () => void;

  getBuild: (id: string | null) => VehicleBuild | undefined;
}

const STORAGE_KEY = 'crashit.v1';

export const useGame = create<GameState>()(
  persist(
    (set, get) => ({
      version: 1,
      builds: [],
      activeBuildId: null,
      screen: 'garage',
      settings: { muted: false, sandbox: false, reduceMotion: false },
      credits: STARTING_CREDITS,
      unlockedParts: [],
      challengeProgress: {},
      activeChallengeId: null,
      crashHistory: [],
      replay: null,
      showcaseOpen: false,

      setScreen: (s) => set({ screen: s }),
      setShowcaseOpen: (v) => set({ showcaseOpen: v }),
      openBuilder: (buildId) => set({ activeBuildId: buildId, screen: 'builder' }),

      startChallenge: (challengeId, buildId) =>
        set((st) => ({
          activeChallengeId: challengeId,
          activeBuildId: buildId ?? st.activeBuildId,
          screen: 'builder',
        })),

      exitChallenge: () => set({ activeChallengeId: null }),

      completeChallenge: (challengeId, stars, rewardParts) => {
        const prev = get().challengeProgress[challengeId];
        const firstTime = !prev;
        const bestStars = Math.max(prev?.stars ?? 0, stars);
        set((st) => {
          const unlocked = new Set(st.unlockedParts);
          for (const p of rewardParts ?? []) unlocked.add(p);
          return {
            challengeProgress: {
              ...st.challengeProgress,
              [challengeId]: { stars: bestStars, completedAt: Date.now() },
            },
            unlockedParts: [...unlocked],
          };
        });
        return firstTime;
      },

      isPartUnlocked: (partId) => {
        const p = getPart(partId);
        if (!p) return false;
        if (p.startUnlocked) return true;
        return get().unlockedParts.includes(partId);
      },

      earnCredits: (amount) => set((st) => ({ credits: st.credits + Math.max(0, Math.round(amount)) })),

      buyPart: (partId) => {
        const part = getPart(partId);
        if (!part) return false;
        const st = get();
        if (st.isPartUnlocked(partId)) return true; // already owned
        if (st.credits < part.cost) return false;
        set((s) => ({
          credits: s.credits - part.cost,
          unlockedParts: s.unlockedParts.includes(partId) ? s.unlockedParts : [...s.unlockedParts, partId],
        }));
        return true;
      },

      recordCrash: (build, config, result, payout) => {
        const record: CrashRecord = {
          id: makeId('crash'),
          // Snapshot the build so the replay survives later edits/deletion.
          build: { ...build, parts: { ...build.parts }, safety: [...build.safety], aero: [...build.aero] },
          config: { scenarioId: config.scenarioId, params: { ...config.params } },
          result,
          payout,
          at: Date.now(),
        };
        set((st) => ({ crashHistory: [record, ...st.crashHistory].slice(0, MAX_HISTORY) }));
      },

      startReplay: (record) => set({ replay: record }),
      endReplay: () => set({ replay: null }),
      deleteCrash: (id) => set((st) => ({ crashHistory: st.crashHistory.filter((c) => c.id !== id) })),

      importBuild: (build, open = true) => {
        set((st) => ({ builds: [build, ...st.builds] }));
        if (open) set({ activeBuildId: build.id, screen: 'builder' });
        return build.id;
      },

      createBuild: (name) => {
        const build = createDefaultBuild(name ?? `Build ${get().builds.length + 1}`);
        set((st) => ({ builds: [build, ...st.builds], activeBuildId: build.id }));
        return build.id;
      },

      duplicateBuild: (id) => {
        const src = get().builds.find((b) => b.id === id);
        if (!src) return null;
        const copy = cloneBuild(src);
        set((st) => ({ builds: [copy, ...st.builds] }));
        return copy.id;
      },

      deleteBuild: (id) =>
        set((st) => ({
          builds: st.builds.filter((b) => b.id !== id),
          activeBuildId: st.activeBuildId === id ? null : st.activeBuildId,
        })),

      renameBuild: (id, name) =>
        set((st) => ({
          builds: st.builds.map((b) =>
            b.id === id ? { ...b, name, updatedAt: Date.now() } : b,
          ),
        })),

      setActiveBuild: (id) => set({ activeBuildId: id }),

      updateBuild: (id, patch) =>
        set((st) => ({
          builds: st.builds.map((b) =>
            b.id === id ? { ...b, ...patch, updatedAt: Date.now() } : b,
          ),
        })),

      selectPart: (buildId, category, partId) =>
        set((st) => ({
          builds: st.builds.map((b) =>
            b.id === buildId
              ? { ...b, parts: { ...b.parts, [category]: partId }, updatedAt: Date.now() }
              : b,
          ),
        })),

      toggleMultiPart: (buildId, category, partId) =>
        set((st) => ({
          builds: st.builds.map((b) => {
            if (b.id !== buildId) return b;
            const list = b[category];
            const next = list.includes(partId)
              ? list.filter((p) => p !== partId)
              : [...list, partId];
            return { ...b, [category]: next, updatedAt: Date.now() };
          }),
        })),

      setColor: (buildId, color) =>
        set((st) => ({
          builds: st.builds.map((b) =>
            b.id === buildId ? { ...b, color, updatedAt: Date.now() } : b,
          ),
        })),

      setTuning: (buildId, patch) =>
        set((st) => ({
          builds: st.builds.map((b) =>
            b.id === buildId
              ? { ...b, tuning: { ...IDENTITY_TUNING, ...b.tuning, ...patch }, updatedAt: Date.now() }
              : b,
          ),
        })),

      resetTuning: (buildId) =>
        set((st) => ({
          builds: st.builds.map((b) =>
            b.id === buildId ? { ...b, tuning: { ...IDENTITY_TUNING }, updatedAt: Date.now() } : b,
          ),
        })),

      setMuted: (m) => set((st) => ({ settings: { ...st.settings, muted: m } })),
      setSandbox: (s) => set((st) => ({ settings: { ...st.settings, sandbox: s } })),
      setReduceMotion: (r) => set((st) => ({ settings: { ...st.settings, reduceMotion: r } })),

      resetProgress: () =>
        set({
          challengeProgress: {},
          unlockedParts: [],
          crashHistory: [],
          credits: STARTING_CREDITS,
          activeChallengeId: null,
          replay: null,
        }),

      getBuild: (id) => get().builds.find((b) => b.id === id),
    }),
    {
      name: STORAGE_KEY,
      partialize: (st) => ({
        version: st.version,
        builds: st.builds,
        activeBuildId: st.activeBuildId,
        settings: st.settings,
        credits: st.credits,
        unlockedParts: st.unlockedParts,
        challengeProgress: st.challengeProgress,
        crashHistory: st.crashHistory,
      }),
    },
  ),
);

/** Seed a first-run garage so the app never opens empty. */
export function ensureSeedData() {
  const { builds, createBuild } = useGame.getState();
  if (builds.length === 0) {
    const id = createBuild('Starter Sedan');
    useGame.getState().renameBuild(id, 'Starter Sedan');
  }
}

export { makeId };
