/* DUSK PATROL — game.js
   Game state and simulation: the jet, damage, particles, camera, scoring
   and the per-frame update. Loaded as a classic script in order (see
   index.html); globals are shared. */
'use strict';

const game = {
  state: 'title', time: 0, score: 0, best: 0, newBest: false,
  hull: 100, shield: 40, shieldT: 0,
  kills: 0, missilesFired: 0, missileHits: 0,
  combo: 1, comboKills: 0, comboT: 0, bestCombo: 1,
  camMode: 0, camAngle: 0, shake: 0, lock: null,
  fps: 60, debug: location.search.indexOf('debug') >= 0,
  waveBanner: 0, waveBonus: 0, visibleChunks: 0, hitFlash: 0,
  mods: defaultMods(), grade: 'D', paused: false, startedAt: 0
};
try { game.best = parseInt(localStorage.getItem('duskPatrolBest') || '0', 10) || 0; } catch (e) { }

const START = [coastX(1060) - 160, 205, 1060];
const plane = {
  pos: START.slice(), yaw: 0, pitch: 0, roll: 0, rollPunch: 0,
  barrel: 0, barrelT: 0, barrelDur: 0.48, barrelDir: 1,
  speed: 175, boost: 0, alive: true, respawn: 0, throttle: 0.62, agl: 200, edge: 0,
  inPitch: 0, inYaw: 0, inRoll: 0, bankVel: 0, gLoad: 0,
  evade: 0, vel: [0, 0, 0], invuln: 0
};
const cam = {
  pos: [0, 0, 0], look: [0, 0, 1], up: [0, 1, 0], fov: 62,
  snap: true, transT: 0, sway: 0, cockpitX: 0, cockpitY: 0
};
const camMat = m4(), viewM = m4(), projM = m4(), vpM = m4();

const missiles = [], smokeP = [], glowP = [], pops = [], tracers = [];
const TRAIL_MAX = 72;
const wingTrails = [[], []];
let trailSampleT = 0;
const BOUNDARY = 6200, BOUNDARY_WARN = 5400;

function planeVisualRoll() { return plane.roll + plane.rollPunch + plane.barrel; }
function clearTrails() { wingTrails[0].length = 0; wingTrails[1].length = 0; trailSampleT = 0; }
function updateTrails(dt) {
  for (let s = 0; s < 2; s++) {
    const tr = wingTrails[s];
    for (let i = tr.length - 1; i >= 0; i--) {
      tr[i].age += dt;
      if (tr[i].age > 1.35) tr.splice(i, 1);
    }
  }
  if (!plane.alive) return;
  trailSampleT -= dt;
  if (trailSampleT > 0) return;
  trailSampleT = 0.016;
  planeMatrix(camMat, plane.pos, plane.yaw, plane.pitch, planeVisualRoll());
  const rx = camMat[0], ry = camMat[1], rz = camMat[2];
  const ux = camMat[4], uy = camMat[5], uz = camMat[6];
  const fx = -camMat[8], fy = -camMat[9], fz = -camMat[10];
  const gFactor = clamp(Math.abs(plane.inRoll) * 0.95 + Math.abs(plane.bankVel) * 0.25 + Math.abs(plane.inPitch) * 0.65 + (plane.barrelT > 0 ? 1.0 : 0) + plane.boost * 0.75, 0, 1.2);
  const w = 0.08 + Math.min(1, gFactor) * 0.07;
  const alpha = 0.42 + Math.min(1, gFactor) * 0.48;
  for (let s = 0; s < 2; s++) {
    const sign = s === 0 ? 1 : -1;
    const tr = wingTrails[s];
    tr.push({
      p: [
        plane.pos[0] + rx * (4.92 * sign) - fx * 2.05,
        plane.pos[1] + ry * (4.92 * sign) - fy * 2.05,
        plane.pos[2] + rz * (4.92 * sign) - fz * 2.05
      ],
      u: [ux, uy, uz],
      r: [rx, ry, rz],
      w, a: alpha, age: 0
    });
    if (tr.length > TRAIL_MAX) tr.shift();
  }
}

function flightForward() {
  const cp = Math.cos(plane.pitch);
  return [-Math.sin(plane.yaw) * cp, Math.sin(plane.pitch), -Math.cos(plane.yaw) * cp];
}

