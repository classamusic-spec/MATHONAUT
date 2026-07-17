// journey — the destination planet closes in as gates are cleared (progress is
// visible), the arrival flyby sweeps the planet past the port side, and the
// journey resets between missions.
const { createHarness } = require("../harness.js");
const { playMission, launchIntoRun } = require("../autopilot.js");
const A = require("../assert.js");

(async () => {
  const H = createHarness();
  await H.boot();

  A.section("the destination approaches as gates are cleared");
  H.tap("missionBtn");
  launchIntoRun(H);
  A.eq(H.D().journey, 0, "journey starts at 0 at launch");
  const startGates = H.D().gatesDone;
  let maxJourney = 0, sawProgress = false;
  const early = H.D().journey;
  // fly until we've cleared a few gates, tracking journey growth
  let f = 0;
  while (f++ < 40000) {
    H.frame();
    const d = H.D();
    maxJourney = Math.max(maxJourney, d.journey);
    if (d.journey > early + 0.05) sawProgress = true;
    if (d.gatesDone >= startGates + 3) break;
    if (d.state !== "RUN") break;
  }
  A.ok(sawProgress, "journey advances as the mission progresses (reached " + maxJourney.toFixed(2) + ")");

  // finish the mission and confirm the flyby runs to the destination
  const r = await playMission(H);
  A.ok(r.win || r.fail, "mission resolved (" + (r.win ? "WIN" : "FAIL") + ")");
  if (r.win) {
    A.ok(maxJourney > early, "arrival journey exceeded the start");
  }
  if (r.win) H.tap("homeBtn1"); else H.tap("homeBtn2");

  A.section("journey resets between missions");
  H.tap("missionBtn");
  launchIntoRun(H);
  A.eq(H.D().journey, 0, "journey is reset to 0 for the next mission");

  A.section("clean run");
  A.eq(H.errors.length, 0, "no runtime errors");

  H.dispose();
  A.done("journey");
})();
