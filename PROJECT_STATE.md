# PROJECT_STATE — CRASHIT

> **Read this first every session.** It is the running log of what exists, what
> works, and what to build next. Update it at the end of every session.

**Game:** BUILD A CAR → CRASH IT. A physics-based vehicle engineering &
crash-testing sandbox. Mobile-first. See the original brief and `ARCHITECTURE.md`.

**Stack:** Vite + React 18 + TypeScript (strict), Zustand (persisted to
localStorage). **Three.js + Rapier3D** (`@dimforge/rapier3d-compat`) power the
real-time crash simulation (lazy-loaded chunk). No backend yet.

**Run:** `npm install` → `npm run dev`. Build: `npm run build`. Typecheck:
`npm run typecheck`. Target viewports: 390×844, 393×852, 430×932.

---

## Current status: END OF SESSION 3

The core game loop is **playable end to end with real-time 3D physics, a
challenge campaign, and progression**:

**BUILD** (Garage + Builder) → **TEST** (scenario + params) → **CRASH**
(3D Rapier sim, cinematic + replay) → **ANALYZE** (engineering report) →
**MODIFY** → **RUN AGAIN**, plus a **Goals** campaign that gates part unlocks.

### New in Session 3 — challenges, progression & crash-model balancing (Phase 10 + 11)
- **Challenge system** (`src/game/challenges/challenges.ts`): 8 data-driven
  challenges across 3 tiers, each pinning a scenario + fixed params and a set of
  measurable goals (survival, cabin intrusion, peak-G, safety, braking distance,
  top speed, cost, mass, power-to-weight). Pure `evaluateChallenge()` returns
  pass/fail + a 1–3★ rating from goal headroom.
- **Progression / unlocks** (store): completing a challenge grants part unlocks
  and records best stars (persisted). Challenges gate on prerequisites; parts
  gate on `isPartUnlocked`. **Design rule enforced: no challenge requires the
  part it rewards** — rewards help later challenges.
- **Goals screen** (`ChallengesScreen`): 5th nav tab, challenge grid with
  lock/complete/★ states, a bottom-sheet detail (scenario, objectives, reward),
  Attempt/Retry.
- **Challenge mode** threads through Builder (challenge banner, locked scenario,
  "Run ›") and Test (locked params, `ChallengeResult` overlay with stars, goal
  checklist, unlock reveal; "Report" still opens the full analysis).
- **Builder unlock gating**: locked parts render greyed with a "Win *X*" hint
  and can't be selected.
- **Crash-model balancing**: failure text now tracks the numbers (a fully-used
  but contained crumple zone reads "energy absorbed", not "overwhelmed");
  structure-failure threshold raised to 18 cm; **rollover retuned** so rollover
  protection & cabin strength actually drive survival (was near-always fatal).
- Verified end-to-end in headless WebGL: Goals → attempt First Contact → 3D
  crash → CHALLENGE COMPLETE (3★) → Roll Cage unlocked → tier-2 challenges
  unlock on the list. No page errors.

### New in Session 2 — 3D deterministic physics + replay (Phase 5, 6, 8)
- **Pre-simulated crash engine** (`src/game/sim/crashSim.ts`): builds a Rapier3D
  world from `VehicleStats` (chassis with real mass / CoG height / inertia,
  welded wheels, ground, scenario-specific barriers/ramps/curbs/opponent cars),
  steps at a fixed 1/120 s timestep, and **bakes every body transform into a
  Float32Array**. Deterministic and cheap (<~500 steps up front). All 11
  scenarios have setups (frontal/offset/side/rear/rollover/wall/head-on/braking/
  jump/drop/multi-car); braking respects a clean stop vs. wall impact.
- **3D renderer** (`src/components/crash/CrashSim3D.tsx`): Three.js scene playing
  the baked recording — metallic paint, glass greenhouse, wheels, hazard
  barriers, grid ground, fog. Camera modes (chase/side/front/top/impact),
  auto slow-mo around impact, impact flash + point light, visual front crush
  driven by `deformationPct`, live speed HUD.
- **Replay & scrubbing**: full timeline scrubber, play/pause, slow-mo
  (1× / 0.5× / 0.25× / 0.1× / 0.05×), Replay, then "Report ›" hands off to the
  existing analysis. Because playback reads baked frames, scrub/replay are free
  and identical every time.
- **Perf guardrails honored**: Three + Rapier are a **lazy chunk** (main bundle
  stayed ~209 KB; 3D chunk loads only on Crash). DPR capped at 2, low-poly,
  geometry/material disposal on unmount, physics off the render thread.
- Verified in headless Chromium (swiftshader WebGL) at 393×852 across
  frontal / rollover / braking / side with no page errors; Report transition OK.

