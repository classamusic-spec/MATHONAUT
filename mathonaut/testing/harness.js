// ---------------------------------------------------------------------------
// Shared headless harness — see testing/README.md
//
// jsdom + real three.js + a fake WebGLRenderer + a stubbed 2D canvas context +
// a controlled clock. This is the boilerplate the example tests each inlined;
// it is factored out here so every suite drives the game the same way.
//
// A 90-second mission runs in milliseconds: time never advances on its own,
// only when a suite calls frame()/settle().
// ---------------------------------------------------------------------------
const { JSDOM } = require("jsdom");
const THREE = require("three");

// The pristine real timer, captured before any harness overrides global
// setTimeout. Used only to yield to the real event loop so pending promise
// microtasks (async save load / persist) can flush — never for game timing.
const REAL_SET_TIMEOUT = global.setTimeout.bind(global);
const REAL_CLEAR_TIMEOUT = global.clearTimeout.bind(global);
const realYield = () => new Promise((r) => REAL_SET_TIMEOUT(r, 0));

// Controlled clock. performance.now() must be overridden BEFORE the game reads
// it, and must stay in lockstep with the manually-driven rAF queue.
let T = 0;
try { Object.defineProperty(globalThis, "performance", { value: { now: () => T }, configurable: true }); }
catch (e) { globalThis.performance.now = () => T; }

// A fake renderer: no GPU. It records the last-rendered scene so suites can
// assert on scene-graph state (e.g. the boss beam cylinder).
let lastScene = null;
class FakeRenderer {
  constructor() { this.info = { render: { calls: 0, triangles: 0 } }; this.domElement = null; }
  setPixelRatio() {} setSize() {} render(s) { lastScene = s; this.info.render.calls++; }
  setClearColor() {} clear() {} dispose() {} getContext() { return {}; }
}

// A 2D canvas context that no-ops everything and hands back stub gradients.
const ctxStub = new Proxy({}, { get: (t, k) => {
  if (k === "createLinearGradient" || k === "createRadialGradient") return () => ({ addColorStop() {} });
  if (k === "canvas") return { width: 256, height: 256 };
  if (k === "measureText") return () => ({ width: 40 });
  if (k === "getImageData") return () => ({ data: new Uint8ClampedArray(4) });
  return typeof k === "string" ? () => {} : undefined;
} });

