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

## Current status: END OF SESSION 8

The core game loop is **playable end to end with real-time 3D physics + sound, a
challenge campaign, progression, a sandbox mode, shareable builds + replays, a
shaped 3D vehicle, and environmental/random crash events**:

**BUILD** (Garage + Builder) → **TEST** (scenario + params) → **CRASH**
(3D Rapier sim, sound + cinematic + replay) → **ANALYZE** (engineering report) →
**MODIFY** → **RUN AGAIN**, plus a **Goals** campaign that gates part unlocks,
a **Sandbox** mode for absurd experiments, and **shareable build links + saved
crash replays**.

### New in Session 8 — environmental / random events (Phase 25)
- **`conditions.ts`**: 5 opt-in "simulation events" — Wet Track, Crosswind, Tire
  Blowout, Brake Fade, Uneven Surface — each with icon + description, clearly
  flagged as simulation-only. A seeded PRNG (`mulberry32` + `seedFrom`) keeps
  runs reproducible for replays.
- **Scoring**: `wet` cleanly reduces grip (→ braking/survival) via
  `conditionAdjustedStats`; all conditions add narrative notes to the report.
- **Sim**: `simulateCrash` applies wet friction, a continuous crosswind force, a
  seeded mid-run tire-blowout impulse, and brake-fade damping — all **gated to
  the pre-impact phase** so added forces can't make the constraint solver eject
  the wrecked car.
- **UI**: a "Simulation Events" panel on the Test screen (toggle chips + 🎲
  Randomize; career/sandbox only, challenges stay clean); active events show as
  icons in the sim HUD and as notes in the report. Conditions + seed are stored
  in the run config so replays reproduce exactly.
- Verified: selection, sim application, HUD icons, report notes, and a
  post-fix sane top speed (was a solver blow-up) in headless WebGL. No errors.

### New in Session 7 — shaped 3D vehicle (Phase 4 polish)
- **`carMesh3d.ts`**: the crash vehicle is now a low-poly body **extruded from
  the same silhouette profile** the 2.5D thumbnails use (`buildCarMesh`), so the
  3D car matches its garage art — hood slope, glass greenhouse, sloped rear,
  belt-line accents, hub-capped wheels. Chassis style comes from the build's
  chassis id; opponent cars get a shaped sedan body too. Replaced the plain
  boxes in `CrashSim3D`. Verified across chase & side cameras — clearly reads as
  a real car now, no page errors.
- **Still open**: reconcile the sim's measured `peakAccelG` into the report
  (deferred — the analytical peak-G drives scoring, so it needs care) and give
  wheels arch cut-outs.

### New in Session 6 — sharing & replays (Phase 13 + 24)
- **Crash history** (persisted, capped 24): every crash snapshots its build +
  scenario config + result. Replays re-run the sim deterministically from that —
  no recording stored (`recordCrash`, `crashHistory`).
- **Recent Crashes** list on the Garage: tap a card to replay the crash in 3D
  (via a global `ReplayHost` overlay) and see its report again.
- **Shareable build links** (`shareCodec.ts`): a build encodes to a URL-safe
  hash (`#b=…`), decodes to a fresh copy. Opening a shared link shows an
  import prompt.
- **Share card** (`ShareCard`): a polished, screenshot-ready card — silhouette,
  key stats, last-crash verdict badge, and a Copy-Link button — opened from a
  🔗 button on each garage card.
- Verified the full share → copy-link → open-link → import, and the replay,
  loops in headless WebGL. No page errors.

### New in Session 5 — sandbox / experiment mode (Phase 19)
- **Tuning model** (`Tuning` on `VehicleBuild`): multipliers/offsets for engine
  power, mass, tyre grip, downforce, wheel size, and centre-of-gravity height,
  applied in `deriveStats` on top of the part-derived stats (identity when
  absent). `wheelScale` is threaded into `crashSim` so tiny/huge wheels really
  render & collide.
- **Sandbox mode** (global `settings.sandbox`): a Career/Sandbox toggle on the
  Garage. In sandbox the Builder drops the budget and unlock gating and gains a
  **Tuning tab** with the extreme sliders. New builds made in sandbox are
  flagged.
- Verified in headless WebGL: toggle → new build (no budget, "Tuning" tab) →
  power ×5 (1,050 hp, 0-60 rises to 11 s because traction-limited — emergent!) →
  wheels ×2.5 render as a monster-truck stance in the 3D crash. No page errors.

### New in Session 4 — audio & game feel (Phase 14 + polish)
- **Procedural audio engine** (`src/game/audio/audio.ts`): one AudioContext,
  master-gain mute, all voices synthesised (no asset files) — engine drone
  (ICE vs. EV voices) & wind pitched to speed, tyre screech gated by
  deceleration, and one-shot impact (low boom + noise crunch) with optional
  glass shatter & metal groan scaled by crash severity. Unlocked on the launch
  click gesture; honors `settings.muted`.
- **3D game feel** in `CrashSim3D`: camera shake on impact (decaying), a
  40-point spark/debris burst at the impact point, and tyre **skid marks** laid
  on the ground during hard deceleration and revealed as the cursor passes.
