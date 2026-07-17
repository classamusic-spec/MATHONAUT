// access — the Phase 0.3 accessibility blockers (docs/06 0.3, docs/05-compliance):
//   - a redundant, non-colour cue (glyph) on answer feedback, greyscale-legible
//   - a settings screen (sound/music/haptics/reduced motion/high contrast) behind
//     a parental gate, persisted across sessions
//   - reduced motion disables the pan/shake/swell/pulse, game still winnable
const { createHarness } = require("../harness.js");
const { launchIntoRun, playMission } = require("../autopilot.js");
const A = require("../assert.js");

(async () => {
  const H = createHarness({ seedSave: { mathLevel: 1 } });
  await H.boot();

  A.section("answer feedback has a non-colour cue");
  H.tap("missionBtn");
  launchIntoRun(H);
  let marks = null;
  for (let i = 0; i < 5000 && !marks; i++) {
    H.frame();
    const d = H.D();
    if (d.state !== "RUN") break;
    const m = [...H.root.querySelectorAll("#ansStrip .ans")].filter((a) => a.getAttribute("data-mark"));
    if (m.length) marks = m.map((a) => ({ mark: a.getAttribute("data-mark"), right: a.classList.contains("right") }));
    else if (d.gateLane != null) H.steerTo(d.gateLane);
  }
  A.ok(!!marks, "a resolved gate carries feedback glyphs");
  if (marks) {
    const correct = marks.find((m) => m.right);
    A.ok(correct && correct.mark === "✓", "the correct answer shows a ✓ (greyscale-distinguishable, not colour-only)");
    A.ok(marks.every((m) => m.mark === "✓" || m.mark === "✗"), "every mark is a ✓ or ✗ glyph");
  }
  H.dispose();

  // ---- settings behind a parental gate ----
  const H2 = createHarness();
  await H2.boot();

  A.section("settings sit behind a parental gate");
  A.ok(H2.$("setOv").classList.contains("hidden"), "settings start hidden");
  H2.tap("settingsBtn");
  A.ok(!H2.$("gateOv").classList.contains("hidden"), "tapping settings opens the grown-up gate");
  A.ok(H2.$("setOv").classList.contains("hidden"), "settings are NOT open yet");
  // a wrong answer does not open settings
  const wrong = [...H2.root.querySelectorAll("#gateOpts button")].find((b) => !b.getAttribute("data-correct"));
  H2.tap(wrong);
  A.ok(H2.$("setOv").classList.contains("hidden"), "a wrong gate answer keeps settings closed");
  // the correct answer does
  const right = [...H2.root.querySelectorAll("#gateOpts button")].find((b) => b.getAttribute("data-correct"));
  H2.tap(right);
  A.ok(!H2.$("setOv").classList.contains("hidden"), "the correct gate answer opens settings");

  A.section("all five toggles exist and flip");
  const keys = ["sound", "music", "haptics", "reduceMotion", "highContrast"];
  for (const k of keys) {
    const t = H2.$("tgl-" + k);
    A.ok(!!t, "toggle for " + k + " exists");
    const before = t.classList.contains("on");
    H2.tap(t);
    A.ok(t.classList.contains("on") !== before, k + " flips on tap");
  }
  A.ok(H2.root.classList.contains("rm"), "reduced-motion toggle adds the .rm root class");
  A.ok(H2.root.classList.contains("hc"), "high-contrast toggle adds the .hc root class");

  A.section("settings persist across sessions");
  H2.tap("setDone");
  await H2.wait(30);
  const saved = JSON.parse(H2.store["mathonaut-save"] || "{}").settings || {};
  A.ok(saved.sound === false, "sound choice persisted");
  A.ok(saved.reduceMotion === true, "reduced-motion choice persisted");
  A.ok(saved.highContrast === true, "high-contrast choice persisted");
  H2.dispose();

  // ---- reduced motion behaviour ----
  A.section("reduced motion disables the launch vista pan");
  const store = H2.store;   // reuse the persisted save (reduceMotion is on)
  const H3 = createHarness({ seedSave: JSON.parse(store["mathonaut-save"]) });
  await H3.boot();
  A.eq(!!(JSON.parse(store["mathonaut-save"]).settings.reduceMotion), true, "session starts with reduced motion on");
  H3.tap("missionBtn");
  H3.tap("launchBtn");
  H3.settle(4);
  // With the pan skipped, the cinematic clock starts already past the pan segment.
  A.ok(H3.D().cineT >= 4, "the sweeping pan is skipped (cineT starts past it: " + H3.D().cineT + ")");
  H3.dispose();

  A.section("reduced motion is still winnable");
  const H4 = createHarness({ seedSave: { mathLevel: 1, settings: { sound: false, music: false, haptics: false, reduceMotion: true, highContrast: true } } });
  await H4.boot();
  H4.tap("missionBtn");
  launchIntoRun(H4);
  const r = await playMission(H4);
  A.ok(r.win, "an accurate pilot still wins with reduced motion + high contrast on");
  A.eq(H4.errors.length, 0, "no runtime errors with accessibility settings on");
  H4.dispose();

  A.done("access");
})();