function createHarness(opts = {}) {
  const width = opts.width || 390, height = opts.height || 844;   // phone by default
  const dom = new JSDOM('<!doctype html><body><div id="root"></div></body>', { pretendToBeVisual: true });
  const { window } = dom;
  global.window = window; global.document = window.document; global.navigator = window.navigator;
  window.performance = { now: () => T };
  window.AudioContext = window.AudioContext || FakeAudioContext;
  window.webkitAudioContext = window.AudioContext;
  const vibes = [];
  window.navigator.vibrate = (p) => { vibes.push(p); return true; };

  // hand the game our fake renderer
  THREE.WebGLRenderer = FakeRenderer;
  window.HTMLCanvasElement.prototype.getContext = function () { return ctxStub; };

  // manual rAF queue
  let rafCbs = [];
  window.requestAnimationFrame = global.requestAnimationFrame = (cb) => { rafCbs.push(cb); return rafCbs.length; };
  window.cancelAnimationFrame = global.cancelAnimationFrame = () => {};

  // Fake timers keyed to the frame clock T. The game reveals its win/fail
  // overlays and resets tap latches via setTimeout; driving those off T (instead
  // of wall-clock) makes a 900ms overlay fire ~54 frames later — instantly, and
  // deterministically. Callbacks fire inside frame() as T passes their due time.
  let timers = [];
  let timerId = 1;
  const fakeSetTimeout = (fn, ms) => { const id = timerId++; timers.push({ id, due: T + (ms || 0), fn }); return id; };
  const fakeClearTimeout = (id) => { timers = timers.filter((t) => t.id !== id); };
  global.setTimeout = window.setTimeout = fakeSetTimeout;
  global.clearTimeout = window.clearTimeout = fakeClearTimeout;
  const runDueTimers = () => {
    let guard = 0;
    while (guard++ < 100000) {
      const dueNow = timers.filter((t) => t.due <= T).sort((a, b) => a.due - b.due);
      if (!dueNow.length) break;
      const t = dueNow[0];
      timers = timers.filter((x) => x !== t);
      try { t.fn(); } catch (e) { errors.push(e && e.stack ? e.stack.split("\n").slice(0, 3).join(" | ") : String(e)); }
    }
  };

  // in-memory storage so save/persist round-trips
  const store = {};
  window.storage = {
    get: async (k) => (store[k] ? { key: k, value: store[k] } : (() => { throw new Error("nf"); })()),
    set: async (k, v) => { store[k] = v; return { key: k, value: v }; },
  };
  if (opts.seedSave) store["mathonaut-save"] = JSON.stringify(opts.seedSave);

  const { MARKUP, createGame, genQuestion, LEVELS, MAX_LEVEL, levelName } = require("./game.cjs");
  const root = window.document.getElementById("root");
  root.innerHTML = MARKUP;
  Object.defineProperty(root, "clientWidth", { value: width });
  Object.defineProperty(root, "clientHeight", { value: height });

  const errors = [];
  const dispose = createGame(root, THREE);

  const $ = (id) => root.querySelector("#" + id);
  const frame = () => {
    T += 16.7;
    runDueTimers();   // fire any setTimeout callbacks now due on the frame clock
    const c = rafCbs; rafCbs = [];
    c.forEach((cb) => { try { cb(T); } catch (e) { errors.push(e && e.stack ? e.stack.split("\n").slice(0, 3).join(" | ") : String(e)); } });
  };
  // Tests must settle >= 6 frames after an input before reading telemetry, or
  // they read stale state (README: this once silently skipped whole missions).
  const settle = (n = 8) => { for (let i = 0; i < n; i++) frame(); };
  const D = () => window.__THREE_GAME_DIAGNOSTICS__;
  const tapRaw = (el) => (typeof el === "string" ? $(el) : el).dispatchEvent(new window.Event("touchend", { cancelable: true }));
  const tap = (el) => { tapRaw(el); settle(); };
  const key = (k) => window.dispatchEvent(new window.KeyboardEvent("keydown", { key: k }));
  const steerTo = (l) => { const d = D(); if (l == null || l === d.lane) return; key(l < d.lane ? "ArrowLeft" : "ArrowRight"); };
  const wallet = () => +($("totStars") ? $("totStars").textContent : 0);
  const now = () => T;
  const scene = () => lastScene;
  // Swipe simulation: a real horizontal drag over the flight. The steering
  // handlers live on `root`, so dispatch there (with bubbling). A drag that
  // travels > 26px reads as a swipe; the move fires mid-drag.
  const swipe = (dx) => {
    const x0 = 200, y0 = 400;
    const start = new window.Event("touchstart", { cancelable: true, bubbles: true });
    start.touches = [{ clientX: x0, clientY: y0 }];
    root.dispatchEvent(start);
    const move = new window.Event("touchmove", { cancelable: true, bubbles: true });
    move.touches = [{ clientX: x0 + dx, clientY: y0 }];
    root.dispatchEvent(move);
    const end = new window.Event("touchend", { cancelable: true, bubbles: true });
    end.changedTouches = [{ clientX: x0 + dx, clientY: y0 }];
    end.touches = [];
    root.dispatchEvent(end);
    settle();
  };
  // A stationary tap at an absolute screen-x on the play field (no drag) — used
  // to exercise tap-the-lane-you-want steering.
  const tapAt = (x) => {
    const start = new window.Event("touchstart", { cancelable: true, bubbles: true });
    start.touches = [{ clientX: x, clientY: 500 }];
    root.dispatchEvent(start);
    const end = new window.Event("touchend", { cancelable: true, bubbles: true });
    end.changedTouches = [{ clientX: x, clientY: 500 }];
    end.touches = [];
    root.dispatchEvent(end);
    settle();
  };

  // Advance the frame clock by `ms` (firing any setTimeout callbacks that come
  // due — win/fail overlay reveals, latch resets), then yield once to the real
  // event loop so pending promise microtasks (async save load / persist) flush.
  const wait = async (ms) => {
    const target = T + (ms || 0);
    while (T < target) frame();
    await realYield();
  };
  const boot = async () => { await realYield(); await wait(60); settle(); };

  const disposeAll = () => {
    try { dispose(); } catch (e) { /* ignore */ }
    global.setTimeout = REAL_SET_TIMEOUT;               // stop routing timers through the disposed harness
    global.clearTimeout = REAL_CLEAR_TIMEOUT;
  };

  return {
    window, root, $, frame, settle, tap, tapRaw, key, steerTo, swipe, tapAt,
    D, wallet, scene, store, errors, dispose: disposeAll, now, wait, boot,
    THREE, genQuestion, LEVELS, MAX_LEVEL, levelName,
    vibes,
  };
}

// A minimal Web Audio stub so the music bed / sfx code exercises without a device.
class FakeAudioParam { constructor(v) { this.value = v; } setValueAtTime() { return this; } linearRampToValueAtTime() { return this; } exponentialRampToValueAtTime() { return this; } setTargetAtTime() { return this; } cancelScheduledValues() { return this; } }
class FakeNode { constructor() { this.frequency = new FakeAudioParam(440); this.gain = new FakeAudioParam(1); this.Q = new FakeAudioParam(1); this.type = "sine"; } connect() { return this; } disconnect() {} start() {} stop() {} }
class FakeAudioContext {
  constructor() { this.currentTime = 0; this.destination = new FakeNode(); this.state = "running"; }
  createOscillator() { return new FakeNode(); }
  createGain() { return new FakeNode(); }
  createBiquadFilter() { return new FakeNode(); }
  createBufferSource() { return new FakeNode(); }
  resume() { return Promise.resolve(); }
  close() { return Promise.resolve(); }
}

module.exports = { createHarness };
