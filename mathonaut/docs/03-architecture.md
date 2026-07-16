# 03 — Architecture

## Where we are

`prototype/Mathonaut.jsx` — one file, ~2,800 lines, runs as a claude.ai React artifact.
Fully playable. Not shippable (no accounts, no persistence beyond a key-value shim,
no store presence), but it is the **reference implementation of game feel** and its
structure is deliberately production-friendly.

## The split to preserve

```
MARKUP                     static HTML+CSS string      (UI)
createGame(root, THREE)    plain DOM + three.js        (all game logic, no framework)
  → returns dispose()
<Mathonaut/>               thin React wrapper          (injects MARKUP, calls createGame)
```

**Why:** `createGame` has no framework dependency, so it runs in jsdom with a fake
WebGL renderer. That is what makes the headless harness possible, and the harness is
what caught every real bug in this project. **Keep game logic out of React.**

## Recommended target stack

| Concern | Choice | Rationale |
|---|---|---|
| Shell | **Expo (React Native)** | One codebase → iOS + Android + web. Required for store presence. |
| 3D | **react-three-fiber + expo-gl** | Ports three.js scenes. Alternative below if this fights you. |
| State | Zustand or plain module state | The game core already owns its own state; don't Redux it. |
| Local save | `expo-sqlite` or MMKV | Local-first. Must work fully offline. |
| Sync | Supabase / Firebase | Parent account owns child profiles. |
| Auth | Parent email/OAuth. **Children never have accounts.** | Compliance. |
| Payments | RevenueCat | Wraps StoreKit/Play Billing, handles subs + restore. |
| Analytics | First-party, privacy-safe | See compliance. No Firebase Analytics on child sessions. |
| Errors | Sentry with PII scrubbing | |

### Fallback if r3f/expo-gl fights the scene
Ship the existing WebGL build inside a **WebView / Capacitor** wrapper, or as a
**PWA** first. Lower risk, faster to validate demand, and the game core transfers
verbatim. Downside: slightly worse perf ceiling and less native polish. This is a
legitimate phase-1 choice — validate before rewriting.

## Data model

```ts
type Account   = { id, email, createdAt, subscription: SubState };
type Child     = { id, accountId, displayName, avatarCrew, createdAt };

type Progress = {
  childId: string;
  mathLevel: number;          // 1..13(+)
  stars: number;              // spendable wallet
  lifetime: number;
  streak: { days: number; lastPlayed: string; freezes: number };
  ownedColors: string[];
  ownedShips: string[];
  ownedCrew: string[];
  activeCrew: string | null;
  stickers: string[];
  systems: Record<SystemId, { stars: 0|1|2|3; bestScore: number }>;
};

type FactStat  = { childId, fact, seen, correct, lastSeenAt, strength };
type Session   = { childId, startedAt, endedAt, missionId, answers: AnswerLog[] };
type AnswerLog = { fact, correct, msToAnswer };
```

**Local-first.** Everything playable offline; sync is a background reconcile.
Conflict rule: last-write-wins per child, except `stars` which takes the max
(never delete a child's earned currency over a sync race).

## Save migration

The prototype already migrates legacy saves (`colorsUnlocked` → `colorsOwned[]`).
Keep that habit: every schema change ships with a migration, and an unknown/missing
field must never crash the menu.

## Performance rules (learned the hard way)

These fixed real, reported crashes. Carry them into the native build.

1. **Throttle the render when an overlay is up.** Menus don't need 60fps behind them.
   Currently: ~15fps + DPR 1 while any overlay shows. Stacked `backdrop-filter` over a
   live WebGL canvas froze menus on iOS.
2. **Cap `backdrop-filter` usage.** Never full-screen. Four small layers max.
3. **Cache textures.** Answer signs are LRU-cached (48). Uncached, they were ~54 GPU
   uploads per mission → **WebGL context loss** → looked like "the game crashed and
   restarted the level".
4. **Handle `webglcontextlost`/`restored`.** Show a message, stop rendering, recover.
5. **Adaptive quality.** Measure frame time; shed pixel ratio when the device struggles.
   Degrade only — never oscillate.
6. **Pool everything.** Obstacles/pickups are pooled by kind. Don't allocate per frame.
7. **Telemetry off the hot path.** Publish every 3 frames, and **not** behind the
   render throttle (it once stalled there).

## Input rules (learned the hard way)

1. **Hidden UI must use `visibility:hidden`**, not just `pointer-events:none` — a
   child's `pointer-events:auto` overrides a parent's `none`. This made invisible
   centred LAUNCH/RETRY buttons live during flight; a left swipe restarted the level.
2. **A swipe is not a tap.** Buttons ignore gestures travelling >12px.
3. **Controls verify their overlay is on-screen** before firing.
4. **Never trust event shape.** Guard `e.touches && e.touches[0]`.

## Repo shape

```
mathonaut/
├── CLAUDE.md
├── app/                  # Expo app, screens, navigation, parent area
├── game/                 # createGame + MARKUP — framework-free core
│   ├── core/             # loop, phases, spawn, collision
│   ├── math/             # genQuestion, ladder, mastery
│   ├── render/           # scene, ship, gates, galaxies, fx
│   └── index.ts
├── shared/               # types, curriculum data, crew data
├── server/               # sync, subscription webhooks, parent dashboard API
└── testing/              # headless harness + suites
```
