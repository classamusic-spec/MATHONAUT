/* ============================================================
   MATHONAUT — framework-free game core

   This is the extracted, framework-free core (per docs/03-architecture.md and
   the Phase 0.1 ticket in docs/06-build-plan.md). It has NO React. All THREE
   scene work goes through `createGame(root, T3)`'s injected THREE, which is what
   lets the headless harness run it in jsdom with a fake WebGLRenderer.

   The only three.js *imports* are the optional post-processing add-ons (bloom).
   They are bundled but never run headless: the composer is built only when a
   real WebGL renderer is present (the fake test renderer has no setRenderTarget),
   so tests still drive everything through the injected THREE.

   Exports:
     MARKUP                 static HTML+CSS string (UI)
     createGame(root, T3)   all game logic (plain DOM + three.js) -> dispose()
     genQuestion, LEVELS, MAX_LEVEL, levelName   re-exported pure math (for tests)

   Do not add a framework dependency here. See CLAUDE.md.
   ============================================================ */
import { ri, pick, LEVELS, MAX_LEVEL, levelName, genQuestion } from "./math/questions.js";
// Optional post-processing (bloom). Bundled with the web build; guarded off in
// the headless harness (see setupPostFX below). `three` is external in the core
// build so these share the injected THREE instance at runtime.
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

/* ============================================================
   MATHONAUT — math space runner
   Markup is a static string so the game logic can be unit-tested
   in a headless DOM without React.
   ============================================================ */

export const MARKUP = `
<style>
  .sl-root{
    --bg:#05081f; --glass:rgba(255,255,255,.07); --stroke:rgba(255,255,255,.14);
    --cyan:#5ce1ff; --gold:#ffcf5c; --mag:#ff5c9e; --mint:#5cffc4;
    --txt:#eef4ff; --dim:rgba(238,244,255,.62);
    position:fixed;inset:0;overflow:hidden;background:var(--bg);color:var(--txt);
    font-family:-apple-system,"SF Pro Display","SF Pro Text","Segoe UI",system-ui,sans-serif;
    -webkit-font-smoothing:antialiased;-webkit-user-select:none;user-select:none;touch-action:none;
    -webkit-tap-highlight-color:transparent;
  }
  .sl-root canvas{display:block;width:100%;height:100%;}
  .sl-hud{position:absolute;inset:0;pointer-events:none;}

  .glass{
    background:linear-gradient(180deg,rgba(255,255,255,.10),rgba(255,255,255,.04));
    border:1px solid var(--stroke);
    box-shadow:0 8px 30px rgba(0,4,20,.5), inset 0 1px 0 rgba(255,255,255,.18);
    -webkit-backdrop-filter:blur(9px);backdrop-filter:blur(9px);
  }

  /* ---------- in-flight question: compact holographic readout ----------
     Kept small and pinned to the very top so it never covers the lanes or the
     incoming hazards — the answers live in the strip below, this is just the
     prompt. */
  #question{position:absolute;top:6.2%;left:50%;transform:translateX(-50%) translateY(4px);
    text-align:center;opacity:0;transition:opacity .3s cubic-bezier(.2,.8,.2,1),transform .3s cubic-bezier(.2,.8,.2,1);
    white-space:nowrap;max-width:94vw;pointer-events:none;}
  #question.show{opacity:1;transform:translateX(-50%) translateY(0);}
  #qSub{display:block;font-size:10px;font-weight:700;letter-spacing:.3em;
    color:var(--cyan);text-transform:uppercase;margin-bottom:3px;
    text-shadow:0 0 10px rgba(92,225,255,.8);}
  #qText{font-size:clamp(22px,6vw,30px);font-weight:800;letter-spacing:-.01em;color:#fff;
    font-variant-numeric:tabular-nums;
    text-shadow:0 0 4px rgba(255,255,255,.45),0 0 16px rgba(92,225,255,.6);}

  /* ---------- top HUD ---------- */
  #topL{position:absolute;top:calc(12px + env(safe-area-inset-top));left:14px;
    border-radius:999px;padding:7px 14px;display:flex;align-items:center;gap:7px;}
  .hp{width:11px;height:11px;border-radius:50%;
    background:radial-gradient(circle at 34% 32%,#ff9db0,#e82f52);
    box-shadow:0 0 10px rgba(255,60,100,.85), inset 0 1px 0 rgba(255,255,255,.5);
    transition:all .25s;}
  .hp.off{background:rgba(255,255,255,.10);box-shadow:none;transform:scale(.78);}
  #shieldTag{margin-left:3px;font-size:11px;font-weight:800;letter-spacing:.08em;color:var(--cyan);
    opacity:0;transition:opacity .2s;text-shadow:0 0 10px rgba(92,225,255,.9);}

  #topR{position:absolute;top:calc(12px + env(safe-area-inset-top));right:14px;
    border-radius:999px;padding:7px 14px;display:flex;align-items:center;gap:6px;
    font-size:15px;font-weight:800;font-variant-numeric:tabular-nums;letter-spacing:.01em;}
  #topR .st{color:var(--gold);filter:drop-shadow(0 0 8px rgba(255,207,92,.8));font-size:13px;}
  #combo{position:absolute;top:calc(52px + env(safe-area-inset-top));right:16px;
    font-size:12px;font-weight:900;letter-spacing:.1em;color:var(--gold);
    text-shadow:0 0 14px rgba(255,207,92,.9);opacity:0;transform:translateY(-4px);
    transition:all .2s;}
  #combo.on{opacity:1;transform:translateY(0);}

  #bossHud{position:absolute;left:50%;transform:translateX(-50%);
    top:calc(56px + env(safe-area-inset-top));border-radius:999px;padding:5px 16px;
    font-size:11px;font-weight:800;letter-spacing:.16em;color:#ffc4d2;display:none;
    background:rgba(90,14,40,.82);border:1px solid rgba(255,92,140,.45);
    box-shadow:0 0 26px rgba(255,60,110,.35), inset 0 1px 0 rgba(255,255,255,.12);}

  #toast{position:absolute;top:31%;left:0;right:0;text-align:center;
    font-size:19px;font-weight:800;letter-spacing:-.01em;color:var(--mint);
    text-shadow:0 0 18px currentColor;opacity:0;transform:translateY(8px) scale(.96);
    transition:all .25s cubic-bezier(.2,.8,.2,1);pointer-events:none;}
  #toast.show{opacity:1;transform:translateY(0) scale(1);}

  /* ---------- bottom: overdrive + mission progress ---------- */
  #btmWrap{position:absolute;left:50%;transform:translateX(-50%);
    bottom:calc(16px + env(safe-area-inset-bottom));width:min(300px,64vw);
    display:flex;flex-direction:column;gap:7px;}
  .bar{height:5px;border-radius:99px;background:rgba(255,255,255,.10);overflow:hidden;
    box-shadow:inset 0 1px 2px rgba(0,0,0,.4);}
  #progFill{height:100%;width:0%;border-radius:99px;
    background:linear-gradient(90deg,#ffb44c,var(--gold));
    box-shadow:0 0 12px rgba(255,207,92,.7);transition:width .35s cubic-bezier(.2,.8,.2,1);}
  #odFill{height:100%;width:0%;border-radius:99px;
    background:linear-gradient(90deg,#2f8fff,var(--cyan));
    box-shadow:0 0 14px rgba(92,225,255,.85);transition:width .18s linear;}
  #odLbl{position:absolute;top:-15px;left:0;font-size:8.5px;font-weight:800;
    letter-spacing:.22em;color:var(--dim);}

  /* ---------- overdrive trigger ---------- */
  #odBtn{position:absolute;right:16px;bottom:calc(30px + env(safe-area-inset-bottom));
    width:64px;height:64px;border-radius:50%;pointer-events:auto;cursor:pointer;
    display:flex;align-items:center;justify-content:center;font-size:26px;
    background:linear-gradient(180deg,rgba(255,255,255,.10),rgba(255,255,255,.03));
    border:1px solid rgba(255,255,255,.12);
    -webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);
    opacity:.32;filter:grayscale(1);transition:all .3s cubic-bezier(.2,.8,.2,1);}
  #odBtn.ready{opacity:1;filter:none;
    background:linear-gradient(180deg,rgba(92,225,255,.32),rgba(47,143,255,.18));
    border-color:rgba(92,225,255,.75);
    box-shadow:0 0 0 0 rgba(92,225,255,.6),0 0 34px rgba(92,225,255,.6), inset 0 1px 0 rgba(255,255,255,.3);
    animation:odpulse 1.5s ease-out infinite;}
  #odBtn:active{transform:scale(.9);}
  @keyframes odpulse{
    0%{box-shadow:0 0 0 0 rgba(92,225,255,.55),0 0 34px rgba(92,225,255,.6), inset 0 1px 0 rgba(255,255,255,.3);}
    70%{box-shadow:0 0 0 16px rgba(92,225,255,0),0 0 34px rgba(92,225,255,.6), inset 0 1px 0 rgba(255,255,255,.3);}
    100%{box-shadow:0 0 0 0 rgba(92,225,255,0),0 0 34px rgba(92,225,255,.6), inset 0 1px 0 rgba(255,255,255,.3);}
  }
  #odRing{position:absolute;inset:0;pointer-events:none;opacity:0;transition:opacity .3s;
    background:radial-gradient(circle,rgba(92,225,255,0) 55%,rgba(92,225,255,.18) 100%);}
  #odRing.on{opacity:1;}

  #flash{position:absolute;inset:0;background:#ff3355;opacity:0;pointer-events:none;}

  /* ---------- overlays ---------- */
  .sl-ov{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;
    justify-content:center;text-align:center;padding:24px;overflow-y:auto;
    background:radial-gradient(ellipse 90% 60% at 50% 42%, rgba(18,32,96,.86), rgba(3,6,22,.975) 78%);
    transition:opacity .38s cubic-bezier(.2,.8,.2,1), visibility .38s;}
  .sl-ov.hidden{opacity:0;pointer-events:none;visibility:hidden;}
  .sl-ov > *{animation:rise .5s cubic-bezier(.2,.8,.2,1) both;}
  .sl-ov > *:nth-child(2){animation-delay:.05s}
  .sl-ov > *:nth-child(3){animation-delay:.1s}
  .sl-ov > *:nth-child(4){animation-delay:.15s}
  @keyframes rise{from{opacity:0;transform:translateY(14px) scale(.98);}to{opacity:1;transform:none;}}

  /* ---------- MATHONAUT wordmark ---------- */
  .wordmark{font-size:clamp(38px,12.5vw,58px);font-weight:800;letter-spacing:.02em;
    display:flex;align-items:center;justify-content:center;line-height:1;
    animation:float 5s ease-in-out infinite;}
  @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-7px)}}
  .wm{background:linear-gradient(180deg,#ffffff 8%,#bfe4ff 52%,#6aa8ff 100%);
    -webkit-background-clip:text;background-clip:text;color:transparent;
    filter:drop-shadow(0 2px 18px rgba(90,160,255,.55));}
  .planet-o{position:relative;display:inline-block;
    width:.66em;height:.66em;border-radius:50%;margin:0 .05em;
    background:radial-gradient(circle at 34% 30%,#a8f0ff 0%,#3f96e8 48%,#12408f 100%);
    box-shadow:0 0 26px rgba(90,200,255,.75), inset -5px -7px 14px rgba(2,14,50,.75),
      inset 3px 4px 10px rgba(190,240,255,.35);}
  .planet-o i{position:absolute;left:50%;top:50%;width:1.42em;height:.44em;
    border:2.5px solid rgba(214,240,255,.85);border-radius:50%;
    transform:translate(-50%,-50%) rotate(-21deg);
    box-shadow:0 0 12px rgba(150,220,255,.65);}
  .tagline{margin-top:12px;font-size:11px;font-weight:700;letter-spacing:.42em;
    color:var(--cyan);text-transform:uppercase;text-shadow:0 0 16px rgba(92,225,255,.7);}

  /* ---------- buttons ---------- */
  .sl-btn{pointer-events:auto;cursor:pointer;position:relative;overflow:hidden;
    font-family:inherit;font-size:16px;font-weight:800;letter-spacing:.04em;color:#04142e;
    background:linear-gradient(180deg,#e9f6ff,#8fd0ff 55%,#5eb2ff);
    border:none;border-radius:999px;padding:15px 46px;margin-top:22px;
    box-shadow:0 10px 30px rgba(50,140,255,.42), inset 0 1px 0 rgba(255,255,255,.9),
      inset 0 -2px 0 rgba(0,40,110,.16);
    transition:transform .16s cubic-bezier(.2,.8,.2,1), box-shadow .16s;}
  .sl-btn::after{content:'';position:absolute;top:0;left:-70%;width:40%;height:100%;
    background:linear-gradient(90deg,transparent,rgba(255,255,255,.65),transparent);
    transform:skewX(-18deg);animation:shine 3.6s ease-in-out infinite;}
  @keyframes shine{0%,72%{left:-70%}88%,100%{left:120%}}
  .sl-btn:active{transform:scale(.955);box-shadow:0 4px 14px rgba(50,140,255,.4), inset 0 1px 0 rgba(255,255,255,.9);}
  .sl-btn.green{background:linear-gradient(180deg,#e6fff5,#84f3c8 55%,#37d999);
    box-shadow:0 10px 30px rgba(40,200,140,.42), inset 0 1px 0 rgba(255,255,255,.9);color:#02341f;}
  .sl-btn.ghost{background:transparent;color:var(--dim);border:1px solid var(--stroke);
    box-shadow:none;font-size:13px;font-weight:700;padding:11px 26px;margin-top:12px;}
  .sl-btn.ghost::after{display:none;}

  /* ---------- cards ---------- */
  .sl-card{border-radius:26px;padding:20px 24px;max-width:330px;width:100%;
    background:linear-gradient(180deg,rgba(255,255,255,.09),rgba(255,255,255,.035));
    border:1px solid var(--stroke);
    box-shadow:0 20px 50px rgba(0,4,22,.55), inset 0 1px 0 rgba(255,255,255,.16);
    -webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);}
  .sl-card h2{margin:2px 0 6px;font-size:23px;font-weight:800;letter-spacing:-.01em;color:#fff;}
  .sl-card p{margin:7px 0;font-size:14px;line-height:1.5;color:var(--dim);}
  .row{display:flex;justify-content:space-between;align-items:center;
    font-size:13px;font-weight:700;color:var(--dim);padding:5px 0;}
  .row b{color:#fff;font-weight:800;}
  .div{height:1px;background:var(--stroke);margin:9px 0;}
  /* level / skill picker: choose which maths to practise (addition, times, …) */
  .lvlrow{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:3px 0;}
  .lvlhd{display:flex;flex-direction:column;gap:1px;min-width:0;}
  .lvlhd span{font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--dim);}
  .lvlhd b{font-size:15px;font-weight:800;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
  .lvlstep{display:flex;align-items:center;gap:10px;pointer-events:auto;flex:0 0 auto;}
  .lvlstep>b{min-width:22px;text-align:center;font-size:17px;font-weight:800;color:#fff;
    font-variant-numeric:tabular-nums;}
  .lvlbtn{width:34px;height:34px;border-radius:12px;cursor:pointer;font-size:22px;font-weight:800;
    line-height:1;color:#fff;background:rgba(92,225,255,.14);border:1.5px solid rgba(92,225,255,.4);
    display:flex;align-items:center;justify-content:center;transition:transform .12s,background .18s;}
  .lvlbtn:active{transform:scale(.9);background:rgba(92,225,255,.28);}
  .lvlbtn.off{opacity:.32;pointer-events:none;}
  .lvleg{font-size:12px;color:var(--cyan);margin:2px 0 2px;font-variant-numeric:tabular-nums;
    text-align:left;letter-spacing:.01em;}
  .sl-chip{display:inline-block;border-radius:999px;padding:6px 13px;font-size:11px;
    font-weight:800;letter-spacing:.1em;margin:4px 3px 0;color:var(--cyan);
    background:rgba(92,225,255,.10);border:1px solid rgba(92,225,255,.32);}
  .sl-stars{font-size:34px;letter-spacing:.14em;margin:8px 0 2px;color:var(--gold);
    filter:drop-shadow(0 0 18px rgba(255,207,92,.75));}
  .sl-sw{display:flex;gap:11px;justify-content:center;margin:14px 0 2px;pointer-events:auto;}
  .sw{width:34px;height:34px;border-radius:50%;cursor:pointer;position:relative;
    border:2px solid rgba(255,255,255,.18);transition:transform .2s cubic-bezier(.2,.8,.2,1),box-shadow .2s;
    box-shadow:inset -3px -4px 8px rgba(0,10,40,.5), inset 2px 2px 6px rgba(255,255,255,.3);}
  .sw.sel{border-color:#fff;transform:scale(1.16);box-shadow:0 0 18px rgba(255,255,255,.6);}
  .sw.lock{opacity:.26;cursor:default;}
  .sw.lock::after{content:'';position:absolute;inset:0;border-radius:50%;
    background:rgba(0,0,0,.35);}
  #finalScore{font-size:46px;font-weight:800;color:#fff;letter-spacing:-.02em;
    font-variant-numeric:tabular-nums;margin:2px 0 4px;
    text-shadow:0 0 30px rgba(255,207,92,.6);}
  #lvlNote{font-size:12.5px;color:var(--cyan);margin-top:8px;font-weight:700;}
  .sl-hint{margin-top:18px;font-size:11.5px;line-height:2;color:rgba(238,244,255,.45);
    letter-spacing:.02em;}
  .sl-kbd{background:rgba(255,255,255,.10);border:1px solid var(--stroke);
    border-radius:5px;padding:2px 7px;font-size:10.5px;}

  /* settings + parental gate */
  .sl-link{pointer-events:auto;cursor:pointer;margin-top:16px;background:none;border:none;
    color:rgba(238,244,255,.6);font-size:12.5px;font-weight:700;text-decoration:underline;
    text-underline-offset:3px;letter-spacing:.02em;}
  .sl-btn.ghost{background:rgba(255,255,255,.06);box-shadow:none;margin-top:12px;}
  .sl-card h2{font-size:20px;font-weight:800;margin:0 0 6px;color:var(--txt);text-align:center;}
  .gate .gate-q{text-align:center;font-size:14px;color:var(--dim);margin:0 0 14px;}
  .gate .gate-q b{color:var(--txt);font-size:18px;}
  .gate-opts{display:flex;gap:10px;justify-content:center;margin-bottom:6px;}
  .gate-opts button{pointer-events:auto;cursor:pointer;min-width:64px;padding:14px 0;border-radius:16px;
    font-size:22px;font-weight:800;font-variant-numeric:tabular-nums;color:var(--txt);
    background:rgba(22,58,124,.55);border:2px solid var(--stroke);}
  .setrow{display:flex;align-items:center;justify-content:space-between;gap:14px;
    padding:12px 4px;border-bottom:1px solid rgba(255,255,255,.08);font-size:14px;color:var(--txt);}
  .tgl{pointer-events:auto;cursor:pointer;width:52px;height:30px;border-radius:999px;position:relative;
    border:2px solid var(--stroke);background:rgba(255,255,255,.08);transition:background .18s;flex:0 0 auto;}
  .tgl::after{content:"";position:absolute;top:2px;left:2px;width:22px;height:22px;border-radius:50%;
    background:#fff;transition:left .18s;}
  .tgl.on{background:var(--mint);border-color:var(--mint);}
  .tgl.on::after{left:24px;}

  /* high contrast: firmer borders, opaque panels, brighter text */
  .sl-root.hc{--dim:rgba(238,244,255,.9);}
  .sl-root.hc .ans{border-width:3.5px;background:#020617;color:#fff;text-shadow:none;}
  .sl-root.hc .sl-card{background:#050a1e;border:2px solid #fff;}
  .sl-root.hc .setrow{color:#fff;}
  .sl-root.hc .ans.right{border-color:#78ffcf;}
  .sl-root.hc .ans.wrongpick{border-color:#ff8aa0;}

  /* reduced motion: no CSS keyframe animation (e.g. the overdrive pulse) */
  .sl-root.rm *,.sl-root.rm *::before,.sl-root.rm *::after{animation:none !important;}
  .ovtitle{font-size:11px;font-weight:800;letter-spacing:.36em;color:var(--dim);
    text-transform:uppercase;margin-bottom:2px;}

  /* ---------- launch sequence ---------- */
  .sl-root.cine #topL,.sl-root.cine #topR,.sl-root.cine #btmWrap,
  .sl-root.cine #odBtn,.sl-root.cine #combo{opacity:0;transition:opacity .3s;}
  #countdown{position:absolute;left:50%;top:37%;transform:translate(-50%,-50%);
    display:none;flex-direction:column;align-items:center;gap:20px;pointer-events:none;}
  #countdown.on{display:flex;}
  #seg7{position:relative;width:92px;height:158px;}
  #seg7 .s{position:absolute;border-radius:3px;background:rgba(255,255,255,.045);
    transition:background .1s linear, box-shadow .1s linear;}
  #seg7 .s.on{background:var(--cyan);
    box-shadow:0 0 18px var(--cyan),0 0 52px rgba(92,225,255,.75);}
  #seg7 .a{left:16px;top:0;width:60px;height:12px;}
  #seg7 .g{left:16px;top:73px;width:60px;height:12px;}
  #seg7 .d{left:16px;top:146px;width:60px;height:12px;}
  #seg7 .f{left:0;top:12px;width:12px;height:61px;}
  #seg7 .b{right:0;top:12px;width:12px;height:61px;}
  #seg7 .e{left:0;top:85px;width:12px;height:61px;}
  #seg7 .c{right:0;top:85px;width:12px;height:61px;}
  #seg7.pop{animation:segpop .38s cubic-bezier(.2,.9,.2,1);}
  @keyframes segpop{0%{transform:scale(1.28);filter:brightness(2)}
    55%{transform:scale(1);filter:brightness(1)}100%{transform:scale(1)}}
  #cdLabel{font-size:10px;font-weight:800;letter-spacing:.42em;color:var(--dim);
    text-transform:uppercase;}
  #blastoff{position:absolute;left:50%;top:37%;
    transform:translate(-50%,-50%) scale(.6);
    font-size:clamp(34px,11.5vw,54px);font-weight:900;letter-spacing:.06em;color:#fff;
    text-shadow:0 0 22px var(--cyan),0 0 70px rgba(92,225,255,.85);
    opacity:0;pointer-events:none;white-space:nowrap;}
  #blastoff.on{animation:blast .85s cubic-bezier(.2,.8,.2,1) forwards;}
  @keyframes blast{
    0%{opacity:0;transform:translate(-50%,-50%) scale(.55)}
    22%{opacity:1;transform:translate(-50%,-50%) scale(1.14)}
    68%{opacity:1;transform:translate(-50%,-50%) scale(1)}
    100%{opacity:0;transform:translate(-50%,-50%) scale(1.4)}}
  #skipHint{position:absolute;left:0;right:0;
    bottom:calc(84px + env(safe-area-inset-bottom));text-align:center;
    font-size:10px;letter-spacing:.26em;color:rgba(238,244,255,.34);
    text-transform:uppercase;opacity:0;transition:opacity .45s;pointer-events:none;}
  #skipHint.on{opacity:1;}

  /* premium framing: soft vignette + top light */
  #vig{position:absolute;inset:0;pointer-events:none;
    background:radial-gradient(ellipse 120% 90% at 50% 42%, transparent 58%, rgba(2,4,16,.55) 100%);}
  #vig::after{content:'';position:absolute;inset:0;
    background:linear-gradient(180deg,rgba(120,180,255,.05),transparent 18%);}

  /* question entrance: scale-blur pop, retriggered per new question */
  #question.pop #qText{animation:qpop .5s cubic-bezier(.2,.9,.25,1) both;}
  #question.pop #qSub{animation:qsub .5s cubic-bezier(.2,.9,.25,1) both;}
  @keyframes qpop{0%{opacity:0;transform:scale(1.25);filter:blur(7px)}
    60%{opacity:1;filter:blur(0)}100%{opacity:1;transform:scale(1)}}
  @keyframes qsub{0%{opacity:0;letter-spacing:.6em}100%{opacity:1;letter-spacing:.32em}}

  /* ship selector — segmented glass control */
  .shipsel{display:flex;gap:8px;justify-content:center;margin:14px 0 2px;pointer-events:auto;}
  .shipbtn{flex:1;max-width:132px;padding:10px 6px 8px;border-radius:16px;cursor:pointer;
    background:rgba(255,255,255,.05);border:1px solid var(--stroke);
    font-family:inherit;color:var(--dim);font-size:11px;font-weight:800;letter-spacing:.08em;
    display:flex;flex-direction:column;align-items:center;gap:3px;
    transition:all .25s cubic-bezier(.2,.8,.2,1);}
  .shipbtn em{font-style:normal;font-size:22px;line-height:1;filter:grayscale(.5);transition:filter .25s,transform .25s;}
  .shipbtn small{font-size:8.5px;font-weight:700;letter-spacing:.06em;color:rgba(238,244,255,.4);}
  .shipbtn.sel{background:rgba(92,225,255,.12);border-color:rgba(92,225,255,.55);color:#fff;
    box-shadow:0 0 22px rgba(92,225,255,.28), inset 0 1px 0 rgba(255,255,255,.2);}
  .shipbtn.sel em{filter:none;transform:scale(1.12);}
  .shipbtn:active{transform:scale(.96);}

  /* answer strip — the 3D signs are only legible for ~1s at flight speed, which is
     hopeless for a 4-year-old. These are locked to lanes and readable from spawn. */
  #ansStrip{position:absolute;left:0;right:0;top:39%;display:none;
    justify-content:center;gap:min(6vw,30px);pointer-events:none;}
  #ansStrip.on{display:flex;}
  /* Boxes are deliberately shorter and semi-translucent so you can still see the
     lanes and incoming hazards behind them — the number stays crisp via a dark
     outline, so readability (the whole point of the strip) is preserved. */
  .ans{min-width:20vw;max-width:100px;padding:7px 4px 8px;border-radius:16px;
    text-align:center;font-size:clamp(28px,8vw,38px);font-weight:800;
    font-variant-numeric:tabular-nums;letter-spacing:-.01em;color:#fff;
    background:rgba(6,12,38,.52);border:2.5px solid rgba(92,225,255,.62);
    box-shadow:0 5px 16px rgba(0,4,20,.4), 0 0 14px rgba(92,225,255,.2),
      inset 0 1px 0 rgba(255,255,255,.16);
    text-shadow:0 1px 3px rgba(0,4,16,.95),0 0 12px rgba(92,225,255,.7);
    transition:transform .18s cubic-bezier(.2,.8,.2,1), background .18s,
      border-color .18s, box-shadow .18s, opacity .18s;}
  .ans.sel{transform:scale(1.18) translateY(-6px);border-color:#fff;
    background:rgba(22,58,124,.9);
    box-shadow:0 8px 26px rgba(0,4,20,.6), 0 0 30px rgba(92,225,255,.8),
      inset 0 1px 0 rgba(255,255,255,.35);}
  .ans.right{border-color:#5cffc4;background:rgba(8,72,52,.92);color:#e6fff5;
    box-shadow:0 0 34px rgba(92,255,196,.85);text-shadow:0 0 16px rgba(92,255,196,.9);}
  .ans.wrongpick{border-color:#ff5c7a;background:rgba(82,10,30,.92);color:#ffe4ea;
    box-shadow:0 0 34px rgba(255,92,122,.85);}
  .ans.dimmed{opacity:.26;transform:scale(.92);}
  /* Redundant, non-colour cue on answer feedback: a shape/glyph badge that is
     legible in greyscale for colour-blind players (accessibility, docs/05). */
  .ans[data-mark]::after{content:attr(data-mark);position:absolute;top:-13px;right:-9px;
    width:26px;height:26px;line-height:24px;border-radius:50%;font-size:16px;font-weight:900;
    text-align:center;border:2px solid #06122a;color:#06122a;box-shadow:0 2px 8px rgba(0,4,20,.6);}
  .ans.right{position:relative;}
  .ans.wrongpick{position:relative;}
  .ans.right[data-mark]::after{background:#5cffc4;}
  .ans.wrongpick[data-mark]::after{background:#ff6a86;}
  #laneDots{position:absolute;left:0;right:0;top:calc(39% + 66px);display:none;
    justify-content:center;gap:min(6vw,30px);pointer-events:none;}
  #laneDots.on{display:flex;}
  .ld{min-width:21vw;max-width:104px;display:flex;justify-content:center;}
  .ld i{width:7px;height:7px;border-radius:50%;background:rgba(255,255,255,.18);
    transition:all .18s;}
  .ld.sel i{background:#fff;box-shadow:0 0 12px #fff;transform:scale(1.5);}

  /* shop: prices + wallet */
  #wallet{display:flex;align-items:center;justify-content:center;gap:6px;
    font-size:19px;font-weight:800;font-variant-numeric:tabular-nums;color:#fff;margin-bottom:2px;}
  #wallet .st{color:var(--gold);filter:drop-shadow(0 0 10px rgba(255,207,92,.85));font-size:16px;}
  .sw .pr,.shipbtn .pr{position:absolute;left:50%;transform:translateX(-50%);
    bottom:-15px;font-size:8.5px;font-weight:800;letter-spacing:.04em;color:var(--gold);
    white-space:nowrap;text-shadow:0 0 8px rgba(255,207,92,.6);}
  .shipbtn{position:relative;}
  .shipbtn .pr{bottom:-14px;}
  .sw.lock::after{content:'';position:absolute;inset:0;border-radius:50%;background:rgba(0,0,0,.5);}
  .sw.buyable{opacity:.75;border-color:rgba(255,207,92,.7);
    box-shadow:0 0 14px rgba(255,207,92,.4);}
  .sw.buyable::after{background:rgba(0,0,0,.25);}
  .shipbtn.buyable{border-color:rgba(255,207,92,.6);color:rgba(255,224,163,.9);}
  .shipbtn.locked em{filter:grayscale(1);opacity:.4;}
  @keyframes nope{0%,100%{transform:translateX(0)}25%{transform:translateX(-5px)}75%{transform:translateX(5px)}}
  .nope{animation:nope .32s ease;}
  .sl-sw{margin-bottom:18px;}
  .shipsel{margin-bottom:18px;}

  /* mission modifier HUD */
  #modHud{position:absolute;top:calc(52px + env(safe-area-inset-top));left:14px;
    border-radius:999px;padding:5px 12px;font-size:11px;font-weight:800;letter-spacing:.06em;
    display:none;align-items:center;gap:6px;
    background:linear-gradient(180deg,rgba(255,255,255,.10),rgba(255,255,255,.04));
    border:1px solid var(--stroke);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);}
  #modHud.on{display:flex;}
  #riftVig{position:absolute;inset:0;pointer-events:none;opacity:0;transition:opacity .3s;
    background:radial-gradient(ellipse 105% 80% at 50% 50%, transparent 42%, rgba(255,40,80,.62) 100%);}

  /* galaxy tag on the brief */
  .galtag{display:block;margin:0 auto 10px;width:fit-content;border-radius:999px;
    padding:5px 14px;font-size:10px;font-weight:800;letter-spacing:.3em;text-transform:uppercase;
    border:1px solid;filter:drop-shadow(0 0 12px currentColor);}
</style>

<canvas id="c"></canvas>

<div class="sl-hud">
  <div id="question"><small id="qSub"></small><span id="qText"></span></div>
  <div id="topL" class="glass"><span id="hearts"></span><span id="shieldTag">SHIELD</span></div>
  <div id="topR" class="glass"><span id="score">0</span><span class="st">★</span></div>
  <div id="combo"></div>
  <div id="bossHud"></div>
  <div id="toast"></div>
  <div id="btmWrap">
    <div style="position:relative;"><span id="odLbl">OVERDRIVE</span>
      <div class="bar"><div id="odFill"></div></div></div>
    <div class="bar"><div id="progFill"></div></div>
  </div>
  <div id="odBtn">⚡</div>
  <div id="odRing"></div>
  <div id="countdown">
    <div id="seg7">
      <i class="s a"></i><i class="s b"></i><i class="s c"></i><i class="s d"></i>
      <i class="s e"></i><i class="s f"></i><i class="s g"></i>
    </div>
    <div id="cdLabel">Ignition</div>
  </div>
  <div id="blastoff">BLAST OFF</div>
  <div id="skipHint">Tap to skip</div>
  <div id="ansStrip">
    <div class="ans" data-l="0"></div><div class="ans" data-l="1"></div><div class="ans" data-l="2"></div>
  </div>
  <div id="laneDots">
    <div class="ld" data-l="0"><i></i></div><div class="ld" data-l="1"><i></i></div><div class="ld" data-l="2"><i></i></div>
  </div>
  <div id="modHud"></div>
  <div id="riftVig"></div>
  <div id="vig"></div>
  <div id="flash"></div>
</div>

<div class="sl-ov" id="menuOv">
  <div class="wordmark"><span class="wm">MATH</span><span class="planet-o"><i></i></span><span class="wm">NAUT</span></div>
  <div class="tagline">Solve · Fly · Survive</div>
  <div class="sl-card">
    <div id="wallet"><span id="totStars">0</span><span class="st">★</span></div>
    <div class="row"><span>Pilot</span><b id="rankTxt">Cadet</b></div>
    <div class="div"></div>
    <div class="lvlrow">
      <div class="lvlhd"><span>Practice</span><b id="mLvlSkill">Number Spotting</b></div>
      <div class="lvlstep">
        <button class="lvlbtn" id="lvlDown" aria-label="Easier skill">−</button>
        <b id="mLvlTxt">1</b>
        <button class="lvlbtn" id="lvlUp" aria-label="Harder skill">+</button>
      </div>
    </div>
    <div class="lvleg" id="mLvlEg">e.g. Find 7</div>
    <div class="shipsel" id="shipSel">
      <button class="shipbtn sel" data-s="0"><em>🚀</em>ROCKET<small>longer overdrive</small></button>
      <button class="shipbtn" data-s="1"><em>🛸</em>UFO<small>star magnet</small></button>
    </div>
    <div class="sl-sw" id="swatches"></div>
  </div>
  <button class="sl-btn" id="missionBtn">PLAY</button>
  <div class="sl-hint">Swipe <b>◀ ▶</b> or press <span class="sl-kbd">←</span> <span class="sl-kbd">→</span> to steer<br>
  Fly through the correct answer — the math never stops the flight</div>
  <button class="sl-link" id="settingsBtn">⚙ Grown-ups &amp; Settings</button>
</div>

<!-- Parental gate: a grown-up answers a multiplication the target age can't, in
     front of settings (non-negotiable: gate before every settings screen). -->
<div class="sl-ov hidden" id="gateOv">
  <div class="sl-card gate">
    <h2>Ask a grown-up</h2>
    <p class="gate-q">Solve to continue: <b id="gateQ">7 × 8</b></p>
    <div class="gate-opts" id="gateOpts"></div>
    <button class="sl-btn ghost" id="gateCancel">Back</button>
  </div>
</div>

<div class="sl-ov hidden" id="setOv">
  <div class="sl-card">
    <h2>Settings</h2>
    <div class="setrow" data-k="sound"><span>Sound effects</span><button class="tgl" id="tgl-sound" role="switch"></button></div>
    <div class="setrow" data-k="music"><span>Music</span><button class="tgl" id="tgl-music" role="switch"></button></div>
    <div class="setrow" data-k="haptics"><span>Vibration</span><button class="tgl" id="tgl-haptics" role="switch"></button></div>
    <div class="setrow" data-k="reduceMotion"><span>Reduced motion</span><button class="tgl" id="tgl-reduceMotion" role="switch"></button></div>
    <div class="setrow" data-k="highContrast"><span>High contrast</span><button class="tgl" id="tgl-highContrast" role="switch"></button></div>
    <button class="sl-btn" id="setDone">Done</button>
  </div>
</div>

<div class="sl-ov hidden" id="briefOv">
  <div class="sl-card">
    <span class="galtag" id="brGalaxy">VERDANT NEBULA</span>
    <div style="font-size:46px;line-height:1;" id="brIcon">🛸</div>
    <h2 id="brTitle">Rescue Zippo!</h2>
    <p id="brText"></p>
    <p id="brRule" style="color:var(--gold);font-weight:700;font-size:12.5px;
      border-top:1px solid var(--stroke);padding-top:10px;margin-top:10px;"></p>
    <span class="sl-chip" id="brLevel">MATH LV 1</span>
    <span class="sl-chip" id="brGates">6 GATES</span>
  </div>
  <button class="sl-btn green" id="launchBtn">LAUNCH</button>
</div>

<div class="sl-ov hidden" id="winOv">
  <div class="ovtitle">Mission Complete</div>
  <div class="sl-stars" id="winStars">★★★</div>
  <div id="finalScore">0</div>
  <div class="sl-card">
    <p id="winStats"></p>
    <div class="div"></div>
    <p id="winUnlock" style="color:var(--mint);font-weight:700;"></p>
    <p id="lvlNote"></p>
  </div>
  <button class="sl-btn green" id="nextBtn">NEXT MISSION</button>
  <button class="sl-btn ghost" id="homeBtn1">HANGAR</button>
</div>

<div class="sl-ov hidden" id="failOv">
  <div class="ovtitle" style="color:#ff9db0;">Ship Needs Repairs</div>
  <div class="sl-card">
    <p id="failStats"></p>
    <div class="div"></div>
    <p style="color:var(--cyan);font-size:12.5px;">Support mode is on for your retry — slower gates, fewer choices.</p>
  </div>
  <button class="sl-btn" id="retryBtn">RETRY MISSION</button>
  <button class="sl-btn ghost" id="homeBtn2">HANGAR</button>
</div>
`;

