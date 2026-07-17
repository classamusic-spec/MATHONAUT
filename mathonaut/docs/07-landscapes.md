# 07 — Landscape Variety Plan

**Goal:** make each stretch of the game *look* like a different place, so a child
flying up the ladder feels like they're travelling through distinct regions of
space — not the same scene recoloured.

This is a plan, ordered cheapest-win-first. Each phase ships with a headless test,
per the project rule (`testing/README.md`).

---

## Where we are today

The scene already has a themable backdrop: `GALAXIES` in `game/index.js`. Each
galaxy is a full palette —

```
{ name, tag, sky:[gradient stops], fog, stars:[3], beacon:[2], streak,
  nebula:[2], planetTint, rim, mix:[hazard weights] }
```

`applyGalaxy(idx)` retints **sky, fog, star colours, rim light, nebulae, beacons,
streaks** and swaps the **hazard mix**. So the machinery for "a different-looking
region" exists and is proven.

**The two limits that make it feel samey:**
1. There are only **4** galaxies.
2. The galaxy is chosen by **mission count** (`save.missions % 4`), not by where
   the child *is* in the maths. A learner grinding level 1 sees the same handful
   of looks on repeat, and there's no sense of "I've reached a new place."

Everything below builds on `GALAXIES` — we are not starting from scratch.

---

## Phase A — Regions mapped to the ladder (cheap, highest impact) ✅ DONE

Give each **band of levels** its own region, and add palettes so there are enough
to go around.

**Shipped:** 8 galaxy palettes (added Frost Belt, Aurora Fields, Deep Fathom,
Ember Reach). The region now follows the child's math level via a `LEVEL_REGION`
map (1:1 onto all 8 regions); the mission's rules/boss still rotate per run. So
climbing the ladder journeys green → gold → ice → aurora → violet → deep blue →
crimson → ember. Covered by the `galaxy` suite (distinct valid region per band,
new region still winnable). Below is the original plan for reference.

- Add 3–4 more galaxy palettes (recolour only — same data shape): e.g. **Frost
  Belt** (pale cyan/white), **Ember Reach** (deep red/orange), **Aurora Fields**
  (green-magenta), **Deep Fathom** (abyssal blue). 6–8 total.
- Replace `save.missions % N` with a **level→region map**, e.g. L1–2 → Verdant,
  L3–4 → Amber, L5–6 → Violet, … so climbing visibly changes the sky. The
  arrival planet's `planetTint` already follows the galaxy, so destinations
  recolour for free.
- Keep a little per-mission variation *within* a band (rotate the accent) so it's
  not identical every run, but the band's identity dominates.

**AC**
- Each level band resolves to a distinct galaxy index (assert the map is total
  and 1:1 onto the region set).
- `applyGalaxy` leaves the scene valid for every new palette (no null texture,
  fog set, ≤ cache cap) — drive one mission per region headless, assert clean.
- Reduced-motion and the texture-cache/​context-loss rules still hold.

*Est: ~1 day. This alone is most of the felt improvement.*

---

## Phase B — Structural signatures, not just colour

Colour alone still reads as "same scene, new filter." Give each region **one
structural signature** so its silhouette differs:

- **Planet form** per region: ringed gas giant / binary suns / cracked moon /
  ice shard cluster. (`makePlanet` already takes style params — extend it.)
- **Decor field** per region: drifting asteroids (exists) vs. ice crystals vs.
  derelict hulls vs. jelly-glow motes. Pooled by kind, spawned from the region.
- **Beacon style**: the lane markers can be rings, chevrons, or buoys per region
  — a subtle but constant cue you're somewhere new.
- Lean on the existing **`mix`** hazard weights so regions also *play* a little
  differently (more comets in the Ember Reach, etc.), within the level's rules.

**AC**
- Each region declares a `signature` (planet form + decor kind + beacon style);
  assert every region has one and they're not all identical.
- A simulated pilot still wins at each region's minimum level (no signature makes
  a level unwinnable — the Dark Rift lesson).
- Decor stays pooled (no per-frame allocation; assert pool reuse).

*Est: ~3–4 days. This is where it stops looking like a reskin.*

---

## Phase C — A real horizon / sense of ground

"Landscape" implies a below, not just a starfield. Add an optional **low
element** per region that grounds the scene:

- A parallax **horizon silhouette** (distant ridgeline, city glow, reef) far
  down-scene, or a **nebula floor** the lanes skim over.
- Gentle parallax tied to speed (respecting reduced-motion → static).

**AC**
- The horizon never overlaps the answer strip or lanes (assert it stays below the
  play channel at 390×844).
- Off under reduced motion; frame time unchanged within budget.

*Est: ~3 days. Optional — do it only if A+B don't already sell "different place".*

---

## Phase D — Tie the set-pieces to the region

Make the region felt at the mission's edges too:

- **Arrival flyby**: the destination planet already uses `planetTint`; give each
  region a distinct arrival mood (ring pass, aurora sweep).
- **Boss arena**: retint the boss and its beams to the region so the fight reads
  as "here", not a floating asset.

**AC**
- Arrival + boss recolour per region; simulated win still holds at min level.

---

## Guardrails (do not regress)

Carry the hard-won rules (`CLAUDE.md`, `docs/03-architecture.md`) into all of this:

- **Texture cache stays bounded** (LRU 48). New planets/decor must reuse, not
  balloon GPU uploads → context loss.
- **Pool everything.** New decor is pooled by kind; no per-frame allocation.
- **Reduced motion** disables parallax/pulse; **high contrast** still legible.
- **Readability first.** No new element may sit over the answer strip or the
  incoming lanes.
- Every visual change ships a headless test that still proves a child can win.

## Suggested order

**A → B → (C/D as budget allows).** Phase A is the cheap 80%; B makes it real;
C/D are polish. Ship A, playtest, then decide how far into B/C to go.
