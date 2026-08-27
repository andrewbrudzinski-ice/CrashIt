# PROJECT_STATE — CRASHIT

> **Read this first every session.** It is the running log of what exists, what
> works, and what to build next. Update it at the end of every session.

**Game:** BUILD A CAR → CRASH IT. A physics-based vehicle engineering &
crash-testing sandbox. Mobile-first. See the original brief and `ARCHITECTURE.md`.

**Stack:** Vite + React 18 + TypeScript (strict), Zustand (persisted to
localStorage). Rapier2D (`@dimforge/rapier2d-compat`) is installed for the
upcoming deterministic physics phase but **not yet wired in**. No backend yet.

**Run:** `npm install` → `npm run dev`. Build: `npm run build`. Typecheck:
`npm run typecheck`. Target viewports: 390×844, 393×852, 430×932.

---

## Current status: END OF SESSION 1

The core game loop is **playable end to end** using an *analytical* crash model
(no real-time physics engine yet):

**BUILD** (Garage + Builder) → **TEST** (scenario + params) → **CRASH**
(cinematic) → **ANALYZE** (engineering report) → **MODIFY** → **RUN AGAIN**.

### What works (verified in a headless Chromium at 393×852)
- **App shell**: 4-screen bottom-nav app (Garage / Build / Crash / Lab),
  automotive-lab dark theme, safe-area aware, phone-column layout that also
  works on desktop.
- **Data-driven parts system** (`src/game/parts/`): 10 categories, ~45 parts,
  each with cost / weight / durability / physical `effects`. Chassis parts carry
  a `platform` (geometry & base mass). Add parts = add data.
- **Stat engine** (`deriveStats.ts`): turns a build into ~30 simulation-ready
  stats (mass, CoG, weight dist, power@wheels, grip, drag, downforce, structural
  strengths, rollover threshold) + derived performance (top speed, 0-60 via
  numeric integration, braking distance, power/weight). Nothing is cosmetic.
- **Garage**: list / create / clone / delete / rename builds, live stat cards,
  share-code badge, persisted across reloads.
- **Builder**: live silhouette preview, paint picker, budget bar ($30k),
  category tabs, per-part **"what-if" delta preview** (each part shows how it
  would change the category's key metric, in green/red, + over-budget flags),
  live 5-stat strip, editable name.
- **Vehicle silhouette** (`VehicleSilhouette.tsx`): parametric SVG side-profile
  scaled by real geometry (lowered sport sits lower than an SUV), metallic paint
  gradient, spoked wheels, blueprint guides.
- **Crash scenarios** (`scenarios.ts`): 11 scenarios (frontal, offset, side,
  rear, rollover, high-speed wall, head-on, braking, jump, drop, multi-car),
  each with tunable parameters + difficulty tiers.
- **Analytical crash model** (`crashModel.ts`): deterministic. Energy →
  crush-work → cabin-intrusion solver; occupant forces; logistic survival;
  0-100 safety score (structural/restraints/crumple/cabin/rollover); per-zone
  damage map; failure diagnosis. Special branches for rollover & braking.
- **Crash cinematic** (`CrashStage.tsx`): countdown → approach → impact
  (flash / shockwave / sparks / shake / haptics) → settle → report. Pre-physics
  placeholder.
- **Crash report** (`CrashReport.tsx`): verdict band, hero metrics, failure
  analysis, safety ring + bars, simulated crash-test dummy, component damage
  bars, Close / Modify / Run-Again actions.
- **Engineering Lab**: weight distribution, stability gauge (rollover
  threshold), power-delivery curve (SVG), braking visual, performance metric
  grid, structural bars, configuration list.

### Known issues / balancing TODO
- **Crash-model tuning**: `FORCE_PER_STRENGTH` / `CABIN_FORCE_MULT` make the
  crumple zone hit 100% deformation fairly easily (a 56 km/h sedan reports
  "crumple overwhelmed" yet 97% survival — messaging vs. numbers mismatch).
  Re-tune so deformation %, intrusion, and verdict track each other cleanly.
- Braking-model `impactVelocity()` has an over-complicated `decel` expression;
  simplify when the physics phase lands.
- No sound yet. No progression/unlocks enforced (parts have `startUnlocked`
  flags but nothing gates on them). No challenges, replays, or sharing UI.
- Silhouette is side-view only; no damage deformation shown on the SVG yet.

---

## Phase roadmap & progress

| Phase | Area | Status |
|------|------|--------|
| 1 | Architecture & app shell | ✅ done |
| 2 | Vehicle data model & garage | ✅ done |
| 3 | Vehicle builder | ✅ done (polish later) |
| 4 | Vehicle visualization | 🟨 2.5D side-profile done; damage states + more angles later |
| 5 | Physics system (Rapier2D) | ⬜ next — deterministic sim |
| 6 | Basic crash test | 🟨 analytical version done; real-time sim pending |
| 7 | Damage system | 🟨 model done; visual deformation pending |
| 8 | Cinematic replay + slow-mo scrubber | ⬜ (placeholder cinematic exists) |
| 9 | Crash analysis | ✅ done (report) |
| 10 | Challenges | ⬜ |
| 11 | Progression / unlocks | ⬜ |
| 12 | Persistence | 🟨 builds+settings persisted; replays not stored |
| 13 | Leaderboards / shareability | ⬜ (share codes generated, no UI/backend) |
| 14 | Audio | ⬜ |
| 15 | Mobile optimization | 🟨 mobile-first throughout; perf pass later |
| 16 | Final polish & balancing | ⬜ |

---

## Recommended next task (Session 2)

**Phase 5 + 8: Real-time deterministic physics with Rapier2D and a scrubbable
replay.** Replace the CSS `CrashStage` with a 2D physics sim (chassis body +
wheels + barrier), fixed-timestep and seeded so a build+scenario always
reproduces the same crash. Drive the *visual* deformation and camera from the
sim while keeping `crashModel.ts` as the authoritative scored outcome (or
reconcile the two). Add slow-motion (1× / 0.5× / 0.25× / 0.1×) and a timeline
scrubber. This is the single biggest jump in "oh my god, run it again" feel.

Before starting: `npm install`, `npm run dev`, open at 393×852, click through
Garage → Build → Crash → report to confirm nothing regressed.

## Session log
- **Session 1**: Scaffolded project; built app shell, parts DB, stat engine,
  garage, builder (with what-if deltas), silhouette renderer, scenarios,
  analytical crash model, cinematic placeholder, crash report, engineering lab.
  Verified end-to-end in headless Chromium at mobile size.