/* ============================================================
   GAME — pure DOM + three.js, no React inside.
   createGame(root, THREE) -> dispose()
   ============================================================ */
export function createGame(root, T3) {
  const $ = (id) => root.querySelector("#" + id);
  const listeners = [];
  function notify(msg) {
    let n = root.querySelector("#notice");
    if (!msg) { if (n) n.remove(); return; }
    if (!n) {
      n = document.createElement("div");
      n.id = "notice";
      n.style.cssText = "position:absolute;left:50%;top:12%;transform:translateX(-50%);z-index:9;" +
        "background:rgba(90,20,40,.9);border:1px solid #ff7d9c;border-radius:14px;padding:9px 16px;" +
        "font-size:12px;font-weight:700;color:#ffd9e0;pointer-events:none;max-width:80vw;text-align:center;";
      root.appendChild(n);
    }
    n.textContent = msg;
  }
  const on = (target, ev, fn, opts) => {
    target.addEventListener(ev, fn, opts);
    listeners.push([target, ev, fn, opts]);
  };

  // ---------- renderer ----------
  const canvas = $("c");
  const renderer = new T3.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  let curDPR = Math.min(window.devicePixelRatio || 1, 2);
  let dprCap = curDPR;              // lowered automatically if the device struggles
  renderer.setPixelRatio(curDPR);
  // Filmic tone-mapping: richer contrast, glows roll off instead of clipping to
  // flat white. Exposure nudged up so the vibrant palette stays vibrant.
  try {
    if (T3.ACESFilmicToneMapping != null) renderer.toneMapping = T3.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.22;
  } catch (e) { /* fake renderer in tests: ignore */ }

  // WebGL contexts get dropped under memory pressure on mobile. Without this the
  // canvas silently dies and the host remounts us — which reads as "it crashed
  // and restarted the level".
  let contextLost = false;
  canvas.addEventListener("webglcontextlost", (e) => {
    e.preventDefault();
    contextLost = true;
    notify("Graphics paused to save memory — tap to resume.");
  }, false);
  canvas.addEventListener("webglcontextrestored", () => {
    contextLost = false;
    resize();
    notify("");
  }, false);
  const scene = new T3.Scene();
  const camera = new T3.PerspectiveCamera(62, 1, 0.1, 400);
  const BASE_FOV = 62;

  // ---------- post-processing (bloom) ----------
  // Only wired up on a real WebGL renderer. The headless harness's fake renderer
  // has no setRenderTarget, so composer stays null and we render directly —
  // tests are untouched. bloomOn is the first thing the adaptive quality sheds.
  let composer = null, bloomPass = null, bloomOn = false;
  function setupPostFX() {
    if (typeof renderer.setRenderTarget !== "function" || !renderer.capabilities) return;
    try {
      const size = new T3.Vector2();
      renderer.getSize(size);
      composer = new EffectComposer(renderer);
      composer.addPass(new RenderPass(scene, camera));
      // (resolution, strength, radius, threshold): only genuinely bright things
      // (signs, beacons, the sun, engine wash) bloom — not the whole scene.
      bloomPass = new UnrealBloomPass(size, 0.7, 0.55, 0.8);
      composer.addPass(bloomPass);
      composer.addPass(new OutputPass());
      composer.setPixelRatio(curDPR);
      bloomOn = true;
    } catch (e) { composer = null; bloomPass = null; bloomOn = false; }
  }
  function draw() {
    if (composer && bloomOn) composer.render();
    else renderer.render(scene, camera);
  }

  function resize() {
    const w = root.clientWidth || window.innerWidth || 800;
    const h = root.clientHeight || window.innerHeight || 600;
    renderer.setSize(w, h, false);
    if (composer) composer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  on(window, "resize", resize);
  resize();
  setupPostFX();

  // ---------- sky ----------
  function skyTexture(stops) {
    const cv = document.createElement("canvas");
    cv.width = 32; cv.height = 256;
    const g = cv.getContext("2d");
    const gr = g.createLinearGradient(0, 0, 0, 256);
    stops.forEach(([o, c]) => gr.addColorStop(o, c));
    g.fillStyle = gr; g.fillRect(0, 0, 32, 256);
    return new T3.CanvasTexture(cv);
  }

  // ---------- GALAXIES: every mission is a different region of space ----------
  const GALAXIES = [
    { name: "VERDANT NEBULA", tag: "#5cffc4",
      sky: [[0, "#03140f"], [0.42, "#07362b"], [0.78, "#0d5a48"], [1, "#1d8a6a"]],
      fog: 0x0d4436, stars: [0xeafff6, 0xa8ffd9, 0x7fd0b8],
      beacon: [0x5cffc4, 0x2fae8a], streak: 0xbfffe6,
      nebula: ["#2fae8a", "#5cffc4"], planetTint: 0x9fe8c8, rim: 0x4dd0a0, mix: [0.6, 0.2, 0.2] },
    { name: "AMBER DRIFT", tag: "#ffcf5c",
      sky: [[0, "#170b02"], [0.42, "#3a2008"], [0.78, "#6a3c10"], [1, "#9a5c1a"]],
      fog: 0x4a2c0c, stars: [0xfff3dc, 0xffd9a0, 0xd8a86a],
      beacon: [0xffcf5c, 0xd88a2f], streak: 0xffe6bf,
      nebula: ["#c4671f", "#ffcf5c"], planetTint: 0xffd9a8, rim: 0xd8942f, mix: [0.7, 0.1, 0.2] },
    { name: "VIOLET EXPANSE", tag: "#c48aff",
      sky: [[0, "#0b0318"], [0.42, "#220a44"], [0.78, "#3d1478"], [1, "#5c22a8"]],
      fog: 0x2a0f52, stars: [0xf4eaff, 0xd9b8ff, 0xa87fd8],
      beacon: [0xc48aff, 0x7f4dd0], streak: 0xe6d4ff,
      nebula: ["#6a2fae", "#c48aff"], planetTint: 0xd9b8ff, rim: 0x9a5cd8, mix: [0.35, 0.25, 0.4] },
    { name: "CRIMSON VOID", tag: "#ff6a7f",
      sky: [[0, "#14030a"], [0.42, "#340a1a"], [0.78, "#5c102a"], [1, "#8a1a3a"]],
      fog: 0x420c1e, stars: [0xffe9ee, 0xffb8c4, 0xd87f94],
      beacon: [0xff6a7f, 0xd0304d], streak: 0xffd4dc,
      nebula: ["#ae2f4d", "#ff6a7f"], planetTint: 0xffb8c4, rim: 0xd84d6a, mix: [0.3, 0.5, 0.2] },
  ];
  let galaxy = GALAXIES[0];
  scene.background = skyTexture(galaxy.sky);
  scene.fog = new T3.Fog(galaxy.fog, 85, 200);

  // soft nebula billboards — the galaxy's signature color wash
  function radialGlow(hex) {
    const cv = document.createElement("canvas");
    cv.width = cv.height = 128;
    const g = cv.getContext("2d");
    const gr = g.createRadialGradient(64, 64, 4, 64, 64, 64);
    gr.addColorStop(0, hex + "cc");
    gr.addColorStop(0.45, hex + "55");
    gr.addColorStop(1, hex + "00");
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    return new T3.CanvasTexture(cv);
  }
  const nebulae = [];
  [[-70, 42, -238, 150], [82, 18, -246, 190], [-20, -18, -250, 130]].forEach(([x, y, z, sc], i) => {
    const m = new T3.Mesh(new T3.PlaneGeometry(1, 1),
      new T3.MeshBasicMaterial({ map: radialGlow(galaxy.nebula[i % 2]), transparent: true,
        opacity: 0.4, blending: T3.AdditiveBlending, depthWrite: false, fog: false }));
    m.position.set(x, y, z); m.scale.setScalar(sc);
    scene.add(m); nebulae.push(m);
  });

  scene.add(new T3.AmbientLight(0xa8c4ff, 1.35));
  const keyLight = new T3.DirectionalLight(0xfff0e0, 1.55);   // warm key, higher contrast
  keyLight.position.set(5, 11, 4); scene.add(keyLight);
  const rimLight = new T3.DirectionalLight(0x7fa8ff, 0.75);   // recolored per galaxy
  rimLight.position.set(-6, 4, -8); scene.add(rimLight);
  const underFill = new T3.DirectionalLight(0x4d6ab0, 0.28);  // bounce from below — kills dead shadows
  underFill.position.set(0, -6, 3); scene.add(underFill);
  const engineLight = new T3.PointLight(0xffa53c, 1.4, 8);
  scene.add(engineLight);

  // chunky toy shading ramp (RGBA, 4px wide for safe GL alignment)
  const gradData = new Uint8Array([100,100,100,255, 160,160,160,255, 215,215,215,255, 255,255,255,255]);
  const gradMap = new T3.DataTexture(gradData, 4, 1, T3.RGBAFormat);
  gradMap.minFilter = gradMap.magFilter = T3.NearestFilter;
  gradMap.needsUpdate = true;
  const toon = (color, opts) =>
    new T3.MeshToonMaterial(Object.assign({ color, gradientMap: gradMap }, opts || {}));

  const LANES = [-2.4, 0, 2.4], PLAYER_Z = 6, SPAWN_Z = -110, KILL_Z = 16;
  const TUNE = { baseSpeed: 24, maxSpeed: 54, laneSnap: 11, hitRadius: 1.15 };
  // Flight speed is tied to the maths level: a 4-year-old on level 1 gets a long,
  // calm approach; a 10-year-old on level 13 gets a real rush.
  function speedProfile() {
    let L = Math.min(MAX_LEVEL, Math.max(1, save.mathLevel));
    // The comparison rungs (14/15) are a quick snap judgement, not a hard sum —
    // fly them at a calm, readable pace (~L7/L9) rather than end-of-ladder speed.
    if (L >= 14) L = 7 + (L - 14) * 2;
    return { base: 13 + L * 1.4, max: 23 + L * 2.7, ramp: 0.03 + L * 0.022 };
  }
  let curSpeed = 0;
  const CURVE = 0.0012;
  // vertical profile: base horizon roll-off + a live elevation term that
  // makes the track climb and dive (elevCur > CURVE means the path rises ahead)
  let elevCur = 0, elevTarget = 0, elevTimer = 6;
  const curveY = (z) => { const d = z - PLAYER_Z; return d < 0 ? (-CURVE + elevCur) * d * d : 0; };
  // horizontal path bend — the course sweeps left/right over time
  let bendCur = 0, bendTarget = 0, bendTimer = 4;
  const bendX = (z) => { const d = z - PLAYER_Z; return d < 0 ? bendCur * d * d : 0; };

  // ---------- open-space flight path: laser hoop markers ----------
  const laneMarkers = [];
  {
    const beaconGeo = new T3.TorusGeometry(0.3, 0.035, 6, 18);
    for (let l = 0; l < 3; l++)
      for (let j = 0; j < 11; j++) {
        const b = new T3.Mesh(
          beaconGeo,
          new T3.MeshBasicMaterial({
            color: l === 1 ? 0x8df0ff : 0x4f9dff,
            transparent: true, opacity: 0.5, depthWrite: false,
            blending: T3.AdditiveBlending, fog: false,
          })
        );
        b.position.set(LANES[l], 0, -j * 12 + 4);
        b.userData.lx = LANES[l];
        scene.add(b); laneMarkers.push(b);
      }
  }
  // ---------- speed streaks (near field, elongate with velocity) ----------
  const STREAKS = 200;
  const streakData = [];
  const streakPos = new Float32Array(STREAKS * 6);
  const streakGeo = new T3.BufferGeometry();
  function seedStreak(s, fresh) {
    // avoid the play corridor centre so streaks don't obscure gates
    const side = Math.random() < 0.5 ? -1 : 1;
    s.x = side * (3.2 + Math.random() * 16);
    s.y = -5 + Math.random() * 18;
    s.z = fresh ? 12 - Math.random() * 150 : -140 - Math.random() * 12;
  }
  for (let i = 0; i < STREAKS; i++) { const s = { x: 0, y: 0, z: 0 }; seedStreak(s, true); streakData.push(s); }
  streakGeo.setAttribute("position", new T3.BufferAttribute(streakPos, 3));
  const streaks = new T3.LineSegments(
    streakGeo,
    new T3.LineBasicMaterial({ color: 0xcfe4ff, transparent: true, opacity: 0.5, fog: false })
  );
  streaks.frustumCulled = false;
  scene.add(streaks);
  function updateStreaks(dt, speed) {
    const len = 0.5 + speed * 0.11;            // faster = longer trails
    const frac = Math.min(1, speed / 55);
    streaks.material.opacity = 0.22 + frac * 0.45;
    for (let i = 0; i < STREAKS; i++) {
      const s = streakData[i];
      s.z += speed * dt * 1.45;                 // near field outruns the lanes
      if (s.z > 12) seedStreak(s, false);
      const o = i * 6;
      streakPos[o] = s.x; streakPos[o + 1] = s.y; streakPos[o + 2] = s.z;
      streakPos[o + 3] = s.x; streakPos[o + 4] = s.y; streakPos[o + 5] = s.z - len;
    }
    streakGeo.attributes.position.needsUpdate = true;
  }

  // ---------- parallax starfield (three depths, three speeds) ----------
  // round glow sprite — PointsMaterial with no map renders hard squares
  function starSprite() {
    const cv = document.createElement("canvas");
    cv.width = cv.height = 64;
    const g = cv.getContext("2d");
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, "rgba(255,255,255,1)");
    gr.addColorStop(0.18, "rgba(255,255,255,.95)");
    gr.addColorStop(0.38, "rgba(210,235,255,.42)");
    gr.addColorStop(0.68, "rgba(150,200,255,.10)");
    gr.addColorStop(1, "rgba(120,180,255,0)");
    g.fillStyle = gr;
    g.beginPath(); g.arc(32, 32, 32, 0, 7); g.fill();
    const t = new T3.CanvasTexture(cv);
    t.needsUpdate = true;
    return t;
  }
  const starTex = starSprite();
  const starLayers = [];
  function makeStars(count, size, color, spread, depth, speedMul) {
    const g = new T3.BufferGeometry(), pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * spread;
      pos[i * 3 + 1] = (Math.random() - 0.5) * spread * 0.55 + 6;
      pos[i * 3 + 2] = 12 - Math.random() * depth;
    }
    g.setAttribute("position", new T3.BufferAttribute(pos, 3));
    const pts = new T3.Points(g, new T3.PointsMaterial({
      color, size, map: starTex, transparent: true, opacity: 0.95,
      depthWrite: false, blending: T3.AdditiveBlending, sizeAttenuation: true, fog: false,
    }));
    pts.frustumCulled = false;
    scene.add(pts);
    starLayers.push({ geo: g, speedMul, depth });
    return pts;
  }
  const starPoints = [
    makeStars(240, 0.42, 0xffffff, 60, 130, 0.55),   // near — visibly rushing
    makeStars(340, 0.26, 0xdfeaff, 130, 260, 0.22),  // mid
    makeStars(460, 0.16, 0xaac8ff, 260, 460, 0.07),  // far — barely creeps
  ];
  function updateStars(dt, speed) {
    starLayers.forEach((L) => {
      const p = L.geo.attributes.position;
      const sp = speed * dt * L.speedMul;
      for (let i = 0; i < p.count; i++) {
        let z = p.getZ(i) + sp;
        if (z > 12) z -= L.depth;
        p.setZ(i, z);
      }
      p.needsUpdate = true;
    });
  }

  // ---------- peripheral debris (set dressing that whips past the camera) ----------
  const decor = [];
  function buildDecorRock() {
    const R = 0.6 + Math.random() * 2.6;
    const g = new T3.IcosahedronGeometry(R, 0), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const v = new T3.Vector3().fromBufferAttribute(p, i);
      v.multiplyScalar(1 + (Math.random() - 0.5) * 0.5);
      p.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeVertexNormals();
    return new T3.Mesh(g, toon(Math.random() < 0.5 ? 0x7d6a58 : 0x5f6b8a));
  }
  for (let i = 0; i < 14; i++) {
    const m = buildDecorRock();
    m.visible = false;
    scene.add(m);
    decor.push({ grp: m, spin: new T3.Vector3(Math.random() * 2, Math.random() * 2, Math.random()), live: false, mul: 1 });
  }
  function updateDecor(dt, speed) {
    decor.forEach((d) => {
      if (!d.live) {
        if (Math.random() < dt * 1.6) {
          const side = Math.random() < 0.5 ? -1 : 1;
          d.grp.position.set(side * (7 + Math.random() * 13), -7 + Math.random() * 22, -135);
          d.grp.visible = true; d.live = true;
          d.mul = 0.9 + Math.random() * 0.5;
        }
        return;
      }
      d.grp.position.z += speed * dt * d.mul;
      d.grp.rotation.x += d.spin.x * dt;
      d.grp.rotation.y += d.spin.y * dt;
      if (d.grp.position.z > 20) { d.grp.visible = false; d.live = false; }
    });
  }

  // ---------- big toy planets ----------
  function planetTexture(base, accent, style) {
    const cv = document.createElement("canvas");
    cv.width = 256; cv.height = 128;
    const g = cv.getContext("2d");
    g.fillStyle = base; g.fillRect(0, 0, 256, 128);
    g.fillStyle = accent;
    if (style === "stripes") {
      for (let y = 6; y < 128; y += 34) {
        g.beginPath();
        for (let x = 0; x <= 256; x += 16) g.lineTo(x, y + Math.sin(x * 0.06) * 5);
        for (let x = 256; x >= 0; x -= 16) g.lineTo(x, y + 14 + Math.sin(x * 0.06) * 5);
        g.closePath(); g.fill();
      }
    } else {
      g.globalAlpha = 0.5;
      for (let i = 0; i < 22; i++) {
        const r = 4 + Math.random() * 9;
        const x = Math.random() * 256, y = Math.random() * 128;
        const rg = g.createRadialGradient(x, y, 0, x, y, r);
        rg.addColorStop(0, accent); rg.addColorStop(1, "rgba(0,0,0,0)");
        g.fillStyle = rg;
        g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
      }
      g.globalAlpha = 1;
    }
    return new T3.CanvasTexture(cv);
  }
  function buildPlanet(r, base, accent, style, ringColor, atmoColor) {
    const grp = new T3.Group();
    grp.add(new T3.Mesh(
      new T3.SphereGeometry(r, 28, 20),
      new T3.MeshToonMaterial({ gradientMap: gradMap, map: planetTexture(base, accent, style), fog: false })
    ));
    if (atmoColor) {
      // rim halo — reads as an atmosphere, the premium tell in the reference shots
      const a1 = new T3.Mesh(new T3.SphereGeometry(r * 1.045, 28, 20),
        new T3.MeshBasicMaterial({ color: atmoColor, transparent: true, opacity: 0.16,
          blending: T3.AdditiveBlending, side: T3.BackSide, depthWrite: false, fog: false }));
      const a2 = new T3.Mesh(new T3.SphereGeometry(r * 1.13, 24, 16),
        new T3.MeshBasicMaterial({ color: atmoColor, transparent: true, opacity: 0.07,
          blending: T3.AdditiveBlending, side: T3.BackSide, depthWrite: false, fog: false }));
      grp.add(a1, a2);
    }
    if (ringColor) {
      const ring = new T3.Mesh(
        new T3.TorusGeometry(r * 1.55, r * 0.13, 10, 42),
        new T3.MeshToonMaterial({ color: ringColor, gradientMap: gradMap, fog: false })
      );
      ring.rotation.x = Math.PI / 2.4; ring.rotation.y = 0.25; grp.add(ring);
      const ring2 = new T3.Mesh(
        new T3.TorusGeometry(r * 1.85, r * 0.05, 8, 42),
        new T3.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, fog: false })
      );
      ring2.rotation.copy(ring.rotation); grp.add(ring2);
    }
    return grp;
  }
  const planets = [];
  function addPlanet(p, x, y, z, spin) {
    p.position.set(x, y, z); p.userData.spin = spin; scene.add(p); planets.push(p);
  }
  // image-4 composition: one huge planet far away, partially cropped by the frame
  addPlanet(buildPlanet(34, "#1f4fae", "#5f9fdc", "craters", null, 0x7fd0ff), 46, 34, -225, 0.015);
  // planets[0] is the DESTINATION — the mission literally flies to it
  const destPlanet = planets[0];
  const DP_START = { pos: new T3.Vector3(46, 34, -225), scale: 1.0 };
  const DP_NEAR  = { pos: new T3.Vector3(18, 10, -95),  scale: 0.7 };
  // arrival flyby: quadratic bezier sweeping the planet past the port side
  const FLY_P0 = DP_NEAR.pos.clone();
  const FLY_P1 = new T3.Vector3(-14, 4, -26);
  const FLY_P2 = new T3.Vector3(-95, -4, 65);
  let journey = 0;
  function qBez(a, b, c, u, out) {
    const v = 1 - u;
    out.set(
      v * v * a.x + 2 * v * u * b.x + u * u * c.x,
      v * v * a.y + 2 * v * u * b.y + u * u * c.y,
      v * v * a.z + 2 * v * u * b.z + u * u * c.z
    );
    return out;
  }
  const dpTmp = new T3.Vector3();
  const _v1 = new T3.Vector3(), _v2 = new T3.Vector3();   // reused scratch to avoid per-frame GC
  function placeDest(j) { // j 0..1 approach
    const e = j * j * (3 - 2 * j); // smoothstep
    destPlanet.position.lerpVectors(DP_START.pos, DP_NEAR.pos, e);
    destPlanet.scale.setScalar(T3.MathUtils.lerp(DP_START.scale, DP_NEAR.scale, e));
  }
  // a small ringed companion, very distant
  addPlanet(buildPlanet(6, "#e07fa4", "#c95584", "stripes", "#ffe0ec", null), -48, 26, -240, -0.03);
  // red dwarf sun (both reference shots have one)
  {
    const sun = new T3.Group();
    sun.add(new T3.Mesh(new T3.SphereGeometry(2.6, 20, 14),
      new T3.MeshBasicMaterial({ color: 0xff4a3c, fog: false })));
    const halo = new T3.Mesh(new T3.SphereGeometry(4.4, 20, 14),
      new T3.MeshBasicMaterial({ color: 0xff5c3c, transparent: true, opacity: 0.22, blending: T3.AdditiveBlending, depthWrite: false, fog: false }));
    sun.add(halo);
    const halo2 = new T3.Mesh(new T3.SphereGeometry(7, 16, 12),
      new T3.MeshBasicMaterial({ color: 0xff7050, transparent: true, opacity: 0.08, blending: T3.AdditiveBlending, depthWrite: false, fog: false }));
    sun.add(halo2);
    addPlanet(sun, -18, 40, -245, 0);
  }
  // (no planet underneath — open space reads faster and keeps the frame clean)

  // ---------- galaxy application: retint sky, fog, stars, beacons, nebulae ----------
  const starMats = starLayers.map((L, i) => null); // filled below
  function applyGalaxy(idx) {
    galaxy = GALAXIES[idx % GALAXIES.length];
    if (scene.background) scene.background.dispose();
    scene.background = skyTexture(galaxy.sky);
    scene.fog.color.setHex(galaxy.fog);
    rimLight.color.setHex(galaxy.rim);
    starPoints.forEach((pts, i) => pts.material.color.setHex(galaxy.stars[i % 3]));
    streaks.material.color.setHex(galaxy.streak);
    laneMarkers.forEach((b) => b.material.color.setHex(b.userData.lx === 0 ? galaxy.beacon[0] : galaxy.beacon[1]));
    nebulae.forEach((n, i) => {
      if (n.material.map) n.material.map.dispose();
      n.material.map = radialGlow(galaxy.nebula[i % 2]);
    });
    planets.forEach((p) => {
      const m = p.children[0].material;
      if (m && m.color) m.color.setHex(galaxy.planetTint);
    });
  }

  // ---------- hero rocket ----------
  const COLORS = [
    { name: "Cherry", accent: 0xff4d5e, price: 0 },
    { name: "Tangerine", accent: 0xff9a3c, price: 120 },
    { name: "Lime", accent: 0x54d64a, price: 220 },
    { name: "Grape", accent: 0xa06bff, price: 350 },
    { name: "Bubblegum", accent: 0xff6bb0, price: 500 },
  ];
  const accentMats = [];
  const acc = () => { const m = toon(0xff4d5e); accentMats.push(m); return m; };

  // ---------- ROCKET: hero model, detail pass ----------
  function buildRocket() {
    const s = new T3.Group();
    const white = toon(0xf7f9ff);
    const dark = toon(0x22304f);
    // chunky body with a subtle belly keel
    const body = new T3.Mesh(new T3.SphereGeometry(0.62, 22, 16), white);
    body.scale.set(1, 1, 2.0); s.add(body);
    const keel = new T3.Mesh(new T3.SphereGeometry(0.5, 16, 12), toon(0xdfe6f7));
    keel.scale.set(0.86, 0.5, 1.7); keel.position.y = -0.28; s.add(keel);
    // accent nose + stripe
    const nose = new T3.Mesh(new T3.SphereGeometry(0.63, 22, 12, 0, Math.PI * 2, 0, Math.PI / 2.6), acc());
    nose.rotation.x = -Math.PI / 2; nose.position.z = -0.62; nose.scale.set(1, 1, 1.35); s.add(nose);
    const band = new T3.Mesh(new T3.CylinderGeometry(0.615, 0.63, 0.26, 22), acc());
    band.rotation.x = Math.PI / 2; band.position.z = 0.45; s.add(band);
    const band2 = new T3.Mesh(new T3.CylinderGeometry(0.63, 0.635, 0.07, 22), dark);
    band2.rotation.x = Math.PI / 2; band2.position.z = 0.24; s.add(band2);
    // porthole
    const rim1 = new T3.Mesh(new T3.TorusGeometry(0.24, 0.065, 10, 22), acc());
    rim1.position.set(0, 0.5, 0.1); rim1.rotation.x = -0.5; s.add(rim1);
    const glass = new T3.Mesh(new T3.CircleGeometry(0.22, 20),
      new T3.MeshToonMaterial({ color: 0x8fe0ff, gradientMap: gradMap, emissive: 0x2a7ab0, emissiveIntensity: 0.55 }));
    glass.position.set(0, 0.5, 0.1); glass.rotation.x = -0.5; s.add(glass);
    // antenna
    const mast = new T3.Mesh(new T3.CylinderGeometry(0.018, 0.026, 0.4, 6), dark);
    mast.position.set(0, 0.76, 0.5); s.add(mast);
    const tip = new T3.Mesh(new T3.SphereGeometry(0.05, 8, 8),
      new T3.MeshBasicMaterial({ color: 0xff4d5e }));
    tip.position.set(0, 0.97, 0.5); tip.name = "navTip"; s.add(tip);
    // fins
    [[-0.62, 0, 0], [0.62, 0, 0], [0, -0.6, Math.PI / 2]].forEach((f) => {
      const fin = new T3.Mesh(new T3.ConeGeometry(0.34, 0.95, 4), acc());
      fin.scale.set(1, 0.9, 0.28);
      fin.rotation.x = Math.PI * 0.5;
      if (f[2]) fin.rotation.z = f[2];
      fin.position.set(f[0], f[1], 0.85); s.add(fin);
    });
    // nav lights: port red / starboard green — aviation convention, pulsing
    const navL = new T3.Mesh(new T3.SphereGeometry(0.06, 8, 8), new T3.MeshBasicMaterial({ color: 0xff3344 }));
    navL.position.set(-0.72, 0, 0.82); navL.name = "navL"; s.add(navL);
    const navR = new T3.Mesh(new T3.SphereGeometry(0.06, 8, 8), new T3.MeshBasicMaterial({ color: 0x33ff77 }));
    navR.position.set(0.72, 0, 0.82); navR.name = "navR"; s.add(navR);
    // engine
    const noz = new T3.Mesh(new T3.CylinderGeometry(0.3, 0.4, 0.32, 16), dark);
    noz.rotation.x = Math.PI / 2; noz.position.z = 1.25; s.add(noz);
    const glowRing = new T3.Mesh(new T3.TorusGeometry(0.34, 0.05, 8, 18),
      new T3.MeshBasicMaterial({ color: 0xffa53c, transparent: true, opacity: 0.85,
        blending: T3.AdditiveBlending, depthWrite: false }));
    glowRing.position.z = 1.42; glowRing.name = "engRing"; s.add(glowRing);
    const fO = new T3.Mesh(new T3.ConeGeometry(0.3, 1.1, 12), new T3.MeshBasicMaterial({ color: 0xff8a2a }));
    fO.rotation.x = Math.PI / 2; fO.position.z = 1.95; fO.name = "flameO"; s.add(fO);
    const fI = new T3.Mesh(new T3.ConeGeometry(0.16, 0.7, 10), new T3.MeshBasicMaterial({ color: 0xffe066 }));
    fI.rotation.x = Math.PI / 2; fI.position.z = 1.8; fI.name = "flameI"; s.add(fI);
    return s;
  }

  // ---------- UFO: the second pilot option ----------
  function buildPlayerUFO() {
    const s = new T3.Group();
    const hull = new T3.Mesh(new T3.SphereGeometry(1.0, 24, 14), toon(0xe9edf9));
    hull.scale.set(1, 0.3, 1); s.add(hull);
    const ringBand = new T3.Mesh(new T3.TorusGeometry(0.94, 0.1, 10, 28), acc());
    ringBand.rotation.x = Math.PI / 2; s.add(ringBand);
    const belly = new T3.Mesh(new T3.SphereGeometry(0.56, 18, 12), toon(0xc7cfe6));
    belly.scale.set(1, 0.55, 1); belly.position.y = -0.16; s.add(belly);
    const dome = new T3.Mesh(
      new T3.SphereGeometry(0.48, 18, 14, 0, Math.PI * 2, 0, Math.PI / 2),
      new T3.MeshToonMaterial({ color: 0xaee6ff, gradientMap: gradMap, transparent: true, opacity: 0.5 }));
    dome.position.y = 0.14; s.add(dome);
    // the pilot: a little green mathonaut
    const head = new T3.Mesh(new T3.SphereGeometry(0.21, 14, 10), toon(0x6fd649));
    head.position.y = 0.3; s.add(head);
    [-0.08, 0.08].forEach((x) => {
      const eye = new T3.Mesh(new T3.SphereGeometry(0.06, 8, 8), new T3.MeshBasicMaterial({ color: 0xffffff }));
      eye.position.set(x, 0.35, -0.15); s.add(eye);
      const pup = new T3.Mesh(new T3.SphereGeometry(0.03, 6, 6), new T3.MeshBasicMaterial({ color: 0x1e2a44 }));
      pup.position.set(x, 0.35, -0.2); s.add(pup);
    });
    // rim running-lights
    for (let i = 0; i < 10; i++) {
      const l = new T3.Mesh(new T3.SphereGeometry(0.06, 8, 8),
        new T3.MeshBasicMaterial({ color: 0x8df0ff }));
      const a = (i / 10) * Math.PI * 2;
      l.position.set(Math.cos(a) * 0.86, -0.02, Math.sin(a) * 0.86);
      l.name = "rimL" + i; s.add(l);
    }
    // anti-grav under-glow
    const ug = new T3.Mesh(new T3.TorusGeometry(0.6, 0.09, 8, 22),
      new T3.MeshBasicMaterial({ color: 0x5ce1ff, transparent: true, opacity: 0.7,
        blending: T3.AdditiveBlending, depthWrite: false }));
    ug.rotation.x = Math.PI / 2; ug.position.y = -0.34; ug.name = "ufoGlow"; s.add(ug);
    const beam = new T3.Mesh(new T3.ConeGeometry(0.5, 0.7, 14, 1, true),
      new T3.MeshBasicMaterial({ color: 0x5ce1ff, transparent: true, opacity: 0.14,
        blending: T3.AdditiveBlending, depthWrite: false, side: T3.DoubleSide }));
    beam.position.y = -0.62; beam.name = "ufoBeam"; s.add(beam);
    return s;
  }

  // rig holds whichever craft is active; all gameplay code drives the rig
  const ship = new T3.Group();
  const rocketModel = buildRocket();
  const ufoModel = buildPlayerUFO();
  ufoModel.visible = false;
  ship.add(rocketModel, ufoModel);
  ship.position.set(0, 0, PLAYER_Z);
  ship.scale.setScalar(0.82);
  scene.add(ship);

  const flameO = rocketModel.getObjectByName("flameO"),
        flameI = rocketModel.getObjectByName("flameI"),
        engRing = rocketModel.getObjectByName("engRing"),
        navL = rocketModel.getObjectByName("navL"),
        navR = rocketModel.getObjectByName("navR"),
        navTip = rocketModel.getObjectByName("navTip"),
        ufoGlow = ufoModel.getObjectByName("ufoGlow"),
        ufoBeam = ufoModel.getObjectByName("ufoBeam");

  const SHIPS = [
    { name: "ROCKET", odDur: 3.8, magnet: 1.1, price: 0 },
    { name: "UFO", odDur: 3.4, magnet: 1.55, price: 300 },
  ];
  let shipSel = 0;
  function applyShip(i) {
    shipSel = i;
    rocketModel.visible = i === 0;
    ufoModel.visible = i === 1;
    engineLight.color.setHex(i === 0 ? 0xffa53c : 0x5ce1ff);
    trailBits.forEach((b) => b.material.color.setHex(i === 0 ? 0xffb04a : 0x7fe8ff));
  }

  // one FX routine for both craft — power 0..2 drives thrust intensity
  function shipFX(power) {
    const t = performance.now();
    if (rocketModel.visible) {
      const fs = power + Math.random() * 0.15;
      flameO.scale.set(1, Math.max(0.15, fs), 1);
      flameI.scale.set(1, Math.max(0.15, fs * 1.1), 1);
      engRing.material.opacity = 0.4 + power * 0.4 + Math.random() * 0.1;
      const blink = Math.sin(t * 0.006) > 0.6 ? 1 : 0.15;
      navL.material.opacity = navR.material.opacity = 1;
      navL.scale.setScalar(0.8 + blink * 0.5);
      navR.scale.setScalar(0.8 + (1 - blink) * 0.5);
      navTip.scale.setScalar(0.8 + (Math.sin(t * 0.004) * 0.5 + 0.5) * 0.5);
      engineLight.position.copy(ship.position); engineLight.position.z += 1.8;
    } else {
      ufoModel.rotation.y += 0.03 + power * 0.02;       // saucer spin
      const pulse = 0.5 + Math.sin(t * 0.012) * 0.2 + power * 0.25;
      ufoGlow.material.opacity = Math.min(1, pulse);
      ufoGlow.scale.setScalar(1 + Math.sin(t * 0.012) * 0.08);
      ufoBeam.material.opacity = 0.08 + power * 0.08;
      for (let i = 0; i < 10; i++) {
        const l = ufoModel.getObjectByName("rimL" + i);
        l.material.opacity = 1;
        l.scale.setScalar(0.7 + (Math.sin(t * 0.01 + i * 0.63) * 0.5 + 0.5) * 0.6);
      }
      engineLight.position.copy(ship.position); engineLight.position.y -= 0.7;
    }
    engineLight.intensity = 0.6 + power * 0.7 + Math.random() * 0.25;
  }
  const applyColor = (i) => accentMats.forEach((m) => m.color.setHex(COLORS[i].accent));

  const shieldMesh = new T3.Mesh(
    new T3.SphereGeometry(1.6, 20, 14),
    new T3.MeshBasicMaterial({ color: 0x7ef3ff, transparent: true, opacity: 0.22, depthWrite: false })
  );
  shieldMesh.visible = false; scene.add(shieldMesh);

  const trailBits = [];
  for (let i = 0; i < 16; i++) {
    const b = new T3.Mesh(
      new T3.CircleGeometry(0.3, 10),
      new T3.MeshBasicMaterial({ color: 0xffb04a, transparent: true, opacity: 0.5, depthWrite: false })
    );
    b.visible = false; scene.add(b); trailBits.push(b);
  }
  let trailIdx = 0;

  // ---------- explosion particles ----------
  const boomBits = [];
  {
    const boomColors = [0xff8a2a, 0xffe066, 0xffffff, 0xff5c3c];
    for (let i = 0; i < 22; i++) {
      const b = new T3.Mesh(
        new T3.SphereGeometry(0.16 + Math.random() * 0.12, 8, 8),
        new T3.MeshBasicMaterial({ color: boomColors[i % 4], transparent: true, opacity: 1, depthWrite: false })
      );
      b.visible = false;
      b.userData.vel = new T3.Vector3();
      b.userData.life = 0;
      scene.add(b); boomBits.push(b);
    }
  }
  // expanding shockwave rings — the punctuation mark for big moments
  const waves = [];
  for (let i = 0; i < 4; i++) {
    const w = new T3.Mesh(new T3.TorusGeometry(1, 0.06, 8, 36),
      new T3.MeshBasicMaterial({ color: 0x5ce1ff, transparent: true, opacity: 0,
        blending: T3.AdditiveBlending, depthWrite: false, fog: false }));
    w.visible = false; w.userData.life = 0;
    scene.add(w); waves.push(w);
  }
  let waveIdx = 0;
  function shockwave(pos, color, big) {
    const w = waves[(waveIdx = (waveIdx + 1) % waves.length)];
    w.visible = true;
    w.position.copy(pos);
    w.material.color.setHex(color);
    w.userData.life = 1;
    w.userData.big = big ? 1.8 : 1;
    w.scale.setScalar(0.2);
    w.lookAt(camera.position);
  }
  function updateWaves(dt) {
    waves.forEach((w) => {
      if (!w.visible) return;
      w.userData.life -= dt * 1.8;
      if (w.userData.life <= 0) { w.visible = false; return; }
      const grow = (1 - w.userData.life) * 6 * w.userData.big + 0.2;
      w.scale.setScalar(grow);
      w.material.opacity = w.userData.life * 0.8;
    });
  }

  let boomIdx = 0;
  function boom(pos, power, count) {
    for (let i = 0; i < count; i++) {
      const b = boomBits[(boomIdx = (boomIdx + 1) % boomBits.length)];
      b.visible = true;
      b.position.copy(pos);
      b.userData.vel.set(Math.random() - 0.5, Math.random() - 0.35, Math.random() - 0.5).normalize()
        .multiplyScalar((3 + Math.random() * 5) * power);
      b.userData.life = 0.55 + Math.random() * 0.3;
      b.scale.setScalar(power);
    }
  }
  function updateBooms(dt) {
    boomBits.forEach((b) => {
      if (!b.visible) return;
      b.userData.life -= dt;
      if (b.userData.life <= 0) { b.visible = false; return; }
      b.position.addScaledVector(b.userData.vel, dt);
      b.userData.vel.multiplyScalar(1 - dt * 2.2);
      b.material.opacity = Math.min(1, b.userData.life * 2.2);
      b.scale.multiplyScalar(1 - dt * 0.8);
    });
  }

  // ---------- holographic laser sign (answer panels) ----------
  const LSTYLE = {
    idle:    { edge: "#5ce1ff", text: "#ffffff", tint: "rgba(30,120,190,", glow: "#5ce1ff" },
    correct: { edge: "#5cffc4", text: "#eafff6", tint: "rgba(30,190,130,", glow: "#5cffc4" },
    wrong:   { edge: "#ff5c7a", text: "#ffe9ee", tint: "rgba(190,40,70,",  glow: "#ff5c7a" },
    dim:     { edge: "#5f7fb0", text: "#c8d8f0", tint: "rgba(50,80,130,",  glow: "#5f7fb0" },
  };
  // LRU texture cache — building a fresh canvas texture per panel per gate
  // was ~54 GPU uploads a mission and a direct cause of context loss on mobile.
  const signCache = new Map();
  const SIGN_CACHE_MAX = 48;
  function laserSign(text, style) {
    const k = text + "|" + style;
    const hit = signCache.get(k);
    if (hit) { signCache.delete(k); signCache.set(k, hit); return hit; }
    const tex = buildLaserSign(text, style);
    signCache.set(k, tex);
    if (signCache.size > SIGN_CACHE_MAX) {
      const oldest = signCache.keys().next().value;
      const t = signCache.get(oldest);
      signCache.delete(oldest);
      if (t) t.dispose();
    }
    return tex;
  }
  function buildLaserSign(text, style) {
    const S = LSTYLE[style] || LSTYLE.idle;
    const W = 256, H = 150;
    const cv = document.createElement("canvas");
    cv.width = W; cv.height = H;
    const g = cv.getContext("2d");
    const r = 22, pad = 14;
    const box = (fn) => {
      g.beginPath();
      g.moveTo(pad + r, pad); g.lineTo(W - pad - r, pad);
      g.quadraticCurveTo(W - pad, pad, W - pad, pad + r);
      g.lineTo(W - pad, H - pad - r);
      g.quadraticCurveTo(W - pad, H - pad, W - pad - r, H - pad);
      g.lineTo(pad + r, H - pad);
      g.quadraticCurveTo(pad, H - pad, pad, H - pad - r);
      g.lineTo(pad, pad + r);
      g.quadraticCurveTo(pad, pad, pad + r, pad);
      g.closePath(); fn();
    };
    // volumetric interior (additive: dark = invisible, so this reads as glassy haze)
    const grd = g.createLinearGradient(0, pad, 0, H - pad);
    grd.addColorStop(0, S.tint + ".42)");
    grd.addColorStop(0.5, S.tint + ".16)");
    grd.addColorStop(1, S.tint + ".42)");
    g.fillStyle = grd; box(() => g.fill());
    // scanlines
    g.globalAlpha = 0.22; g.fillStyle = S.edge;
    for (let y = pad + 4; y < H - pad; y += 7) g.fillRect(pad, y, W - pad * 2, 1);
    g.globalAlpha = 1;
    // glowing frame
    g.shadowColor = S.glow; g.shadowBlur = 16;
    g.strokeStyle = S.edge; g.lineWidth = 3.5; box(() => g.stroke());
    g.shadowBlur = 8; g.lineWidth = 1.2; box(() => g.stroke());
    // corner brackets — tech read
    g.shadowBlur = 10; g.lineWidth = 4; g.strokeStyle = S.edge;
    const c = 18;
    [[pad, pad, 1, 1], [W - pad, pad, -1, 1], [pad, H - pad, 1, -1], [W - pad, H - pad, -1, -1]]
      .forEach(([x, y, sx, sy]) => {
        g.beginPath();
        g.moveTo(x + sx * c, y); g.lineTo(x + sx * 4, y);
        g.moveTo(x, y + sy * c); g.lineTo(x, y + sy * 4);
        g.stroke();
      });
    // numerals
    const str = String(text);
    g.shadowColor = S.glow; g.shadowBlur = 22;
    g.fillStyle = S.text;
    g.font = (str.length > 3 ? "900 68px " : "900 96px ") +
      '-apple-system,"SF Pro Display","Segoe UI",sans-serif';
    g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText(str, W / 2, H / 2 + 2);
    g.shadowBlur = 0;
    const tx = new T3.CanvasTexture(cv);
    tx.anisotropy = 4;
    return tx;
  }

  // ---------- opaque sign texture (used by star coins) ----------
  function textTexture(text, borderColor, bgColor, txtColor) {
    const cv = document.createElement("canvas");
    cv.width = 256; cv.height = 150;
    const g = cv.getContext("2d");
    const r = 64;
    g.fillStyle = bgColor || "#ffffff";
    g.beginPath(); g.moveTo(r, 6); g.lineTo(256 - r, 6); g.quadraticCurveTo(250, 6, 250, r);
    g.lineTo(250, 150 - r); g.quadraticCurveTo(250, 144, 256 - r, 144); g.lineTo(r, 144);
    g.quadraticCurveTo(6, 144, 6, 150 - r); g.lineTo(6, r); g.quadraticCurveTo(6, 6, r, 6);
    g.closePath(); g.fill();
    g.strokeStyle = borderColor || "#38d98a"; g.lineWidth = 12; g.stroke();
    g.fillStyle = txtColor || "#1e2a66";
    g.font = String(text).length > 4 ? '900 58px "Segoe UI",sans-serif' : '900 84px "Segoe UI",sans-serif';
    g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText(String(text), 128, 80);
    const tx = new T3.CanvasTexture(cv); tx.anisotropy = 4; return tx;
  }

  // ---------- obstacles ----------
  function randDir() {
    return new T3.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
  }
  function scatterOnSphere(grp, radius, count, maker) {
    for (let i = 0; i < count; i++) {
      const v = randDir();
      const m = maker();
      m.position.copy(v.clone().multiplyScalar(radius * 0.96));
      m.lookAt(v.clone().multiplyScalar(radius * 2));
      grp.add(m);
    }
  }
  function buildAsteroid() {
    const grp = new T3.Group();
    const R = 0.85 + Math.random() * 0.45;
    const g = new T3.IcosahedronGeometry(R, 1), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const v = new T3.Vector3().fromBufferAttribute(p, i);
      v.multiplyScalar(1 + (Math.random() - 0.5) * 0.38);
      p.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeVertexNormals();
    grp.add(new T3.Mesh(g, toon(0x9c7a5e)));
    scatterOnSphere(grp, R, 5, () => new T3.Mesh(new T3.CircleGeometry(0.13 + Math.random() * 0.12, 10), toon(0x6e5440)));
    scatterOnSphere(grp, R, 3, () => new T3.Mesh(new T3.CircleGeometry(0.1 + Math.random() * 0.08, 8), toon(0xc4a184)));
    grp.userData.spin = new T3.Vector3(Math.random(), Math.random() * 1.4, Math.random());
    return grp;
  }
  function buildComet() {
    const grp = new T3.Group();
    grp.add(new T3.Mesh(new T3.IcosahedronGeometry(0.55, 1), toon(0x8a97b8)));
    scatterOnSphere(grp, 0.55, 3, () => new T3.Mesh(new T3.CircleGeometry(0.1, 8), toon(0x5c6a8f)));
    const f1 = new T3.Mesh(new T3.ConeGeometry(0.55, 2.4, 10), new T3.MeshBasicMaterial({ color: 0xff9a3c }));
    f1.rotation.x = -Math.PI / 2; f1.position.z = -1.3; grp.add(f1);
    const f2 = new T3.Mesh(new T3.ConeGeometry(0.32, 1.7, 8), new T3.MeshBasicMaterial({ color: 0xffe066 }));
    f2.rotation.x = -Math.PI / 2; f2.position.z = -1.1; grp.add(f2);
    grp.userData.flames = [f1, f2];
    return grp;
  }
  function buildUFO() {
    const grp = new T3.Group();
    const disc = new T3.Mesh(new T3.SphereGeometry(1.25, 20, 12), toon(0xffb84d));
    disc.scale.set(1, 0.32, 1); grp.add(disc);
    const belly = new T3.Mesh(new T3.SphereGeometry(0.7, 16, 10), toon(0xe8973b));
    belly.scale.set(1, 0.5, 1); belly.position.y = -0.18; grp.add(belly);
    const dome = new T3.Mesh(
      new T3.SphereGeometry(0.55, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2),
      new T3.MeshToonMaterial({ color: 0xaee6ff, gradientMap: gradMap, transparent: true, opacity: 0.55 })
    );
    dome.position.y = 0.16; grp.add(dome);
    const head = new T3.Mesh(new T3.SphereGeometry(0.24, 12, 10), toon(0x6fd649));
    head.position.y = 0.36; grp.add(head);
    [-0.09, 0.09].forEach((x) => {
      const eye = new T3.Mesh(new T3.SphereGeometry(0.07, 8, 8), new T3.MeshBasicMaterial({ color: 0xffffff }));
      eye.position.set(x, 0.42, 0.18); grp.add(eye);
      const pup = new T3.Mesh(new T3.SphereGeometry(0.035, 6, 6), new T3.MeshBasicMaterial({ color: 0x1e2a44 }));
      pup.position.set(x, 0.42, 0.245); grp.add(pup);
    });
    const ant = new T3.Mesh(new T3.CylinderGeometry(0.02, 0.02, 0.22, 6), toon(0x4aa832));
    ant.position.y = 0.62; grp.add(ant);
    const bob = new T3.Mesh(new T3.SphereGeometry(0.05, 8, 8), new T3.MeshBasicMaterial({ color: 0xffe066 }));
    bob.position.y = 0.75; grp.add(bob);
    for (let i = 0; i < 8; i++) {
      const l = new T3.Mesh(new T3.SphereGeometry(0.09, 8, 8),
        new T3.MeshBasicMaterial({ color: i % 2 ? 0xff5c6a : 0xffe066 }));
      const a = (i / 8) * Math.PI * 2;
      l.position.set(Math.cos(a) * 1.05, -0.02, Math.sin(a) * 1.05); grp.add(l);
    }
    return grp;
  }
  let coinTex = null;
  function buildCrystal() {
    const grp = new T3.Group();
    const coin = new T3.Mesh(new T3.CylinderGeometry(0.5, 0.5, 0.14, 20),
      toon(0xffcf3f, { emissive: 0x8a5a00, emissiveIntensity: 0.25 }));
    coin.rotation.x = Math.PI / 2; grp.add(coin);
    if (!coinTex) coinTex = textTexture("★", "#e8a20c", "#ffcf3f", "#ffffff");
    const face = new T3.Mesh(new T3.PlaneGeometry(0.8, 0.8),
      new T3.MeshBasicMaterial({ map: coinTex, transparent: true }));
    face.position.z = 0.08; grp.add(face);
    const face2 = face.clone(); face2.position.z = -0.08; face2.rotation.y = Math.PI; grp.add(face2);
    return grp;
  }
  function buildCrate() {
    const grp = new T3.Group();
    const box = new T3.Mesh(new T3.BoxGeometry(0.72, 0.72, 0.72), toon(0xd9a35c));
    grp.add(box);
    const bandMat = toon(0x8a5f2f);
    [0.001, Math.PI / 2].forEach((r) => {
      const b = new T3.Mesh(new T3.BoxGeometry(0.78, 0.14, 0.78), bandMat);
      b.rotation.z = r; grp.add(b);
    });
    const glow = new T3.Mesh(new T3.PlaneGeometry(1.5, 1.5),
      new T3.MeshBasicMaterial({ color: 0xffcf5c, transparent: true, opacity: 0.16,
        blending: T3.AdditiveBlending, depthWrite: false, fog: false }));
    grp.add(glow); grp.userData.halo = glow;
    grp.userData.spin = new T3.Vector3(0.8, 1.2, 0.5);
    return grp;
  }
  function buildDebris() {
    const grp = new T3.Group();
    grp.add(new T3.Mesh(new T3.IcosahedronGeometry(0.55, 0),
      toon(0xff7d5c, { emissive: 0x7a1c08, emissiveIntensity: 0.35 })));
    const spike = new T3.Mesh(new T3.ConeGeometry(0.14, 0.5, 6), toon(0xffab2e));
    spike.position.y = 0.6; grp.add(spike);
    const spike2 = spike.clone(); spike2.rotation.z = Math.PI; spike2.position.y = -0.6; grp.add(spike2);
    grp.userData.spin = new T3.Vector3(2, 2, 1);
    return grp;
  }

  const active = [];
  const pools = { asteroid: [], comet: [], ufo: [], crystal: [], debris: [], crate: [] };
  const builders = { asteroid: buildAsteroid, comet: buildComet, ufo: buildUFO, crystal: buildCrystal, debris: buildDebris, crate: buildCrate };
  function spawn(kind, lane, z) {
    let grp = pools[kind].pop();
    if (!grp) grp = builders[kind]();
    grp.visible = true;
    grp.position.set(LANES[lane] + bendX(z), curveY(z), z);
    grp.rotation.set(0, 0, 0);
    scene.add(grp);
    active.push({ grp, kind, lane, x: LANES[lane], t: Math.random() * 6, scored: false,
      speedMul: kind === "comet" ? 1.7 : 1, driftT: 1.4 + Math.random() * 1.5, targetLane: lane });
  }
  function despawn(i) {
    const o = active[i];
    o.grp.visible = false; scene.remove(o.grp);
    pools[o.kind].push(o.grp); active.splice(i, 1);
  }
  const clearActive = () => { for (let i = active.length - 1; i >= 0; i--) despawn(i); };

  // ---------- gates ----------
  const gateGroup = new T3.Group(); scene.add(gateGroup);
  let gate = null;
  function makeGate(q) {
    const panels = [];
    for (let l = 0; l < 3; l++) {
      const val = q.options[l];
      const dimmed = q.fadeLane === l;
      const mesh = new T3.Mesh(
        new T3.PlaneGeometry(2.7, 1.58),
        new T3.MeshBasicMaterial({
          map: laserSign(val, dimmed ? "dim" : "idle"),
          transparent: true, depthWrite: false, fog: false,   // never fade into fog
          blending: T3.AdditiveBlending, opacity: dimmed ? 0.35 : 1,
        })
      );
      mesh.position.set(LANES[l], 1.35, 0);
      gateGroup.add(mesh);
      panels.push({ mesh, val, lane: l });

      // emitter pucks + projection beams — the sign reads as *projected*, not planted
      [-1.06, 1.06].forEach((px) => {
        const puck = new T3.Mesh(
          new T3.CylinderGeometry(0.13, 0.17, 0.1, 12),
          new T3.MeshBasicMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0.9, fog: false })
        );
        puck.position.set(LANES[l] + px, -0.62, 0);
        gateGroup.add(puck);
        const beam = new T3.Mesh(
          new T3.CylinderGeometry(0.035, 0.09, 1.85, 8, 1, true),
          new T3.MeshBasicMaterial({
            color: 0x5ce1ff, transparent: true, opacity: 0.3,
            blending: T3.AdditiveBlending, depthWrite: false, side: T3.DoubleSide, fog: false,
          })
        );
        beam.position.set(LANES[l] + px, 0.35, 0);
        gateGroup.add(beam);
      });
    }
    gateGroup.position.set(0, curveY(SPAWN_Z - 4), SPAWN_Z - 4);
    gateGroup.visible = true;
    gate = { panels, q, answered: false, resolveT: 0 };
    showAnswers(q);
  }
  function clearGate() {
    while (gateGroup.children.length) {
      const c = gateGroup.children.pop();
      if (c.material) c.material.dispose();   // maps are cache-owned; never dispose here
      if (c.geometry) c.geometry.dispose();
    }
    gateGroup.visible = false; gate = null;
    hideAnswers();
  }
  const ring = new T3.Mesh(new T3.TorusGeometry(2.2, 0.16, 10, 40),
    toon(0x38d98a, { emissive: 0x0d5a34, emissiveIntensity: 0.4 }));
  ring.visible = false; scene.add(ring);

  // ---------- boss ----------
  let boss = null;
  function buildBoss(color) {
    const grp = new T3.Group();
    const disc = new T3.Mesh(new T3.SphereGeometry(3.6, 24, 14), toon(0x8a97b8));
    disc.scale.set(1, 0.3, 1); grp.add(disc);
    const belly = new T3.Mesh(new T3.SphereGeometry(2.1, 20, 12), toon(0x6b7899));
    belly.scale.set(1, 0.5, 1); belly.position.y = -0.5; grp.add(belly);
    const dome = new T3.Mesh(
      new T3.SphereGeometry(1.6, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2),
      new T3.MeshToonMaterial({ color, gradientMap: gradMap, emissive: color, emissiveIntensity: 0.35, transparent: true, opacity: 0.92 })
    );
    dome.position.y = 0.4; dome.name = "bossDome"; grp.add(dome);
    [-0.55, 0.55].forEach((x) => {
      const eye = new T3.Mesh(new T3.SphereGeometry(0.28, 10, 10), new T3.MeshBasicMaterial({ color: 0xffffff }));
      eye.position.set(x, 1.0, 1.1); grp.add(eye);
      const pup = new T3.Mesh(new T3.SphereGeometry(0.13, 8, 8), new T3.MeshBasicMaterial({ color: 0x1e2a44 }));
      pup.position.set(x, 1.0, 1.33); grp.add(pup);
    });
    for (let i = 0; i < 12; i++) {
      const l = new T3.Mesh(new T3.SphereGeometry(0.22, 8, 8),
        new T3.MeshBasicMaterial({ color: i % 2 ? 0xff5c6a : 0xffe066 }));
      const a = (i / 12) * Math.PI * 2;
      l.position.set(Math.cos(a) * 3.3, -0.15, Math.sin(a) * 3.3);
      l.name = "bl" + i; grp.add(l);
    }
    // emitter the attack beam fires from
    const emit = new T3.Mesh(new T3.SphereGeometry(0.5, 12, 10),
      new T3.MeshBasicMaterial({ color: 0xff5c6a, transparent: true, opacity: 0.9 }));
    emit.position.set(0, -0.7, 0); emit.name = "bossEmit"; grp.add(emit);
    grp.position.set(0, 3.4, -58);
    return grp;
  }
  // boss attack beam — sweeps a lane, telegraphed before it fires
  const bossBeam = new T3.Mesh(
    new T3.CylinderGeometry(0.5, 0.5, 80, 14, 1, true),
    new T3.MeshBasicMaterial({ color: 0xff5c6a, transparent: true, opacity: 0,
      blending: T3.AdditiveBlending, depthWrite: false, side: T3.DoubleSide, fog: false })
  );
  bossBeam.rotation.x = Math.PI / 2;
  bossBeam.visible = false;
  scene.add(bossBeam);
  const bossAtk = { state: "idle", t: 2.2, lane: 1, lane2: -1 };

  const laser = new T3.Mesh(new T3.CylinderGeometry(0.1, 0.1, 1, 8),
    new T3.MeshBasicMaterial({ color: 0xff5c8a, transparent: true, opacity: 0.95 }));
  laser.visible = false; scene.add(laser);
  let laserT = 0;

  // ---------- audio ----------
  let AC = null;
  function audioCtx() {
    if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { AC = null; } }
    return AC;
  }
  function beep(freq, dur, type, vol, slide) {
    if (!setting("sound")) return;              // respect the sound-effects toggle
    const ctx = audioCtx(); if (!ctx) return;
    try {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type || "sine";
      o.frequency.setValueAtTime(freq, ctx.currentTime);
      if (slide) o.frequency.exponentialRampToValueAtTime(slide, ctx.currentTime + dur);
      g.gain.setValueAtTime(vol || 0.15, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
      o.connect(g); g.connect(ctx.destination);
      o.start(); o.stop(ctx.currentTime + dur);
    } catch (e) { /* audio is decoration; never break the game */ }
  }
  const sfx = {
    swipe: () => beep(420, 0.09, "triangle", 0.09, 640),
    pickup: () => { beep(760, 0.12, "sine", 0.16, 1140); setTimeout(() => beep(1140, 0.1, "sine", 0.1, 1500), 60); },
    correct: () => { beep(660, 0.12, "sine", 0.18, 880); setTimeout(() => beep(880, 0.12, "sine", 0.16, 1100), 90); setTimeout(() => beep(1320, 0.16, "sine", 0.14), 180); },
    wrong: () => beep(220, 0.25, "triangle", 0.14, 150),
    hit: () => beep(140, 0.35, "sawtooth", 0.25, 50),
    shield: () => beep(500, 0.2, "sine", 0.12, 300),
    laser: () => beep(900, 0.2, "sawtooth", 0.12, 200),
    bossHit: () => { beep(120, 0.35, "square", 0.18, 60); setTimeout(() => beep(90, 0.3, "sawtooth", 0.14, 40), 80); },
    win: () => [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => beep(f, 0.22, "sine", 0.16), i * 130)),
    overdrive: () => {
      beep(180, 0.5, "sawtooth", 0.16, 900);
      setTimeout(() => beep(520, 0.3, "square", 0.1, 1400), 90);
      setTimeout(() => beep(880, 0.4, "sine", 0.12, 1760), 180);
    },
    smash: () => { beep(90, 0.18, "square", 0.2, 40); beep(700, 0.12, "sawtooth", 0.1, 200); },
    count: (n) => { beep(n === 1 ? 900 : 620, 0.13, "square", 0.13); },
    charge: () => beep(180, 0.85, "sawtooth", 0.07, 780),
    beam: () => { beep(950, 0.4, "sawtooth", 0.16, 180); beep(200, 0.35, "square", 0.1, 90); },
    blast: () => {
      beep(70, 1.1, "sawtooth", 0.24, 260);
      beep(140, 0.9, "square", 0.1, 420);
      setTimeout(() => beep(1200, 0.5, "sine", 0.12, 300), 60);
    },
  };

  // ---------- haptics ----------
  // Short taps on hits and answers; respects the vibration toggle. Guards every
  // access — navigator.vibrate is absent on iOS Safari and must never throw.
  function haptic(pattern) {
    if (!setting("haptics")) return;
    const nav = (typeof window !== "undefined" && window.navigator) || (typeof navigator !== "undefined" ? navigator : null);
    try { if (nav && typeof nav.vibrate === "function") nav.vibrate(pattern); } catch (e) { /* decoration */ }
  }

  // ---------- music bed ----------
  // A low filtered drone that rises in pitch with flight speed (docs/06 0.4).
  // Persistent oscillator, started on flight, stopped on menus / when muted.
  let musicOsc = null, musicGain = null, musicFilter = null;
  function startMusic() {
    const ctx = audioCtx();
    if (!ctx || !setting("music") || musicOsc) return;
    try {
      musicOsc = ctx.createOscillator();
      musicGain = ctx.createGain();
      musicFilter = ctx.createBiquadFilter();
      musicOsc.type = "sawtooth";
      musicOsc.frequency.setValueAtTime(48, ctx.currentTime);
      musicFilter.type = "lowpass";
      musicFilter.frequency.setValueAtTime(300, ctx.currentTime);
      musicGain.gain.setValueAtTime(0.0001, ctx.currentTime);
      musicGain.gain.linearRampToValueAtTime(0.05, ctx.currentTime + 0.8);
      musicOsc.connect(musicFilter); musicFilter.connect(musicGain); musicGain.connect(ctx.destination);
      musicOsc.start();
    } catch (e) { musicOsc = null; musicGain = null; musicFilter = null; }
  }
  function stopMusic() {
    if (!musicOsc) return;
    try {
      const ctx = audioCtx();
      musicGain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.2);
      musicOsc.stop(ctx.currentTime + 0.5);
    } catch (e) { /* ignore */ }
    musicOsc = null; musicGain = null; musicFilter = null;
  }
  function updateMusic() {
    const flying = state === S.RUN || state === S.CINE;
    if (setting("music") && flying) startMusic(); else stopMusic();
    if (musicOsc) {
      try {
        const ctx = audioCtx();
        const frac = Math.min(1, (curSpeed || 0) / speedProfile().max);
        musicOsc.frequency.setTargetAtTime(48 + frac * 74, ctx.currentTime, 0.15);       // pitch rises with speed
        if (musicFilter) musicFilter.frequency.setTargetAtTime(300 + frac * 900, ctx.currentTime, 0.2);
      } catch (e) { /* ignore */ }
    }
  }