/* ---------- particles ---------- */
function spawnGlow(p, v, size, life, col, grow) {
  if (glowP.length > 320) glowP.shift();
  glowP.push({ p: p.slice(), v: v.slice(), size, life, max: life, col, grow: grow || 0, a: 1 });
}
function spawnSmoke(p, v, size, life, col, grow, alpha) {
  if (smokeP.length > 260) smokeP.shift();
  smokeP.push({ p: p.slice(), v: v.slice(), size, life, max: life, col, grow: grow || 0, a: alpha === undefined ? 0.6 : alpha });
}
function randDir(r) {
  const z = r() * 2 - 1, a = r() * TAU, s = Math.sqrt(1 - z * z);
  return [Math.cos(a) * s, z, Math.sin(a) * s];
}
function explode(p, scale) {
  const r = mulberry32(((game.time * 997) | 0) + ((p[0] * 13) | 0));
  for (let i = 0; i < 30; i++) {
    const d = randDir(r);
    spawnGlow(vadd(p, vmul(d, 2 + r() * 5)), vmul(d, 18 + r() * 58 * scale),
      (4 + r() * 9) * scale, 0.35 + r() * 0.7, [1, 0.45 + r() * 0.5, 0.10 + r() * 0.15], 28);
  }
  spawnGlow(p, [0, 0, 0], 30 * scale, 0.16, [1, 0.92, 0.72], 120);
  for (let i = 0; i < 15; i++) {
    const d = randDir(r);
    spawnSmoke(vadd(p, vmul(d, 3)), [d[0] * 6, 4 + r() * 10, d[2] * 6],
      (4 + r() * 5) * scale, 1.0 + r() * 1.3, [0.38, 0.33, 0.34], 9, 0.55);
  }
}
function updateParticles(dt) {
  for (let i = smokeP.length - 1; i >= 0; i--) {
    const s = smokeP[i];
    s.p = vadd(s.p, vmul(s.v, dt)); s.v[1] += 2.2 * dt;
    s.life -= dt; s.size += s.grow * dt;
    if (s.life <= 0) smokeP.splice(i, 1);
  }
  for (let i = glowP.length - 1; i >= 0; i--) {
    const g = glowP[i];
    g.p = vadd(g.p, vmul(g.v, dt)); g.v[1] -= 18 * dt; g.v = vmul(g.v, 1 - 1.6 * dt);
    g.life -= dt; g.size += g.grow * dt;
    if (g.life <= 0) glowP.splice(i, 1);
  }
  for (let i = pops.length - 1; i >= 0; i--) {
    pops[i].t -= dt;
    pops[i].p[1] += dt * 14;
    if (pops[i].t <= 0) pops.splice(i, 1);
  }
}

/* ---------- scoring ---------- */
function creditKill(e) {
  const base = e.def.score;
  const mult = game.combo;
  const pts = Math.round(base * mult);
  game.score += pts;
  game.kills++;
  game.comboKills++;
  game.comboT = 3.0;
  game.bestCombo = Math.max(game.bestCombo, game.combo);
  game.combo = Math.min(8, 1 + Math.floor(game.comboKills / 2));
  if (game.mods.healPerKill > 0 && plane.alive) {
    game.hull = Math.min(game.mods.hullMax, game.hull + game.mods.healPerKill);
  }
  pops.push({
    p: e.pos.slice(),
    text: '+' + pts + (mult > 1 ? ' X' + mult : ''),
    t: 1.3, col: mult > 1 ? COL.amber : COL.bone
  });
  if (e.type === 'carrier') {
    pops.push({ p: [e.pos[0], e.pos[1] + 14, e.pos[2]], text: 'CARRIER DOWN', t: 2.4, col: COL.red });
  }
}
function creditShot() { /* reserved for accuracy bookkeeping */ }
function updateCombo(dt) {
  if (game.comboT > 0) {
    game.comboT -= dt;
    if (game.comboT <= 0) { game.combo = 1; game.comboKills = 0; }
  }
}

/* ---------- player damage ---------- */
function damagePlayer(dmg, at) {
  if (!plane.alive || game.state !== 'play') return;
  if (plane.invuln > 0 || (plane.evade || 0) > 0) return;
  game.hitFlash = Math.min(1, game.hitFlash + dmg / 40);
  if (game.shield > 0) {
    const absorbed = Math.min(game.shield, dmg);
    game.shield -= absorbed;
    dmg -= absorbed;
    game.shieldT = 0;
    if (at) spawnGlow(at, [0, 0, 0], 4, 0.16, [0.45, 0.85, 1.0], 14);
  }
  if (dmg > 0) {
    game.hull -= dmg;
    game.shake = Math.max(game.shake, 0.25 + dmg * 0.01);
    if (at) spawnGlow(at, [0, 0, 0], 5, 0.2, [1, 0.35, 0.25], 18);
  }
  audio.hit();
  if (game.hull <= 0) {
    game.hull = 0;
    crash(true);
  }
}

