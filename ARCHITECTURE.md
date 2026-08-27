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
- **Rapier2D** (`@dimforge/rapier2d-compat`, WASM) chosen for the physics phase:
  deterministic, fast on mobile, 2D is enough for a side/top crash view and far
  cheaper than 3D deformable bodies. *(Installed, not yet wired.)*
- **Rendering**: stylized **2.5D SVG** side-profile (`VehicleSilhouette`) rather
  than 3D assets — impressive, tiny, and performant. The live crash view will
  move to a `<canvas>` driven by Rapier.

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
    crash/                    CrashStage (cinematic), CrashReport
  game/                       ← framework-agnostic core
    parts/
      types.ts                Part / PartEffects / Platform / VehicleBuild types
      partsDatabase.ts        The catalog + lookup helpers + category labels
    vehicle/
      vehicleModel.ts         Build factory, ids, share codes, budget
      deriveStats.ts          Build → VehicleStats (the stat engine)
    scenarios/scenarios.ts    Scenario defs + params + ScenarioConfig
    crash/crashModel.ts       Analytical crash → CrashResult (scored outcome)
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

## Physics plan (Phase 5, next)

- Fixed timestep (e.g. 1/120s), accumulator loop, seeded RNG for random events.
- Bodies: chassis (box compound), 2 wheels (revolute + suspension via
  spring/prismatic), barrier/other vehicles per scenario `kind`.
- Map `VehicleStats` → Rapier params (mass, CoG offset, wheel grip → friction,
  suspension stiffness/travel, downforce as speed² force).
- Record per-step transforms into a buffer → scrubbable replay + slow-mo.
- Derive *visual* deformation from impulse at contact points; keep
  `crashModel.ts` (or a reconciled version) as the scored truth.

## Conventions

- Units: SI internally (kg, m, m/s, N); convert at the display edge
  (`lib/format.ts`). Speed shown km/h + mph, mass kg (+lb where useful).
- CSS: one stylesheet per screen/component, design tokens only (no magic
  colors). `.mono`/`.tabular` for instrument readouts.
- Keep components dumb; put math in `src/game`.
