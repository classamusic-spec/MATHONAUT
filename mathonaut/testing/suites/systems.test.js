// systems — the four mission rules are genuinely different, the boss beam
// telegraphs before it fires, the star economy pays out, and purchases persist.
const { createHarness } = require("../harness.js");
const { playMission, launchIntoRun } = require("../autopilot.js");
const A = require("../assert.js");

// Find the boss beam in the scene graph (the tall telegraph/fire cylinder).
function beam(H) {
  const s = H.scene();
  if (!s) return null;
  let b = null;
  s.traverse((o) => {
    if (!b && o.geometry && o.geometry.type === "CylinderGeometry" && o.geometry.parameters.height === 80) b = o;
  });
  return b;
}

(async () => {
  // Seed above level 4 so the boss actually fires — it deliberately holds fire
  // for pre-schoolers (a learner-sim once jammed in a fail loop being beamed at L2).
  const H = createHarness({ seedSave: { mathLevel: 6 } });
  await H.boot();

  A.section("economy — starting state");
  A.eq(H.wallet(), 0, "wallet starts empty (no currency sold to children)");
  const swatches = [...H.root.querySelectorAll(".sw")];
  A.ok(swatches.length > 0, "colour swatches exist (" + swatches.length + ")");
  const ufoBtn = H.root.querySelectorAll(".shipbtn")[1];
  A.ok(ufoBtn.classList.contains("locked"), "UFO is locked at start");
  H.tap(ufoBtn);
  A.ok(ufoBtn.classList.contains("locked"), "buying UFO with 0 stars is rejected (still locked)");

  A.section("four mission rules are distinct");
  const rules = new Set(), galaxies = new Set(), titles = new Set();
  let beamTelegraphs = 0, beamFires = 0;
  const walletBefore = H.wallet();
  let earnedAcross = 0;
  for (let m = 0; m < 4; m++) {
    H.tap("missionBtn");
    rules.add(H.$("brRule").textContent);
    galaxies.add(H.$("brGalaxy").textContent);
    titles.add(H.$("brTitle").textContent);
    const w0 = H.wallet();
    launchIntoRun(H);
    const r = await playMission(H, {
      onFrame: (d) => {
        const b = beam(H);
        if (b && b.visible) {
          beamTelegraphs++;
          if (b.material && b.material.opacity > 0.6) beamFires++;
        }
      },
    });
    A.ok(r.win || r.fail, "mission " + (m + 1) + " resolved (" + (r.win ? "WIN" : "FAIL") + ")");
    if (r.win) earnedAcross += H.wallet() - w0;
    if (r.win) H.tap("homeBtn1"); else H.tap("homeBtn2");
  }
  A.ok(rules.size >= 3, "missions use distinct rules (" + rules.size + " seen)");
  A.ok(titles.size >= 3, "missions have distinct titles (" + titles.size + " seen)");

  A.section("boss combat");
  A.ok(beamTelegraphs > 0, "the boss beam telegraphs (appeared " + beamTelegraphs + " frames)");
  A.ok(beamFires > 0, "the boss beam actually fires after telegraphing (" + beamFires + " frames)");

  A.section("economy — earning + persistence");
  A.ok(H.wallet() > walletBefore, "wallet grows by playing (now " + H.wallet() + ")");
  // buy the cheapest buyable colour with earned stars
  const buyable = [...H.root.querySelectorAll(".sw")].find((s) => s.classList.contains("buyable"));
  if (buyable) {
    const price = +buyable.querySelector(".pr").textContent.replace(/[^0-9]/g, "");
    const w = H.wallet();
    const ownedBefore = [...H.root.querySelectorAll(".sw")].filter((s) => !s.classList.contains("buyable")).length;
    H.tap(buyable);
    // refreshMenu() rebuilds the swatch nodes, so re-query rather than trust the old ref.
    const ownedAfter = [...H.root.querySelectorAll(".sw")].filter((s) => !s.classList.contains("buyable")).length;
    A.ok(ownedAfter === ownedBefore + 1, "a new colour is now owned (" + ownedBefore + " -> " + ownedAfter + ")");
    A.ok(H.wallet() === w - price, "wallet debited exactly the price (" + w + " -> " + H.wallet() + ")");
  } else {
    A.ok(false, "expected at least one buyable colour after earning stars");
  }
  // let the async persist() flush, then assert the save round-tripped
  await H.wait(30);
  A.ok(!!H.store["mathonaut-save"], "save persisted to storage");
  const saved = JSON.parse(H.store["mathonaut-save"] || "{}");
  A.ok(saved.stars === H.wallet(), "persisted wallet matches (" + saved.stars + ")");
  A.ok(Array.isArray(saved.colorsOwned) && saved.colorsOwned.length >= 2, "purchased colour is in the persisted save");

  A.section("clean run");
  A.eq(H.errors.length, 0, "no runtime errors");

  H.dispose();
  A.done("systems");
})();