function crash(killed) {
  if (!plane.alive) return;
  if (game.camMode === 1) { game.camMode = 0; cam.snap = true; }
  plane.alive = false;
  explode(plane.pos, 2.0);
  game.shake = 1.4; game.lock = null;
  audio.explosion();
  game.combo = 1; game.comboKills = 0; game.comboT = 0;
  if (killed) {
    plane.respawn = 2.4;
    plane.dead = true;
  } else {
    // A terrain or boundary crash costs hull and puts you back in the air.
    game.hull = Math.max(0, game.hull - 30);
    plane.respawn = 2.0;
    plane.dead = game.hull <= 0;
  }
}

function respawnPlane() {
  plane.pos = START.slice();
  plane.yaw = 0; plane.pitch = 0; plane.roll = 0; plane.rollPunch = 0;
  plane.barrel = 0; plane.barrelT = 0; plane.barrelDir = 1;
  plane.inPitch = 0; plane.inYaw = 0; plane.inRoll = 0; plane.bankVel = 0; plane.gLoad = 0;
  plane.speed = 175; plane.boost = 0; plane.alive = true;
  plane.invuln = 1.6; plane.evade = 0; plane.vel = [0, 0, 0];
  game.shield = game.mods.shieldMax;
  game.shieldT = 0;
  clearTrails();
  cam.snap = true; cam.transT = 0; cam.sway = 0;
}

/* ---------- plane ---------- */
function updatePlane(dt) {
  if (game.state !== 'play') return;
  if (!plane.alive) {
    plane.respawn -= dt;
    if (plane.respawn <= 0) {
      if (plane.dead) { endGame(); return; }
      respawnPlane();
    }
    return;
  }
  if (plane.invuln > 0) plane.invuln -= dt;

  let pIn = ((keys.KeyW || keys.ArrowUp) ? 1 : 0) - ((keys.KeyS || keys.ArrowDown) ? 1 : 0) + touch.pitch;
  let steerIn = ((keys.KeyA || keys.ArrowLeft) ? 1 : 0) - ((keys.KeyD || keys.ArrowRight) ? 1 : 0) + touch.roll;
  pIn += clamp(-mouseDY * 0.038, -1, 1);
  steerIn += clamp(-mouseDX * 0.045, -1, 1);
  mouseDX *= 0.84; mouseDY *= 0.84;
  pIn = clamp(pIn, -1, 1);
  steerIn = clamp(steerIn, -1, 1);

  // Instant snap-reversal: counter-banking whips across much faster than holding one side.
  const reversing = steerIn !== 0 && steerIn * plane.inRoll < -0.05;
  const kPitch = 1 - Math.exp(-dt * 14);
  const kSteer = 1 - Math.exp(-dt * (reversing ? 26 : 16));
  plane.inPitch = lerp(plane.inPitch, pIn, kPitch);
  plane.inRoll = lerp(plane.inRoll, steerIn, kSteer);
  plane.inYaw = plane.inRoll;

  const turn = game.mods.turnMult;
  plane.pitch = wrapAngle(plane.pitch + plane.inPitch * 1.72 * turn * dt);

  // High-G banked carving: quick lean into ~68 deg bank, crisp snap-level when released.
  const prevRoll = plane.roll;
  const maxBank = 1.18;
  const targetRoll = plane.inRoll * maxBank;
  const rollRate = Math.abs(steerIn) > 0.04 ? (reversing ? 19.5 : 13.5) : 7.6;
  plane.roll = lerp(plane.roll, targetRoll, 1 - Math.exp(-dt * rollRate * Math.min(1.4, turn)));
  plane.bankVel = (plane.roll - prevRoll) / Math.max(dt, 0.001);

  // Elastic visual wing-snap overshoot makes left/right transitions feel razor-sharp.
  const targetPunch = clamp(plane.bankVel * 0.032, -0.22, 0.22);
  plane.rollPunch = lerp(plane.rollPunch, targetPunch, 1 - Math.exp(-dt * 16));

  // Immediate coordinated yaw: direct authority on frame 1 + banked lift carve.
  const yawRate = (plane.inRoll * 1.02 + Math.sin(plane.roll) * 1.48) * turn;
  plane.yaw = wrapAngle(plane.yaw + yawRate * dt);
  plane.gLoad = clamp(Math.abs(yawRate) * 0.55 + Math.abs(plane.inPitch) * 0.65, 0, 1.5);

  const boostKey = keys.ShiftLeft || keys.ShiftRight || touch.boost;
  plane.boost = lerp(plane.boost, boostKey ? 1 : 0, 1 - Math.exp(-dt * 6.2));

  const fwd = flightForward();
  const target = (138 + plane.throttle * 86 + plane.boost * 155) * game.mods.speedMult;
  plane.speed += (target - plane.speed) * dt * 1.15 - fwd[1] * 26 * dt;
  plane.speed = clamp(plane.speed, 95, 415 * game.mods.speedMult);

  plane.vel = vmul(fwd, plane.speed);
  plane.pos[0] += fwd[0] * plane.speed * dt;
  plane.pos[1] += fwd[1] * plane.speed * dt;
  plane.pos[2] += fwd[2] * plane.speed * dt;

  if (plane.barrelT > 0) {
    plane.barrelT -= dt;
    const dur = plane.barrelDur || 0.48;
    const t = clamp(1 - plane.barrelT / dur, 0, 1);
    const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    plane.barrel = plane.barrelDir * TAU * eased;
    // Lateral evasive juke along horizontal wing axis during the barrel roll.
    const juke = Math.sin(t * Math.PI) * 52 * dt * -plane.barrelDir;
    plane.pos[0] += Math.cos(plane.yaw) * juke;
    plane.pos[2] -= Math.sin(plane.yaw) * juke;
    if (plane.barrelT <= 0) { plane.barrel = 0; plane.barrelT = 0; }
  }

  if (plane.boost > 0.5) game.shake = Math.max(game.shake, 0.045);
  const gh = Math.max(terrainHeight(plane.pos[0], plane.pos[2]), 0);
  plane.agl = plane.pos[1] - gh;
  plane.edge = Math.max(Math.abs(plane.pos[0]), Math.abs(plane.pos[2]));
  if (plane.agl < 3.2) crash(false);
  if (plane.edge > BOUNDARY) crash(false);
  if (!plane.alive) return;
  audio.update(plane.speed, plane.boost);

  const lock = lockTarget(plane.pos, fwd);
  if (lock && lock !== game.lock) audio.beep(1180);
  game.lock = lock;
}

