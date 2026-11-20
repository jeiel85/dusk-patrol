/* DUSK PATROL — input.js
   Screen fitting plus keyboard, mouse (pointer lock) and touch input.
   Loaded as a classic script in order (see index.html); globals are shared. */
'use strict';

const frameEl = document.getElementById('frame');
function resize() {
  // Between 1 and 3 device pixels per game pixel, round down to a whole number
  // so every game pixel is the same size (also on 125%/150% displays), unless
  // that would shrink the view below 75% (e.g. 1.4x -> 1x in a phone embed).
  // From 3x up uneven rows are invisible, so fill; below 1:1 scale freely.
  const dpr = window.devicePixelRatio || 1;
  const fit = Math.min(innerWidth / W, innerHeight / H) * dpr;
  const whole = Math.floor(fit);
  const s = (whole >= 1 && fit < 3 && whole / fit >= 0.75 ? whole : fit) / dpr;
  frameEl.style.width = (W * s) + 'px';
  frameEl.style.height = (H * s) + 'px';
}
window.addEventListener('resize', resize);
resize();

/* ============================================================
   INPUT
   ============================================================ */
const keys = Object.create(null);
let mouseDX = 0, mouseDY = 0;
window.addEventListener('keydown', e => {
  const k = e.code;
  if (k === 'ArrowUp' || k === 'ArrowDown' || k === 'ArrowLeft' || k === 'ArrowRight' || k === 'Space') e.preventDefault();
  if (!keys[k]) {
    if (k === 'Enter') onEnter();
    else if (k === 'KeyF') fireMissile();
    else if (k === 'KeyC') cycleCamera();
    else if (k === 'Digit1') setCamera(0);
    else if (k === 'Digit2') setCamera(1);
    else if (k === 'Digit3') setCamera(2);
    else if (k === 'KeyB') startBarrel();
    else if (k === 'KeyM') audio.toggle();
    else if (k === 'KeyP' || k === 'Escape') togglePause();
    else if (k === 'KeyR') restart();
  }
  keys[k] = true;
});
window.addEventListener('keyup', e => { keys[e.code] = false; });
glCanvas.addEventListener('pointerdown', e => {
  if (e.pointerType !== 'mouse') return;
  audio.init();
  if (game.state === 'play' && glCanvas.requestPointerLock) {
    try { glCanvas.requestPointerLock(); } catch (err) { }
  }
});
document.addEventListener('mousemove', e => {
  if (document.pointerLockElement === glCanvas) {
    mouseDX += e.movementX;
    mouseDY += e.movementY;
  }
});
// Leaving the tab or window mid-flight pauses instead of flying on unattended.
function releaseInputs() {
  for (const k in keys) keys[k] = false;
  touch.reset();
  if (game.state === 'play') togglePause();
}
window.addEventListener('blur', releaseInputs);
document.addEventListener('visibilitychange', () => { if (document.hidden) releaseInputs(); });

/* ---------- touch ---------- */
// A floating stick on the left half (up = nose up, sideways = roll) and
// buttons on the right. Each control follows its own pointer for multi-touch.
const touch = {
  on: false, pitch: 0, roll: 0, boost: false, fire: false, stickId: null, ox: 0, oy: 0,
  root: document.getElementById('touch'),
  enable(on) {
    if (this.on === on) return;
    this.on = on;
    document.body.classList.toggle('touch', on);
    if (!on) this.reset();
  },
  reset() {
    this.pitch = this.roll = 0; this.boost = this.fire = false; this.stickId = null;
    this.base.hidden = this.knob.hidden = true;
    for (const b of this.root.querySelectorAll('button.on')) b.classList.remove('on');
  },
  place(el, x, y) { el.style.left = x + 'px'; el.style.top = y + 'px'; },
  // Capture keeps a drag bound to its control; it throws if the pointer already ended.
  capture(el, id) { try { el.setPointerCapture(id); } catch (err) { } }
};
touch.base = touch.root.querySelector('.base');
touch.knob = touch.root.querySelector('.knob');
if (matchMedia('(pointer: coarse)').matches) touch.enable(true);
window.addEventListener('keydown', () => touch.enable(false), true);

window.addEventListener('pointerdown', e => {
  if (e.pointerType === 'mouse') return;
  touch.enable(true);
  audio.init();
  // Taps outside the controls drive the menus: start, retry and resume.
  if (e.target.closest('button') || e.target.closest('.zone')) return;
  if (game.state === 'title' || game.state === 'results' || game.state === 'pause') onEnter();
});

const zone = touch.root.querySelector('.zone');
const STICK_R = 46;
zone.addEventListener('pointerdown', e => {
  if (touch.stickId !== null) return;
  touch.stickId = e.pointerId; touch.ox = e.clientX; touch.oy = e.clientY;
  touch.capture(zone, e.pointerId);
  touch.place(touch.base, e.clientX, e.clientY); touch.place(touch.knob, e.clientX, e.clientY);
  touch.base.hidden = touch.knob.hidden = false;
});
zone.addEventListener('pointermove', e => {
  if (e.pointerId !== touch.stickId) return;
  let dx = e.clientX - touch.ox, dy = e.clientY - touch.oy;
  const d = Math.hypot(dx, dy);
  if (d > STICK_R) { dx *= STICK_R / d; dy *= STICK_R / d; }
  touch.place(touch.knob, touch.ox + dx, touch.oy + dy);
  const dead = v => Math.abs(v) < 0.12 ? 0 : v;
  touch.pitch = dead(-dy / STICK_R);
  touch.roll = dead(-dx / STICK_R);
});
const endStick = e => {
  if (e.pointerId !== touch.stickId) return;
  touch.stickId = null; touch.pitch = touch.roll = 0;
  touch.base.hidden = touch.knob.hidden = true;
};
zone.addEventListener('pointerup', endStick);
zone.addEventListener('pointercancel', endStick);

for (const btn of touch.root.querySelectorAll('button')) {
  const act = btn.dataset.act;
  btn.addEventListener('pointerdown', e => {
    e.preventDefault();
    touch.capture(btn, e.pointerId);
    btn.classList.add('on');
    if (act === 'fire') { touch.fire = true; fireMissile(); }
    else if (act === 'boost') touch.boost = true;
    else if (act === 'roll') startBarrel();
    else if (act === 'cam') cycleCamera();
    else if (act === 'pause') togglePause();
  });
  const up = () => {
    btn.classList.remove('on');
    if (act === 'fire') touch.fire = false;
    else if (act === 'boost') touch.boost = false;
  };
  btn.addEventListener('pointerup', up);
  btn.addEventListener('pointercancel', up);
}
// Stick and buttons exist only while flying; menus are driven by taps.
let wasFlying = false;
function syncTouchUI() {
  const flying = game.state === 'play';
  if (flying === wasFlying) return;
  wasFlying = flying;
  document.body.classList.toggle('flying', flying);
  if (!flying) touch.reset();
}