// math (genQuestion, LEVELS, levelName, ri, pick) is imported from ./math/questions.js

    // Each mission changes a RULE, not just the wallpaper.
  const MISSIONS = [
    { icon: "👽", title: "Rescue Zippo", boss: 0x54d64a, bossName: "TRACTOR SAUCER", mod: "rescue",
      text: "Zippo is trapped in a tractor beam past the asteroid belt. Charge your rescue laser and bring him home.",
      rule: "Standard flight rules",
      winText: "Zippo is free — he does a happy wiggle." },
    { icon: "📦", title: "Cargo Run to Nova", boss: 0xff9a3c, bossName: "PIRATE BARGE", mod: "cargo",
      text: "Station Nova needs med-kits. Collect cargo pods on the way — but every hit knocks one loose.",
      rule: "Collect cargo · each hit drops a pod · +30 ★ per pod delivered",
      winText: "Cargo delivered. Station Nova cheers." },
    { icon: "🔧", title: "Repair the Solar Array", boss: 0xa06bff, bossName: "GLITCH CORE", mod: "repair",
      text: "The array needs power codes entered in sequence. Three correct answers in a row repairs a node.",
      rule: "3 correct in a row = node repaired · a miss breaks the chain · +80 ★ per node",
      winText: "Array repaired — the lights come back on." },
    { icon: "🕳️", title: "Escape the Dark Rift", boss: 0x5c8aff, bossName: "RIFT GUARDIAN", mod: "rift",
      text: "A dark rift is swallowing the lane behind you. Right answers push it back. Wrong ones feed it.",
      rule: "The rift chases you · correct answers push it back · it never stops coming",
      winText: "You escaped the rift. Smooth flying, pilot." },
  ];

  // ---------- save ----------
  const DEFAULT_SETTINGS = { sound: true, music: true, haptics: true, reduceMotion: false, highContrast: false };
  const save = { mathLevel: 1, missions: 0, stars: 0, lifetime: 0, colorSel: 0,
    colorsOwned: [0], shipsOwned: [0], shipSel: 0, settings: { ...DEFAULT_SETTINGS } };
  // Accessibility / audio setting readers (see docs/05-compliance.md).
  const setting = (k) => (save.settings ? save.settings[k] : DEFAULT_SETTINGS[k]);
  const reduceMotion = () => !!setting("reduceMotion");
  const motion = () => (reduceMotion() ? 0 : 1);
  let storageOK = false;
  async function loadSave() {
    try {
      const r = await window.storage.get("mathonaut-save");
      if (r && r.value) Object.assign(save, JSON.parse(r.value));
      // migrate older saves
      if (!Array.isArray(save.colorsOwned)) save.colorsOwned = [0];
      if (!Array.isArray(save.shipsOwned)) save.shipsOwned = [0];
      if (!save.colorsOwned.includes(save.colorSel)) save.colorSel = 0;
      if (!save.shipsOwned.includes(save.shipSel)) save.shipSel = 0;
      save.settings = { ...DEFAULT_SETTINGS, ...(save.settings || {}) };  // migrate: unknown/missing settings default
      storageOK = true;
    } catch (e) {
      storageOK = typeof window.storage !== "undefined";
    }
    if (disposed) return;
    refreshMenu(); applyColor(save.colorSel); applyShip(save.shipSel); applySettings();
  }
  async function persist() {
    if (!storageOK) return;
    try { await window.storage.set("mathonaut-save", JSON.stringify(save)); } catch (e) { /* ignore */ }
  }
  // Reflect accessibility settings onto the root so CSS can respond (high
  // contrast; reduced motion also kills CSS keyframe animations).
  function applySettings() {
    root.classList.toggle("hc", !!setting("highContrast"));
    root.classList.toggle("rm", reduceMotion());
  }

  // ---------- state ----------
  const S = { MENU: 0, BRIEF: 1, RUN: 2, WIN: 3, FAIL: 4, CINE: 5 };
  let state = S.MENU;
  let laneIdx = 1, score = 0, runTime = 0, hp = 3, shield = false, combo = 0, bestCombo = 0;
  let phase = "fly", phaseT = 0, gatesDone = 0, totalGates = 6, answersRight = 0, answersTotal = 0;
  let spawnT = 0.8;
  let recent = [], assist = false, supportRetry = false;
  let mission = null, bossHP = 3;
  const qty = { need: 0, have: 0, activeT: 0 };
  let shake = 0, hitPause = 0, fovKick = 0, invuln = 0, timeScale = 1;
  let crashing = false, crashT = 0, crashSparkT = 0;
  let od = 0, odActive = 0, odSmashes = 0;   // #3: overdrive charge / seconds left
  // mission modifier state
  let cargo = 0, coinsRun = 0, chain = 0, nodes = 0, riftZ = 30, riftHits = 0;
  let guardsSpawned = 0;                      // guards placed in front of the answer this mission (0 below L4)
  let launchT = 0;                            // post-blastoff acceleration ramp
  let disposed = false;

  // ---------- launch cinematic tick ----------
  function updateCine(dt) {
    cineT += dt;
    updateStars(dt, 9);
    updateStreaks(dt, 9);
    ship.position.y = Math.sin(performance.now() * 0.0016) * 0.12;
    ship.rotation.z = Math.sin(performance.now() * 0.001) * 0.05;

    const ct = cineT - CINE.pan;
    // engines idle during the vista, then rev harder with every number
    let rev = 0.45;
    if (ct >= 0) rev = 0.45 + Math.min(5, ct / CINE.step) * 0.22;
    shipFX(rev);

    if (ct >= 0) {
      skipHint.classList.remove("on");
      const idx = Math.floor(ct / CINE.step);
      if (idx < 5) {
        cdBox.classList.add("on");
        const n = 5 - idx;
        if (n !== lastCount) { lastCount = n; setDigit(n); sfx.count(n); shake = Math.max(shake, 0.12); }
      } else if (!blasted) {
        blasted = true;
        cdBox.classList.remove("on");
        blastEl.classList.remove("on");
        void blastEl.offsetWidth;
        blastEl.classList.add("on");
        sfx.blast();
        boom(ship.position.clone().add(new T3.Vector3(0, -0.1, 1.9)), 1.1, 10);
        shockwave(ship.position, 0x5ce1ff, true);
        shake = 0.7;
      }
    }
    if (cineT >= CINE_END) beginFlight();
  }
  const CINE = { pan: 4.0, step: 0.66, blast: 0.8 };
  const CINE_END = CINE.pan + 5 * CINE.step + CINE.blast;
  let cineT = 0, lastCount = 0, blasted = false;
  const SEG = {
    5: ["a", "f", "g", "c", "d"],
    4: ["f", "g", "b", "c"],
    3: ["a", "b", "g", "c", "d"],
    2: ["a", "b", "g", "e", "d"],
    1: ["b", "c"],
  };
  const seg7 = $("seg7"), cdBox = $("countdown"), blastEl = $("blastoff"), skipHint = $("skipHint");
  function setDigit(n) {
    seg7.querySelectorAll(".s").forEach((s) => s.classList.remove("on"));
    (SEG[n] || []).forEach((k) => { const el = seg7.querySelector("." + k); if (el) el.classList.add("on"); });
    seg7.classList.remove("pop");
    void seg7.offsetWidth;   // restart the pop animation
    seg7.classList.add("pop");
  }

  // overdrive aura around the ship
  const odAura = new T3.Mesh(
    new T3.SphereGeometry(1.85, 20, 14),
    new T3.MeshBasicMaterial({
      color: 0x5ce1ff, transparent: true, opacity: 0.3,
      blending: T3.AdditiveBlending, depthWrite: false, fog: false,
    })
  );
  odAura.visible = false;
  scene.add(odAura);

  const qBox = $("question"), qText = $("qText"), qSub = $("qSub"),
    heartsEl = $("hearts"), shieldTag = $("shieldTag"), scoreEl = $("score"),
    comboEl = $("combo"), toastEl = $("toast"), flashEl = $("flash"),
    progFill = $("progFill"), bossHud = $("bossHud"),
    odFill = $("odFill"), odBtn = $("odBtn"), odRing = $("odRing");

  let toastTimer = null;
  function toast(msg, color) {
    toastEl.textContent = msg;
    toastEl.style.color = color || "#aef7d4";
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("show"), 1000);
  }
  // ---- lane-locked answer strip: readable the whole approach ----
  const ansEls = [...root.querySelectorAll("#ansStrip .ans")];
  const ldEls = [...root.querySelectorAll("#laneDots .ld")];
  function showAnswers(q) {
    ansEls.forEach((el, i) => {
      el.textContent = q.options[i];
      el.className = "ans" + (q.fadeLane === i ? " dimmed" : "");
    });
    $("ansStrip").classList.add("on");
    $("laneDots").classList.add("on");
    syncLane();
  }
  function syncLane() {
    ansEls.forEach((el, i) => el.classList.toggle("sel", i === laneIdx && !el.classList.contains("right") && !el.classList.contains("wrongpick")));
    ldEls.forEach((el, i) => el.classList.toggle("sel", i === laneIdx));
  }
  function resolveAnswers(correctLane, picked) {
    ansEls.forEach((el, i) => {
      el.classList.remove("sel", "dimmed");
      el.removeAttribute("data-mark");
      if (i === correctLane) { el.classList.add("right"); el.setAttribute("data-mark", "✓"); }
      else if (i === picked) { el.classList.add("wrongpick"); el.setAttribute("data-mark", "✗"); }
      else el.classList.add("dimmed");
    });
  }
  function hideAnswers() {
    $("ansStrip").classList.remove("on");
    $("laneDots").classList.remove("on");
    ansEls.forEach((el) => { el.className = "ans"; el.removeAttribute("data-mark"); });
  }

  const showQ = (t, s) => {
    qText.textContent = t; qSub.textContent = s || "";
    qBox.classList.add("show");
    qBox.classList.remove("pop");
    void qBox.offsetWidth;
    qBox.classList.add("pop");
  };
  const hideQ = () => qBox.classList.remove("show");
  function redFlash(op) {
    flashEl.style.transition = ""; flashEl.style.opacity = op;
    setTimeout(() => { flashEl.style.transition = "opacity .4s"; flashEl.style.opacity = 0; }, 30);
  }
  function updHUD() {
    let hearts = "";
    for (let i = 0; i < 3; i++) hearts += '<span class="hp' + (i < hp ? "" : " off") + '"></span>';
    heartsEl.innerHTML = hearts;
    shieldTag.style.opacity = shield ? 1 : 0;
    shieldMesh.visible = shield;
    scoreEl.textContent = Math.floor(score);
    if (combo > 1) { comboEl.textContent = "COMBO ×" + combo; comboEl.classList.add("on"); }
    else comboEl.classList.remove("on");
    // overdrive meter + trigger state
    odFill.style.width = od * 100 + "%";
    const ready = od >= 1 && odActive <= 0 && state === S.RUN;
    odBtn.classList.toggle("ready", ready);
    odRing.classList.toggle("on", odActive > 0);
    // mission modifier readout
    const mh = $("modHud");
    const m = mission && mission.mod;
    if (state === S.RUN && m && m !== "rescue") {
      mh.classList.add("on");
      if (m === "cargo") mh.innerHTML = '<span style="color:#ffcf5c">📦</span> ' + cargo;
      else if (m === "repair") mh.innerHTML = '<span style="color:#c48aff">🔧</span> ' + nodes +
        ' <span style="opacity:.5">·</span> ' + "●".repeat(chain) + "○".repeat(3 - chain);
      else if (m === "rift") {
        const d = Math.max(0, riftZ - PLAYER_Z);
        mh.innerHTML = '<span style="color:#ff6a7f">🕳️</span> ' + d.toFixed(0) + "m";
      }
    } else mh.classList.remove("on");
    const prog = phase === "boss" || phase === "bossIntro" ? 1 : gatesDone / totalGates;
    progFill.style.width = prog * 100 + "%";
    if (phase === "boss" || phase === "bossIntro") {
      bossHud.style.display = "block";
      bossHud.textContent = mission.bossName + " · " +
        "▮".repeat(Math.max(0, bossHP)) + "▯".repeat(Math.max(0, 3 - bossHP));
    } else bossHud.style.display = "none";
  }

  // ---------- #3: OVERDRIVE ----------
  function addOD(amount) { od = Math.min(1, od + amount); }
  function fireOverdrive() {
    if (state !== S.RUN || crashing || od < 1 || odActive > 0) return;
    od = 0; odActive = SHIPS[shipSel].odDur; odSmashes = 0;
    shockwave(ship.position, 0x5ce1ff, true);
    fovKick = 16; shake = 0.45;
    sfx.overdrive();
    toast("OVERDRIVE", "#8df0ff");
    updHUD();
  }

  // ---------- flow ----------
  function buy(kind, i, el) {
    const list = kind === "color" ? COLORS : SHIPS;
    const owned = kind === "color" ? save.colorsOwned : save.shipsOwned;
    const price = list[i].price;
    if (save.stars < price) {
      el.classList.remove("nope"); void el.offsetWidth; el.classList.add("nope");
      toast("Need " + (price - save.stars) + " ★ more", "#ffd166");
      sfx.wrong();
      return false;
    }
    save.stars -= price;
    owned.push(i);
    sfx.pickup();
    toast("Unlocked " + list[i].name, "#ffd166");
    return true;
  }
  // A representative example for each rung, so the picker shows what the skill
  // actually is (addition, subtraction, times tables, …) at a glance.
  const LEVEL_EG = [
    "Find 7", "Count the stars", "2 + 3 = ?", "6 + 4 = ?", "5 − 2 = ?", "9 − 4 = ?",
    "6 + 6 = ?", "13 + 6 = ?", "5, 10, 15, ?", "4 × 3 = ?", "7 × 8 = ?", "24 ÷ 6 = ?", "9 × 12 = ?",
    "7 □ 4  →  >", "12 □ 15  →  <",
  ];
  const levelExample = (l) => LEVEL_EG[Math.min(LEVEL_EG.length, Math.max(1, l)) - 1];
  function setLevel(l) {
    const nl = Math.min(MAX_LEVEL, Math.max(1, l));
    if (nl === save.mathLevel) return;
    save.mathLevel = nl;
    sfx.swipe(); haptic(6);
    persist(); refreshMenu();
  }
  function refreshMenu() {
    $("mLvlTxt").textContent = save.mathLevel;
    if ($("mLvlSkill")) $("mLvlSkill").textContent = levelName(save.mathLevel);
    if ($("mLvlEg")) $("mLvlEg").textContent = "e.g.  " + levelExample(save.mathLevel);
    if ($("lvlDown")) $("lvlDown").classList.toggle("off", save.mathLevel <= 1);
    if ($("lvlUp")) $("lvlUp").classList.toggle("off", save.mathLevel >= MAX_LEVEL);
    $("totStars").textContent = save.stars;
    const ranks = ["Cadet", "Pilot", "Ace", "Commander", "Captain", "Star Legend"];
    $("rankTxt").textContent = ranks[Math.min(ranks.length - 1, Math.floor(save.missions / 2))];
    root.querySelectorAll(".shipbtn").forEach((b) => {
      const i = +b.dataset.s;
      const owned = save.shipsOwned.includes(i);
      b.classList.toggle("sel", owned && i === save.shipSel);
      b.classList.toggle("locked", !owned);
      b.classList.toggle("buyable", !owned);
      let pr = b.querySelector(".pr");
      if (!owned) {
        if (!pr) { pr = document.createElement("span"); pr.className = "pr"; b.appendChild(pr); }
        pr.textContent = SHIPS[i].price + " ★";
      } else if (pr) pr.remove();
    });
    const sw = $("swatches");
    sw.innerHTML = "";
    COLORS.forEach((c, i) => {
      const owned = save.colorsOwned.includes(i);
      const d = document.createElement("div");
      d.className = "sw" + (owned && i === save.colorSel ? " sel" : "") + (owned ? "" : " buyable");
      d.style.background = "radial-gradient(circle at 35% 35%, #ffffff, #" + c.accent.toString(16).padStart(6, "0") + ")";
      if (!owned) {
        const pr = document.createElement("span");
        pr.className = "pr"; pr.textContent = c.price + " ★";
        d.appendChild(pr);
      }
      const sel = () => {
        if (!live(d)) return;
        if (!save.colorsOwned.includes(i)) { if (!buy("color", i, d)) return; }
        save.colorSel = i; applyColor(i); persist(); refreshMenu(); sfx.swipe();
      };
      let dMoved = false, dx0 = 0;
      d.addEventListener("touchstart", (e) => { dx0 = e.touches[0].clientX; dMoved = false; }, { passive: true });
      d.addEventListener("touchmove", (e) => { if (Math.abs(e.touches[0].clientX - dx0) > 12) dMoved = true; }, { passive: true });
      d.onclick = sel;
      d.addEventListener("touchend", (e) => { e.preventDefault(); if (!dMoved) sel(); }, { passive: false });
      sw.appendChild(d);
    });
  }
  function openBrief() {
    const idx = save.missions % MISSIONS.length;
    mission = MISSIONS[idx];
    applyGalaxy(idx);
    $("brGalaxy").textContent = galaxy.name;
    $("brGalaxy").style.color = galaxy.tag;
    $("brGalaxy").style.borderColor = galaxy.tag;
    totalGates = 5 + Math.min(4, Math.ceil(save.mathLevel / 3));
    $("brIcon").textContent = mission.icon;
    $("brTitle").textContent = mission.title;
    $("brText").textContent = mission.text;
    $("brRule").textContent = mission.rule;
    $("brLevel").textContent = "LV " + save.mathLevel + " · " + levelName(save.mathLevel).toUpperCase();
    $("brGates").textContent = totalGates + " GATES + BOSS";
    state = S.BRIEF;
    if (curDPR > 1) { curDPR = 1; renderer.setPixelRatio(1); resize(); }
    $("menuOv").classList.add("hidden");
    $("winOv").classList.add("hidden");
    $("failOv").classList.add("hidden");
    $("briefOv").classList.remove("hidden");
  }
  function startRun(skipPan) {
    if (!mission) mission = MISSIONS[save.missions % MISSIONS.length];
    clearActive(); clearGate(); ring.visible = false;
    if (boss) { scene.remove(boss); boss = null; }
    laneIdx = 1; score = 0; runTime = 0; hp = 3; shield = false; combo = 0; bestCombo = 0;
    phase = "fly"; phaseT = 2.2; spawnT = 0.8; gatesDone = 0; answersRight = 0; answersTotal = 0;
    recent = []; assist = supportRetry; bossHP = 3;
    shake = 0; hitPause = 0; fovKick = 0; invuln = 0; timeScale = 1;
    crashing = false; crashT = 0;
    od = 0; odActive = 0; odSmashes = 0; odAura.visible = false;
    bossBeam.visible = false; bossAtk.state = "idle"; bossAtk.t = 2.2;
    launchT = 0;
    bendCur = 0; bendTarget = 0; bendTimer = 5;
    elevCur = 0; elevTarget = 0; elevTimer = 6;
    journey = 0; placeDest(0);
    cargo = 0; coinsRun = 0; chain = 0; nodes = 0; riftZ = 30; riftHits = 0;
    guardsSpawned = 0;
    $("riftVig").style.opacity = 0;
    ship.position.set(0, 0, PLAYER_Z); ship.rotation.set(0, 0, 0);
    ship.scale.setScalar(0.82); ship.visible = true;
    trailBits.forEach((b) => (b.visible = false));
    hideQ(); hideAnswers(); updHUD();
    $("briefOv").classList.add("hidden");
    $("failOv").classList.add("hidden");
    const ctx = audioCtx();
    if (ctx && ctx.state === "suspended") ctx.resume();

    // roll the launch cinematic; retries skip the vista and go straight to
    // countdown. Reduced-motion also skips the sweeping vista pan.
    if (reduceMotion()) skipPan = true;
    state = S.CINE;
    cineT = skipPan ? CINE.pan : 0;
    lastCount = 0; blasted = false;
    root.classList.add("cine");
    blastEl.classList.remove("on");
    cdBox.classList.remove("on");
    seg7.querySelectorAll(".s").forEach((s) => s.classList.remove("on"));
    if (!skipPan) skipHint.classList.add("on");
  }
  function beginFlight() {
    state = S.RUN;
    if (curDPR !== dprCap) { curDPR = dprCap; renderer.setPixelRatio(curDPR); resize(); }
    root.classList.remove("cine");
    cdBox.classList.remove("on");
    skipHint.classList.remove("on");
    launchT = 1.25;
    fovKick = 20; shake = 0.55;
    toast(mission.icon + "  " + mission.title, "#8df0ff");
    updHUD();
  }
  function skipCine() {
    if (state !== S.CINE) return;
    blastEl.classList.remove("on");
    beginFlight();
  }
  function missionWin() {
    state = S.WIN; hideQ(); sfx.win();
    $("riftVig").style.opacity = 0;
    const acc = answersTotal ? answersRight / answersTotal : 1;
    const stars = acc >= 0.9 ? 3 : acc >= 0.65 ? 2 : 1;

    // ---- star payout (#4): coins + rating + combo + mission-specific bonus ----
    const payCoins = coinsRun;
    const payRating = stars * 40;
    const payCombo = bestCombo * 5;
    let payMod = 0, modLabel = "";
    if (mission.mod === "cargo") { payMod = cargo * 30; modLabel = cargo + " pods delivered"; }
    else if (mission.mod === "repair") { payMod = nodes * 80; modLabel = nodes + " nodes repaired"; }
    else if (mission.mod === "rift") { payMod = Math.max(0, 120 - riftHits * 40); modLabel = riftHits === 0 ? "never caught" : riftHits + " rift hits"; }
    else if (mission.mod === "rescue") { payMod = hp * 25; modLabel = "Zippo aboard · " + hp + " hull left"; }
    const earned = payCoins + payRating + payCombo + payMod;

    save.stars += earned;
    save.lifetime = (save.lifetime || 0) + earned;
    save.missions++;

    let note = "";
    if (acc >= 0.85 && save.mathLevel < MAX_LEVEL) { save.mathLevel++; note = "Level up → " + save.mathLevel + " · " + levelName(save.mathLevel); }
    else if (acc < 0.5 && save.mathLevel > 1) { save.mathLevel--; note = "Let's practise " + levelName(save.mathLevel) + " — you've got this."; }
    else note = "Staying on " + levelName(save.mathLevel);
    supportRetry = false;
    persist(); refreshMenu();

    $("winStars").textContent = "★".repeat(stars) + "☆".repeat(3 - stars);
    $("finalScore").textContent = "+" + earned;
    $("winStats").innerHTML =
      '<div class="row"><span>Stars collected</span><b>' + payCoins + '</b></div>' +
      '<div class="row"><span>Rating bonus</span><b>' + payRating + '</b></div>' +
      '<div class="row"><span>Best combo ×' + Math.max(1, bestCombo) + '</span><b>' + payCombo + '</b></div>' +
      '<div class="row"><span>' + modLabel + '</span><b>' + payMod + '</b></div>' +
      '<div class="div"></div>' +
      '<div class="row"><span>Accuracy</span><b>' + answersRight + "/" + answersTotal + '</b></div>';
    $("winUnlock").textContent = mission.winText;
    $("lvlNote").textContent = note;
    setTimeout(() => { if (!disposed) $("winOv").classList.remove("hidden"); }, 900);
  }
  function missionFail() {
    state = S.FAIL; hideQ(); sfx.hit(); redFlash(0.55);
    $("riftVig").style.opacity = 0;
    supportRetry = true; recent = [];
    const salvage = Math.floor(coinsRun * 0.5) + answersRight * 5;
    save.stars += salvage;
    save.lifetime = (save.lifetime || 0) + salvage;
    persist(); refreshMenu();
    $("failStats").innerHTML =
      '<div class="row"><span>Answered</span><b>' + answersRight + "/" + answersTotal + '</b></div>' +
      '<div class="row"><span>Salvaged</span><b>+' + salvage + ' ★</b></div>';
    setTimeout(() => { if (!disposed) $("failOv").classList.remove("hidden"); }, 700);
  }

  // A control only fires when its overlay is actually on screen AND the gesture was
  // a tap rather than a swipe. Without the first guard, the invisible centred
  // LAUNCH/RETRY buttons stayed touch-live during flight and a left swipe
  // restarted the level.
  function live(el) {
    const ov = el.closest && el.closest(".sl-ov");
    return !(ov && ov.classList.contains("hidden"));
  }
  function press(id, fn) {
    const el = $(id);
    let fired = false, sx = 0, sy = 0, moved = false;
    on(el, "touchstart", (e) => {
      const t = e.touches && e.touches[0];
      sx = t ? t.clientX : 0; sy = t ? t.clientY : 0; moved = false;
    }, { passive: true });
    on(el, "touchmove", (e) => {
      const t = e.touches && e.touches[0];
      if (!t) return;
      if (Math.abs(t.clientX - sx) > 12 || Math.abs(t.clientY - sy) > 12) moved = true;
    }, { passive: true });
    on(el, "touchend", (e) => {
      e.preventDefault(); e.stopPropagation();
      fired = true; setTimeout(() => (fired = false), 400);
      if (moved || !live(el)) return;
      fn();
    }, { passive: false });
    on(el, "click", () => { if (!fired && live(el)) fn(); });
  }
  root.querySelectorAll(".shipbtn").forEach((btn) => {
    const sel = () => {
      if (!live(btn)) return;
      const i = +btn.dataset.s;
      if (!save.shipsOwned.includes(i)) { if (!buy("ship", i, btn)) { refreshMenu(); return; } }
      save.shipSel = i; applyShip(i); persist(); sfx.swipe(); refreshMenu();
    };
    let bMoved = false, bx = 0;
    btn.addEventListener("touchstart", (e) => { bx = e.touches[0].clientX; bMoved = false; }, { passive: true });
    btn.addEventListener("touchmove", (e) => { if (Math.abs(e.touches[0].clientX - bx) > 12) bMoved = true; }, { passive: true });
    btn.addEventListener("click", sel);
    btn.addEventListener("touchend", (e) => { e.preventDefault(); e.stopPropagation(); if (!bMoved) sel(); }, { passive: false });
  });
  press("missionBtn", openBrief);
  press("launchBtn", () => startRun(false));
  press("retryBtn", () => startRun(true));
  press("nextBtn", openBrief);
  press("homeBtn1", () => { $("winOv").classList.add("hidden"); $("menuOv").classList.remove("hidden"); state = S.MENU; });
  press("homeBtn2", () => { $("failOv").classList.add("hidden"); $("menuOv").classList.remove("hidden"); state = S.MENU; });

  // ---------- settings + parental gate ----------
  function buildGate() {
    const a = ri(6, 9), b = ri(6, 9), ans = a * b;
    $("gateQ").textContent = a + " × " + b;
    const opts = new Set([ans]);
    while (opts.size < 3) { const d = ans + pick([-1, 1, -2, 2, 3, -3, 6, -6]); if (d > 0 && !opts.has(d)) opts.add(d); }
    const arr = [...opts].sort(() => Math.random() - 0.5);
    const wrap = $("gateOpts"); wrap.innerHTML = "";
    arr.forEach((v) => {
      const btn = document.createElement("button");
      btn.textContent = v;
      if (v === ans) btn.setAttribute("data-correct", "1");
      const act = () => { if (!live(btn)) return; if (v === ans) openSettings(); else { sfx.wrong(); buildGate(); } };
      let m = false, x = 0;
      btn.addEventListener("touchstart", (e) => { x = e.touches && e.touches[0] ? e.touches[0].clientX : 0; m = false; }, { passive: true });
      btn.addEventListener("touchmove", (e) => { const t = e.touches && e.touches[0]; if (t && Math.abs(t.clientX - x) > 12) m = true; }, { passive: true });
      btn.addEventListener("touchend", (e) => { e.preventDefault(); e.stopPropagation(); if (!m) act(); }, { passive: false });
      btn.addEventListener("click", act);
      wrap.appendChild(btn);
    });
  }
  function openGate() { $("menuOv").classList.add("hidden"); $("gateOv").classList.remove("hidden"); buildGate(); }
  function closeGate() { $("gateOv").classList.add("hidden"); $("menuOv").classList.remove("hidden"); }
  function openSettings() { $("gateOv").classList.add("hidden"); $("setOv").classList.remove("hidden"); renderToggles(); }
  function closeSettings() { $("setOv").classList.add("hidden"); $("menuOv").classList.remove("hidden"); }
  const SETTING_KEYS = ["sound", "music", "haptics", "reduceMotion", "highContrast"];
  function renderToggles() {
    SETTING_KEYS.forEach((k) => { const t = $("tgl-" + k); if (t) { t.classList.toggle("on", !!setting(k)); t.setAttribute("aria-checked", setting(k) ? "true" : "false"); } });
  }
  function toggleSetting(k) {
    save.settings[k] = !setting(k);
    persist(); applySettings(); renderToggles();
    if (k === "music") updateMusic();
    if (setting("haptics")) haptic(8);
  }
  press("lvlDown", () => setLevel(save.mathLevel - 1));
  press("lvlUp", () => setLevel(save.mathLevel + 1));
  press("settingsBtn", openGate);
  press("gateCancel", closeGate);
  press("setDone", closeSettings);
  SETTING_KEYS.forEach((k) => press("tgl-" + k, () => toggleSetting(k)));

  // ---------- input ----------
  function moveTo(target) {
    if (state !== S.RUN) return;
    const nl = Math.min(2, Math.max(0, target));
    if (nl !== laneIdx) { laneIdx = nl; sfx.swipe(); haptic(6); if (gate && !gate.answered) syncLane(); }
  }
  function move(dir) { moveTo(laneIdx + dir); }
  const laneAtX = (x) => {                        // which lane a tap at screen-x wants
    const w = root.clientWidth || window.innerWidth || 390;
    return Math.min(2, Math.max(0, Math.floor((x / w) * 3)));
  };
  on(window, "keydown", (e) => {
    if (state === S.CINE) { skipCine(); return; }
    if (e.key === "ArrowLeft" || e.key === "a") move(-1);
    else if (e.key === "ArrowRight" || e.key === "d") move(1);
    else if (e.key === " " || e.key === "ArrowUp" || e.key === "w") { e.preventDefault(); fireOverdrive(); }
  });
  // overdrive trigger — its own hit area, must not double as a lane tap
  let odTapped = false, odMoved = false, odX = 0, odY = 0;
  on(odBtn, "touchstart", (e) => {
    e.stopPropagation(); odTapped = true; odMoved = false;
    const t = e.touches && e.touches[0];
    odX = t ? t.clientX : 0; odY = t ? t.clientY : 0;
  }, { passive: true });
  on(odBtn, "touchmove", (e) => {
    const t = e.touches && e.touches[0];
    if (!t) return;
    if (Math.abs(t.clientX - odX) > 14 || Math.abs(t.clientY - odY) > 14) odMoved = true;
  }, { passive: true });
  on(odBtn, "touchend", (e) => {
    e.preventDefault(); e.stopPropagation();
    if (!odMoved) fireOverdrive();
    setTimeout(() => (odTapped = false), 60);
  }, { passive: false });
  on(odBtn, "click", () => { if (!odTapped) fireOverdrive(); });

  // Steering: a horizontal drag moves proportionally (a long swipe can cross two
  // lanes and it tracks your finger continuously); a tap goes straight to the
  // lane you tapped. Both feel direct — no fixed one-lane-per-flick or
  // guess-the-half. A drag that never really moves sideways is treated as a tap.
  const laneStep = () => Math.max(46, (root.clientWidth || window.innerWidth || 390) * 0.18);
  let tx = null, ty = null, startLane = 1, dragged = false;
  on(root, "touchstart", (e) => {
    if (odTapped) return;
    if (state === S.CINE) { skipCine(); return; }
    const t = e.touches && e.touches[0];
    if (!t) return;
    tx = t.clientX; ty = t.clientY; startLane = laneIdx; dragged = false;
  }, { passive: true });
  on(root, "touchmove", (e) => {
    if (tx === null) return;
    const t = e.touches && e.touches[0];
    if (!t) return;
    const dx = t.clientX - tx, dy = t.clientY - ty;
    if (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy)) {
      moveTo(startLane + Math.round(dx / laneStep()));
      dragged = true;
    }
  }, { passive: true });
  on(root, "touchend", () => {
    if (!dragged && !odTapped && tx !== null && state === S.RUN) moveTo(laneAtX(tx));  // tap the lane you want
    tx = null; dragged = false;
  }, { passive: true });
  // Mouse (desktop): click a lane to go there, or click-drag to slide across.
  let mx = null, mStartLane = 1, mDragged = false;
  on(root, "mousedown", (e) => {
    if (state === S.CINE) { skipCine(); return; }
    mx = e.clientX; mStartLane = laneIdx; mDragged = false;
  });
  on(root, "mousemove", (e) => {
    if (mx === null || state !== S.RUN) return;
    const dx = e.clientX - mx;
    if (Math.abs(dx) > 12) { moveTo(mStartLane + Math.round(dx / laneStep())); mDragged = true; }
  });
  on(root, "mouseup", (e) => {
    if (mx !== null && !mDragged && state === S.RUN) moveTo(laneAtX(e.clientX));
    mx = null; mDragged = false;
  });

  // ---------- answers ----------
  function recordAnswer(right) {
    // mission rules react to every answer
    if (mission && mission.mod === "repair") {
      if (right) {
        chain++;
        if (chain >= 3) {
          chain = 0; nodes++;
          score += 250; sfx.win();
          shockwave(ship.position, 0xc48aff, true);
          toast("NODE REPAIRED · " + nodes, "#c48aff");
        }
      } else if (chain > 0) { chain = 0; toast("Chain broken", "#ffd166"); }
    } else if (mission && mission.mod === "rift") {
      riftZ += right ? 9 : -6;          // right answers buy distance, wrong ones feed it
      riftZ = Math.min(34, riftZ);       // capped: it is always breathing on your neck
      if (right) toast("Rift pushed back", "#8df0ff");
    }
    answersTotal++;
    haptic(right ? 12 : [18, 40, 18]);   // a gentle tick for right, a double buzz for wrong
    recent.push(right ? 1 : 0);
    if (recent.length > 4) recent.shift();
    if (right) answersRight++;
    const rSum = recent.reduce((a, b) => a + b, 0);
    if (recent.length >= 3 && rSum <= 1 && !assist) { assist = true; toast("Support mode on", "#8df0ff"); }
    if (recent.length >= 4 && rSum === 4) assist = false;
  }
  function grantReward() {
    combo++; bestCombo = Math.max(bestCombo, combo);
    score += 100 * combo;
    // #3: correct answers charge OVERDRIVE — math skill converts into flight power
    addOD(0.3 + Math.min(0.22, combo * 0.05));
    if (!shield && combo % 2 !== 0) { shield = true; sfx.shield(); toast("SHIELD UP  ×" + combo); }
    else { fovKick = 8; score += 50; toast("SPEED BOOST  ×" + combo); }
  }
  function wrongConsequence(correctVal) {
    combo = 0; sfx.wrong();
    toast("Answer was " + correctVal + " — debris ahead!", "#ffd166");
    const freeLane = ri(0, 2);
    for (let l = 0; l < 3; l++) if (l !== freeLane) spawn("debris", l, PLAYER_Z - 42 - Math.random() * 4);
  }
  function takeHit() {
    if (invuln > 0 || crashing) return;
    if (shield) {
      shield = false; sfx.shield(); toast("Shield saved you", "#7ef3ff");
      boom(ship.position, 0.7, 8);
      invuln = 1; shake = 0.5; return;
    }
    hp--; sfx.hit(); haptic(30); redFlash(0.4); shake = 0.9; combo = 0;
    boom(ship.position, 0.9, 10);
    // cargo run: a hit knocks a pod loose — you watch it tumble away
    if (mission && mission.mod === "cargo" && cargo > 0) {
      cargo--;
      spawn("crate", laneIdx, PLAYER_Z - 1);
      const lost = active[active.length - 1];
      if (lost) { lost.speedMul = 2.2; lost.scored = true; }
      toast("Cargo pod lost!", "#ff9db0");
    }
    updHUD();
    if (hp <= 0) {
      // crash sequence: spin, tumble, mini explosion, then the repair screen
      crashing = true; crashT = 1.5; crashSparkT = 0;
      boom(ship.position, 1.5, 16);
      redFlash(0.5); shake = 1.2;
    } else { hitPause = 0.12; invuln = 1.4; }
  }

  // ---------- phases ----------
  // ---------- #1: hazards that guard the correct answer ----------
  // The whole point: math skill and flight skill must intersect. Sometimes the
  // right answer costs a dodge — and overdrive is how you buy your way through.
  function guardChance() {
    if (assist) return 0;                 // never punish a struggling player
    if (save.mathLevel < 4) return 0;     // pre-schoolers just fly and answer
    if (gatesDone < 2) return 0;          // let them find their footing first
    return Math.min(0.62, 0.12 + save.mathLevel * 0.035 + gatesDone * 0.02);
  }
  function maybeGuard(correctLane) {
    if (Math.random() >= guardChance()) return false;
    // sits ~16 units ahead of the gate: dodge it, then snap back for the answer
    const kind = Math.random() < 0.6 ? "asteroid" : "comet";
    spawn(kind, correctLane, SPAWN_Z - 4 + 16);
    guardsSpawned++;
    return true;
  }

  function nextChallenge() {
    if (gatesDone > 0 && gatesDone % 3 === 2) {
      phase = "quantity";
      qty.need = save.mathLevel < 3 ? ri(2, 3) : ri(2, 2 + Math.min(4, Math.ceil(save.mathLevel / 3)));
      qty.have = 0; qty.activeT = 0;
      showQ("exactly " + qty.need + " ★", "COLLECT · " + qty.have + "/" + qty.need);
    } else {
      phase = "gate";
      const q = genQuestion(save.mathLevel);
      if (assist) q.fadeLane = pick([0, 1, 2].filter((l) => l !== q.correctLane));
      makeGate(q);
      const guarded = maybeGuard(q.correctLane);
      showQ(q.text, guarded ? "GUARDED — PUNCH THROUGH OR DODGE" : q.sub);
    }
  }
  function startBoss() {
    phase = "bossIntro"; phaseT = 2.5;
    bossAtk.state = "idle"; bossAtk.t = 2.4; bossBeam.visible = false;
    boss = buildBoss(mission.boss); scene.add(boss);
    showQ(mission.bossName + "!", "3 CORRECT ANSWERS TO WIN");
    sfx.bossHit(); shake = 0.6; updHUD();
  }
  function resolvePanels(correctLane) {
    resolveAnswers(correctLane, laneIdx);
    gate.panels.forEach((p) => {
      const style = p.lane === correctLane ? "correct" : p.lane === laneIdx ? "wrong" : "dim";
      p.mesh.material.map = laserSign(p.val, style);
      p.mesh.material.needsUpdate = true;
      p.mesh.material.opacity = 1;
    });
  }

  // ---------- loop ----------
  const clock = new T3.Clock();
  function update(dt) {
    updateBooms(dt);
    updateWaves(dt);
    planets.forEach((p) => (p.children[0].rotation.y += p.userData.spin * dt));

    if (state === S.CINE) { updateCine(dt); return; }

    if (state !== S.RUN) {
      // keep drifting on menus so the game never looks frozen
      updateStars(dt, 6);
      updateStreaks(dt, 6);
      ship.rotation.z = Math.sin(performance.now() * 0.001) * 0.06;
      ship.position.y = Math.sin(performance.now() * 0.0016) * 0.12;
      if (boss) boss.rotation.y += dt * 0.4;
      shipFX(0.9);
      return;
    }
    // crash sequence: rocket spins and tumbles, sparks fly, then repairs screen
    if (crashing) {
      crashT -= dt;
      ship.rotation.z += dt * 11;
      ship.rotation.x += dt * 6;
      ship.position.y += dt * 1.4;
      ship.position.z += dt * 2.5;
      if (crashT < 0.5) ship.scale.multiplyScalar(1 - dt * 2.4);
      crashSparkT -= dt;
      if (crashSparkT <= 0) { boom(ship.position, 0.6, 4); crashSparkT = 0.16; }
      shipFX(0.35);
      if (crashT <= 0) {
        crashing = false;
        ship.visible = false;
        boom(ship.position, 1.8, 18);
        missionFail();
      }
      return;
    }
    if (hitPause > 0) { hitPause -= dt; return; }
    invuln = Math.max(0, invuln - dt);
    ship.visible = hp > 0 && (invuln <= 0 || Math.floor(performance.now() / 90) % 2 === 0);

    timeScale = 1;
    if (assist && gate && !gate.answered && gateGroup.position.z > -40) timeScale = 0.6;
    dt *= timeScale;
    runTime += dt;

    // #3: overdrive burn
    if (odActive > 0) {
      odActive = Math.max(0, odActive - dt);
      odAura.visible = true;
      odAura.position.copy(ship.position);
      const pulse = 1 + Math.sin(performance.now() * 0.02) * 0.07;
      odAura.scale.setScalar(pulse);
      odAura.material.opacity = 0.18 + Math.min(1, odActive) * 0.22;
      if (odActive === 0) {
        toast(odSmashes > 0 ? "SMASHED ×" + odSmashes : "OVERDRIVE OVER", "#8df0ff");
      }
    } else odAura.visible = false;

    const odBoost = odActive > 0 ? 1.4 : 1;
    if (launchT > 0) launchT = Math.max(0, launchT - dt);
    const launchMul = launchT > 0 ? T3.MathUtils.lerp(1, 0.32, launchT / 1.25) : 1;
    const sp = speedProfile();
    const speed = Math.min(sp.max, sp.base + runTime * sp.ramp) * odBoost * launchMul;
    curSpeed = speed;
    score += speed * dt * 0.25;

    // the course sweeps: pick a new bend every few seconds, ease toward it
    bendTimer -= dt;
    if (bendTimer <= 0) {
      bendTarget = pick([-1.5, -1, 0, 0, 1, 1.5]) * 0.001;
      bendTimer = 5 + Math.random() * 4;
    }
    bendCur += (bendTarget - bendCur) * Math.min(1, dt * 0.5);
    // ...and climbs or dives on its own rhythm
    elevTimer -= dt;
    if (elevTimer <= 0) {
      elevTarget = pick([0, 0, 0.0012, 0.0022, -0.0008]);
      elevTimer = 6 + Math.random() * 5;
    }
    elevCur += (elevTarget - elevCur) * Math.min(1, dt * 0.35);

    // player
    const dx = LANES[laneIdx] - ship.position.x;
    ship.position.x += dx * Math.min(1, (TUNE.laneSnap * dt) / Math.max(timeScale, 0.001));
    ship.rotation.z = T3.MathUtils.lerp(ship.rotation.z, -dx * 0.35 - bendCur * 160, Math.min(1, 12 * dt));
    ship.rotation.y = T3.MathUtils.lerp(ship.rotation.y, -dx * 0.1 - bendCur * 60, Math.min(1, 12 * dt));
    ship.rotation.x = T3.MathUtils.lerp(ship.rotation.x, -elevCur * 130, Math.min(1, 8 * dt));
    ship.position.y = Math.sin(performance.now() * 0.003) * 0.07;
    shieldMesh.position.copy(ship.position);
    shieldMesh.material.opacity = 0.16 + Math.sin(performance.now() * 0.006) * 0.06;

    shipFX(0.85 + (speed / TUNE.maxSpeed) * 0.5 + (odActive > 0 ? 0.45 : 0));

    const tb = trailBits[(trailIdx = (trailIdx + 1) % trailBits.length)];
    tb.visible = true;
    tb.position.copy(ship.position); tb.position.y -= 0.05; tb.position.z += 1.7;
    tb.material.opacity = 0.5;
    tb.scale.set(1, 1, 1);
    trailBits.forEach((b) => {
      if (!b.visible) return;
      b.position.z += speed * dt * 0.9;
      b.material.opacity -= dt * 1.6;
      b.scale.multiplyScalar(1 - dt * 1.2);
      if (b.material.opacity <= 0) b.visible = false;
      b.lookAt(camera.position);
    });

    // space path motion
    laneMarkers.forEach((b) => {
      b.position.z += speed * dt;
      if (b.position.z > 10) b.position.z -= 132;
      b.position.x = b.userData.lx + bendX(b.position.z);
      b.position.y = curveY(b.position.z) - 0.85 + Math.sin(performance.now() * 0.002 + b.position.z) * 0.08;
      b.rotation.y += dt * 2;
      // brief flare as each beacon passes the ship — a metronome for speed
      const near = 1 - Math.min(1, Math.abs(b.position.z - PLAYER_Z) / 9);
      b.material.opacity = (0.18 + 0.5 * Math.max(0, 1 + b.position.z / 132)) + near * 0.5;
      b.scale.setScalar(1 + near * 0.9);
    });
    {
      updateStars(dt, speed);
      updateStreaks(dt, speed);
      updateDecor(dt, speed);
    }

    // the Dark Rift: a wall of nothing that never stops closing
    if (mission.mod === "rift") {
      riftZ -= dt * (0.5 + save.mathLevel * 0.02);
      const gap = riftZ - PLAYER_Z;
      // reduced-motion: a calm, steady vignette instead of the closing-in pulse
      $("riftVig").style.opacity = reduceMotion()
        ? (gap < 13 ? 0.3 : 0)
        : Math.max(0, Math.min(0.95, (14 - gap) / 13));
      if (gap <= 1.6) {
        riftZ = PLAYER_Z + 13;
        riftHits++;
        if (odActive > 0) { toast("Overdrive outran the rift", "#8df0ff"); shockwave(ship.position, 0x5ce1ff, true); }
        else { takeHit(); toast("The rift caught you!", "#ff6a7f"); if (state !== S.RUN) return; }
      }
    }

    // journey: the destination closes in as gates are cleared
    {
      const targetJ = (phase === "boss" || phase === "bossIntro" || phase === "done")
        ? 1 : Math.min(0.85, (gatesDone / totalGates) * 0.85 + runTime * 0.002);
      journey += (targetJ - journey) * Math.min(1, dt * 0.35);
      if (phase !== "done") placeDest(journey);
      destPlanet.children[0].rotation.y += dt * 0.02;
    }

    // phases
    phaseT -= dt;
    if (phase === "fly") {
      // interval-based waves so hazards never clump; quiet zone before each challenge
      spawnT -= dt;
      if (spawnT <= 0 && phaseT > 1.0) {
        const L = save.mathLevel;
        const lanes = [0, 1, 2];
        const l = lanes.splice(ri(0, 2), 1)[0];
        const r = Math.random();
        const mix = galaxy.mix || [0.5, 0.25, 0.25]; // [asteroid, comet, ufo]
        // young pilots meet only slow, obvious asteroids — no darting UFOs or fast comets
        const kind = L < 3 ? "asteroid"
          : r < mix[0] ? "asteroid" : r < mix[0] + mix[1] ? "comet" : "ufo";
        spawn(kind, l, SPAWN_Z);
        if (mission.mod === "cargo" && Math.random() < 0.45) spawn("crate", pick(lanes), SPAWN_Z - 14);
        else if (Math.random() < 0.45) spawn("crystal", pick(lanes), SPAWN_Z - 14);
        // sparser traffic for little ones: gaps shrink as the ladder is climbed
        const gap = L < 3 ? 2.6 : L < 5 ? 2.0 : L < 8 ? 1.6 : 1.35;
        spawnT = gap + Math.random() * 0.7;
      }
      if (phaseT <= 0) { if (gatesDone >= totalGates) startBoss(); else nextChallenge(); }
    } else if (phase === "gate" && gate) {
      gateGroup.position.z += speed * dt;
      gateGroup.position.y = curveY(gateGroup.position.z);
      gateGroup.position.x = bendX(gateGroup.position.z);
      if (!gate.answered && gateGroup.position.z >= PLAYER_Z - 1) {
        gate.answered = true;
        const right = laneIdx === gate.q.correctLane;
        recordAnswer(right);
        resolvePanels(gate.q.correctLane);
        if (right) {
          grantReward(); sfx.correct(); fovKick = Math.max(fovKick, 5);
          shockwave(new T3.Vector3(gateGroup.position.x + LANES[laneIdx], gateGroup.position.y + 1.2, gateGroup.position.z), 0x5cffc4, false);
        } else wrongConsequence(gate.q.answer);
        gate.resolveT = 1.1;
        gatesDone++;
      }
      if (gate.answered) {
        gate.resolveT -= dt;
        gate.panels.forEach((p) => (p.mesh.material.opacity = Math.max(0, gate.resolveT)));
        if (gate.resolveT <= 0) { clearGate(); hideQ(); phase = "fly"; phaseT = 3.0; }
      }
      if (gate && !gate.answered && gateGroup.position.z > KILL_Z) { clearGate(); hideQ(); phase = "fly"; phaseT = 2; }
    } else if (phase === "quantity") {
      qty.activeT += dt;
      spawnT -= dt;
      if (qty.activeT < 6 && spawnT <= 0) {
        spawn("crystal", ri(0, 2), SPAWN_Z);
        spawnT = 0.75 + Math.random() * 0.45;
      }
      if (qty.activeT >= 6 && !ring.visible) { ring.visible = true; ring.position.set(0, 0.6, SPAWN_Z); }
      if (ring.visible) {
        ring.position.z += speed * dt;
        ring.position.y = 0.6 + curveY(ring.position.z);
        ring.position.x = bendX(ring.position.z);
        ring.rotation.z += dt * 1.5;
        const pulse = 1 + Math.sin(performance.now() * 0.008) * 0.05;
        ring.scale.set(pulse, pulse, 1);
        if (ring.position.z >= PLAYER_Z) {
          ring.visible = false;
          const right = qty.have === qty.need;
          recordAnswer(right); gatesDone++;
          if (right) { grantReward(); sfx.correct(); toast("Exactly " + qty.need + " — perfect count!"); }
          else {
            wrongConsequence(qty.need);
            toast((qty.have > qty.need ? "Too many! " : "Not enough! ") + qty.have + "/" + qty.need, "#ffd166");
          }
          hideQ(); phase = "fly"; phaseT = 3.0;
        }
      }
    } else if (phase === "bossIntro") {
      if (boss) boss.position.z = T3.MathUtils.lerp(boss.position.z, -46, dt * 1.2);
      if (phaseT <= 0) {
        phase = "boss";
        const q = genQuestion(save.mathLevel);
        if (assist) q.fadeLane = pick([0, 1, 2].filter((l) => l !== q.correctLane));
        makeGate(q);
        const guarded = maybeGuard(q.correctLane);
        showQ(q.text, guarded ? "GUARDED — HIT " + mission.bossName : "HIT " + mission.bossName);
      }
    } else if (phase === "boss") {
      if (boss) {
        const rage = (3 - bossHP) / 3;                     // 0 → 1 as it takes damage
        boss.rotation.y += dt * (0.8 + rage * 1.4);
        boss.position.x = Math.sin(runTime * (0.7 + rage * 0.8)) * (1.6 + rage * 0.9) + bendX(boss.position.z);
        boss.position.y = 3.6 + Math.sin(runTime * (1.3 + rage)) * (0.4 + rage * 0.35);
        boss.rotation.z = Math.sin(runTime * 3) * rage * 0.12;   // listing as it's hurt
        // visible damage: dome dims, running lights die, sparks at low HP
        const dome = boss.getObjectByName("bossDome");
        if (dome) { dome.material.emissiveIntensity = 0.35 * (bossHP / 3); dome.material.opacity = 0.92 - rage * 0.3; }
        for (let i = 0; i < 12; i++) {
          const l = boss.getObjectByName("bl" + i);
          if (l) l.visible = i < Math.ceil(12 * (bossHP / 3));
        }
        if (bossHP <= 1 && Math.random() < dt * 3.5) {
          boom(boss.position.clone().add(new T3.Vector3((Math.random() - 0.5) * 5, -0.5, 0)), 0.55, 2);
        }
        // ---- attacks: telegraph, then fire down a lane ----
        bossAtk.t -= dt;
        const emit = boss.getObjectByName("bossEmit");
        if (bossAtk.state === "idle") {
          if (emit) emit.scale.setScalar(0.7 + Math.sin(runTime * 6) * 0.1);
          bossBeam.visible = false;
          // Below level 4 the boss only looms and taunts — a 4-year-old should not be
          // dodging beams while learning to count.
          if (save.mathLevel >= 4 && bossAtk.t <= 0 && gate && !gate.answered && gateGroup.position.z < -32) {
            bossAtk.lane = ri(0, 2);
            bossAtk.lane2 = bossHP <= 1 ? pick([0, 1, 2].filter((l) => l !== bossAtk.lane)) : -1;
            bossAtk.state = "warn";
            bossAtk.t = 0.95 - rage * 0.2;
            sfx.charge();
          }
        } else if (bossAtk.state === "warn") {
          bossBeam.visible = true;
          const p = 0.5 + Math.sin(performance.now() * 0.03) * 0.5;
          bossBeam.material.opacity = 0.1 + p * 0.16;
          bossBeam.scale.set(0.42, 1, 0.42);
          if (emit) emit.scale.setScalar(1 + p * 0.6);
          if (bossAtk.t <= 0) { bossAtk.state = "fire"; bossAtk.t = 0.42; sfx.beam(); shake = 0.35; }
        } else if (bossAtk.state === "fire") {
          bossBeam.visible = true;
          bossBeam.material.opacity = 0.75 + Math.random() * 0.2;
          bossBeam.scale.set(1, 1, 1);
          if (laneIdx === bossAtk.lane || laneIdx === bossAtk.lane2) {
            if (odActive > 0) { if (Math.random() < dt * 6) boom(ship.position, 0.5, 2); }
            else takeHit();
            if (state !== S.RUN) return;
          }
          if (bossAtk.t <= 0) {
            bossAtk.state = "idle";
            bossAtk.t = Math.max(1.1, 2.6 - rage * 1.3);
            bossBeam.visible = false;
          }
        }
        // park the beam on its lane(s)
        if (bossBeam.visible) {
          const bz = -26;
          bossBeam.position.set(LANES[bossAtk.lane] + bendX(bz), 0.6 + curveY(bz), bz);
        }
      }
      if (gate) {
        gateGroup.position.z += speed * dt * 0.9;
        gateGroup.position.y = curveY(gateGroup.position.z);
        gateGroup.position.x = bendX(gateGroup.position.z);
        if (!gate.answered && gateGroup.position.z >= PLAYER_Z - 1) {
          gate.answered = true;
          const right = laneIdx === gate.q.correctLane;
          recordAnswer(right);
          resolvePanels(gate.q.correctLane);
          if (right) {
            bossHP--; combo++; bestCombo = Math.max(bestCombo, combo);
            score += 200 * combo;
            addOD(0.34);
            sfx.laser(); laserT = 0.35; shake = 0.4;
            if (boss) shockwave(boss.position, 0xff5c9e, true);
            setTimeout(() => sfx.bossHit(), 150);
            toast("DIRECT HIT", "#ff9db0");
          } else {
            combo = 0; sfx.wrong();
            toast("Answer was " + gate.q.answer + " — incoming!", "#ffd166");
            const freeLane = ri(0, 2);
            for (let l = 0; l < 3; l++) if (l !== freeLane) spawn("debris", l, PLAYER_Z - 46);
          }
          gate.resolveT = 1;
          updHUD();
        }
        if (gate.answered) {
          gate.resolveT -= dt;
          gate.panels.forEach((p) => (p.mesh.material.opacity = Math.max(0, gate.resolveT)));
          if (gate.resolveT <= 0) {
            clearGate();
            if (bossHP <= 0) {
              if (boss) { sfx.bossHit(); shake = 1; redFlash(0.25); scene.remove(boss); boss = null; }
              bossBeam.visible = false; bossAtk.state = "idle"; bossAtk.t = 2.2;
              hideQ(); phase = "done"; phaseT = 4.6;
              elevTarget = 0; bendTarget = 0.0016;   // course curves around the planet
              toast(mission.bossName + " DEFEATED", "#ffd166");
              setTimeout(() => { if (!disposed && phase === "done") toast("ARRIVAL · " + galaxy.name, galaxy.tag); }, 1400);
            } else { phase = "bossIntro"; phaseT = 1.6; hideQ(); }
          }
        }
        if (gate && !gate.answered && gateGroup.position.z > KILL_Z) { clearGate(); phase = "bossIntro"; phaseT = 1; hideQ(); }
      }
    } else if (phase === "done") {
      // ARRIVAL FLYBY: sweep the destination past, huge, on the left
      const u = Math.min(1, Math.max(0, 1 - phaseT / 4.6));
      const e = u * u * (3 - 2 * u);
      qBez(FLY_P0, FLY_P1, FLY_P2, e, dpTmp);
      destPlanet.position.copy(dpTmp);
      destPlanet.scale.setScalar(T3.MathUtils.lerp(DP_NEAR.scale, 0.46, e));
      destPlanet.children[0].rotation.y += dt * 0.12;  // surface visibly rolling past
      fovKick = Math.max(fovKick, (1 - Math.abs(u - 0.45) * 2.4) * 5); // widescreen swell at closest pass
      if (phaseT <= 0) { missionWin(); return; }
    }

    // entities
    for (let i = active.length - 1; i >= 0; i--) {
      const o = active[i];
      o.t += dt;
      o.grp.position.z += speed * o.speedMul * dt;
      let bob = 0;
      if (o.kind === "asteroid" || o.kind === "debris") {
        o.grp.rotation.x += o.grp.userData.spin.x * dt;
        o.grp.rotation.y += o.grp.userData.spin.y * dt;
      } else if (o.kind === "ufo") {
        o.driftT -= dt;
        o.grp.rotation.y += dt * 1.2;
        bob = Math.sin(o.t * 4) * 0.25;
        if (o.driftT <= 0 && o.grp.position.z < -20) {
          o.targetLane = pick([o.targetLane - 1, o.targetLane + 1].filter((l) => l >= 0 && l <= 2));
          o.driftT = 1.4 + Math.random() * 1.6;
        }
        const gx = LANES[o.targetLane] - o.x;
        o.x += gx * Math.min(1, 2.2 * dt);
        o.grp.rotation.z = -gx * 0.15;
      } else if (o.kind === "comet") {
        o.grp.userData.flames.forEach((f, fi) => f.scale.set(1, 1 + Math.sin(o.t * 18 + fi) * 0.15, 1));
      } else if (o.kind === "crystal") {
        o.grp.rotation.y += dt * 3;
        bob = Math.sin(o.t * 5) * 0.15;
      } else if (o.kind === "crate") {
        o.grp.rotation.x += o.grp.userData.spin.x * dt;
        o.grp.rotation.y += o.grp.userData.spin.y * dt;
        bob = Math.sin(o.t * 3.5) * 0.2;
        o.grp.userData.halo.lookAt(camera.position);
      }
      o.grp.position.x = o.x + bendX(o.grp.position.z);
      o.grp.position.y = bob + curveY(o.grp.position.z);

      const pz = o.grp.position.z;
      const ddx = Math.abs(o.grp.position.x - ship.position.x);
      const ddz = Math.abs(pz - PLAYER_Z);
      if (ddz < TUNE.hitRadius) {
        if (o.kind === "crate") {
          if (ddx < SHIPS[shipSel].magnet) {
            if (cargo < 6) { cargo++; score += 40; sfx.pickup(); boom(o.grp.position, 0.6, 4); toast("Cargo secured · " + cargo, "#ffcf5c"); }
            despawn(i); continue;
          }
        } else if (o.kind === "crystal") {
          if (ddx < SHIPS[shipSel].magnet) {
            score += 25; coinsRun++; sfx.pickup();
            boom(o.grp.position, 0.5, 4);
            if (phase === "quantity") {
              qty.have++;
              showQ("exactly " + qty.need + " ★", "COLLECT · " + qty.have + "/" + qty.need);
              toast(qty.have + "/" + qty.need + " ★");
            } else toast("+25 ★");
            despawn(i); continue;
          }
        } else if (ddx < TUNE.hitRadius + (odActive > 0 ? 0.5 : 0) && hp > 0 && phase !== "done") {
          if (odActive > 0) {
            // punch straight through — this is what the math bought you
            odSmashes++; score += 60;
            boom(o.grp.position, 1.2, 8);
            sfx.smash(); shake = Math.max(shake, 0.35);
            despawn(i); continue;
          }
          takeHit();
          if (state !== S.RUN) return;
          despawn(i); continue;
        }
      }
      if (o.kind !== "crystal" && !o.scored && pz > PLAYER_Z + TUNE.hitRadius) {
        o.scored = true;
        if (ddx < 2.6 && ddx >= TUNE.hitRadius) {
          score += 15; toast("NEAR MISS +15", "#ffd166");
          shake = Math.max(shake, 0.2);
        }
      }
      if (pz > KILL_Z) despawn(i);
    }

    // laser
    if (laserT > 0) {
      laserT -= dt;
      laser.visible = true;
      const from = _v1.copy(ship.position); from.y += 0.1; from.z -= 1;
      const to = boss ? _v2.copy(boss.position) : _v2.set(0, 3, -46);
      const dist = from.distanceTo(to);
      laser.position.copy(from).add(to).multiplyScalar(0.5);
      laser.scale.set(1, dist, 1);
      laser.lookAt(to);
      laser.rotateX(Math.PI / 2);
      laser.material.opacity = laserT / 0.35;
    } else laser.visible = false;

    updHUD();
  }

  // wide universe vista that sweeps around and settles behind the ship
  function cineCamera() {
    const u = Math.min(1, cineT / CINE.pan);
    const e = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2; // easeInOutCubic
    const ang = T3.MathUtils.lerp(2.45, 0, e);   // sweeps ~140° around to dead astern
    const rad = T3.MathUtils.lerp(56, 5.6, e);   // pulls in
    const hgt = T3.MathUtils.lerp(31, 2.15, e);  // drops down
    camera.position.set(
      Math.sin(ang) * rad,
      hgt + (Math.random() - 0.5) * shake * 0.4 * motion(),
      ship.position.z + Math.cos(ang) * rad
    );
    // look target slides from the deep field (planets) onto the ship's forward view
    camera.lookAt(
      T3.MathUtils.lerp(10, ship.position.x * 0.65, e),
      T3.MathUtils.lerp(15, 1.1, e),
      T3.MathUtils.lerp(-150, ship.position.z - 13, e)
    );
    camera.fov = T3.MathUtils.lerp(46, BASE_FOV, e);
    camera.updateProjectionMatrix();
  }

  function render(dt) {
    if (state === S.CINE) {
      cineCamera();
      shake = Math.max(0, shake - dt * 2.2);
      draw();
      return;
    }
    const spd = state === S.RUN ? curSpeed : 0;
    const frac = Math.min(1, spd / speedProfile().max);
    const hum = frac * 0.045; // engine vibration grows with speed
    const followX = ship.position.x * 0.4;
    const mo = motion();   // 0 under reduced-motion: no camera shake / engine jitter
    camera.position.set(
      followX + (Math.random() - 0.5) * (shake * 0.5 + hum) * mo,
      2.15 + (Math.random() - 0.5) * (shake * 0.4 + hum) * mo,
      PLAYER_Z + 5.6 - frac * 0.5 // creeps closer as you speed up
    );
    camera.lookAt(
      ship.position.x * 0.65 + bendX(-14) * 0.55,
      1.1 + curveY(-16) * 0.42,   // eye follows the slope ahead
      ship.position.z - 13
    );
    camera.rotation.z += bendCur * 55; // subtle roll into the turn
    shake = Math.max(0, shake - dt * 2.2);
    fovKick = Math.max(0, fovKick - dt * 10);
    camera.fov = BASE_FOV + frac * 13 + fovKick * mo + (timeScale < 1 ? -4 : 0);  // no flyby/hit FOV swell under reduced-motion
    camera.updateProjectionMatrix();
    draw();
  }

  let rafId = null;
  let uiFrame = 0, diagFrame = 0;
  let ftCount = 0, frameMsAvg = 16.7;   // smoothed real frame time (ms) for adaptive quality
  let errShown = false;

  function tick() {
    if (disposed) return;
    rafId = requestAnimationFrame(tick);
    const dt = Math.min(clock.getDelta(), 0.05);
    // Smoothed real frame time. Vsync caps this near 16.7ms (60fps) on a device
    // that's keeping up; it only rises when the device genuinely can't. An EMA
    // rides out one-off spikes (a GC pause, a tab returning from background).
    frameMsAvg += (dt * 1000 - frameMsAvg) * 0.08;

    try { update(dt); }
    catch (e) {
      if (!errShown) { errShown = true; notify("Hiccup: " + (e && e.message ? e.message : "unknown")); console.error(e); }
    }

    updateMusic();   // idempotent: starts/stops the drone with flight and tracks speed

    // telemetry first — it must not depend on whether we drew this frame
    if ((diagFrame = (diagFrame + 1) % 3) === 0) {
      let threat = null, threatZ = -999, starLane = null, starZ = -999;
      for (const o of active) {
        const z = o.grp.position.z;
        if (z > -30 && z < PLAYER_Z) {
          if (o.kind === "crystal") { if (z > starZ) { starZ = z; starLane = o.lane; } }
          else if (z > threatZ) { threatZ = z; threat = Math.round((o.x + 2.4) / 2.4); }
        }
      }
      window.__THREE_GAME_DIAGNOSTICS__ = {
        state: ["MENU", "BRIEF", "RUN", "WIN", "FAIL", "CINE"][state],
        cineT: +cineT.toFixed(2), count: lastCount, journey: +journey.toFixed(2),
        beamState: bossAtk.state, beamLane: bossAtk.state === "idle" ? null : bossAtk.lane,
        beamLane2: bossAtk.lane2, cargo, chain, nodes, guards: guardsSpawned, riftGap: +(riftZ - PLAYER_Z).toFixed(1),
        phase, lane: laneIdx, hp, shield, combo, gatesDone, totalGates, bossHP, assist, crashing,
        od: +od.toFixed(2), odActive: +odActive.toFixed(2), odSmashes,
        mathLevel: save.mathLevel, entities: active.length, score: Math.floor(score),
        acc: answersTotal ? (answersRight / answersTotal).toFixed(2) : "—",
        gateLane: gate && !gate.answered ? gate.q.correctLane : null,
        threatLane: threat, starLane, qtyNeed: qty.need, qtyHave: qty.have,
        dpr: curDPR, signCache: signCache.size, contextLost,
        draws: renderer.info.render.calls, tris: renderer.info.render.triangles,
      };
    }

    // Menus/overlays don't need a 60fps 3D scene behind them — and on mobile the
    // stacked blur over a live canvas is what made the buttons feel frozen.
    const overlayUp = state !== S.RUN && state !== S.CINE;
    if (contextLost) return;
    if (overlayUp && (uiFrame = (uiFrame + 1) % 4) !== 0) return;

    try { render(dt); }
    catch (e) {
      if (!errShown) { errShown = true; notify("Render issue: " + (e && e.message ? e.message : "unknown")); console.error(e); }
    }

    // Adaptive quality: if the device can't hold ~55fps, shed pixel ratio in
    // gentle steps (never upscale back, to avoid oscillating). Reacts in ~0.5s
    // and degrades smoothly instead of one big blurry jump. Only during flight.
    if (!overlayUp && ++ftCount >= 30) {
      ftCount = 0;
      if (frameMsAvg > 18) {                           // > 18ms ≈ under 55fps
        if (bloomOn) bloomOn = false;                  // bloom is the priciest — shed it first
        else if (dprCap > 1.0) {
          dprCap = Math.max(1.0, +(dprCap - 0.25).toFixed(2));
          curDPR = dprCap;
          renderer.setPixelRatio(curDPR);
          if (composer) composer.setPixelRatio(curDPR);
          resize();
        }
      }
    }
  }

  loadSave();
  updHUD();
  diagFrame = 2;   // publish telemetry on the very first tick
  tick();

  return function dispose() {
    disposed = true;
    if (rafId) cancelAnimationFrame(rafId);
    clearTimeout(toastTimer);
    listeners.forEach(([t, e, f, o]) => t.removeEventListener(e, f, o));
    listeners.length = 0;
    signCache.forEach((t) => { try { t.dispose(); } catch (e) {} });
    signCache.clear();
    try { renderer.dispose(); } catch (e) { /* ignore */ }
    stopMusic();
    try { if (bloomPass) bloomPass.dispose(); if (composer) composer.dispose(); } catch (e) { /* ignore */ }
    if (AC && AC.close) { try { AC.close(); } catch (e) { /* ignore */ } }
  };
}

// Re-export the pure math so the headless `math` suite can hit it directly
// through the same bundle (52k generated questions).
export { genQuestion, LEVELS, MAX_LEVEL, levelName };
