// Build a single self-contained HTML file that plays the real game core in a
// browser. Bundles web/main.js (which pulls in three.js + game/index.js) into one
// IIFE and inlines it into an HTML shell — no external scripts, so it works from
// file://, a static host, or a claude.ai artifact (strict CSP, no CDN).
//
//   node web/build.js   ->   web/index.html
const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");

(async () => {
  const result = await esbuild.build({
    entryPoints: [path.join(__dirname, "main.js")],
    bundle: true,
    format: "iife",
    minify: true,
    write: false,
    legalComments: "none",
    target: ["es2019"],
  });
  const js = result.outputFiles[0].text;

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#05081f">
<title>Mathonaut</title>
<style>
  html,body{margin:0;height:100%;background:#02040f;overflow:hidden;
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,system-ui,sans-serif;
    -webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent;
    overscroll-behavior:none;touch-action:none;}
  /* Present the phone-shaped game centred, like the target device, with a soft
     glow around it on wider screens. On a phone it just fills the viewport. */
  #frame{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;}
  #root{position:relative;width:100%;height:100%;max-width:460px;max-height:920px;
    overflow:hidden;background:#05081f;}
  @media(min-width:520px){
    #root{border-radius:26px;box-shadow:0 0 0 1px rgba(120,170,255,.14),
      0 30px 90px rgba(0,8,40,.7),0 0 120px rgba(60,120,255,.18);}
    #frame{background:radial-gradient(circle at 50% 30%,#0a1230 0%,#02040f 70%);}
  }
</style>
</head>
<body>
<div id="frame"><div id="root"></div></div>
<script>${js}</script>
</body>
</html>
`;

  fs.writeFileSync(path.join(__dirname, "index.html"), html);
  const kb = (Buffer.byteLength(html) / 1024).toFixed(0);
  console.log("web/index.html written (" + kb + " KB, self-contained)");

  // Body-only variant for hosts that supply their own <head> (e.g. a claude.ai
  // artifact). Same inlined bundle, no <!doctype>/<html>/<head>/<body>.
  const body = `<title>Mathonaut</title>
<style>
  html,body{margin:0;height:100%;background:#02040f;overflow:hidden;
    -webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent;
    overscroll-behavior:none;touch-action:none;}
  #frame{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;}
  #root{position:relative;width:100%;height:100%;max-width:460px;max-height:920px;
    overflow:hidden;background:#05081f;}
  @media(min-width:520px){
    #root{border-radius:26px;box-shadow:0 0 0 1px rgba(120,170,255,.14),
      0 30px 90px rgba(0,8,40,.7),0 0 120px rgba(60,120,255,.18);}
    #frame{background:radial-gradient(circle at 50% 30%,#0a1230 0%,#02040f 70%);}
  }
</style>
<div id="frame"><div id="root"></div></div>
<script>${js}</script>
`;
  fs.writeFileSync(path.join(__dirname, "artifact.html"), body);
  console.log("web/artifact.html written (body-only, for hosted publishing)");
})().catch((e) => { console.error(e); process.exit(1); });