function updateTitlePlane() {
  const a = game.time * 0.095, R = 780;
  plane.pos[0] = -60 + Math.cos(a) * R;
  plane.pos[2] = Math.sin(a) * R;
  plane.pos[1] = 228 + Math.sin(game.time * 0.6) * 12;
  plane.yaw = Math.PI - a;
  plane.pitch = Math.cos(game.time * 0.6) * 0.06;
  plane.roll = 0.48; plane.rollPunch = 0; plane.inRoll = 0.42; plane.bankVel = 0;
  plane.speed = 215; plane.boost = 0.28 + 0.14 * Math.sin(game.time * 1.4);
}

/* ---------- camera ---------- */
const CHASE_TAU = { pos: 0.10, look: 0.055, up: 0.09 };
function updateCamera(dt) {
  // Use base attitude (without barrel spin) for external cameras so barrel rolls spin dramatically in frame.
  planeMatrix(camMat, plane.pos, plane.yaw, plane.pitch, plane.roll);
  const right = [camMat[0], camMat[1], camMat[2]];
  const up = [camMat[4], camMat[5], camMat[6]];
  const fwd = [-camMat[8], -camMat[9], -camMat[10]];

  let eye = null, look = null, upv = [0, 1, 0], fov = 62, snap = false;
  let posTau = CHASE_TAU.pos, lookTau = CHASE_TAU.look, upTau = CHASE_TAU.up;

  if (game.state === 'title') {
    const a = game.time * 0.17;
    eye = [plane.pos[0] + Math.cos(a) * 34, plane.pos[1] + 6 + 4 * Math.sin(a * 0.7), plane.pos[2] + Math.sin(a) * 34];
    look = vadd(plane.pos, [0, -14, 0]);
    upv = [0, 1, 0]; fov = 56;
    snap = true;
  } else if (game.camMode === 1 && plane.alive) {
    // FPV Cockpit camera: follows full roll + barrel + G-force head bob.
    planeMatrix(camMat, plane.pos, plane.yaw, plane.pitch, planeVisualRoll());
    const fUp = [camMat[4], camMat[5], camMat[6]];
    const fFwd = [-camMat[8], -camMat[9], -camMat[10]];
    eye = vadd(vadd(plane.pos, vmul(fFwd, 2.3)), vmul(fUp, 0.96));
    look = vadd(eye, vmul(fFwd, 120));
    upv = fUp; fov = 70 + plane.boost * 9;
    cam.cockpitX = lerp(cam.cockpitX, clamp(-plane.inRoll * 4.5 - plane.bankVel * 0.45, -7, 7), 1 - Math.exp(-dt * 12));
    cam.cockpitY = lerp(cam.cockpitY, clamp(plane.inPitch * 3.5 + plane.boost * 2.2, -5, 6), 1 - Math.exp(-dt * 12));
    if (cam.transT <= 0.02) snap = true;
    else { posTau = 0.06; lookTau = 0.04; upTau = 0.06; }
  } else if (game.camMode === 2 && plane.alive) {
    // Overhead tactical view (inspired by classic pixel-art 3D flight top-down).
    const hFwd = vnorm([-Math.sin(plane.yaw), 0, -Math.cos(plane.yaw)]);
    const alt = 104 + plane.boost * 18;
    eye = [plane.pos[0] - hFwd[0] * 24, plane.pos[1] + alt, plane.pos[2] - hFwd[2] * 24];
    look = [plane.pos[0] + hFwd[0] * 32, plane.pos[1] - 6, plane.pos[2] + hFwd[2] * 32];
    upv = hFwd;
    fov = 52 + plane.boost * 5;
    posTau = 0.13; lookTau = 0.09; upTau = 0.13;
    if (game.state === 'play') {
      eye = vadd(eye, vmul(plane.vel, posTau));
      look = vadd(look, vmul(plane.vel, lookTau));
    }
  } else if (game.camMode === 3) {
    game.camAngle += dt * 0.25;
    eye = [plane.pos[0] + Math.cos(game.camAngle) * 29, plane.pos[1] + 9 + Math.sin(game.camAngle * 0.7) * 4, plane.pos[2] + Math.sin(game.camAngle) * 29];
    look = vadd(plane.pos, [0, 1, 0]);
    upv = [0, 1, 0]; fov = 58;
    if (cam.transT <= 0.02) snap = true;
    else { posTau = 0.10; lookTau = 0.07; upTau = 0.10; }
  } else {
    // Dynamic banking Chase camera: lateral carve lag shows off wings, flames & contrails.
    const targetSway = -plane.inRoll * 3.8 - clamp(plane.bankVel * 0.28, -2.4, 2.4);
    cam.sway = lerp(cam.sway, targetSway, 1 - Math.exp(-dt * 8.5));
    const barrelKick = plane.barrelT > 0 ? Math.sin(plane.barrel) * 0.07 : 0;
    const blend = vnorm(vadd(vlerp([0, 1, 0], up, 0.28), vmul(right, barrelKick)));
    const dist = 16.8 + plane.speed * 0.012 + plane.boost * 2.4;
    eye = vadd(vadd(plane.pos, vmul(fwd, -dist)), vadd(vmul(blend, 5.2), vmul(right, cam.sway)));
    look = vadd(plane.pos, vadd(vmul(fwd, 74), vadd(vmul(up, 2.1), vmul(right, cam.sway * 0.35))));
    upv = blend; fov = 62 + plane.boost * 12 + Math.abs(plane.inRoll) * 3.2;
    if (game.state === 'results' || game.state === 'upgrade') {
      game.camAngle += dt * 0.22;
      eye = [plane.pos[0] + Math.cos(game.camAngle) * 31, plane.pos[1] + 8, plane.pos[2] + Math.sin(game.camAngle) * 31];
      look = vadd(plane.pos, [0, 1, 0]); upv = [0, 1, 0]; fov = 56;
      snap = true;
    } else if (game.state === 'play' && plane.alive) {
      const vel = plane.vel;
      eye = vadd(eye, vmul(vel, posTau));
      look = vadd(look, vmul(vel, lookTau));
    } else {
      snap = true;
    }
  }

  if (cam.transT > 0) {
    cam.transT = Math.max(0, cam.transT - dt);
    posTau = Math.max(posTau, 0.11);
    lookTau = Math.max(lookTau, 0.08);
    upTau = Math.max(upTau, 0.10);
  }

  if (snap || cam.snap) {
    cam.pos = eye.slice(); cam.look = look.slice(); cam.up = upv.slice(); cam.fov = fov; cam.snap = false;
  } else {
    cam.pos = vlerp(cam.pos, eye, 1 - Math.exp(-dt / posTau));
    cam.look = vlerp(cam.look, look, 1 - Math.exp(-dt / lookTau));
    cam.up = vnorm(vlerp(cam.up, upv, 1 - Math.exp(-dt / upTau)));
    cam.fov = lerp(cam.fov, fov, 1 - Math.exp(-dt * 9));
  }
  if (game.camMode !== 1) {
    const gh = terrainHeight(cam.pos[0], cam.pos[2]);
    if (cam.pos[1] < gh + 3) cam.pos[1] = gh + 3;
  }
  const sh = game.shake * 2.4;
  let sx = 0, sy = 0, sz = 0;
  if (sh > 0.02) {
    sx = (Math.random() - 0.5) * sh; sy = (Math.random() - 0.5) * sh; sz = (Math.random() - 0.5) * sh;
  }
  m4look(viewM, [cam.pos[0] + sx, cam.pos[1] + sy, cam.pos[2] + sz],
    [cam.look[0] + sx * 1.5, cam.look[1] + sy * 1.5, cam.look[2] + sz * 1.5], cam.up);
  m4persp(projM, cam.fov * DEG, W / H, 1, 9000);
  m4mul(vpM, projM, viewM);
}

