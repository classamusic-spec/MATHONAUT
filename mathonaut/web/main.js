// Browser entry for the standalone, self-contained build. Bundled (with three.js)
// by web/build.js and inlined into web/index.html, so the result is one HTML file
// that plays the real game core in any WebGL browser — no server, no CDN.
//
// This is the browser-facing sibling of app/Mathonaut.jsx: same split, same core.
import * as THREE from "three";
import { MARKUP, createGame } from "../game/index.js";

// Persistence shim: the core talks to an async window.storage (get/set that
// resolve { key, value } and reject on a miss). Back it with localStorage so a
// child's stars, unlocks, and settings survive a reload.
if (!window.storage) {
  window.storage = {
    get: (k) => new Promise((resolve, reject) => {
      let v = null;
      try { v = window.localStorage.getItem(k); } catch (e) { /* private mode */ }
      if (v == null) reject(new Error("not found")); else resolve({ key: k, value: v });
    }),
    set: (k, v) => new Promise((resolve) => {
      try { window.localStorage.setItem(k, v); } catch (e) { /* quota / private mode: run without persistence */ }
      resolve({ key: k, value: v });
    }),
  };
}

function boot() {
  const root = document.getElementById("root");
  if (!root) return;
  root.className = "sl-root";
  root.innerHTML = MARKUP;
  try {
    createGame(root, THREE);
  } catch (err) {
    const menu = root.querySelector("#menuOv") || root;
    const box = document.createElement("div");
    box.style.cssText =
      "margin:14px auto;max-width:320px;background:rgba(120,20,40,.9);" +
      "border:2px solid #ff7d9c;border-radius:14px;padding:10px 16px;font-size:12.5px;color:#fff;";
    box.textContent = "Couldn't start the engine: " + (err && err.message ? err.message : "unknown error");
    menu.appendChild(box);
  }
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
else boot();
