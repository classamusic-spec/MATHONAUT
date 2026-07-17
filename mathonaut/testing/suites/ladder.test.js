// ladder — a simulated learner who is accurate at their level must climb the
// ladder without jamming. This is the suite that would have caught the "learner
// jams at level 2" bug (a four-year-old stuck in a fail loop being beamed).
//
// The climb is stochastic (random questions, guards, a boss), so we don't assert
// a fixed mission count — we let an accurate pilot keep flying and assert it
// reaches level 7 and never gets permanently stuck.
const { createHarness } = require("../harness.js");
const { playMission, launchIntoRun } = require("../autopilot.js");
const A = require("../assert.js");

const TARGET = 7;        // README: a learner climbs 1 -> 7+
const MAX_MISSIONS = 30; // early-stops at L7; measured worst case is ~19 missions
const JAM_LIMIT = 18;    // this many missions with no new level == a real jam (a legit climb never plateaus this long)

(async () => {
  const H = createHarness();
  await H.boot();

  const rows = [];
  let maxLevel = 1, sinceProgress = 0, jammedAt = null;
  for (let m = 0; m < MAX_MISSIONS && maxLevel < TARGET; m++) {
    H.tap("missionBtn");
    const lvl = H.D().mathLevel;
    launchIntoRun(H);
    const r = await playMission(H, { maxFrames: 120000 });
    rows.push({ lvl, res: r.win ? "WIN" : r.fail ? "FAIL" : "TIMEOUT" });
    if (r.win) H.tap("homeBtn1"); else H.tap("homeBtn2");

    const now = H.D().mathLevel;
    if (now > maxLevel) { maxLevel = now; sinceProgress = 0; }
    else if (++sinceProgress >= JAM_LIMIT && jammedAt == null) jammedAt = maxLevel;
  }

  console.log("\n  climb: " + rows.map((r) => "L" + r.lvl + r.res[0]).join(" "));

  A.section("a learner climbs the ladder");
  A.eq(rows.filter((r) => r.res === "TIMEOUT").length, 0, "every mission resolved (no timeouts)");
  A.eq(jammedAt, null, "the learner never jams (no " + JAM_LIMIT + "-mission stall)");
  A.ok(maxLevel >= TARGET, "an accurate learner reaches level " + TARGET + " (got L" + maxLevel + " in " + rows.length + " missions)");
  A.ok(maxLevel > rows[0].lvl, "progression climbs (L" + rows[0].lvl + " -> L" + maxLevel + ")");

  A.section("no jam at the low levels");
  // The classic bug: an accurate learner should never fail the pre-arithmetic levels.
  const lowFails = rows.filter((r) => r.lvl <= 3 && r.res === "FAIL");
  A.eq(lowFails.length, 0, "an accurate learner never fails at L1-3");

  A.section("clean run");
  A.eq(H.errors.length, 0, "no runtime errors across the whole climb");

  H.dispose();
  A.done("ladder");
})();
