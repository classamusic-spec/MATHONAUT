# CLAUDE.md — Mathonaut

Read this first. It is the contract for how this project is built.

## What Mathonaut is

A 3-lane endless-runner space game where **maths is the steering, never a quiz popup**.
The player flies a rocket (or UFO) down three invisible lanes. Answer gates appear;
you fly *through* the correct answer. Correct answers grant shields, speed and
Overdrive charge. Wrong answers spawn a dodgeable debris wave and a visual hint.
Each mission ends in a boss fight and an arrival flyby at a destination planet.

Target age: **4–10**. A four-year-old starts at number recognition; a ten-year-old
ends at 12× tables.

## The one rule that governs every design decision

> **The maths must control the gameplay, not pause it.**

If a proposed feature stops the flight to ask a question, it is wrong. Rework it.

## Current state

`prototype/Mathonaut.jsx` is a **working, fully playable single-file prototype**
(~2,800 lines). It runs as a claude.ai React artifact. It is not production code,
but it is not throwaway either — it is the reference implementation of the game
feel, and every system in it has been verified by a headless test harness.

What already works: the core loop, 13-level adaptive curriculum, 4 mission types
with distinct rules, 4 galaxy themes, boss combat with telegraphed beams, Overdrive,
star economy with a shop, launch cinematic with countdown, destination-planet
approach and flyby, crash animation, mobile perf guards.

**Read `docs/06-build-plan.md` for what to build next and in what order.**

## Non-negotiables

These are not preferences. Violating any of them fails App Store review, breaks
the law, or breaks a child's trust.

1. **No ads. Ever.** No banners, no rewarded video, no interstitials.
2. **No third-party trackers / behavioural analytics on children.** First-party,
   privacy-safe telemetry only.
3. **No purchasable currency sold to the child.** Stars are earned by playing only.
4. **No paid loot boxes.** Earned random cosmetics are fine; paid ones are not.
5. **Parental gate** in front of every purchase, external link, and settings screen.
6. **No pay-to-win.** Cosmetics and content, never advantage.
7. **No dark patterns**: no countdown pressure, no streak-loss guilt, no "your
   friends are ahead of you".
8. **Never punish a struggling child.** Support mode exists (see below) and must
   remain automatic and silent-ish. Difficulty adapts down, never shames.

## Design decisions you must not casually undo

Each of these was made for a measured reason. If you want to change one, re-measure first.

| Decision | Why |
|---|---|
| **Answers live in a HUD strip, not only on the 3D signs** | Measured: 3D panels are 12px wide at spawn distance and only legible for **1.1s**. To be readable at spawn they'd need to be ~7 units wide, but lanes are 4.8 apart — they'd overlap. 3D signs *cannot* solve this. The HUD strip gives **9.2s** of thinking time. |
| **Flight speed scales with maths level** (`13 + L*1.4`) | A 4-year-old on L1 gets a 7.5s approach; a 10-year-old on L13 gets 3.5s. One speed cannot serve both. |
| **Guards (hazards in front of the correct answer) only at level 4+** | Below that the child is still learning to count. |
| **Boss holds fire below level 4** | A learner-simulation jammed in a fail loop at L2 because the boss was beaming a four-year-old. |
| **Below level 3: asteroids only, 2.6s gaps** | No darting UFOs or fast comets for pre-schoolers. |
| **No zero as a decoy at levels 1–2** | Zero is a genuinely confusing concept at age 4. |
| **Decoys stay in the child's number world at L1–6** | Never offer 13 as a decoy to "Find 3". |
| **Hidden overlays use `visibility:hidden`** | `pointer-events:none` on a parent is overridden by a child's `pointer-events:auto`. This bug made invisible centred LAUNCH/RETRY buttons touch-live during flight — a left swipe restarted the level. |
| **Buttons ignore gestures that travel >12px** | Same bug class: a swipe is not a tap. |
| **Render throttles to ~15fps when an overlay is up; DPR drops to 1** | Stacked `backdrop-filter` over a live WebGL canvas at 60fps froze menus on iOS. |
| **Answer sign textures are LRU-cached (cap 48)** | Was ~54 fresh GPU texture uploads per mission → WebGL context loss → "crashes and restarts the level". |
| **`webglcontextlost` is handled** | Without it the canvas silently dies and the host remounts, which reads as a crash. |

## Architecture principle: keep the game core framework-free

The prototype deliberately separates:

- `MARKUP` — a static HTML string (UI + CSS)
- `createGame(root, THREE)` — all game logic, plain DOM + three.js, **no React**
- A thin React component that injects MARKUP and calls `createGame` in `useEffect`

**Preserve this split.** It is why the game is testable headlessly in jsdom without
a browser or a renderer, and it is how every real bug in this project was found.
`createGame` returns a `dispose()` that must tear down every listener, RAF, and
GPU resource.

## Testing is not optional here

See `testing/README.md`. There is a headless harness that:
- loads the game in jsdom with a fake WebGL renderer
- drives it with synthetic taps/keys
- reads `window.__THREE_GAME_DIAGNOSTICS__` telemetry
- plays entire missions with a scripted auto-pilot

**Bugs this harness caught that no amount of code-reading did:**
- The Dark Rift mission was **mathematically unwinnable** — a perfect pilot still lost.
- The boss fight was **unwinnable at speed** — the answered gate flew past the cleanup
  line before its fade finished, so the victory check never ran.
- The swipe-restart bug (reproduced as `state=CINE score=0`).
- A learner **jamming at level 2** in a fail loop.

Every gameplay/balance change must be re-verified with a simulated player, not by eye.

### Telemetry contract
`window.__THREE_GAME_DIAGNOSTICS__` publishes every 3 frames. Keep it populated
and keep it decoupled from render throttling (it once stalled behind the throttle).
Tests must settle ≥6 frames after an input before reading it, or they read stale state.

## Definition of done for any gameplay change

- [ ] Headless test proves the intended behaviour
- [ ] Headless test proves a **simulated child can still win** at the lowest affected level
- [ ] No regression in the existing suites
- [ ] Console clean; `dispose()` still tears everything down
- [ ] Works at 390×844 (phone) — this is the primary target, not desktop

## Voice and tone in-game

Warm, brief, never condescending. "Let's practise Taking Away to 10 — you've got
this." Never "Wrong!", never a red X on a child's face. The failure screen is
"Ship Needs Repairs", and it still pays out salvage stars.
