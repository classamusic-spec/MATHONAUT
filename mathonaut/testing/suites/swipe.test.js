// swipe — the input rules learned the hard way (docs/03-architecture.md):
//   1. Hidden UI must be inert. Invisible centred LAUNCH/RETRY buttons once sat
//      live over the flight; a left swipe restarted the level.
//   2. A swipe is not a tap (buttons ignore gestures that travel > 12px).
//   3. Real swipes/taps still steer.
const { createHarness } = require("../harness.js");
const { launchIntoRun } = require("../autopilot.js");
const A = require("../assert.js");

(async () => {
  const H = createHarness();
  await H.boot();

  H.tap("missionBtn");
  launchIntoRun(H);
  A.section("mid-flight, hidden menu buttons are inert");
  A.eq(H.D().state, "RUN", "in flight");
  const scoreStart = H.D().score;
  // The menu / launch / retry buttons are hidden behind visibility:hidden while
  // flying. Firing them must NOT restart the level (the original bug: state
  // flipped back to CINE/BRIEF with score reset).
  H.tap("launchBtn");
  H.tap("homeBtn1");
  H.tap("homeBtn2");
  H.settle(8);
  A.eq(H.D().state, "RUN", "still flying — hidden buttons did nothing");

  A.section("a swipe over the flight does not restart the level");
  const before = H.D().state;
  H.swipe(-120);   // a big left drag, exactly the gesture that used to restart
  A.eq(H.D().state, before, "left swipe did not change game state");
  A.ok(H.D().state === "RUN", "still in RUN after the swipe");

  A.section("real controls still steer");
  // a keyboard arrow (an unambiguous discrete input) steers
  const lane0 = H.D().lane;
  H.key(lane0 === 2 ? "ArrowLeft" : "ArrowRight");
  H.settle(12);
  A.ok(H.D().lane !== lane0, "arrow key steers (" + lane0 + " -> " + H.D().lane + ")");

  // a real swipe steers proportionally
  const lane1 = H.D().lane;
  H.swipe(lane1 === 2 ? -90 : 90);
  A.ok(H.D().lane !== lane1, "a real swipe steers (" + lane1 + " -> " + H.D().lane + ")");

  A.section("tap the lane you want");
  const w = H.root.clientWidth;
  H.tapAt(w * 0.5);   // centre first so the next taps are unambiguous moves
  H.tapAt(w * 0.08);  // far left
  A.eq(H.D().lane, 0, "tapping the left third goes to lane 0");
  H.tapAt(w * 0.92);  // far right
  A.eq(H.D().lane, 2, "tapping the right third goes to lane 2");
  H.tapAt(w * 0.5);   // middle
  A.eq(H.D().lane, 1, "tapping the middle goes to lane 1");

  A.section("a long swipe can cross two lanes");
  H.tapAt(w * 0.08);            // start at lane 0
  A.eq(H.D().lane, 0, "reset to lane 0");
  H.swipe(w * 0.6);            // a big rightward drag
  A.eq(H.D().lane, 2, "a long right swipe crosses from lane 0 to lane 2");

  A.section("clean run");
  A.eq(H.errors.length, 0, "no runtime errors");

  H.dispose();
  A.done("swipe");
})();
