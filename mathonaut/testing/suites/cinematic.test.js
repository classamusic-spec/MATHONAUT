// cinematic — the launch sequence: a real 7-segment countdown 5 -> 1 with the
// correct segment patterns, then blast-off into flight, and it must be skippable.
const { createHarness } = require("../harness.js");
const A = require("../assert.js");

// The canonical 7-segment patterns (must match the game's SEG table).
const SEG = {
  5: ["a", "f", "g", "c", "d"],
  4: ["f", "g", "b", "c"],
  3: ["a", "b", "g", "c", "d"],
  2: ["a", "b", "g", "e", "d"],
  1: ["b", "c"],
};
const litSegments = (H) =>
  [...H.root.querySelectorAll("#seg7 .s")].filter((s) => s.classList.contains("on"))
    .map((s) => [...s.classList].find((c) => c.length === 1 && c !== "s")).sort();

(async () => {
  const H = createHarness();
  await H.boot();

  A.section("countdown 5 -> 1 with correct segment patterns");
  H.tap("missionBtn");
  H.tap("launchBtn");
  A.eq(H.D().state, "CINE", "launch enters the cinematic");

  const seenPatterns = {};
  const order = [];
  let blastSeen = false;
  let f = 0;
  while (f++ < 2000) {
    H.frame();
    const d = H.D();
    if (d.state !== "CINE") { if (d.state === "RUN") break; }
    const n = d.count;
    if (n >= 1 && n <= 5 && H.$("countdown").classList.contains("on")) {
      if (order[order.length - 1] !== n) order.push(n);
      if (!seenPatterns[n]) seenPatterns[n] = litSegments(H);
    }
    if (H.$("blastoff").classList.contains("on")) blastSeen = true;
  }

  // digits appear in descending order 5,4,3,2,1
  const descending = order.join(",");
  A.ok(order.includes(5) && order.includes(1), "counted through 5 and 1 (saw " + descending + ")");
  let monotonic = true;
  for (let i = 1; i < order.length; i++) if (order[i] > order[i - 1]) monotonic = false;
  A.ok(monotonic, "countdown descends (" + descending + ")");

  for (const n of [5, 4, 3, 2, 1]) {
    if (seenPatterns[n]) {
      A.ok(JSON.stringify(seenPatterns[n]) === JSON.stringify([...SEG[n]].sort()),
        "digit " + n + " lit the right segments (" + seenPatterns[n].join("") + ")");
    } else {
      A.ok(false, "digit " + n + " was displayed");
    }
  }

  A.section("blast-off into flight");
  A.ok(blastSeen, "blast-off banner fired");
  A.eq(H.D().state, "RUN", "cinematic hands off to flight");

  A.section("the cinematic is skippable");
  if (H.D().state === "RUN") { /* finish this mission cleanly */ }
  // Start another mission and skip immediately.
  // (return to menu first)
  let g = 0; while (g++ < 200 && H.D().state === "RUN") { H.frame(); }
  // drive it to a resolution isn't necessary — just re-open a brief via a fresh harness
  H.dispose();

  const H2 = createHarness();
  await H2.boot();
  H2.tap("missionBtn");
  H2.tap("launchBtn");
  A.eq(H2.D().state, "CINE", "second launch enters cinematic");
  // a tap/keypress during the cinematic skips straight to flight
  const start = H2.D().state;
  H2.key("ArrowLeft");
  H2.settle();
  let h = 0; while (h++ < 400 && H2.D().state === "CINE") { H2.frame(); }
  A.ok(H2.D().state === "RUN", "a tap skips the cinematic into flight (was " + start + ")");
  A.ok(h < 400, "skip reached flight quickly, bypassing the full countdown (" + h + " frames)");

  A.section("clean run");
  A.eq(H.errors.length + H2.errors.length, 0, "no runtime errors");
  H2.dispose();
  A.done("cinematic");
})();
