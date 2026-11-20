/* DUSK PATROL — game.js
   Game state and simulation: particles, drones, missiles, the jet,
   cameras, state transitions and the per-frame update.
   Loaded as a classic script in order (see index.html); globals are shared. */
'use strict';

const game = {
  state: 'title', time: 0, timer: 120, score: 0, kills: 0, shots: 0, best: 0, newBest: false,
  camMode: 0, camAngle: 0, shake: 0, lock: null,
  fps: 60, debug: location.search.indexOf('debug') >= 0
};
try { game.best = parseInt(localStorage.getItem('duskPatrolBest') || '0', 10) || 0; } catch (e) { }

const START = [coastX(1060) - 160, 205, 1060];
const plane = {
  pos: START.slice(), yaw: 0, pitch: 0, roll: 0, barrel: 0, barrelT: 0,
  speed: 175, boost: 0, alive: true, respawn: 0, throttle: 0.62, agl: 200, edge: 0,
  inPitch: 0, inYaw: 0, inRoll: 0
};
const cam = { pos: [0, 0, 0], look: [0, 0, 1], up: [0, 1, 0], snap: true };
const camMat = m4(), viewM = m4(), projM = m4(), vpM = m4();

let mslAmmo = 8, mslCd = 0, mslReload = 0, missileSide = 1;
const missiles = [], drones = [], smokeP = [], glowP = [], pops = [];

function flightForward() {
  const cp = Math.cos(plane.pitch);
  return [-Math.sin(plane.yaw) * cp, Math.sin(plane.pitch), -Math.cos(plane.yaw) * cp];
}