The analytical `crashModel.ts` remains the **authoritative scored outcome** (the
report); the 3D sim drives the *visuals* and is fed the same impact speed, so
the two agree. Full reconciliation (measuring the score from sim impulses) is a
later refinement.

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
- **Sim ↔ score reconciliation**: the report is still analytical; the 3D sim
  measures a `peakAccelG` but it's unused. Consider feeding sim impulse into the
  score, or at least surface the measured peak.
- **3D polish**: vehicle is box-based (no body silhouette in 3D); front-crush is
  a simple scale (rear wheels can look offset when the body slides back);
  rollover reliability varies with the trip curb; no skid marks / debris / sound.
- Braking-model `impactVelocity()` in `crashModel.ts` still has an
  over-complicated `decel` expression; simplify.
- No sound yet. No progression/unlocks enforced (parts have `startUnlocked`
  flags but nothing gates on them). No challenges or sharing UI. Crash
  *recordings* are computed live but not persisted for later viewing.
- Silhouette (garage/builder/lab thumbnails) is side-view only; no damage state.

---

## Phase roadmap & progress

| Phase | Area | Status |
|------|------|--------|
| 1 | Architecture & app shell | ✅ done |
| 2 | Vehicle data model & garage | ✅ done |
| 3 | Vehicle builder | ✅ done (polish later) |
| 4 | Vehicle visualization | 🟨 2.5D side-profile + 3D box vehicle; body silhouette in 3D + damage states later |
| 5 | Physics system (Rapier3D) | ✅ done — deterministic pre-sim |
| 6 | Basic crash test | ✅ done (3D real-time, all 11 scenarios) |
| 7 | Damage system | 🟨 model done; 3D crush is basic (scale); no debris |
| 8 | Cinematic replay + slow-mo scrubber | ✅ done (camera modes, slow-mo, scrubber, replay) |
| 9 | Crash analysis | ✅ done (report) |
| 10 | Challenges | ✅ done (8 challenges, 3 tiers, ★ ratings) |
| 11 | Progression / unlocks | ✅ done (part unlocks via challenges, gated builder) |
| 12 | Persistence | 🟨 builds+settings+unlocks+challenge progress persisted; replays not stored |
| 13 | Leaderboards / shareability | ⬜ (share codes generated, no UI/backend) |
| 14 | Audio | ⬜ |
| 15 | Mobile optimization | 🟨 mobile-first + lazy 3D chunk; perf pass on device later |
| 16 | Final polish & balancing | ⬜ |

---

## Recommended next task (Session 4)

**Sound + game feel (Phase 14 + polish)** — the crash is still silent, and this
is now the biggest missing "oh my god" multiplier. Add a Web Audio architecture
(procedural, no asset files): engine/EV whine pitched to speed, tire, wind,
impact crunch, metal groan, glass; trigger the impact SFX off the sim
`impactFrame`; honor `settings.muted`. Then add camera shake on impact, tire
skid marks on the ground plane, and a simple debris/spark burst in 3D.

Secondary polish, any of:
- **Sandbox / Experiment mode (Phase 19)** — a toggle (already `settings.sandbox`
  in the store) that ignores the budget and unlock gating; wire it into a garage
  entry + builder so players can build ridiculous cars.
- **Daily challenge (Phase 28)** — one rotating seeded challenge on the Goals
  screen.
- **Shareable build card + crash replay persistence (Phase 13 + 24)** — store
  `SimRecording`/config so old crashes replay; a share card from the build.
- Balance playtest: the challenge targets are first-pass; the deeper ones
  (Featherweight, Stay Upright, The Fortress) need a real difficulty check, and
  the sim's measured `peakAccelG` still isn't reconciled into the report.

Before starting: `npm install`, `npm run dev`, open at 393×852. Smoke path:
Goals → attempt a challenge → Build (note locked parts) → Run → 3D crash →
CHALLENGE COMPLETE → reward unlock. WebGL required for the crash view.

## Session log
- **Session 1**: Scaffolded project; built app shell, parts DB, stat engine,
  garage, builder (with what-if deltas), silhouette renderer, scenarios,
  analytical crash model, cinematic placeholder, crash report, engineering lab.
  Verified end-to-end in headless Chromium at mobile size.
- **Session 2**: Replaced the placeholder cinematic with a real **3D Rapier
  physics crash simulation** — deterministic pre-baked recording, Three.js
  playback, camera modes, slow-motion, timeline scrubber, replay, impact FX,
  visual crush. Lazy-loaded chunk (main bundle unchanged). All 11 scenarios set
  up. Verified across frontal/rollover/braking/side in headless WebGL; Report
  transition intact. Dropped `rapier2d-compat`.
- **Session 3**: Added the **Challenges campaign + progression** — 8 challenges
  across 3 tiers, star ratings, part-unlock rewards with a no-self-dependency
  rule, a Goals screen, and challenge mode woven through Builder/Test with a
  `ChallengeResult` overlay. Gated locked parts in the builder. Balanced the
  crash model (failure narration matches the numbers; rollover retuned so
  protection matters). Verified the full attempt→complete→unlock loop in
  headless WebGL.
