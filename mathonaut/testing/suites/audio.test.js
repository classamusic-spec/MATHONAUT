// audio — Phase 0.4: a music bed that rises with speed, and haptics on
// hit/answer. Both must respect the settings toggles. (The harness stubs
// AudioContext and navigator.vibrate so we can observe calls headlessly.)
const { createHarness } = require("../harness.js");
const { launchIntoRun, playMission } = require("../autopilot.js");
const A = require("../assert.js");

(async () => {
  // --- haptics respect the toggle ---
  A.section("haptics fire on answers/hits when enabled");
  const H = createHarness({ seedSave: { mathLevel: 1, settings: { sound: false, music: false, haptics: true, reduceMotion: false, highContrast: false } } });
  await H.boot();
  H.tap("missionBtn");
  launchIntoRun(H);
  await playMission(H);
  A.ok(H.vibes.length > 0, "navigator.vibrate was called during play (" + H.vibes.length + " times)");
  H.dispose();

  A.section("haptics stay silent when disabled");
  const H2 = createHarness({ seedSave: { mathLevel: 1, settings: { sound: false, music: false, haptics: false, reduceMotion: false, highContrast: false } } });
  await H2.boot();
  H2.tap("missionBtn");
  launchIntoRun(H2);
  await playMission(H2);
  A.eq(H2.vibes.length, 0, "navigator.vibrate is never called with haptics off");
  H2.dispose();

  // --- music bed ---
  A.section("the music bed plays in flight and rises with speed");
  // Instrument the fake AudioContext: capture oscillators + their frequency ramps.
  const oscFreqs = [];
  const origAC = H.window.AudioContext;
  const HM = createHarness({ seedSave: { mathLevel: 8, settings: { sound: true, music: true, haptics: false, reduceMotion: false, highContrast: false } } });
  // Wrap the context so we can watch the drone oscillator's frequency targets.
  const ctxs = [];
  const RealAC = HM.window.AudioContext;
  HM.window.AudioContext = HM.window.webkitAudioContext = function () {
    const c = new RealAC();
    const mkOsc = c.createOscillator.bind(c);
    c.createOscillator = () => {
      const o = mkOsc();
      const set = o.frequency.setTargetAtTime.bind(o.frequency);
      o.frequency.setTargetAtTime = (v, t, tc) => { oscFreqs.push(v); return set(v, t, tc); };
      return o;
    };
    ctxs.push(c);
    return c;
  };
  await HM.boot();
  HM.tap("missionBtn");
  launchIntoRun(HM);
  // fly a while so the drone tracks changing speed
  let f = 0;
  const seen = [];
  while (f++ < 3000) {
    HM.frame();
    const d = HM.D();
    if (d.state !== "RUN") break;
    if (d.gateLane != null) HM.steerTo(d.gateLane);
    if (f % 200 === 0) seen.push(oscFreqs.length);
  }
  A.ok(oscFreqs.length > 0, "the drone oscillator's pitch is driven while flying (" + oscFreqs.length + " updates)");
  const spread = oscFreqs.length ? Math.max(...oscFreqs) - Math.min(...oscFreqs) : 0;
  A.ok(spread > 1, "the drone pitch actually varies with speed (range " + spread.toFixed(1) + " Hz)");
  HM.window.AudioContext = origAC;
  HM.dispose();

  A.section("music does not play when muted");
  const oscFreqs2 = [];
  const HQ = createHarness({ seedSave: { mathLevel: 8, settings: { sound: true, music: false, haptics: false, reduceMotion: false, highContrast: false } } });
  const RealAC2 = HQ.window.AudioContext;
  HQ.window.AudioContext = HQ.window.webkitAudioContext = function () {
    const c = new RealAC2();
    const mkOsc = c.createOscillator.bind(c);
    c.createOscillator = () => {
      const o = mkOsc();
      const set = o.frequency.setTargetAtTime.bind(o.frequency);
      o.frequency.setTargetAtTime = (v, t, tc) => { oscFreqs2.push(v); return set(v, t, tc); };
      return o;
    };
    return c;
  };
  await HQ.boot();
  HQ.tap("missionBtn");
  launchIntoRun(HQ);
  for (let i = 0; i < 600; i++) { HQ.frame(); if (HQ.D().state !== "RUN") break; }
  A.eq(oscFreqs2.length, 0, "no drone pitch updates with music muted");
  HQ.dispose();

  A.done("audio");
})();
