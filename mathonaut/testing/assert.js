// Minimal assertion harness. Each suite is its own process: it accumulates
// checks, prints a report, and exits non-zero if anything failed (so CI and
// run.js can gate on it).
let passed = 0;
const failures = [];
let current = "";

function section(name) { current = name; console.log("\n  " + name); }

function ok(cond, msg) {
  if (cond) { passed++; console.log("    ✓ " + msg); }
  else { failures.push((current ? current + " — " : "") + msg); console.log("    ✗ " + msg); }
  return !!cond;
}

function eq(actual, expected, msg) {
  return ok(actual === expected, msg + "  (got " + JSON.stringify(actual) + ", want " + JSON.stringify(expected) + ")");
}

function done(suiteName) {
  console.log("\n  " + suiteName + ": " + passed + " passed, " + failures.length + " failed");
  if (failures.length) {
    console.log("\n  FAILURES:");
    failures.forEach((f) => console.log("    - " + f));
    process.exit(1);
  }
  process.exit(0);
}

module.exports = { section, ok, eq, done };
