// The auto-pilot (see testing/README.md) — the most valuable piece of the
// harness. It reads telemetry and plays: dodge beams, dodge hazards, fly
// through the correct answer, gather quantity when a mission asks for it, and
// spend Overdrive. Vary `sloppy` to model a struggling child.
//
// Returns { win, fail, timeout, frames, info } for a single mission.
// Async: on WIN/FAIL it yields to real time so the result overlay (revealed by
// a real setTimeout) actually appears, otherwise the home button can't return
// to the menu and the next mission never starts.
// Pick the lane the pilot wants to be in this frame. Getting the ANSWER matters
// as much as surviving: a pilot that only dodges wins the mission but with poor
// accuracy and never levels up. So we fly through the answer whenever it's not a
// beam, dodging a guard only at the last moment and returning immediately.
// Beams are the hard constraint; a lone guard on the answer lane we ride into
// (and smash with Overdrive when we have it).
function chooseLane(d, missThisGate) {
  const danger = new Set([d.beamLane, d.beamLane2].filter((x) => x != null && x >= 0));
  const invuln = d.odActive > 0;                       // Overdrive smashes through everything
  const beamSafe = (l) => invuln || !danger.has(l);
  const nearestOnMe = d.threatLane === d.lane && !invuln;

  // Aim point.
  let target = null;
  if (d.phase === "quantity") {
    // Collect "exactly N": undershoot AND overshoot are wrong. Once we have
    // enough, the star lane becomes a hazard — vacate it and stay off, or we
    // pick up an extra and fail the count.
    if (d.qtyHave < d.qtyNeed) target = d.starLane;
    else if (d.starLane != null && (d.starLane === d.lane))
      target = [0, 1, 2].find((l) => l !== d.starLane && beamSafe(l) && l !== d.threatLane);
    else target = d.lane;   // hold in a starless lane
  } else if (d.gateLane != null) {
    target = missThisGate
      ? [0, 1, 2].find((l) => l !== d.gateLane && beamSafe(l))
      : d.gateLane;
  }

  // Hard constraint first: never sit in a beam we can leave.
  if (danger.has(d.lane) && !invuln) {
    if (target != null && beamSafe(target)) return target;
    const s = [0, 1, 2].filter(beamSafe);
    return s.length ? s[0] : d.lane;
  }

  // A hazard is about to hit our exact lane. Step aside — but toward the target
  // if we can, and never into a beam. If we have Overdrive and we're on the
  // answer lane, we'd rather smash through than abandon the answer (handled by
  // the OD logic in playMission), so only bail when we can't smash.
  if (nearestOnMe) {
    const onAnswer = target === d.lane;
    if (onAnswer && d.od >= 1) return d.lane;           // hold; OD will smash the guard
    const opts = [0, 1, 2].filter((l) => l !== d.lane && beamSafe(l) && l !== d.threatLane);
    if (target != null && opts.includes(target)) return target;
    if (opts.length) return opts[0];
    return d.lane;
  }

  // Clear to fly: go to the answer/target if it isn't a beam.
  if (target != null && beamSafe(target)) return target;
  return d.lane;
}

async function playMission(H, opts = {}) {
  const { D, frame, tap, steerTo } = H;
  const sloppy = opts.sloppy || 0;          // 0 = accurate; >0 = deliberately wrong that fraction of gates
  const maxFrames = opts.maxFrames || 200000;
  const onFrame = opts.onFrame;
  const info = { beamDodges: 0, gatesAnswered: 0, wrongOnPurpose: 0 };
  let gateSeen = -1;
  let f = 0;
  while (f++ < maxFrames) {
    frame();
    const d = D();
    if (!d) continue;
    if (onFrame) onFrame(d, H);
    if (d.state === "RUN") {
      // Decide once per gate whether to deliberately miss it (models a struggling child).
      let missThisGate = false;
      if (sloppy > 0 && d.gateLane != null && d.gatesDone !== gateSeen) {
        gateSeen = d.gatesDone;
        missThisGate = (d.gatesDone % Math.max(2, Math.round(1 / sloppy))) === 0;
        if (missThisGate) info.wrongOnPurpose++;
      } else if (sloppy > 0 && d.gateLane != null) {
        // keep the same decision for the duration of this gate
        missThisGate = (d.gatesDone % Math.max(2, Math.round(1 / sloppy))) === 0;
      }
      // Fine-grained steering: act every frame so dodge-and-return is achievable
      // even at high level speed.
      const want = chooseLane(d, missThisGate);
      if (want !== d.lane) { steerTo(want); if ([d.beamLane, d.beamLane2].includes(d.lane)) info.beamDodges++; }
      // Spend Overdrive DEFENSIVELY: its smash makes the ship invulnerable, so
      // fire it when a hit is imminent and can't be dodged (threat on our lane,
      // or a beam we can't leave). Firing it the instant it charges wastes the
      // invulnerability — the reason a merely-charged pilot still died at L5.
      if (d.od >= 1 && d.odActive <= 0) {
        const danger = [d.beamLane, d.beamLane2].filter((x) => x != null && x >= 0);
        const trappedInBeam = danger.includes(d.lane) && danger.includes(want);
        const hitImminent = d.threatLane === d.lane;   // smash it (and keep the answer lane)
        if (trappedInBeam || hitImminent) tap("odBtn");
      }
    }
    if (d.state === "FAIL") { await H.wait(800); H.settle(); return { fail: true, frames: f, info }; }
    if (d.state === "WIN") { await H.wait(1000); H.settle(); return { win: true, frames: f, info }; }
  }
  return { timeout: true, frames: f, info };
}

// Drive from the briefing screen through the launch cinematic into RUN.
function launchIntoRun(H) {
  H.tap("launchBtn");
  let g = 0;
  while (g++ < 1200) { H.frame(); const d = H.D(); if (d && d.state === "RUN") break; }
  H.settle();
}

module.exports = { playMission, launchIntoRun };
