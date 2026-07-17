// kid — the level-1 experience for a four-year-old. The answer strip must be
// readable (it carries the answers, the 3D signs alone give only ~1.1s), there
// must be plenty of thinking time, no guards/hazards in front of the answer,
// and steering must track lanes.
const { createHarness } = require("../harness.js");
const { launchIntoRun, playMission } = require("../autopilot.js");
const A = require("../assert.js");

(async () => {
  const H = createHarness({ seedSave: { mathLevel: 1 } });
  await H.boot();
  A.eq(H.D().mathLevel, 1, "starting at level 1");

  H.tap("missionBtn");
  launchIntoRun(H);
  // fly forward until the first gate/answer strip is up
  let f = 0;
  while (f++ < 4000 && !H.$("ansStrip").classList.contains("on")) H.frame();

  A.section("answer strip is readable");
  A.ok(H.$("ansStrip").classList.contains("on"), "answer strip shows during approach");
  const ans = [...H.root.querySelectorAll("#ansStrip .ans")];
  A.eq(ans.length, 3, "three lane answers are shown");
  A.ok(ans.every((e) => e.textContent.trim().length > 0), "every lane answer has visible text");
  const nums = ans.map((e) => e.textContent.trim());
  A.ok(new Set(nums).size === 3, "the three answers are distinct: " + nums.join(", "));

  A.section("lane tracking");
  // Do this first, while we're plainly mid-flight — later sampling loops fly the
  // whole mission and steering only applies in RUN.
  A.eq(H.D().state, "RUN", "in flight");
  const d0 = H.D().lane;
  H.key(d0 === 0 ? "ArrowRight" : "ArrowLeft");
  H.settle(12);
  A.ok(H.D().lane !== d0, "steering moves the ship to another lane (" + d0 + " -> " + H.D().lane + ")");

  A.section("thinking time");
  // Measure how long the strip stays up before the gate is answered/passed.
  // Speed at L1 is 13 + 1*1.4 -> a long, gentle approach. Count frames the
  // strip is continuously visible from spawn.
  let visFrames = 0;
  const startGate = H.D().gatesDone;
  while (visFrames < 4000 && H.$("ansStrip").classList.contains("on") && H.D().gatesDone === startGate) {
    H.frame(); visFrames++;
  }
  const seconds = (visFrames * 16.7) / 1000;
  A.ok(seconds >= 6, "at least 6s of thinking time at L1 (measured " + seconds.toFixed(1) + "s)");

  A.section("no guards for pre-schoolers");
  // Design decision: guards (deliberate hazards placed in front of the correct
  // answer) only at level 4+. `guards` is a telemetry counter of guards spawned
  // this mission — it must stay 0 across a full, played-out L1 mission. (Sparse
  // ambient traffic still exists; guards are the deliberate dodge-to-answer kind.)
  let maxGuards = 0;
  const rL1 = await playMission(H, { onFrame: (d) => { maxGuards = Math.max(maxGuards, d.guards || 0); } });
  A.ok(rL1.win || rL1.fail, "the L1 mission played out (" + (rL1.win ? "WIN" : "FAIL") + ")");
  A.eq(maxGuards, 0, "no guards are ever spawned across a full L1 mission");

  A.section("clean run");
  A.eq(H.errors.length, 0, "no runtime errors");
  H.dispose();

  // Sanity: guards DO appear once the child is doing arithmetic with dodges (L5),
  // proving the counter isn't dead and the gating is real.
  const H5 = createHarness({ seedSave: { mathLevel: 6 } });
  await H5.boot();
  let guardsHi = 0;
  for (let m = 0; m < 4 && guardsHi === 0; m++) {
    H5.tap("missionBtn");
    launchIntoRun(H5);
    const rr = await playMission(H5, { onFrame: (d) => { guardsHi = Math.max(guardsHi, d.guards || 0); } });
    if (rr.win) H5.tap("homeBtn1"); else H5.tap("homeBtn2");
  }
  A.section("guards appear once arithmetic gets guarded (L6)");
  A.ok(guardsHi > 0, "guards are spawned at L6 (" + guardsHi + "), proving the L1 zero is real gating not a dead counter");
  H5.dispose();

  A.done("kid");
})();
