import { useEffect, useRef } from "react";
import * as THREE from "three";
import { MARKUP, createGame } from "../game/index.js";

/* ============================================================
   MATHONAUT — thin React wrapper

   All this does is inject MARKUP and call createGame in an effect. Every line
   of game logic lives in game/ (framework-free), which is why the game is
   testable headlessly. Keep this wrapper thin — see docs/03-architecture.md.
   ============================================================ */

export default function Mathonaut() {
  const rootRef = useRef(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let dispose = null;
    try {
      dispose = createGame(root, THREE);
    } catch (err) {
      const menu = root.querySelector("#menuOv");
      if (menu) {
        const box = document.createElement("div");
        box.style.cssText =
          "margin-top:14px;background:rgba(120,20,40,.9);border:2px solid #ff7d9c;" +
          "border-radius:14px;padding:10px 16px;font-size:12.5px;max-width:320px;";
        box.textContent = "Couldn't start the engine: " + (err && err.message ? err.message : "unknown error");
        menu.appendChild(box);
      }
    }
    return () => { if (dispose) dispose(); };
  }, []);

  return <div ref={rootRef} className="sl-root" dangerouslySetInnerHTML={{ __html: MARKUP }} />;
}
