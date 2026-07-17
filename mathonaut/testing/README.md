# Testing — the headless harness

**This is the most valuable engineering asset in the project. Do not drop it in the
port.**

## Why it exists

Every genuine bug in Mathonaut was found by simulation, not by reading code or by
eyeballing the game:

| Bug | How it presented | Found by |
|---|---|---|
| **Dark Rift mission mathematically unwinnable** | Looked fine. Felt hard. | An auto-pilot answering *every question correctly* still lost. Drift outpaced pushback. |
| **Boss fight unwinnable at speed** | "The boss just never dies" | The answered gate flew past the cleanup line before its fade finished, so the victory check never ran. |
| **Swipe-left restarts the level** | User report | Reproduced exactly: `state=CINE score=0` after a swipe over an invisible centred button. |
| **Learner jams at level 2** | Would have looked like "kids quit early" | A simulated child climbing the ladder got stuck in a fail loop — the boss was beaming a four-year-old. |
| **Answers unreadable** | User report: "hard to see" | Measured: panels are 12px at spawn, legible for **1.1s**. |
| **Menus freeze / game restarts** | User report | Audit found 6 stacked `backdrop-filter` layers over a 60fps canvas + ~54 texture uploads/mission → WebGL context loss. |

None of these are visible in a code review. All were trivially visible to a robot
that plays the game.

## How it works

```
jsdom  +  real three.js  +  a fake WebGLRenderer  +  a stubbed canvas 2D context
   ↓
inject MARKUP into a root div
   ↓
createGame(root, THREE)
   ↓
drive with synthetic touch/key events
   ↓
step frames manually (controlled clock — no real time)
   ↓
read window.__THREE_GAME_DIAGNOSTICS__
```

Key tricks:
- **Fake renderer**: `class FakeRenderer { setPixelRatio(){} setSize(){} render(){} }`.
  You never need a GPU. You can still assert on scene graph state.
- **Controlled clock**: override `performance.now()` and drive `requestAnimationFrame`
  manually. A 90-second mission runs in milliseconds.
- **Canvas 2D stub**: a `Proxy` returning no-ops, plus `createLinearGradient` /
  `createRadialGradient` returning `{addColorStop(){}}`.
- **Storage shim**: an in-memory `window.storage` so save/persist round-trips.

## The auto-pilot

The most valuable piece. It reads telemetry and plays:

```js
const danger = [d.beamLane, d.beamLane2].filter(x => x != null && x >= 0);
if (danger.includes(d.lane) && d.odActive <= 0) {
  const safe = [0,1,2].filter(l => !danger.includes(l));
  steerTo(safe.includes(d.gateLane) ? d.gateLane : safe[0]);   // dodge, prefer the answer
}
else if (d.threatLane === d.lane) steerTo(...);                 // dodge hazards
else if (d.gateLane != null) steerTo(d.gateLane);               // answer correctly
if (d.od >= 1 && d.odActive <= 0) tap('odBtn');                 // spend overdrive
```

Vary its competence to model different children:
- **accurate pilot** → must be able to win. If it can't, the level is broken.
- **sloppy pilot** (deliberately wrong every other gate) → must sometimes fail.
  If it always wins, there are no stakes.

## Telemetry contract

`window.__THREE_GAME_DIAGNOSTICS__`, published **every 3 frames**:

```
state, phase, lane, hp, shield, combo, gatesDone, totalGates, bossHP, assist,
crashing, od, odActive, odSmashes, mathLevel, entities, score, acc,
gateLane, threatLane, starLane, qtyNeed, qtyHave,
beamState, beamLane, beamLane2, cargo, chain, nodes, riftGap,
cineT, count, journey, dpr, signCache, contextLost, draws, tris
```

**Two rules learned painfully:**
1. **Telemetry must not sit behind the render throttle.** It once did, and stalled on
   menus.
2. **Tests must settle ≥6 frames after an input before reading.** Otherwise they read
   stale state — this caused a test to silently *skip entire missions* while reporting
   wins.

## Gotcha: the harness can lie

When the swipe-restart bug was fixed, **three suites broke** — because they had been
secretly pressing *hidden* buttons to shortcut through menus, exactly the thing a
thumb was doing accidentally. **That was the strongest evidence the fix worked.**

If a test breaks after a legitimate fix, suspect the test.

## Suites to port

| Suite | Asserts |
|---|---|
| `math` | 52k generated questions: unique options, answer present, no negatives, L1–6 ≤ 20, no zero decoys L1–2 |
| `ladder` | A simulated learner climbs 1 → 7+ without jamming |
| `systems` | All 4 mission rules, boss beams, economy, purchases persist |
| `kid` | L1 experience: answer strip readable, ≥6s thinking time, no guards (deterministic counter), lane tracking |
| `access` | Answer-feedback glyph (greyscale cue), settings behind a parental gate, persistence, reduced-motion behaviour |
| `audio` | Music bed rises with speed; haptics on hit/answer; both respect the toggles |
| `perf` | Menu render throttle, texture cache bounded, context-loss recovery |
| `swipe` | Hidden controls inert; real swipe/tap still steer |
| `cinematic` | Countdown 5→1, correct 7-segment patterns, blast-off, skip |
| `journey` | Planet approaches with progress; flyby sweeps left; resets between missions |

All eight are implemented in `suites/*.test.js` and gate CI.

## Running the suite

From `mathonaut/`:

```bash
npm install      # three, jsdom, esbuild (dev only)
npm test         # bundles the core to testing/game.cjs, then runs every suite
```

`npm test` runs each suite in its own child process (isolated globals — one game
instance never leaks into the next) and exits non-zero if any suite fails. To run
one suite directly:

```bash
npm run build:core
node testing/suites/ladder.test.js
```

### How the suite is wired

- `harness.js` — the shared setup: jsdom, a fake `WebGLRenderer` that records the
  scene, a stubbed 2D canvas context, an in-memory `window.storage`, a fake
  `AudioContext`, and — crucially — **a fake clock**. `performance.now()`,
  `requestAnimationFrame`, and `setTimeout` are all driven off a manual frame
  counter, so a 90-second mission (and its 900ms result-overlay reveal) runs in
  milliseconds and deterministically. `createHarness()` returns the driving
  handles (`frame`, `settle`, `tap`, `key`, `swipe`, `D`, `wallet`, `scene`, …).
- `autopilot.js` — the scripted player. `playMission()` reads telemetry each frame
  and steers: vacate boss beams, fly through the answer, collect *exactly* N in a
  quantity phase, and spend Overdrive **defensively** (its smash is invulnerable,
  so it's saved for an unavoidable hit rather than burned the instant it charges).
  Pass `{ sloppy: n }` to model a struggling child who misses on purpose.
- `assert.js` — a tiny check/report helper; `run.js` — the runner.

The `math` suite needs no game at all — it imports `genQuestion` straight from the
bundle (the pure math lives in `game/math/questions.js`).

## The examples

`example-systems-test.js` and `example-ladder-test.js` are the original, inlined
reference tests kept for provenance. They bundle the **prototype** rather than the
extracted core:

```bash
npx esbuild ../prototype/Mathonaut.jsx --bundle --format=cjs --external:three \
  --alias:react=./stub/react.js --outfile=./game.cjs
node example-ladder-test.js
```

(`stub/react.js` = `module.exports = { useEffect:()=>{}, useRef:()=>({current:null}) };`
— the React wrapper is stubbed out because `createGame` doesn't need it. That's the
whole point of the split.)
