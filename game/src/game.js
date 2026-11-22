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
  pos: START.slice(), yaw: 0, pitch: 0, roll: 0, barrel: 0, barrelT: 0,
  speed: 175, boost: 0, alive: true, respawn: 0, throttle: 0.62, agl: 200, edge: 0,
  inPitch: 0, inYaw: 0, inRoll: 0, evade: 0, vel: [0, 0, 0], invuln: 0
};
const cam = { pos: [0, 0, 0], look: [0, 0, 1], up: [0, 1, 0], snap: true };
const camMat = m4(), viewM = m4(), projM = m4(), vpM = m4();

const missiles = [], smokeP = [], glowP = [], pops = [], tracers = [];
const BOUNDARY = 6200, BOUNDARY_WARN = 5400;

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
  plane.yaw = 0; plane.pitch = 0; plane.roll = 0;
  plane.barrel = 0; plane.barrelT = 0;
  plane.speed = 175; plane.boost = 0; plane.alive = true;
  plane.invuln = 1.6; plane.evade = 0; plane.vel = [0, 0, 0];
  game.shield = game.mods.shieldMax;
  game.shieldT = 0;
  cam.snap = true;
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
  let yIn = (keys.ArrowLeft ? 1 : 0) - (keys.ArrowRight ? 1 : 0);
  let rIn = (keys.KeyA ? 1 : 0) - (keys.KeyD ? 1 : 0) + touch.roll;
  pIn += clamp(-mouseDY * 0.035, -1, 1);
  yIn += clamp(-mouseDX * 0.03, -1, 1);
  mouseDX *= 0.86; mouseDY *= 0.86;

  const k = 1 - Math.exp(-dt * 9);
  plane.inPitch = lerp(plane.inPitch, clamp(pIn, -1, 1), k);
  plane.inYaw = lerp(plane.inYaw, clamp(yIn, -1, 1), k);
  plane.inRoll = lerp(plane.inRoll, clamp(rIn, -1, 1), k);

  const turn = game.mods.turnMult;
  plane.pitch = wrapAngle(plane.pitch + plane.inPitch * 1.5 * turn * dt);
  plane.roll = wrapAngle(plane.roll + plane.inRoll * 3.0 * turn * dt);
  if (Math.abs(rIn) < 0.02 && Math.abs(plane.inRoll) < 0.06) {
    plane.roll = wrapAngle(plane.roll + Math.atan2(Math.sin(-plane.roll), Math.cos(-plane.roll)) * (1 - Math.exp(-dt * 1.05)));
  }
  const yawRate = plane.inYaw * 0.8 + Math.sin(plane.roll) * 1.12;
  plane.yaw += yawRate * dt;

  const boostKey = keys.ShiftLeft || keys.ShiftRight || touch.boost;
  plane.boost = lerp(plane.boost, boostKey ? 1 : 0, 1 - Math.exp(-dt * 3.2));

  const fwd = flightForward();
  const target = (130 + plane.throttle * 85 + plane.boost * 145) * game.mods.speedMult;
  plane.speed += (target - plane.speed) * dt * 0.7 - fwd[1] * 27 * dt;
  plane.speed = clamp(plane.speed, 92, 395 * game.mods.speedMult);

  plane.vel = vmul(fwd, plane.speed);
  plane.pos[0] += fwd[0] * plane.speed * dt;
  plane.pos[1] += fwd[1] * plane.speed * dt;
  plane.pos[2] += fwd[2] * plane.speed * dt;

  if (plane.barrelT > 0) {
    plane.barrelT -= dt;
    const t = clamp(1 - plane.barrelT / 0.72, 0, 1);
    plane.barrel = TAU * smoothstep(0, 1, t);
    if (plane.barrelT <= 0) plane.barrel = 0;
  }

  if (plane.boost > 0.5) game.shake = Math.max(game.shake, 0.05);
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
  const a = game.time * 0.075, R = 780;
  plane.pos[0] = -60 + Math.cos(a) * R;
  plane.pos[2] = Math.sin(a) * R;
  plane.pos[1] = 235 + Math.sin(game.time * 0.5) * 10;
  plane.yaw = Math.PI - a;
  plane.pitch = 0; plane.roll = 0.30; plane.speed = 210; plane.boost = 0.12;
}