/* ---------- particles ---------- */
function spawnGlow(p, v, size, life, col, grow) {
  if (glowP.length > 250) glowP.shift();
  glowP.push({ p: p.slice(), v: v.slice(), size, life, max: life, col, grow: grow || 0, a: 1 });
}
function spawnSmoke(p, v, size, life, col, grow, alpha) {
  if (smokeP.length > 230) smokeP.shift();
  smokeP.push({ p: p.slice(), v: v.slice(), size, life, max: life, col, grow: grow || 0, a: alpha === undefined ? 0.6 : alpha });
}
function randDir(r) {
  const z = r() * 2 - 1, a = r() * TAU, s = Math.sqrt(1 - z * z);
  return [Math.cos(a) * s, z, Math.sin(a) * s];
}
function explode(p, scale) {
  const r = mulberry32(((game.time * 997) | 0) + ((p[0] * 13) | 0));
  for (let i = 0; i < 28; i++) {
    const d = randDir(r);
    spawnGlow(vadd(p, vmul(d, 2 + r() * 5)), vmul(d, 18 + r() * 55 * scale),
      (4 + r() * 9) * scale, 0.35 + r() * 0.65, [1, 0.45 + r() * 0.5, 0.10 + r() * 0.15], 28);
  }
  spawnGlow(p, [0, 0, 0], 30 * scale, 0.16, [1, 0.92, 0.72], 120);
  for (let i = 0; i < 14; i++) {
    const d = randDir(r);
    spawnSmoke(vadd(p, vmul(d, 3)), [d[0] * 6, 4 + r() * 10, d[2] * 6],
      (4 + r() * 5) * scale, 1.0 + r() * 1.2, [0.38, 0.33, 0.34], 9, 0.55);
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
  for (let i = pops.length - 1; i >= 0; i--) { pops[i].t -= dt; if (pops[i].t <= 0) pops.splice(i, 1); }
}

/* ---------- drones ---------- */
function resetDrones() {
  drones.length = 0;
  for (let i = 0; i < 8; i++) {
    const h = droneHome(i);
    drones.push({ home: h.slice(), pos: h.slice(), alive: true, respawn: 0, phase: i * 1.7, rot: i * 0.9 });
  }
}
function killDrone(d) {
  if (!d.alive) return;
  d.alive = false; d.respawn = 13 + Math.random() * 5;
  explode(d.pos, 1.0);
  game.score += 100; game.kills++;
  pops.push({ p: d.pos.slice(), text: '+100', t: 1.3 });
  game.shake = Math.max(game.shake, 0.35);
  audio.explosion();
}
function updateDrones(dt) {
  for (const d of drones) {
    if (!d.alive) {
      d.respawn -= dt;
      if (d.respawn <= 0) {
        const h = droneHome((Date.now() / 997 | 0) % 1000);
        d.home = h.slice(); d.pos = h.slice(); d.alive = true;
        d.phase = Math.random() * 6; d.rot = Math.random() * 6;
      }
      continue;
    }
    // Slow patrol circle around the home point, bobbing gently.
    const a = game.time * 0.22 + d.phase;
    d.rot += dt * 0.8;
    d.pos[0] = d.home[0] + Math.cos(a) * 55;
    d.pos[1] = d.home[1] + Math.sin(game.time * 1.2 + d.phase) * 5;
    d.pos[2] = d.home[2] + Math.sin(a) * 55;
  }
}

// Missiles home on the drone nearest the nose inside a ~31° cone; the HUD
// uses the same test so a LOCK marker always means the missile will track.
const LOCK_COS = 0.86;
function lockTarget(from, fwd) {
  let target = null, best = LOCK_COS;
  for (const d of drones) {
    if (!d.alive) continue;
    const dd = vdot(fwd, vnorm(vsub(d.pos, from)));
    if (dd > best) { best = dd; target = d; }
  }
  return target;
}

/* ---------- missiles ---------- */
function fireMissile() {
  if (game.state !== 'play' || !plane.alive || mslAmmo <= 0 || mslCd > 0) return;
  planeMatrix(camMat, plane.pos, plane.yaw, plane.pitch, plane.roll + plane.barrel);
  const right = [camMat[0], camMat[1], camMat[2]], up = [camMat[4], camMat[5], camMat[6]];
  const fwd = flightForward();
  const p = vadd(vadd(plane.pos, vmul(right, 3.2 * missileSide)), vadd(vmul(up, -0.28), vmul(fwd, 1.0)));
  missileSide *= -1;
  missiles.push({ p, v: vmul(fwd, 420), life: 5, trail: 0, target: lockTarget(p, fwd) });
  mslAmmo--; mslCd = 0.42; game.shots++;
  game.shake = Math.max(game.shake, 0.22);
  audio.missile();
}
function updateMissiles(dt) {
  mslCd = Math.max(0, mslCd - dt);
  mslReload += dt;
  if (mslReload > 3) { mslReload = 0; if (mslAmmo < 8) mslAmmo++; }
  for (let i = missiles.length - 1; i >= 0; i--) {
    const m = missiles[i];
    m.life -= dt;
    if (m.target && m.target.alive) {
      const want = vnorm(vsub(m.target.pos, m.p));
      const cur = vnorm(m.v);
      m.v = vmul(vnorm(vlerp(cur, want, clamp(dt * 3.0, 0, 1))), 440);
    }
    m.p = vadd(m.p, vmul(m.v, dt));
    m.trail -= dt;
    if (m.trail <= 0) {
      spawnSmoke(vadd(m.p, vmul(vnorm(m.v), -1.2)), [0, 1.2, 0], 1.6, 0.7, [0.72, 0.66, 0.62], 9, 0.5);
      m.trail = 0.026;
    }
    // Proximity fuse: any drone in range is hit, not only the locked one.
    const hit = drones.find(d => d.alive && vdist(m.p, d.pos) < 18);
    let dead = false;
    if (hit) {
      killDrone(hit); dead = true;
    } else if (m.p[1] < Math.max(terrainHeight(m.p[0], m.p[2]), 0) + 1) {
      explode(m.p, 0.7); audio.explosion(); dead = true;
    } else if (m.life <= 0) {
      explode(m.p, 0.4); dead = true;
    }
    if (dead) missiles.splice(i, 1);
  }
}

/* ---------- plane ---------- */
function crash() {
  if (!plane.alive) return;
  if (game.camMode === 1) { game.camMode = 0; cam.snap = true; }
  plane.alive = false; plane.respawn = 2.0;
  explode(plane.pos, 1.8);
  game.shake = 1.2; game.lock = null;
  audio.explosion();
}
function respawnPlane() {
  plane.pos = START.slice();
  plane.yaw = 0; plane.pitch = 0; plane.roll = 0;
  plane.barrel = 0; plane.barrelT = 0;
  plane.speed = 175; plane.boost = 0; plane.alive = true;
  cam.snap = true;
}
function startBarrel() {
  if (game.state === 'play' && plane.alive && plane.barrelT <= 0) { plane.barrelT = 0.9; audio.beep(880); }
}
function updatePlane(dt) {
  if (game.state !== 'play') return;
  if (!plane.alive) {
    plane.respawn -= dt;
    if (plane.respawn <= 0) respawnPlane();
    return;
  }
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

  // Full aerobatics: pitch and roll wrap instead of stopping at 90/180 degrees.
  plane.pitch = wrapAngle(plane.pitch + plane.inPitch * 1.5 * dt);
  plane.roll = wrapAngle(plane.roll + plane.inRoll * 3.0 * dt);
  if (Math.abs(rIn) < 0.02 && Math.abs(plane.inRoll) < 0.06) {
    plane.roll = wrapAngle(plane.roll + Math.atan2(Math.sin(-plane.roll), Math.cos(-plane.roll)) * (1 - Math.exp(-dt * 1.05)));
  }
  const yawRate = plane.inYaw * 0.8 + Math.sin(plane.roll) * 1.12;
  plane.yaw += yawRate * dt;

  const boostKey = keys.ShiftLeft || keys.ShiftRight || keys.Space || touch.boost;
  if (touch.fire) fireMissile(); // holding FIRE keeps shooting at the normal cadence
  plane.boost = lerp(plane.boost, boostKey ? 1 : 0, 1 - Math.exp(-dt * 3.2));

  const fwd = flightForward();
  const target = 130 + plane.throttle * 85 + plane.boost * 145;
  plane.speed += (target - plane.speed) * dt * 0.7 - fwd[1] * 27 * dt;
  plane.speed = clamp(plane.speed, 92, 395);

  plane.pos[0] += fwd[0] * plane.speed * dt;
  plane.pos[1] += fwd[1] * plane.speed * dt;
  plane.pos[2] += fwd[2] * plane.speed * dt;

  if (plane.barrelT > 0) {
    plane.barrelT -= dt;
    const t = clamp(1 - plane.barrelT / 0.9, 0, 1);
    plane.barrel = TAU * smoothstep(0, 1, t);
    if (plane.barrelT <= 0) plane.barrel = 0;
  }

  if (plane.boost > 0.5) game.shake = Math.max(game.shake, 0.05);
  const gh = Math.max(terrainHeight(plane.pos[0], plane.pos[2]), 0);
  plane.agl = plane.pos[1] - gh;
  plane.edge = Math.max(Math.abs(plane.pos[0]), Math.abs(plane.pos[2]));
  if (plane.agl < 3.2) crash();
  if (plane.edge > BOUNDARY) crash();
  if (!plane.alive) return;
  audio.update(plane.speed, plane.boost);

  const lock = lockTarget(plane.pos, fwd);
  if (lock && lock !== game.lock) audio.beep(1180);
  game.lock = lock;
}
const BOUNDARY = 6200, BOUNDARY_WARN = 5400;

function updateTitlePlane() {
  const a = game.time * 0.075, R = 780;
  plane.pos[0] = -60 + Math.cos(a) * R;
  plane.pos[2] = Math.sin(a) * R;
  plane.pos[1] = 235 + Math.sin(game.time * 0.5) * 10;
  plane.yaw = Math.PI - a;
  plane.pitch = 0; plane.roll = 0.30; plane.speed = 210; plane.boost = 0.12;
}

/* ---------- camera ---------- */
// Chase smoothing time constants. The same values drive velocity compensation
// so exponential smoothing produces zero steady-state lag behind the jet.
const CHASE_TAU = { pos: 0.12, look: 0.07, up: 0.10 };
function updateCamera(dt) {
  planeMatrix(camMat, plane.pos, plane.yaw, plane.pitch, plane.roll + plane.barrel);
  const right = [camMat[0], camMat[1], camMat[2]];
  const up = [camMat[4], camMat[5], camMat[6]];
  const fwd = [-camMat[8], -camMat[9], -camMat[10]];

  let eye = null, look = null, upv = [0, 1, 0], fov = 62, snap = false;

  if (game.state === 'title') {
    const a = game.time * 0.17;
    eye = [plane.pos[0] + Math.cos(a) * 36, plane.pos[1] + 6 + 4 * Math.sin(a * 0.7), plane.pos[2] + Math.sin(a) * 36];
    look = vadd(plane.pos, [0, 1, 0]);
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
    if (game.state === 'results') {
      game.camAngle += dt * 0.22;
      eye = [plane.pos[0] + Math.cos(game.camAngle) * 31, plane.pos[1] + 8, plane.pos[2] + Math.sin(game.camAngle) * 31];
      look = vadd(plane.pos, [0, 1, 0]); upv = [0, 1, 0]; fov = 56;
      snap = true;
    } else if (game.state === 'play' && plane.alive) {
      // Velocity compensation cancels the steady-state lag of exponential
      // smoothing, keeping the jet framed while turns and loops ease in.
      const vel = vmul(fwd, plane.speed);
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
  let shakeX = 0, shakeY = 0, shakeZ = 0;
  if (sh > 0.02) {
    shakeX = (Math.random() - 0.5) * sh; shakeY = (Math.random() - 0.5) * sh; shakeZ = (Math.random() - 0.5) * sh;
  }
  m4look(viewM, [cam.pos[0] + shakeX, cam.pos[1] + shakeY, cam.pos[2] + shakeZ],
    [cam.look[0] + shakeX * 1.5, cam.look[1] + shakeY * 1.5, cam.look[2] + shakeZ * 1.5], cam.up);
  m4persp(projM, fov * DEG, W / H, 1, 9000);
  m4mul(vpM, projM, viewM);
}

/* ---------- state transitions ---------- */
function startGame() {
  game.state = 'play';
  game.timer = 120; game.score = 0; game.kills = 0; game.shots = 0; game.camMode = 0; game.newBest = false;
  game.shake = 0; game.lock = null; game.camAngle = 0;
  mslAmmo = 8; mslCd = 0; mslReload = 0; missileSide = 1;
  missiles.length = 0; smokeP.length = 0; glowP.length = 0; pops.length = 0;
  resetDrones(); respawnPlane();
  audio.init(); audio.beep(680);
}
function endGame() {
  if (game.state !== 'play') return;
  game.state = 'results';
  if (game.score > game.best) {
    game.best = game.score;
    game.newBest = true;
    try { localStorage.setItem('duskPatrolBest', String(game.best)); } catch (e) { }
  }
  game.camAngle = Math.atan2(cam.pos[2] - plane.pos[2], cam.pos[0] - plane.pos[0]);
  audio.beep(440);
}
function onEnter() {
  audio.init();
  if (game.state === 'title' || game.state === 'results') startGame();
  else if (game.state === 'pause') togglePause();
}
function restart() {
  audio.init();
  startGame();
}
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

  if (game.state === 'title') {
    updateTitlePlane();
    updateDrones(dt);
    updateParticles(dt);
  } else if (game.state === 'play') {
    const sec = Math.ceil(game.timer);
    game.timer -= dt;
    if (game.timer > 0 && game.timer <= 10 && Math.ceil(game.timer) < sec) audio.beep(990); // final countdown tick
    updatePlane(dt);
    updateDrones(dt);
    updateMissiles(dt);
    updateParticles(dt);
    if (game.timer <= 0) { game.timer = 0; endGame(); }
  } else if (game.state === 'results') {
    updateDrones(dt);
    updateParticles(dt);
  }
  updateCamera(dt);
}