/* ---------- state transitions ---------- */
function startGame() {
  game.state = 'play';
  game.score = 0; game.kills = 0; game.missilesFired = 0; game.missileHits = 0;
  game.combo = 1; game.comboKills = 0; game.comboT = 0; game.bestCombo = 1;
  game.camMode = 0; game.newBest = false; game.shake = 0; game.lock = null;
  game.camAngle = 0; game.hitFlash = 0; game.startedAt = game.time;
  game.mods = defaultMods();
  game.hull = game.mods.hullMax; game.shield = game.mods.shieldMax; game.shieldT = 0;
  campaign.picks = {}; campaign.wave = 0; campaign.cleared = 0;
  missiles.length = 0; smokeP.length = 0; glowP.length = 0; pops.length = 0;
  tracers.length = 0; enemies.length = 0; ebullets.length = 0;
  resetWeapons(); respawnPlane();
  plane.dead = false;
  startWave(1);
  audio.init(); audio.beep(680);
}

function endGame() {
  if (game.state !== 'play' && game.state !== 'upgrade') return;
  game.state = 'results';
  plane.alive = false;
  game.grade = runGrade();
  if (game.score > game.best) {
    game.best = game.score;
    game.newBest = true;
    try { localStorage.setItem('duskPatrolBest', String(game.best)); } catch (e) { }
  }
  game.camAngle = Math.atan2(cam.pos[2] - plane.pos[2], cam.pos[0] - plane.pos[0]);
  audio.gameOver();
}
function onEnter() {
  audio.init();
  if (game.state === 'title' || game.state === 'results') startGame();
  else if (game.state === 'pause') togglePause();
}
function restart() { audio.init(); startGame(); }
function togglePause() {
  if (game.state === 'play') { game.state = 'pause'; audio.beep(300); }
  else if (game.state === 'pause') { game.state = 'play'; audio.beep(620); }
}
function setCamera(mode) {
  if (game.state !== 'play' || game.camMode === mode) return;
  game.camMode = mode;
  cam.transT = 0.42;
  audio.beep(840);
}
function cycleCamera() { setCamera((game.camMode + 1) % 4); }

/* ---------- master update ---------- */
function update(dt) {
  game.time += dt;
  game.shake = Math.max(0, game.shake - dt * 1.7);
  game.hitFlash = Math.max(0, game.hitFlash - dt * 1.8);
  if (game.waveBanner > 0) game.waveBanner -= dt;

  if (game.state === 'title') {
    updateTitlePlane();
    updateTrails(dt);
    updateParticles(dt);
  } else if (game.state === 'play') {
    updatePlane(dt);
    updateTrails(dt);
    if (game.state !== 'play') { updateCamera(dt); return; }
    updateWeapons(dt);
    updateEnemies(dt);
    updateMissiles(dt);
    updateParticles(dt);
    updateCombo(dt);
    updateCampaign(dt);

    // Shield regenerates after a few quiet seconds.
    game.shieldT += dt;
    if (game.shieldT > 6 && game.shield < game.mods.shieldMax) {
      game.shield = Math.min(game.mods.shieldMax, game.shield + 9 * dt);
    }
  } else if (game.state === 'upgrade' || game.state === 'results') {
    updateParticles(dt);
    if (game.state === 'upgrade') updateCamera(dt);
  }
  updateCamera(dt);
}
