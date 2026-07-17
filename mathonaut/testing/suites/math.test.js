// math — 52k generated questions. Asserts the invariants that keep the maths
// inside a child's world (see CLAUDE.md / docs/02-curriculum.md):
//   unique options, answer present, no negatives, L1-6 answers <= 20,
//   no zero decoys at L1-2, decoys stay in-world at L1-6.
const { genQuestion, LEVELS, MAX_LEVEL, levelName } = require("../game.cjs");
const A = require("../assert.js");

A.section("ladder wiring");
A.eq(MAX_LEVEL, 15, "15 levels");
A.eq(LEVELS.length, 15, "LEVELS has 15 entries");
A.eq(levelName(1), "Number Spotting", "L1 is Number Spotting");
A.eq(levelName(13), "Times to 12", "L13 is Times to 12");
A.eq(levelName(14), "Greater or Less", "L14 is Greater or Less");
A.eq(levelName(15), "Compare to 20", "L15 is Compare to 20");
A.eq(levelName(99), "Compare to 20", "out-of-range clamps high");
A.eq(levelName(0), "Number Spotting", "out-of-range clamps low");

A.section("52,000 generated questions");
const PER_LEVEL = 4000;
let total = 0;
const bad = {
  dupOptions: 0, answerMissing: 0, negative: 0, tooBigLow: 0,
  zeroDecoyLow: 0, outOfWorld: 0, wrongCorrectLane: 0, notThree: 0,
};
for (let L = 1; L <= MAX_LEVEL; L++) {
  for (let i = 0; i < PER_LEVEL; i++) {
    const q = genQuestion(L);
    total++;
    const opts = q.options;
    if (opts.length !== 3) bad.notThree++;
    if (new Set(opts).size !== opts.length) bad.dupOptions++;
    if (!opts.includes(q.answer)) bad.answerMissing++;
    if (opts.some((o) => o < 0)) bad.negative++;
    if (q.correctLane !== opts.indexOf(q.answer)) bad.wrongCorrectLane++;
    if (L <= 6 && q.answer > 20) bad.tooBigLow++;
    if (L <= 2 && opts.includes(0)) bad.zeroDecoyLow++;
    // Decoys stay in the child's number world at L1-6: never wildly far from the answer.
    if (L <= 6 && opts.some((o) => Math.abs(o - q.answer) > 6)) bad.outOfWorld++;
  }
}
A.eq(total, PER_LEVEL * MAX_LEVEL, "generated " + total + " questions");
A.eq(bad.notThree, 0, "every question has exactly 3 options");
A.eq(bad.dupOptions, 0, "no duplicate options");
A.eq(bad.answerMissing, 0, "the answer is always among the options");
A.eq(bad.wrongCorrectLane, 0, "correctLane always points at the answer");
A.eq(bad.negative, 0, "no negative options");
A.eq(bad.tooBigLow, 0, "L1-6 answers stay <= 20");
A.eq(bad.zeroDecoyLow, 0, "no zero decoys at L1-2");
A.eq(bad.outOfWorld, 0, "L1-6 decoys stay within 6 of the answer (in-world)");

A.section("comparison levels — greater / less / equal");
// L14/L15 answer a SYMBOL, not a number. Verify the three options are always
// the three symbols and the answer truly reflects the two numbers shown.
const cmp = { badOptions: 0, wrongSymbol: 0, noEqualSeen: {} };
for (const L of [14, 15]) {
  let sawEqual = false;
  for (let i = 0; i < 8000; i++) {
    const q = genQuestion(L);
    if ([...q.options].sort().join("") !== "<=>") cmp.badOptions++;
    if (q.options[q.correctLane] !== q.answer) cmp.wrongSymbol++;
    const m = q.text.match(/^(\d+)\s*□\s*(\d+)$/);
    if (!m) { cmp.wrongSymbol++; continue; }
    const a = +m[1], b = +m[2];
    const expect = a > b ? ">" : a < b ? "<" : "=";
    if (q.answer !== expect) cmp.wrongSymbol++;
    if (q.answer === "=") sawEqual = true;
    if (L === 14 && (a > 10 || b > 10)) cmp.wrongSymbol++;    // "to 10" stays <= 10
    if (L === 15 && (a > 20 || b > 20)) cmp.wrongSymbol++;    // "to 20" stays <= 20
  }
  cmp.noEqualSeen[L] = !sawEqual;
}
A.eq(cmp.badOptions, 0, "comparison options are always exactly <, > and =");
A.eq(cmp.wrongSymbol, 0, "the answer symbol always matches the two numbers (and stays in range)");
A.ok(!cmp.noEqualSeen[14] && !cmp.noEqualSeen[15], "'=' really occurs (equal pairs are generated)");

A.section("shape per level");
for (let L = 1; L <= MAX_LEVEL; L++) {
  const q = genQuestion(L);
  A.ok(typeof q.text === "string" && q.text.length > 0, "L" + L + " has question text");
  A.ok(typeof q.sub === "string", "L" + L + " has a sub-instruction");
}

A.done("math");
