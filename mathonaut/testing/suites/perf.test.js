// perf — the mobile survival rules (docs/03-architecture.md), each of which
// fixed a real reported crash:
//   - render throttles + DPR drops to 1 while an overlay is up
//   - answer-sign textures are LRU-cached, bounded at 48
//   - webglcontextlost is handled (stop rendering, recover on restore)
const { createHarness } = require("../harness.js");
const { playMission, launchIntoRun } = require("../autopilot.js");
const A = require("../assert.js");

(async () => {
  const H = createHarness();
  await H.boot();

  A.section("render throttle on menus");
  // On the menu (an overlay), only ~1 in 4 frames should actually render.
  H.settle(4);
  const drawsBeforeMenu = H.D().draws;
  H.settle(24);
  const drawsMenu = H.D().draws - drawsBeforeMenu;
  A.ok(drawsMenu <= 24 / 3, "menu renders are throttled (" + drawsMenu + " draws over 24 frames)");

  // In flight, every frame renders.
  H.tap("missionBtn");
  launchIntoRun(H);
  H.settle(4);
  const drawsBeforeRun = H.D().draws;
  H.settle(24);
  const drawsRun = H.D().draws - drawsBeforeRun;
  A.ok(drawsRun >= 20, "flight renders every frame (" + drawsRun + " draws over 24 frames)");
  A.ok(drawsRun > drawsMenu, "flight renders more than the throttled menu");

  A.section("DPR drops to 1 behind an overlay");
  // We're in flight now; DPR is at its cap. Returning to an overlay drops it.
  const dprFlight = H.D().dpr;
  const r = await playMission(H);
  if (r.win) H.tap("homeBtn1"); else H.tap("homeBtn2");
  H.settle(8);
  A.ok(H.D().dpr <= 1, "DPR is 1 on the menu overlay (" + H.D().dpr + ")");

  A.section("answer-sign texture cache is bounded");
  // Play a couple more missions to churn plenty of answer signs, then assert the
  // LRU cache never exceeds its cap of 48.
  let maxCache = H.D().signCache;
  for (let m = 0; m < 2; m++) {
    H.tap("missionBtn");
    launchIntoRun(H);
    const rr = await playMission(H, {
      onFrame: (d) => { maxCache = Math.max(maxCache, d.signCache); },
    });
    if (rr.win) H.tap("homeBtn1"); else H.tap("homeBtn2");
  }
  A.ok(maxCache > 0, "answer-sign textures are cached (peak " + maxCache + ")");
  A.ok(maxCache <= 48, "texture cache never exceeds its LRU cap of 48 (peak " + maxCache + ")");

  A.section("WebGL context-loss recovery");
  H.tap("missionBtn");
  launchIntoRun(H);
  const canvas = H.root.querySelector("canvas");
  A.ok(!!canvas, "canvas exists");
  const drawsPreLoss = H.D().draws;
  // fire the loss event the browser would fire on a GPU reset
  const lost = new H.window.Event("webglcontextlost", { cancelable: true });
  canvas.dispatchEvent(lost);
  H.settle(10);
  A.ok(H.D().contextLost === true, "context loss is registered");
  const drawsDuringLoss = H.D().draws;
  H.settle(10);
  A.eq(H.D().draws, drawsDuringLoss, "rendering halts while the context is lost");
  // restore
  canvas.dispatchEvent(new H.window.Event("webglcontextrestored"));
  H.settle(10);
  A.ok(H.D().contextLost === false, "context restore clears the flag");
  A.ok(H.D().draws > drawsDuringLoss, "rendering resumes after restore");

  A.section("clean run");
  A.eq(H.errors.length, 0, "no runtime errors");

  H.dispose();
  A.done("perf");
})();
