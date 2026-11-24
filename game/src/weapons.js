/* DUSK PATROL — weapons.js
   Player weapons: hitscan autocannon with heat, lock-on missiles with a
   reloading magazine, defensive flares and the barrel-roll dodge.
   Loaded as a classic script in order (see index.html); globals are shared. */
'use strict';

const weapons = {
  heat: 0, overheated: false, cd: 0, side: 1,
  ammo: 4, reloadT: 0, flares: 3, flareCd: 0,
  rollT: 0, rollCd: 0
};

// Cannon: 30 rounds/s base, 6 damage, 100 heat by default. Sustained fire
// overheats in about two seconds, which is what makes the gauge matter.
const CANNON = { rpm: 1800, dmg: 6, spread: 0.010, range: 1400, heatPerShot: 1.7, cool: 30 };

function resetWeapons() {
  weapons.heat = 0; weapons.overheated = false; weapons.cd = 0; weapons.side = 1;
  weapons.ammo = game.mods.missileMax; weapons.reloadT = 0;
  weapons.flares = game.mods.flareMax; weapons.flareCd = 0;
  weapons.rollT = 0; weapons.rollCd = 0;
}

/* ---------- muzzle helpers ---------- */
const _wMat = m4();
function muzzlePoint(side) {
  planeMatrix(_wMat, plane.pos, plane.yaw, plane.pitch, planeVisualRoll());
  const right = [_wMat[0], _wMat[1], _wMat[2]];
  const up = [_wMat[4], _wMat[5], _wMat[6]];
  const fwd = flightForward();
  return vadd(vadd(plane.pos, vmul(right, 2.1 * side)), vadd(vmul(up, 0.06), vmul(fwd, 5.4)));
}

/* ---------- autocannon ---------- */
// Ray against every live hostile, nearest hit wins. Hitscan keeps the tracer
// exactly where the shot lands, which is what makes the reticle trustworthy.
function cannonRay(origin, dir) {
  let best = null, bestT = CANNON.range;
  for (const e of enemies) {
    if (!e.alive) continue;
    const oc = vsub(origin, e.pos);
    const b = vdot(oc, dir);
    const c = vdot(oc, oc) - e.r * e.r;
    const disc = b * b - c;
    if (disc < 0) continue;
    const t = -b - Math.sqrt(disc);
    if (t > 0 && t < bestT) { bestT = t; best = e; }
  }
  return best ? { e: best, t: bestT, p: vadd(origin, vmul(dir, bestT)) } : null;
}

function fireCannon() {
  if (game.state !== 'play' || !plane.alive || weapons.overheated || weapons.cd > 0) return;
  weapons.cd = 1 / (CANNON.rpm * game.mods.fireRate / 60);
  const side = weapons.side; weapons.side *= -1;

  const m = muzzlePoint(side);
  const fwd = flightForward();
  const camRight = [Math.cos(plane.yaw), 0, -Math.sin(plane.yaw)];
  const aim = vnorm([
    fwd[0] + camRight[0] * (Math.random() - 0.5) * CANNON.spread,
    fwd[1] + (Math.random() - 0.5) * CANNON.spread,
    fwd[2] + camRight[2] * (Math.random() - 0.5) * CANNON.spread
  ]);
  const hit = cannonRay(m, aim);
  const end = hit ? hit.p : vadd(m, vmul(aim, CANNON.range));

  tracers.push({ a: m, b: end, life: 0.055, max: 0.055 });
  spawnGlow(m, vmul(fwd, 12), 1.5, 0.05, [1, 0.85, 0.5], 4);
  audio.cannon();

  weapons.heat += CANNON.heatPerShot / game.mods.heatCap;
  if (weapons.heat >= 100) { weapons.heat = 100; weapons.overheated = true; audio.overheat(); }

  if (hit) {
    const crit = Math.random() < game.mods.crit;
    const dmg = CANNON.dmg * game.mods.dmgMult * (crit ? 2.2 : 1);
    const died = hurtEnemy(hit.e, dmg, crit);
    spawnGlow(end, vmul(aim, -6), 1.8, 0.07, crit ? [1, 0.95, 0.6] : [1, 0.75, 0.42], 5);
    if (died) creditShot(true);
  }
}

/* ---------- missiles ---------- */
const LOCK_COS = 0.90;
function lockTarget(from, fwd) {
  let target = null, best = LOCK_COS, bestD = 1e9;
  for (const e of enemies) {
    if (!e.alive) continue;
    const to = vsub(e.pos, from);
    const d = vlen(to) || 1;
    const dd = vdot(fwd, vmul(to, 1 / d));
    if (dd > best && d < bestD) { best = dd; bestD = d; target = e; }
  }
  return target;
}

function fireMissile() {
  if (game.state !== 'play' || !plane.alive) return;
  if (weapons.ammo <= 0) { audio.beep(180); return; }
  if (weapons.cd > 0) return;
  weapons.ammo--;
  weapons.cd = 0.30;
  const fwd = flightForward();
  const m = muzzlePoint(weapons.side);
  weapons.side *= -1;
  missiles.push({
    p: m, v: vmul(fwd, 200), life: 6, trail: 0,
    target: lockTarget(plane.pos, fwd), speed: 300, boostT: 0.35
  });
  game.missilesFired++;
  game.shake = Math.max(game.shake, 0.18);
  audio.missile();
}

