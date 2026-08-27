# CRASHIT — Build a Car → Crash It

A physics-based vehicle **engineering & crash-testing sandbox**. Design a
vehicle from modular parts under a budget, predict how it will perform, send it
into a crash scenario, and read the engineering report — then change the
suspension and **run it again**.

Mobile-first (designed for 390×844 / 393×852 / 430×932); works on desktop too.

> This is a game/simulation for entertainment and learning. It is **not** a
> real-world safety-certification tool.

## The loop

**BUILD → TEST → PREDICT → CRASH → ANALYZE → MODIFY → CRASH AGAIN**

## Getting started

```bash
npm install
npm run dev        # http://localhost:5173
```

Other scripts:

```bash
npm run build      # typecheck + production build
npm run preview    # serve the production build
npm run typecheck  # tsc, no emit
```

## Tech

Vite · React 18 · TypeScript (strict) · Zustand (persisted) · Rapier2D (physics,
being wired in). Stylized 2.5D SVG vehicle rendering.

## Project docs

- **`PROJECT_STATE.md`** — current status, what works, and the next task. Read
  this first when picking up development.
- **`ARCHITECTURE.md`** — how the code is organized and why.

Built incrementally across sessions — see the phase roadmap in
`PROJECT_STATE.md`.