/* ---------- camera ---------- */
const CHASE_TAU = { pos: 0.12, look: 0.07, up: 0.10 };
function updateCamera(dt) {
  planeMatrix(camMat, plane.pos, plane.yaw, plane.pitch, plane.roll + plane.barrel);
  const up = [camMat[4], camMat[5], camMat[6]];
  const fwd = [-camMat[8], -camMat[9], -camMat[10]];

  let eye = null, look = null, upv = [0, 1, 0], fov = 62, snap = false;

  if (game.state === 'title') {
    const a = game.time * 0.17;
    eye = [plane.pos[0] + Math.cos(a) * 36, plane.pos[1] + 6 + 4 * Math.sin(a * 0.7), plane.pos[2] + Math.sin(a) * 36];
    // Aim a little below the jet so it sits above the menu panel.
    look = vadd(plane.pos, [0, -16, 0]);
    upv = [0, 1, 0]; fov = 55;
    snap = true;
  } else if (game.camMode === 1 && plane.alive) {
    eye = vadd(vadd(plane.pos, vmul(fwd, 2.3)), vmul(up, 0.95));
    look = vadd(eye, vmul(fwd, 120));
    upv = up; fov = 69 + plane.boost * 8;
    snap = true;
  } else if (game.camMode === 2) {
    game.camAngle += dt * 0.22;
    eye = [plane.pos[0] + Math.cos(game.camAngle) * 30, plane.pos[1] + 9 + Math.sin(game.camAngle * 0.7) * 4, plane.pos[2] + Math.sin(game.camAngle) * 30];
    look = vadd(plane.pos, [0, 1, 0]);
    upv = [0, 1, 0]; fov = 58;
    snap = true;
  } else {
    const blend = vnorm(vlerp([0, 1, 0], up, 0.36));
    const dist = 18 + plane.speed * 0.01;
    eye = vadd(vadd(plane.pos, vmul(fwd, -dist)), vmul(blend, 5.8));
    look = vadd(plane.pos, vadd(vmul(fwd, 70), vmul(up, 2.4)));
    upv = blend; fov = 60 + plane.boost * 11;
    if (game.state === 'results' || game.state === 'upgrade') {
      game.camAngle += dt * 0.22;
      eye = [plane.pos[0] + Math.cos(game.camAngle) * 31, plane.pos[1] + 8, plane.pos[2] + Math.sin(game.camAngle) * 31];
      look = vadd(plane.pos, [0, 1, 0]); upv = [0, 1, 0]; fov = 56;
      snap = true;
    } else if (game.state === 'play' && plane.alive) {
      const vel = plane.vel;
      eye = vadd(eye, vmul(vel, CHASE_TAU.pos));
      look = vadd(look, vmul(vel, CHASE_TAU.look));
    } else {
      snap = true;
    }
  }

  if (snap || cam.snap) {
    cam.pos = eye.slice(); cam.look = look.slice(); cam.up = upv.slice(); cam.snap = false;
  } else {
    cam.pos = vlerp(cam.pos, eye, 1 - Math.exp(-dt / CHASE_TAU.pos));
    cam.look = vlerp(cam.look, look, 1 - Math.exp(-dt / CHASE_TAU.look));
    cam.up = vnorm(vlerp(cam.up, upv, 1 - Math.exp(-dt / CHASE_TAU.up)));
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
  m4persp(projM, fov * DEG, W / H, 1, 9000);
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
  cam.snap = true;
  audio.beep(840);
}
function cycleCamera() { setCamera((game.camMode + 1) % 3); }

/* ---------- master update ---------- */
function update(dt) {
  game.time += dt;
  game.shake = Math.max(0, game.shake - dt * 1.7);
  game.hitFlash = Math.max(0, game.hitFlash - dt * 1.8);
  if (game.waveBanner > 0) game.waveBanner -= dt;

  if (game.state === 'title') {
    updateTitlePlane();
    updateParticles(dt);
  } else if (game.state === 'play') {
    updatePlane(dt);
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
