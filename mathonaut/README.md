# Mathonaut

A 3-lane space runner where **the maths is the steering, never a quiz popup**.
Ages 4–10. Number recognition through 12× tables.

## Start here

1. **`CLAUDE.md`** — project contract. Read first. Contains the non-negotiables and
   the design decisions that must not be casually undone (each with the measurement
   behind it).
2. **`docs/06-build-plan.md`** — what to build, in order, with acceptance criteria.
3. **`prototype/Mathonaut.jsx`** — the working, playable reference implementation.
4. **`testing/README.md`** — the headless harness. This is how every real bug in this
   project was found. Do not drop it.

## Docs

| File | Contents |
|---|---|
| `docs/01-product-spec.md` | Core loop, built systems, crew collectibles, stickers, daily flight, streaks |
| `docs/02-curriculum.md` | The 13-level ladder, galaxy map, per-fact mastery (spaced repetition) |
| `docs/03-architecture.md` | Target stack, data model, perf + input rules learned the hard way |
| `docs/04-monetization.md` | Freemium subscription vs premium, pricing, what never to do |
| `docs/05-compliance.md` | COPPA / Kids Category / accessibility. Build blockers, not paperwork. |
| `docs/06-build-plan.md` | Phased tickets with acceptance criteria |
| `docs/07-landscapes.md` | Plan for making each region/level look distinct |

## The prototype

`prototype/Mathonaut.jsx` runs as a claude.ai React artifact. ~2,800 lines, single
file, fully playable. It contains:

- Core 3-lane loop with swipe/tap/keyboard steering
- 13-level adaptive curriculum (validated across 52,000 generated questions)
- HUD answer strip — 9.2s of thinking time (the 3D signs alone gave 1.1s)
- 4 mission types with genuinely different rules (Rescue / Cargo / Repair / Rift)
- 4 galaxy themes that retint the entire scene and change the hazard mix
- Boss combat: telegraphed lane beams, rage scaling, visible battle damage
- Overdrive — correct answers charge a smash-through burst
- Star economy with a shop; purchases persist
- Launch cinematic with a real 7-segment countdown; destination planet approach + flyby
- Mobile perf guards: render throttling, texture caching, WebGL context-loss recovery

## Play it

`web/index.html` is a **single, self-contained file** (three.js + the game core
inlined — no server, no CDN). Open it in any WebGL browser and play. Rebuild it
after changing the core with:

```bash
npm run build:web      # -> web/index.html
```

## Run the tests

```bash
npm install
npm test               # bundles the core, runs 11 headless suites (no browser)
```

## The one rule

> **The maths must control the gameplay, not pause it.**

If a feature stops the flight to ask a question, it's wrong. Rework it.
