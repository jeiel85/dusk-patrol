/* DUSK PATROL — main.js
   Frame loop: fixed-cap timestep, update, render, HUD.
   Loaded as a classic script in order (see index.html); globals are shared. */
'use strict';

let lastT = performance.now();
function frame(now) {
  let dt = (now - lastT) / 1000;
  lastT = now;
  if (!isFinite(dt) || dt < 0) dt = 0.016;
  dt = Math.min(dt, 0.05);
  game.fps = lerp(game.fps, 1 / Math.max(dt, 0.0001), 0.08);
  update(dt);
  syncTouchUI();
  renderScene();
  renderHUD();
  requestAnimationFrame(frame);
}
document.addEventListener('visibilitychange', () => { lastT = performance.now(); });

respawnPlane();
plane.alive = true;
updateTitlePlane();
updateCamera(0.016);
requestAnimationFrame(frame);