- **Mute toggle** (🔊/🔇) in the sim HUD, synced to the store setting.
- Verified in headless WebGL (braking + frontal): AudioContext initializes, mute
  button present, skid marks render, no page errors.

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
| 4 | Vehicle visualization | ✅ 2.5D thumbnails + shaped 3D body (extruded silhouette); damage-state morphing later |
| 5 | Physics system (Rapier3D) | ✅ done — deterministic pre-sim |
| 6 | Basic crash test | ✅ done (3D real-time, all 11 scenarios) |
| 7 | Damage system | 🟨 model done; 3D crush is basic (scale); no debris |
| 8 | Cinematic replay + slow-mo scrubber | ✅ done (camera modes, slow-mo, scrubber, replay) |
| 9 | Crash analysis | ✅ done (report) |
| 10 | Challenges | ✅ done (8 challenges, 3 tiers, ★ ratings) |
| 11 | Progression / unlocks | ✅ done (part unlocks via challenges, gated builder) |
| 12 | Persistence | ✅ builds, settings, unlocks, challenge progress & crash history persisted |
| 13 | Leaderboards / shareability | 🟨 shareable build links + share card done; leaderboards need a backend |
| 14 | Audio | ✅ done (procedural engine/wind/screech/impact/glass/metal + mute) |
| 15 | Mobile optimization | 🟨 mobile-first + lazy 3D chunk; perf pass on device later |
| 16 | Final polish & balancing | ⬜ |
| 19 | Experiment / sandbox mode | ✅ done (mode toggle + tuning sliders) |
| 25 | Randomized / environmental events | ✅ done (wet/wind/blowout/fade/uneven, seeded) |

---

## Recommended next task (Session 9)

Pick one; all are self-contained:

- **Daily challenge (Phase 28)** — one date-seeded rotating challenge pinned at
  the top of the Goals screen; reuses the challenge engine + `seedFrom` (seed
  the scenario, params, and any conditions from the date). Small, adds a reason
  to return.
- **Settings screen** — global mute, reduce-motion, sandbox toggle, and "reset
  progress" in one place (mute + sandbox currently live only in their contexts).
  Add a gear entry in the Garage header. `settings.reduceMotion` exists in the
  store but isn't wired to anything yet.
- **Balance + peak-G reconciliation** — thread the sim's measured `peakAccelG`
  back through `onComplete` → report so the number matches the physics watched
  (touches CrashSim3D/TestScreen/ReplayHost/CrashReport); difficulty-test the
  tier-2/3 challenges.
- **Debug/dev tools (Phase 30)** — a hidden dev overlay (gravity, time scale,
  force-crash, show CoG/velocity vectors, hitboxes) gated behind a secret tap.

Before starting: `npm install`, `npm run dev`, open at 393×852. Smoke paths:
(career) Goals → attempt → Build → Run → COMPLETE; (sandbox) Garage → Sandbox →
New → Tuning → Crash; (events) Crash → toggle Simulation Events → Crash; (share)
crash → Garage → 🔗 → Copy Link, and Recent Crashes → tap to replay. WebGL + a
user gesture (audio) required.

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
- **Session 4**: Added **procedural audio** (`game/audio/audio.ts`) — engine/EV
  drone, wind, tyre screech, and impact/glass/metal one-shots, all synthesised,
  wired into the 3D sim and unlocked on the launch gesture; a mute toggle synced
  to the store. Added **3D game feel**: impact camera shake, a spark/debris
  burst, and tyre skid marks. Verified render + audio init with no errors.
- **Session 5**: Added **sandbox / experiment mode** — a `Tuning` model (power/
  mass/grip/downforce/wheel-size/CoG multipliers) applied in `deriveStats` and
  threaded into the sim (`wheelScale`); a Career/Sandbox toggle on the Garage;
  and a Builder Tuning tab (with budget + unlock gating dropped in sandbox).
  Verified extreme builds (5× power, 2.5× wheels) crash correctly in 3D.
- **Session 6**: Added **sharing & replays** — persisted crash history with a
  Recent Crashes list that replays saved crashes in 3D (`ReplayHost`,
  deterministic re-sim); URL-hash build sharing (`shareCodec`) with an import
  prompt; and a screenshot-ready `ShareCard`. Verified the share→import and
  replay round-trips end-to-end in headless WebGL.
- **Session 7**: Replaced the plain-box 3D crash vehicle with a **shaped body
  extruded from the silhouette profile** (`carMesh3d.ts`) so the 3D car matches
  its 2.5D thumbnail — hood, glass greenhouse, sloped rear, wheels. Chassis
  style from the build; opponents shaped too. Verified in chase & side views.
- **Session 8**: Added **environmental/random events** (`conditions.ts`) — wet
  track, crosswind, tire blowout, brake fade, uneven surface — as opt-in seeded
  "Simulation Events" on the Test screen, applied through the crash model (wet
  grip) and the sim (forces/impulses/damping, gated to pre-impact), surfaced in
  the HUD and report, and stored in the run config for reproducible replays.
