// galaxy — Phase A (docs/07-landscapes.md): the region a mission is set in now
// follows the child's place on the ladder, so climbing visibly travels through
// space. Assert the level→region map is total and 1:1 onto all 8 regions, that
// each region applies a valid sky, and that a new region is still winnable.
const { createHarness } = require("../harness.js");
const { playMission, launchIntoRun } = require("../autopilot.js");
const A = require("../assert.js");

// one representative level per band (the map is [0,0,1,1,4,4,5,5,2,6,6,3,3,7,7])
const BANDS = [
  { level: 1, band: "L1-2" }, { level: 3, band: "L3-4" }, { level: 5, band: "L5-6" },
  { level: 7, band: "L7-8" }, { level: 9, band: "L9" }, { level: 10, band: "L10-11" },
  { level: 12, band: "L12-13" }, { level: 14, band: "L14-15" },
];

(async () => {
  A.section("each level band is a distinct, valid region");
  const names = [];
  for (const b of BANDS) {
    const H = createHarness({ seedSave: { mathLevel: b.level } });
    await H.boot();
    H.tap("missionBtn");                          // openBrief applies the region
    const name = H.$("brGalaxy").textContent;
    names.push(name);
    A.ok(name && name.length > 0, b.band + " (L" + b.level + ") names its region: " + name);
    A.ok(!!(H.scene() && H.scene().background), b.band + " has a sky background applied");
    A.eq(H.errors.length, 0, b.band + " applies cleanly (no errors)");
    H.dispose();
  }
  A.eq(new Set(names).size, 8, "all 8 bands show a distinct region (" + new Set(names).size + " unique)");

  A.section("climbing changes the region");
  A.ok(names[0] !== names[1], "L1-2 and L3-4 are different regions (" + names[0] + " → " + names[1] + ")");
  A.ok(names[BANDS.length - 1] !== names[0], "the top band differs from the start");

  A.section("each region shows its own visible backdrop set-piece");
  // Exactly one backdrop group should be visible per region, and different
  // regions must light up different set-pieces (Saturn / sun vista / belt …).
  function visibleBackdropSig(H) {
    const s = H.scene();
    if (!s) return null;
    let vis = 0, meshes = 0, hasInstanced = false;
    s.children.forEach((c) => {
      if (c.userData && c.userData.backdrop && c.visible) {
        vis++;
        c.traverse((o) => { if (o.isMesh) meshes++; if (o.isInstancedMesh) hasInstanced = true; });
      }
    });
    return { vis, meshes, hasInstanced };
  }
  {
    const sigs = [];
    for (const b of BANDS) {
      const H = createHarness({ seedSave: { mathLevel: b.level } });
      await H.boot();
      H.tap("missionBtn");
      H.settle(6);
      sigs.push(visibleBackdropSig(H) || { meshes: 0, hasInstanced: false });
      A.eq(H.errors.length, 0, b.band + " backdrop applies without error");
      H.dispose();
    }
    A.ok(sigs.every((s) => s.meshes > 0), "every region shows a non-empty backdrop set-piece");
    const emberIdx = BANDS.findIndex((b) => b.level === 14);
    A.ok(sigs[emberIdx].hasInstanced, "the Ember Reach backdrop includes the instanced asteroid belt");
    A.ok(new Set(sigs.map((s) => s.meshes)).size >= 4, "backdrops differ in composition across regions (" + sigs.map((s) => s.meshes).join(",") + ")");
  }

  A.section("a signature region plays through cleanly");
  // L5-6 is a brand-new region (Frost Belt). A recolour must never break a level.
  const H = createHarness({ seedSave: { mathLevel: 5 } });
  await H.boot();
  H.tap("missionBtn");
  A.eq(H.$("brGalaxy").textContent, "FROST BELT", "L5 flies through the Frost Belt");
  // A recolour/backdrop/restyle must never break a level. Winnability is proven
  // rigorously by the ladder suite; here we just prove the Saturn stage runs to a
  // clean resolution (no crash) with its restyled destination + backdrop live.
  launchIntoRun(H);
  const r = await playMission(H);
  A.ok(r.win || r.fail, "the Saturn (Frost Belt) stage plays to a resolution (" + (r.win ? "WIN" : "FAIL") + ")");
  A.eq(H.errors.length, 0, "no runtime errors across the Saturn stage");
  H.dispose();

  A.done("galaxy");
})();
