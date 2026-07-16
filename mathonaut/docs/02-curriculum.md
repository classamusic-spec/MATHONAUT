# 02 — Curriculum

This is the part that makes Mathonaut an *app parents pay for* rather than a
maths-themed game. Treat it as the product, not a feature.

## The ladder (built — 13 levels)

Implemented in `genQuestion(level)` in the prototype. Validated across 52,000
generated questions: no duplicate options, answer always present, no negatives,
and levels 1–6 never exceed 20.

| L | Name | Form | Example | Age |
|---|---|---|---|---|
| 1 | Number Spotting | recognition, **no arithmetic** | `Find 4` → 2 / 7 / 4 | 4 |
| 2 | Counting | count objects | `★ ★ ★ = ?` → 3 / 1 / 2 | 4–5 |
| 3 | Adding to 5 | a+b ≤ 5 | `1 + 4 = ?` | 5 |
| 4 | Adding to 10 | a+b ≤ 10 | `6 + 3 = ?` | 5–6 |
| 5 | Taking Away to 5 | a−b, a ≤ 5 | `4 − 2 = ?` | 5–6 |
| 6 | Taking Away to 10 | a−b, a ≤ 10 | `10 − 6 = ?` | 6 |
| 7 | Doubles & Tens | a+a, 10+a | `6 + 6 = ?` | 6–7 |
| 8 | Adding to 20 | ± within 20 | `14 + 3 = ?` | 7 |
| 9 | Skip Counting | 2s/5s/10s patterns | `10, 20, 30, ?` | 7 |
| 10 | Times 2 to 5 | small × | `3 × 5 = ?` | 7–8 |
| 11 | Times to 9 | × to 9 | `6 × 3 = ?` | 8–9 |
| 12 | Sharing & Missing | ÷, missing number | `16 ÷ 2 = ?`, `4 × ? = 24` | 9 |
| 13 | Times to 12 | × to 12, mixed ÷ | `10 × 11 = ?` | 9–10 |

### Rules baked in — do not regress
- **L1–2 never offer 0** as a decoy.
- **L1–6 decoys** are ±1..±3 only — stay in the child's number world.
- **L7+ decoys** may use the plausible-error set (±1, ±2, ±10, ×2, ÷2) — these are
  *pedagogically useful* wrong answers, i.e. the mistakes children actually make.
- The distractor loop has a hard iteration guard and a deterministic filler. It must
  never be able to hang.

### Extension (phase 2)
| L | Name |
|---|---|
| 14 | Fractions — halves & quarters |
| 15 | Simple fractions of amounts |
| 16 | Decimals — tenths |
| 17 | Two-step problems |

## Adaptive difficulty (built)

- **Between missions:** accuracy ≥85% → level up. <50% → level down (with a kind note).
- **Within a mission — Support Mode:** ≤1 of last 3 correct → time slows 40% near
  gates and one wrong answer is dimmed out. Four straight correct turns it off.
  Support mode also **suppresses guards entirely**.
- A failed mission auto-enables support for the retry.

Difficulty also scales flight speed, hazard density/type, guard rate, and boss
aggression by level. See the table in `CLAUDE.md`.

---

## Galaxy map (to build — phase 2)

Replace the invisible mission cycle with a visible destination.

```
Galaxy (skill domain)
 └── Star System (mission)  ×6–10
      └── 3-star mastery rating
```

| Galaxy | Skill domain | Levels | Unlock |
|---|---|---|---|
| Verdant Nebula | Number sense — spotting, counting | 1–2 | free |
| Amber Drift | Adding | 3–4, 7 | free |
| Violet Expanse | Taking away | 5–6, 8 | 12★ |
| Crimson Void | Patterns & skip counting | 9 | 30★ |
| *(new)* Aurora Reach | Times tables | 10–11 | 60★ |
| *(new)* Deep Fathom | Sharing & division | 12–13 | 100★ |

**Why this is the highest-leverage structural change:** it converts "I played" into
"I'm 3 stars from the Crimson Void." Everything hangs off it — per-galaxy bests,
3-star completion goals, crew homes, and the free/paid boundary.

**Content maths:** because questions are procedural, a "level" is just
`(skill × mission rule × galaxy × difficulty tier)`. 13 skills × 4 rules × 6 galaxies
≈ 300+ distinct missions nearly free. The only handcrafted work is boss variants and
set pieces. **Do not hand-author question banks.**

---

## Per-fact mastery (to build — phase 2, the differentiator)

The game currently adapts *level* but not *facts*. Every gate answer is already
logged. That data is the product.

### Model
```ts
type FactStat = {
  fact: string;        // canonical key, e.g. "7x8", "13-6", "count:3"
  seen: number;
  correct: number;
  lastSeenAt: number;  // epoch ms
  strength: 0|1|2|3|4|5;  // Leitner box
};
```

### Algorithm (Leitner / spaced repetition, kept simple)
1. On a correct answer → `strength++` (cap 5). On wrong → `strength = max(0, strength-2)`.
2. Due interval by box: `[0, 2min, 1 day, 3 days, 1 week, 3 weeks]`.
3. When generating a gate: with p≈0.35, serve a **due fact** with `strength ≤ 2`
   instead of a fresh random one. Otherwise generate normally for the level.
4. A missed fact is re-served **2–3 gates later in the same mission**, then again
   next session.

This is spaced repetition wearing a spacesuit. It is the difference between "maths
game" and "app that provably teaches", and it is what the parent dashboard reports on.

### Parent-facing output
- Accuracy per **skill family** (adding, taking away, ×2 table…)
- Facts trending up / facts still shaky
- Practice minutes, sessions, streak
- "Ava has mastered 8 of 12 in the 5× table"

**Privacy:** all of this is child performance data. It stays local-first, syncs only
to the parent's own account, and is never used for ad targeting or shared with third
parties. See `05-compliance.md`.
