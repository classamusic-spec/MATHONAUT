// dispose — createGame must return a dispose() that tears everything down: the
// RAF loop stops, event listeners go inert, and the sign-texture cache/renderer
// are released. A leak here is exactly the class of bug CLAUDE.md warns about
// (a remounted-but-not-disposed canvas reads as a crash).
const { createHarness } = require("../harness.js");
const { launchIntoRun } = require("../autopilot.js");
const A = require("../assert.js");

(async () => {
  const H = createHarness();
  await H.boot();

  A.section("the game is live before dispose");
  H.tap("missionBtn");
  launchIntoRun(H);
  H.settle(10);
  const before = H.D();
  A.eq(before.state, "RUN", "flying before dispose");
  const drawsBefore = before.draws;
  H.settle(6);
  A.ok(H.D().draws > drawsBefore, "the render loop is advancing");
  A.ok(H.D().signCache >= 0, "sign cache is populated (" + H.D().signCache + ")");

  A.section("dispose stops the loop");
  H.dispose();
  const frozen = H.D();
  const drawsAtDispose = frozen.draws;
  H.settle(30);                     // keep pumping frames…
  A.eq(H.D().draws, drawsAtDispose, "no further renders after dispose (RAF cancelled)");
  A.eq(H.D().state, frozen.state, "telemetry is frozen (update loop stopped)");

  A.section("listeners are inert after dispose");
  const errsBefore = H.errors.length;
  // fire the inputs that used to steer / start the game
  H.key("ArrowLeft");
  H.key(" ");
  H.swipe(-120);
  H.tapRaw("missionBtn");
  H.settle(6);
  A.eq(H.errors.length, errsBefore, "post-dispose input causes no errors");
  A.eq(H.D().draws, drawsAtDispose, "post-dispose input does not restart the loop");

  A.section("dispose is clean and idempotent");
  H.dispose();                       // calling twice must not throw
  A.eq(H.errors.length, errsBefore, "a second dispose is a no-op, not a crash");

  A.done("dispose");
})();
