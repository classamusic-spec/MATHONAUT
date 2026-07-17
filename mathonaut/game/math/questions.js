/* ============================================================
   MATHONAUT — question generator (pure, framework-free)

   Lifted verbatim from the prototype's in-closure math block so it can be
   unit-tested in isolation (the `math` suite fires 52k generated questions
   at it). No THREE, no DOM, no React — just numbers.

   Design decisions encoded here (see CLAUDE.md — do not casually undo):
   - L1–L2 need no arithmetic: a 4-year-old plays by recognising and counting.
   - Decoys stay in the child's number world ("Find 3" never offers 13 at L1–6).
   - No zero as a decoy at L1–2 (zero is genuinely confusing at age 4).
   ============================================================ */

export const ri = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
export const pick = (a) => a[ri(0, a.length - 1)];

// A real early-years ladder. L1-L2 need no arithmetic at all — a 4-year-old
// can play by recognising and counting. Difficulty adapts along this ladder.
export const LEVELS = [
  "Number Spotting", "Counting", "Adding to 5", "Adding to 10",
  "Taking Away to 5", "Taking Away to 10", "Doubles & Tens", "Adding to 20",
  "Skip Counting", "Times 2 to 5", "Times to 9", "Sharing & Missing", "Times to 12",
  "Greater or Less", "Compare to 20",
];
export const MAX_LEVEL = LEVELS.length;   // 13
export const levelName = (l) => LEVELS[Math.min(LEVELS.length, Math.max(1, l)) - 1];

export function genQuestion(level) {
  let text, ans, sub = "FLY THROUGH THE ANSWER";
  const L = Math.min(MAX_LEVEL, Math.max(1, level));
  if (L === 1) {                                   // pure number recognition
    ans = ri(1, 9);
    text = "Find  " + ans;
    sub = "FIND THIS NUMBER";
  } else if (L === 2) {                            // counting objects
    ans = ri(1, 5);
    text = "★ ".repeat(ans).trim();
    sub = "HOW MANY STARS?";
  } else if (L === 3) {                            // sums to 5
    const a = ri(1, 3), b = ri(1, 5 - a);
    text = a + " + " + b + " = ?"; ans = a + b; sub = "ADD THEM UP";
  } else if (L === 4) {                            // sums to 10
    const a = ri(1, 6), b = ri(1, 10 - a);
    text = a + " + " + b + " = ?"; ans = a + b; sub = "ADD THEM UP";
  } else if (L === 5) {                            // subtraction within 5
    const a = ri(2, 5), b = ri(1, a - 1);
    text = a + " − " + b + " = ?"; ans = a - b; sub = "TAKE IT AWAY";
  } else if (L === 6) {                            // subtraction within 10
    const a = ri(4, 10), b = ri(1, a - 1);
    text = a + " − " + b + " = ?"; ans = a - b; sub = "TAKE IT AWAY";
  } else if (L === 7) {                            // doubles and tens
    if (Math.random() < 0.5) { const a = ri(1, 6); text = a + " + " + a + " = ?"; ans = a * 2; sub = "DOUBLE IT"; }
    else { const a = ri(1, 9); text = "10 + " + a + " = ?"; ans = 10 + a; sub = "ADD TO TEN"; }
  } else if (L === 8) {                            // within 20
    if (Math.random() < 0.55) { const a = ri(5, 14), b = ri(2, 20 - a); text = a + " + " + b + " = ?"; ans = a + b; }
    else { const a = ri(10, 20), b = ri(2, 9); text = a + " − " + b + " = ?"; ans = a - b; }
    sub = "ADD OR TAKE AWAY";
  } else if (L === 9) {                            // skip counting
    const step = pick([2, 5, 10]), st = step * ri(1, 3);
    text = [st, st + step, st + step * 2].join(", ") + ", ?";
    ans = st + step * 3; sub = "WHAT COMES NEXT?";
  } else if (L === 10) {                           // times 2-5
    const a = ri(2, 5), b = ri(2, 6);
    text = a + " × " + b + " = ?"; ans = a * b; sub = "MULTIPLY";
  } else if (L === 11) {                           // times to 9
    const a = ri(3, 9), b = ri(3, 9);
    text = a + " × " + b + " = ?"; ans = a * b; sub = "MULTIPLY";
  } else if (L === 12) {                           // division / missing number
    if (Math.random() < 0.5) { const b = ri(2, 6), v = ri(2, 9); text = b * v + " ÷ " + b + " = ?"; ans = v; sub = "SHARE IT OUT"; }
    else { const a = ri(2, 9), v = ri(2, 9); text = a + " × ? = " + a * v; ans = v; sub = "FIND THE MISSING NUMBER"; }
  } else if (L === 13) {                           // times to 12, mixed
    if (Math.random() < 0.6) { const a = ri(6, 12), b = ri(6, 12); text = a + " × " + b + " = ?"; ans = a * b; sub = "MULTIPLY"; }
    else { const b = ri(3, 9), v = ri(4, 12); text = b * v + " ÷ " + b + " = ?"; ans = v; sub = "SHARE IT OUT"; }
  } else {                                         // L14/L15: greater / less / equal
    // The answer is a COMPARISON SYMBOL, not a number — fly through <, > or =.
    // We short-circuit the numeric decoy machinery below: the three options are
    // always the three symbols, shuffled, so the correct lane still varies.
    const hi = L >= 15 ? 20 : 10;
    const a = ri(1, hi);
    let b = ri(1, hi);
    if (Math.random() < 0.28) b = a;               // make "=" a genuine answer ~1/3 of the time
    const answer = a > b ? ">" : a < b ? "<" : "=";
    const options = ["<", ">", "="].sort(() => Math.random() - 0.5);
    return {
      text: a + "  □  " + b, sub: "BIGGER, SMALLER, OR EQUAL?",
      answer, options, correctLane: options.indexOf(answer),
    };
  }

  // Distractors must stay in the child's number world — "Find 3" must never
  // offer 13 as a decoy to a four-year-old.
  const opts = new Set([ans]);
  const cands = L <= 6
    ? [ans + 1, ans - 1, ans + 2, ans - 2, ans + 3, ans - 3]
    : [ans + 1, ans - 1, ans + 2, ans - 2, ans + 10, ans - 10, ans * 2, Math.max(0, Math.floor(ans / 2))];
  const floor = L <= 2 ? 1 : 0;      // no zero decoys for pre-schoolers
  let guard = 0;
  while (opts.size < 3 && guard++ < 200) {
    const c = Math.random() < 0.8 ? pick(cands) : ans + ri(-4, 4);
    if (c >= floor && !opts.has(c)) opts.add(c);
  }
  let filler = Math.max(floor, ans + 1);
  while (opts.size < 3) { if (!opts.has(filler)) opts.add(filler); filler++; }  // never hang
  const options = [...opts].sort(() => Math.random() - 0.5);
  return { text, sub, answer: ans, options, correctLane: options.indexOf(ans) };
}
