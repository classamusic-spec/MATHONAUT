// picker — the menu skill picker lets a player/parent choose which maths to
// practise (number spotting → addition → subtraction → times tables → division)
// instead of only ever seeing level 1 until they climb. Fast: no missions.
const { createHarness } = require("../harness.js");
const A = require("../assert.js");

(async () => {
  const H = createHarness();
  await H.boot();

  A.section("starts at level 1 and shows the skill");
  A.eq(H.$("mLvlTxt").textContent, "1", "level shows 1");
  A.eq(H.$("mLvlSkill").textContent, "Number Spotting", "skill name shown");
  A.ok(/find/i.test(H.$("mLvlEg").textContent), "an example is shown (" + H.$("mLvlEg").textContent.trim() + ")");
  A.ok(H.$("lvlDown").classList.contains("off"), "the − button is disabled at level 1");

  A.section("stepping up changes the maths");
  for (let i = 0; i < 9; i++) H.tap("lvlUp");
  A.eq(H.$("mLvlTxt").textContent, "10", "reached level 10");
  A.eq(H.$("mLvlSkill").textContent, "Times 2 to 5", "skill is a times table now");
  A.ok(H.$("mLvlEg").textContent.includes("×"), "example shows multiplication (" + H.$("mLvlEg").textContent.trim() + ")");
  // and the generated questions actually match
  const q = H.genQuestion(+H.$("mLvlTxt").textContent);
  A.ok(q.text.includes("×"), "L10 generates a multiplication question (" + q.text + ")");

  A.section("comparison rung is reachable");
  for (let i = 0; i < 4; i++) H.tap("lvlUp");   // -> level 14, Greater or Less
  A.eq(H.$("mLvlSkill").textContent, "Greater or Less", "level 14 is the comparison skill");
  A.ok(/[<>]/.test(H.$("mLvlEg").textContent), "its example shows a comparison symbol (" + H.$("mLvlEg").textContent.trim() + ")");
  const cq = H.genQuestion(14);
  A.ok(["<", ">", "="].includes(cq.answer), "L14 answers a comparison symbol (" + cq.answer + ")");

  A.section("clamps at the top");
  for (let i = 0; i < 4; i++) H.tap("lvlUp");
  A.eq(H.$("mLvlTxt").textContent, String(H.MAX_LEVEL), "level clamps at the max (" + H.MAX_LEVEL + ")");
  A.ok(H.$("lvlUp").classList.contains("off"), "the + button disables at the top");

  A.section("stepping down and persistence");
  for (let i = 0; i < H.MAX_LEVEL - 5; i++) H.tap("lvlDown");   // from the top down to level 5
  A.eq(H.$("mLvlTxt").textContent, "5", "stepped down to level 5");
  A.eq(H.$("mLvlSkill").textContent, "Taking Away to 5", "skill is subtraction");
  await H.wait(30);
  const saved = JSON.parse(H.store["mathonaut-save"] || "{}");
  A.eq(saved.mathLevel, 5, "the chosen level persists to the save");

  A.section("the chosen level drives the mission");
  H.tap("missionBtn");
  A.ok(H.$("brLevel").textContent.includes("5"), "the brief reflects the chosen level (" + H.$("brLevel").textContent + ")");

  A.eq(H.errors.length, 0, "no runtime errors");
  H.dispose();
  A.done("picker");
})();
