# 01 — Product Spec

## Core loop (already built)

```
Mission brief → Launch cinematic → Fly → Answer gate → Instant reward/consequence
  → repeat ×N → Boss fight → Arrival flyby → Stars + rating → Shop/progress → repeat
```

Moment-to-moment: **see challenge → choose a lane while flying → instant feedback →
use the reward to survive the next obstacle.**

### Built systems (reference implementation in `prototype/Mathonaut.jsx`)

| System | State | Notes |
|---|---|---|
| 3-lane flight, swipe/tap/arrow steering | Done | Lane snap ~0.1s, banking, pitch into slope |
| Answer gates (3 options, one per lane) | Done | HUD strip + 3D holographic signs |
| Quantity challenges ("collect exactly N") | Done | Every 3rd challenge |
| Guarded answers (hazard in front of correct lane) | Done | Level 4+ only |
| Overdrive (correct answers → smash-through burst) | Done | The math→power fusion |
| Boss with telegraphed lane beams + visible damage | Done | Level 4+ for beams; rages as it dies |
| 4 mission rule-sets | Done | Rescue / Cargo / Repair / Rift |
| 4 galaxy themes (sky, fog, stars, hazard mix) | Done | Retint the whole scene |
| Destination planet approach + arrival flyby | Done | Tied to gate progress |
| Star currency + shop | Done | 5 colours, UFO craft |
| Adaptive difficulty + support mode | Done | 13-level ladder |
| Launch cinematic + 7-segment countdown | Done | Skippable |
| Crash animation | Done | Spin, sparks, mini-explosion |

## The gap

A child who plays ~45 minutes has seen everything. Expansion is **not** "more of each" —
it is converting the existing ladder into three interlocking systems: a **map**, a
**collection**, and a **reason to return tomorrow**.

---

## 1. Crew — the primary collectible

**Why this one first:** collect-the-character is the strongest completion loop for ages
4–8, and Zippo already exists in the fiction as a rescued alien. Make him #1 of ~20.

### Rules
- A crew member is **visibly aboard** — riding in the rocket's porthole or the UFO's dome.
  This is the whole point. An invisible collectible is a number.
- Each has: name, one-line personality, a small **non-competitive perk**, a home galaxy.
- Rescued by completing specific missions, or by 3-starring a system.
- The child picks who rides along. Swapping is free.

### Starter crew (6 for the first slice)

| Name | Home | Perk | Personality |
|---|---|---|---|
| Zippo | Verdant Nebula | +1 heart | Wiggles when happy. Terrified of comets. |
| Bolt | Amber Drift | Overdrive lasts +0.6s | Talks fast. Has opinions about engines. |
| Pip | Verdant Nebula | Star magnet +0.3 | Very small. Very fast. Eats stars. |
| Grum | Crimson Void | Shield survives one extra hit | Slow, kind, enormous. |
| Vex | Violet Expanse | Sees one wrong answer dimmed | Knows things. Won't say how. |
| Nova | Amber Drift | +10% star payout | Was a cargo pilot. Retired. Bored. |

Perks must stay small and sideways — never "answers the question for you", never
stacking into a solved game.

### Data shape
```ts
type CrewMember = {
  id: string; name: string; galaxy: GalaxyId;
  perk: { kind: 'heart'|'odDur'|'magnet'|'shield'|'hint'|'payout'; value: number };
  blurb: string;
  unlock: { type: 'mission'|'stars'|'stickers'; ref: string };
};
```

---

## 2. Sticker logbook — the show-a-parent artefact

Kids show this page to adults. That is organic marketing, and it costs almost nothing.

- Stickers for **feats**, not grind: first double answered, a no-hit mission, every galaxy
  visited, 10 near-misses, first 3-star, rescued all of a galaxy's crew.
- **Postcards**: auto-capture a still at each planet flyby (the arrival sweep is already
  a scripted 4.6s camera move — perfect screenshot moment). Store to the logbook.
- Never expiring, never purchasable.

---

## 3. Hangar — the star sinks

Extends what exists (5 colours + UFO craft).

- Hulls / trail effects / engine horns / decals / cockpit toys
- **Cargo capsules**: earned (never bought) random cosmetics. Opening one is a
  small ceremony. This is the safe form of a loot box: no money touches it.
- Price ladder should keep a purchase roughly every 1–3 missions early, stretching later.

---

## 4. Incentives — the comeback loop

| Feature | Shape | Why it works |
|---|---|---|
| **Daily Flight** | Fixed daily seed, one attempt, 2× stars, own leaderboard-free best | A reason that expires. The single strongest DAU lever. |
| **Streaks** | Days played in a row, with 1 free **freeze token** per week | Habit — but the freeze token is what stops it becoming guilt |
| **Daily quests** | 3 rotating: "answer 10 take-aways", "collect 15 stars in Amber Drift" | Directs practice at weak skills |
| **Weekly crew mission** | Your collected crew "requests" a destination | Ties collection back into play |
| **Parent weekly email** | "Ava practised subtraction 43× this week, accuracy +12%" | Retention *and* the monetization pitch |

**Forbidden:** loss-aversion timers, "your streak dies in 2 hours!", social comparison
between children.

---

## 5. Session shape

A mission is ~90s. There is no arc across a sitting. Add a **Patrol**: three missions
with escalating stakes and a completion bonus. That builds the "one more run" ramp
without any timer pressure.

---

## Priority for the first expansion slice

1. **Crew (6) + Daily Flight + streaks** — biggest retention lift, buildable inside the
   current prototype today
2. **Sticker logbook + postcards**
3. Galaxy map + per-fact mastery (see `02-curriculum.md`)
4. Patrols

## Still-missing polish (cheap, high impact)

- **Music bed.** A low drone that rises in pitch with speed would do more for felt
  motion than any visual. ~30 lines of Web Audio. Currently there is only SFX.
- **Haptics** on hits/answers (`navigator.vibrate`, or Expo Haptics natively).
- **Pilot name.** "Commander Ava" in mission briefs — trivially cheap personalisation
  that this age adores.
- **Accessibility blocker:** answer feedback is currently **colour-only** (green/red).
  Add shape/icon/position cues. See `05-compliance.md`.
