# 06 — Build Plan

Ordered by **what teaches you the most, soonest**. Each ticket has acceptance
criteria written so a headless test can assert them.

> **Rule:** every gameplay ticket ships with a test proving a *simulated child can
> still win at the lowest affected level*. See `testing/README.md`.

---

## Phase 0 — Foundations (do first, ~1 week) ✅ DONE

**Goal:** the prototype becomes a repo with a test loop. **Done** — `game/` +
`app/` + `testing/` with `npm test` (10 suites) and CI.

### 0.1 Extract the core ✅
Split `prototype/Mathonaut.jsx` into `game/`. `createGame(root, THREE)` + `MARKUP`
stay framework-free (`game/index.js`); the pure question generator is its own
module (`game/math/questions.js`); the React wrapper is `app/Mathonaut.jsx`.
- **AC met:** the headless suites pass against the extracted core.
- **AC met:** `dispose()` tears down every listener/RAF/GPU resource (clean-run assertions).

### 0.2 Port the test harness ✅
Shared harness + 10 suites in `testing/`, wired to CI.
- **AC met:** `npm test` bundles the core and runs all suites headless, no browser.
- **AC met:** CI (`.github/workflows/ci.yml`) fails on any regression.

### 0.3 Accessibility blockers ✅
- Redundant non-colour cue on answer feedback: a ✓/✗ glyph badge (`data-mark`).
- Settings screen (sound / music / haptics / reduced motion / high contrast)
  behind a **parental gate**; choices persist.
- **AC met:** reduced motion disables the launch pan, camera shake, flyby FOV
  swell and rift pulse; an accurate pilot still wins (`access` suite).
- **AC met:** correctness is greyscale-distinguishable — the glyph is asserted present.

### 0.4 Music bed + haptics ✅
A low filtered drone that rises in pitch with flight speed; haptics on hit/answer.
- **AC met:** both respect the settings toggles (`audio` suite).

---

## Phase 1 — Retention slice (build inside the prototype, ~2 weeks)

**Goal:** find out if a real child comes back on day two. This is the highest-value
question in the project and you can answer it before any store work.

### 1.1 Crew collectibles (6 starters)
Per `01-product-spec.md`. Crew member **visibly rides** in the porthole/dome.
- **AC:** selected crew renders in both rocket and UFO.
- **AC:** each perk measurably applies (test: `+1 heart` → hp starts at 4).
- **AC:** perks never stack into trivialising the game — cap total perk effect.
- **AC:** crew unlock persists across sessions.

### 1.2 Daily Flight
Fixed daily seed, one attempt, 2× stars.
- **AC:** same seed → identical question/hazard sequence (assert determinism).
- **AC:** attempt consumed; resets at local midnight.
- **AC:** works offline.

### 1.3 Streaks + freeze tokens
- **AC:** streak increments once per local day.
- **AC:** freeze token consumed automatically on a missed day; 1 granted per week.
- **AC:** **no** loss-aversion messaging anywhere (manual review).

### 1.4 Sticker logbook + postcards
Auto-capture a still during the arrival flyby.
- **AC:** stickers award on feat, persist, never expire.
- **AC:** postcard saved per galaxy first-visit.

### 1.5 Daily quests (3 rotating)
- **AC:** quests target the child's weak skills once mastery exists (Phase 2), random before.

---

## Phase 2 — The product (~4 weeks)

**Goal:** the thing a parent would actually pay for.

### 2.1 Galaxy map
Replace the invisible mission cycle. Galaxies → star systems → 3-star ratings.
- **AC:** progress visible; unlock thresholds enforced.
- **AC:** 6 galaxies × 6–10 systems generated from `(skill × rule × galaxy × tier)`.
- **AC:** no hand-authored question banks.

### 2.2 Per-fact mastery (spaced repetition)
Per `02-curriculum.md`. Leitner boxes, due-fact injection at p≈0.35.
- **AC:** a fact answered wrong is re-served within the same mission (2–3 gates later).
- **AC:** a fact answered wrong is re-served next session.
- **AC:** simulation: a child who consistently misses `7×8` sees it more often than `2×2`.
- **AC:** mastery data survives migration and never crashes on unknown facts.

### 2.3 New galaxies + levels 14–17
Aurora Reach (times tables), Deep Fathom (division). Fractions/decimals ladder.
- **AC:** the 52k-question validation suite extends to the new levels and passes.

### 2.4 Patrols
Three-mission runs with a completion bonus.
- **AC:** quitting mid-patrol loses nothing but the bonus (no punishment for stopping).

### 2.5 Boss variety
Currently one boss archetype reskinned. Add 2–3 attack patterns (sweeping beam,
lane mines, shield phase requiring two correct in a row).
- **AC:** every pattern is winnable by a simulated pilot at its minimum level.

---

## Phase 3 — Shipping (~4–6 weeks)

### 3.1 Native wrap
Expo + react-three-fiber, **or** WebView/PWA fallback (see `03-architecture.md`).
- **AC:** 60fps on a mid-range 3-year-old Android phone.
- **AC:** context-loss recovery works on device.

### 3.2 Accounts + child profiles
Parent holds the account. Children are profiles. Local-first + sync.
- **AC:** fully playable offline; sync reconciles without losing stars (max-merge).
- **AC:** children have no credentials.

### 3.3 Parent dashboard
Per-skill accuracy, facts mastered/shaky, practice minutes, streak.
- **AC:** behind a parental gate.
- **AC:** shows a real, computed trend — not a vanity chart.

### 3.4 Compliance pass
Work `05-compliance.md` end to end. Legal review.

### 3.5 Monetization
RevenueCat. Free tier = 2 galaxies. Premium unlock.
- **AC:** parental gate before purchase; restore works; no currency sold to children.

---

## Phase 4 — Growth

- Weekly parent email
- Store editorial pitch (Apple Kids)
- ASO
- **Then** school pilots (teacher dashboard, class codes, printable reports)

---

## Known-good decisions to carry forward

Do not re-litigate these without re-measuring — see the table in `CLAUDE.md`.
The short version: HUD answer strip (1.1s → 9.2s of thinking time), speed scaled by
level, guards/boss-beams gated to level 4+, no zero decoys for pre-schoolers,
`visibility:hidden` on hidden overlays, render throttle on menus, LRU texture cache,
context-loss handling.

## Open questions worth a real playtest

1. Is 9.2s at level 1 *too* long — does a 4-year-old get bored before the gate arrives?
2. Is the 4.6s arrival flyby glorious or one second too long by mission ten?
   (Make it skippable like the launch cinematic if it wears.)
3. Does the launch cinematic survive repetition, or should retries skip it entirely?
4. Do the lane beacons read as lanes to a child, or just as decoration?
5. Guard distance is 16 units ahead of the gate — is dodge-and-return achievable at L10+?
