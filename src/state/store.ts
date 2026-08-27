import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { PartCategory, VehicleBuild } from '../game/parts/types';
import {
  cloneBuild,
  createDefaultBuild,
  makeId,
} from '../game/vehicle/vehicleModel';

export type Screen = 'garage' | 'builder' | 'test' | 'lab';

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

  // --- navigation ---
  setScreen: (s: Screen) => void;
  openBuilder: (buildId: string) => void;

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

  // --- settings ---
  setMuted: (m: boolean) => void;
  setSandbox: (s: boolean) => void;

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

      setScreen: (s) => set({ screen: s }),
      openBuilder: (buildId) => set({ activeBuildId: buildId, screen: 'builder' }),

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

      setMuted: (m) => set((st) => ({ settings: { ...st.settings, muted: m } })),
      setSandbox: (s) => set((st) => ({ settings: { ...st.settings, sandbox: s } })),

      getBuild: (id) => get().builds.find((b) => b.id === id),
    }),
    {
      name: STORAGE_KEY,
      partialize: (st) => ({
        version: st.version,
        builds: st.builds,
        activeBuildId: st.activeBuildId,
        settings: st.settings,
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