function updateMissiles(dt) {
  if (weapons.ammo < game.mods.missileMax) {
    weapons.reloadT += dt;
    if (weapons.reloadT >= 2.6) { weapons.reloadT = 0; weapons.ammo++; }
  } else weapons.reloadT = 0;

  for (let i = missiles.length - 1; i >= 0; i--) {
    const m = missiles[i];
    m.life -= dt;
    m.speed = Math.min(620, m.speed + 900 * dt);
    if (m.target && m.target.alive && m.target !== null) {
      const want = vnorm(vsub(m.target.pos, m.p));
      const cur = vnorm(m.v);
      m.v = vmul(vnorm(vlerp(cur, want, clamp(dt * 3.4, 0, 1))), m.speed);
    } else {
      m.v = vmul(vnorm(m.v), m.speed);
    }
    m.p = vadd(m.p, vmul(m.v, dt));
    m.trail -= dt;
    if (m.trail <= 0) {
      spawnSmoke(vadd(m.p, vmul(vnorm(m.v), -1.4)), [0, 1.4, 0], 1.7, 0.7, [0.74, 0.68, 0.64], 9, 0.5);
      m.trail = 0.024;
    }

    let dead = false;
    // Proximity fuse: any hostile inside the blast is hit, not only the lock.
    let hit = null, hd = 1e9;
    for (const e of enemies) {
      if (!e.alive) continue;
      const d = vdist(m.p, e.pos);
      if (d < e.r + 12 && d < hd) { hd = d; hit = e; }
    }
    if (hit) {
      const died = hurtEnemy(hit, 95, false);
      game.missileHits++;
      explode(m.p, 0.75);
      audio.explosion();
      if (died) creditShot(true);
      dead = true;
    } else if (m.p[1] < Math.max(terrainHeight(m.p[0], m.p[2]), 0) + 1) {
      explode(m.p, 0.7); audio.explosion(); dead = true;
    } else if (m.life <= 0) {
      explode(m.p, 0.4); dead = true;
    }
    if (dead) missiles.splice(i, 1);
  }
}

/* ---------- flares ---------- */
function fireFlares() {
  if (game.state !== 'play' || !plane.alive) return;
  if (weapons.flares <= 0 || weapons.flareCd > 0) { audio.beep(180); return; }
  weapons.flares--;
  weapons.flareCd = game.mods.flareCd;
  plane.evade = 0.9;
  for (let i = 0; i < 10; i++) {
    const d = randDir(Math.random);
    spawnGlow(vadd(plane.pos, vmul(d, 3)), vadd(vmul(d, 42), vmul(plane.vel || [0, 0, 0], 0.2)),
      3.2, 0.9, [1, 0.55, 0.2], 2);
  }
  // Break every missile lock in the air.
  let broken = 0;
  for (const b of ebullets) {
    if (b.homing > 0) { b.homing = 0; b.life = Math.min(b.life, 1.1); broken++; }
  }
  game.shake = Math.max(game.shake, 0.12);
  audio.flare();
  if (broken) pops.push({ p: plane.pos.slice(), text: 'DECOY', t: 1.0, col: COL.amber });
}

/* ---------- barrel roll dodge ---------- */
let lastBarrelDir = 1;
function startBarrel(dir) {
  if (game.state !== 'play' || !plane.alive) return;
  if (weapons.rollCd > 0 || plane.barrelT > 0) { audio.beep(180); return; }
  if (!dir) {
    if (Math.abs(plane.inRoll) > 0.12) dir = plane.inRoll > 0 ? 1 : -1;
    else { dir = lastBarrelDir; lastBarrelDir = -lastBarrelDir; }
  }
  plane.barrelDir = dir;
  plane.barrelDur = 0.48;
  plane.barrelT = plane.barrelDur;
  weapons.rollCd = game.mods.rollCd;
  plane.evade = Math.max(plane.evade || 0, 0.58);
  game.shake = Math.max(game.shake, 0.14);
  audio.roll();
}

function updateWeapons(dt) {
  weapons.cd = Math.max(0, weapons.cd - dt);
  weapons.flareCd = Math.max(0, weapons.flareCd - dt);
  weapons.rollCd = Math.max(0, weapons.rollCd - dt);

  const firing = plane.alive && game.state === 'play' && !weapons.overheated &&
    (keys.Space || keys.Mouse0 || touch.fire);
  if (firing) fireCannon();
  // Heat always bleeds off; it just bleeds faster when the trigger is released.
  if (!firing && weapons.heat > 0) {
    weapons.heat = Math.max(0, weapons.heat - CANNON.cool * dt / game.mods.heatCap);
  } else if (weapons.overheated) {
    weapons.heat = Math.max(0, weapons.heat - CANNON.cool * 0.55 * dt / game.mods.heatCap);
  }
  if (weapons.overheated && weapons.heat <= 25) weapons.overheated = false;

  if (plane.evade > 0) plane.evade -= dt;

  for (let i = tracers.length - 1; i >= 0; i--) {
    tracers[i].life -= dt;
    if (tracers[i].life <= 0) tracers.splice(i, 1);
  }
}
