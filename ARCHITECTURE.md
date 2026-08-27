# ARCHITECTURE — CRASHIT

Design notes for the codebase. Read alongside `PROJECT_STATE.md`.

## Principles

1. **Data-driven, not hardcoded.** Parts, scenarios, and vehicle geometry are
   plain data. The UI and simulation read from that data. Adding content =
   adding data, not editing components.
2. **Simulation, not decoration.** Every part `effect` flows into a physical
   accumulator and out through `deriveStats`. No stat is cosmetic.
3. **Deterministic.** Given a build + scenario (+ future seed), the outcome is
   reproducible — the basis for replays and shareable crashes.
4. **Mobile-first.** Touch targets ≥44px, bottom sheets / sliders / big
   buttons, safe-area insets, a phone-width column centered on desktop. No
   desktop-first shrinking.
5. **Modular.** Game logic (`src/game`) is framework-agnostic and free of React;
   React only renders it. This keeps the physics/scoring testable and reusable.

## Stack & why

- **Vite + React + TS (strict).** Fast, standard, typed.
- **Zustand** for state — minimal boilerplate, selector-based subscriptions to
  avoid needless re-renders (important for the live builder), `persist`
  middleware for localStorage.
- **Three.js + Rapier3D** (`@dimforge/rapier3d-compat`, WASM) power the crash
  view: full 3D, deterministic, **lazy-loaded** so the app shell never pays for
  them until the user hits Crash.
- **Rendering**: stylized **2.5D SVG** side-profile (`VehicleSilhouette`) for
  garage/builder/lab thumbnails (tiny, instant); the live crash is a real
  **3D WebGL** scene playing a pre-baked physics recording.

## Directory map

```
src/
  main.tsx, App.tsx           App entry + screen router (no react-router; a
                              Zustand `screen` field switches screens)
  styles/                     Design tokens (theme.css) + global.css
  state/store.ts              Zustand store: builds CRUD, part selection,
                              settings, navigation, persistence
  app/
    app.css                   Shell, bottom-nav, shared .btn/.card/.pill
    navigation/BottomNav.tsx
    screens/                  GarageScreen, BuilderScreen, TestScreen, LabScreen
                              (each with its own .css)
  components/
    vehicle/                  VehicleSilhouette + silhouetteProfiles (data)
    crash/                    CrashSim3D (Three.js playback), CrashReport
  game/                       ← framework-agnostic core
    parts/
      types.ts                Part / PartEffects / Platform / VehicleBuild types
      partsDatabase.ts        The catalog + lookup helpers + category labels
    vehicle/
      vehicleModel.ts         Build factory, ids, share codes, budget
      deriveStats.ts          Build → VehicleStats (the stat engine)
      shareCodec.ts           Build ↔ URL-safe code (link sharing / import)
    scenarios/scenarios.ts    Scenario defs + params + ScenarioConfig
    crash/crashModel.ts       Analytical crash → CrashResult (scored outcome)
    sim/crashSim.ts           Rapier3D pre-simulation → baked SimRecording
    challenges/challenges.ts  Challenge defs + evaluation + unlock mapping
    audio/audio.ts            Procedural Web Audio engine (singleton)
  lib/format.ts               Display formatters + rating colors
```

## Data flow

```
VehicleBuild ──deriveStats()──▶ VehicleStats ──┬─▶ Garage/Builder/Lab UI
   (parts selection)                            │
                                                └─▶ computeCrash(stats, cfg)
ScenarioConfig ─────────────────────────────────▶        │
   (scenario + params)                                    ▼
                                                     CrashResult
                                                     ├─▶ CrashStage (cinematic)
                                                     └─▶ CrashReport (analysis)
```

`deriveStats` is pure. `computeCrash` is pure & deterministic. Both live in
`src/game` with no React imports, so they can later be unit-tested and run
inside a physics worker.

## Key model contracts (keep stable)

- **`PartEffects`** — additive/multiplicative contributions accumulated in
  `deriveStats`. Extend by adding a field + handling it there.
- **`Platform`** — the chassis-only base geometry. Single source of truth for
  wheelbase/track/length/height/CoG/weight-dist/drag; other parts nudge via
  deltas.
- **`VehicleStats`** — the interface every screen and the crash model consume.
  Additive changes are safe; renames ripple widely.
- **`CrashResult`** — everything the report/replay needs. The future real-time
  sim should either produce this or be reconciled against it so the *scored*
  result stays deterministic and authoritative.

## Physics (Phase 5 — implemented)

`crashSim.ts` **pre-simulates the whole crash once** and bakes transforms:

- Fixed 1/120 s timestep. Chassis built from `VehicleStats` with explicit mass,
  CoG height (via `setAdditionalMassProperties`) and box inertia; wheels welded
  as cylinder colliders; ground + scenario props (barrier/ramp/curb/opponents).
- Each scenario `kind` gets its own body layout & initial velocities.
- Every tracked body's transform is written to a `Float32Array`
  (`frameCount × bodies × 7`). The renderer replays that array — so **scrubbing,
  slow-mo and replay never re-simulate** and are identical every time (baked
  frames make this true regardless of Rapier's own determinism).
- Impact is detected by peak chassis deceleration between frames.
- `crashModel.ts` stays the **scored truth**; the sim is fed the same impact
  speed so visuals and report agree. Reconciling the sim's measured `peakAccelG`
  into the score is a future refinement.

**Why pre-bake instead of live-stepping?** It decouples physics cost from render
FPS, makes the timeline trivially scrubbable, guarantees deterministic replays,
and keeps the door open to moving the sim into a Web Worker unchanged.

## Conventions

- Units: SI internally (kg, m, m/s, N); convert at the display edge
  (`lib/format.ts`). Speed shown km/h + mph, mass kg (+lb where useful).
- CSS: one stylesheet per screen/component, design tokens only (no magic
  colors). `.mono`/`.tabular` for instrument readouts.
- Keep components dumb; put math in `src/game`.
