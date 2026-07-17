// Test runner. Each suite runs in its own child process (isolated globals — one
// game instance never leaks into the next) and gates on its exit code. Run via
// `npm test`, which first bundles the framework-free core to testing/game.cjs.
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const suiteDir = path.join(__dirname, "suites");
const bundle = path.join(__dirname, "game.cjs");

if (!fs.existsSync(bundle)) {
  console.error("\n  testing/game.cjs not found — run `npm run build:core` first (npm test does this automatically).\n");
  process.exit(2);
}

// Deterministic, meaningful order: math (no game) -> ladder -> systems -> the rest.
const order = ["math", "ladder", "systems", "kid", "access", "audio", "perf", "swipe", "cinematic", "journey", "dispose"];
const files = fs.readdirSync(suiteDir).filter((f) => f.endsWith(".test.js"));
const suites = order
  .map((n) => n + ".test.js")
  .filter((f) => files.includes(f))
  .concat(files.filter((f) => !order.includes(f.replace(".test.js", ""))));

console.log("\n================  MATHONAUT — headless suite  ================");
const results = [];
for (const f of suites) {
  const name = f.replace(".test.js", "");
  process.stdout.write("\n---- " + name + " ----");
  const r = spawnSync(process.execPath, [path.join(suiteDir, f)], { encoding: "utf8" });
  const out = (r.stdout || "") + (r.stderr || "");
  process.stdout.write(out.replace(/^/gm, "  ").replace(/^  \n/, "\n"));
  results.push({ name, ok: r.status === 0 });
}

console.log("\n================  summary  ================");
let allOk = true;
for (const res of results) {
  console.log("  " + (res.ok ? "PASS" : "FAIL") + "  " + res.name);
  if (!res.ok) allOk = false;
}
console.log("");
process.exit(allOk ? 0 : 1);
