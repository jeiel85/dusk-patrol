/* DUSK PATROL — enemies.js
   Hostile definitions and behaviour: patrol drones, interceptors, gunships
   and the carrier boss, plus the enemy projectile pool.
   Loaded as a classic script in order (see index.html); globals are shared. */
'use strict';

const enemies = [];
const ebullets = [];

const ENEMY_DEFS = {
  drone: {
    hp: 60, r: 5.5, score: 100, name: 'DRONE', points: 100,
    color: [0.55, 0.20, 0.16], accent: [1.0, 0.55, 0.22]
  },
  interceptor: {
    hp: 110, r: 6.5, score: 250, name: 'INTERCEPTOR',
    color: [0.30, 0.34, 0.52], accent: [1.0, 0.30, 0.28]
  },
  gunship: {
    hp: 320, r: 10, score: 600, name: 'GUNSHIP',
    color: [0.26, 0.30, 0.26], accent: [1.0, 0.72, 0.28]
  },
  carrier: {
    hp: 1400, r: 26, score: 5000, name: 'CARRIER',
    color: [0.20, 0.19, 0.28], accent: [1.0, 0.42, 0.34]
  }
};

function spawnPoint(dist) {
  const a = Math.random() * TAU;
  const x = plane.pos[0] + Math.cos(a) * dist;
  const z = plane.pos[2] + Math.sin(a) * dist;
  const h = Math.max(terrainHeight(x, z), 0);
  return [clamp(x, -BOUNDARY + 400, BOUNDARY - 400),
    clamp(h + 90 + Math.random() * 150, 90, 430),
    clamp(z, -BOUNDARY + 400, BOUNDARY - 400)];
}

function spawnEnemy(type) {
  const def = ENEMY_DEFS[type] || ENEMY_DEFS.drone;
  const scale = 1 + Math.max(0, campaign.wave - 1) * 0.11;
  const pos = spawnPoint(type === 'carrier' ? 1000 : 850 + Math.random() * 350);
  const e = {
    type, def,
    pos, vel: [0, 0, 0],
    hp: def.hp * (type === 'carrier' ? 1 : scale), maxHp: def.hp * (type === 'carrier' ? 1 : scale),
    r: def.r, alive: true, rot: Math.random() * TAU, phase: Math.random() * TAU,
    fireT: 1.2 + Math.random() * 2, burst: 0, burstT: 0, hitT: 0, spawnT: 0.55,
    home: pos.slice(), roll: 0, aggro: 0
  };
  if (type === 'carrier') {
    e.maxHp = e.hp = def.hp + campaign.wave * 60;
    campaign.boss = e;
  }
  enemies.push(e);
  return e;
}

/* ---------- enemy projectiles ---------- */
function fireEnemyBullet(e, speed, dmg, spread, homing, life) {
  const to = vsub(plane.pos, e.pos);
  const d = vlen(to) || 1;
  let dir = vnorm(to);
  if (spread) {
    dir = vnorm([
      dir[0] + (Math.random() - 0.5) * spread,
      dir[1] + (Math.random() - 0.5) * spread,
      dir[2] + (Math.random() - 0.5) * spread
    ]);
  }
  ebullets.push({
    p: vadd(e.pos, vmul(dir, e.r + 1)),
    v: vmul(dir, speed),
    life: life || 3.2, dmg, homing: homing || 0, trail: 0, kind: homing ? 1 : 0
  });
}

function updateEnemyBullets(dt) {
  for (let i = ebullets.length - 1; i >= 0; i--) {
    const b = ebullets[i];
    b.life -= dt;
    if (b.homing > 0 && plane.alive) {
      const want = vnorm(vsub(plane.pos, b.p));
      const cur = vnorm(b.v);
      b.v = vmul(vnorm(vlerp(cur, want, clamp(dt * b.homing, 0, 1))), vlen(b.v));
    }
    b.p = vadd(b.p, vmul(b.v, dt));
    b.trail -= dt;
    if (b.trail <= 0 && b.kind === 1) {
      spawnSmoke(b.p.slice(), [0, 1.5, 0], 1.4, 0.5, [0.62, 0.55, 0.55], 7, 0.42);
      b.trail = 0.04;
    }
    let dead = b.life <= 0;
    if (!dead && plane.alive && vdist(b.p, plane.pos) < 7.5) {
      damagePlayer(b.dmg, b.p);
      dead = true;
    }
    if (!dead && b.p[1] < Math.max(terrainHeight(b.p[0], b.p[2]), 0) + 1) dead = true;
    if (dead) ebullets.splice(i, 1);
  }
}

/* ---------- per-type behaviour ---------- */
function moveEnemy(e, dt) {
  const toP = vsub(plane.pos, e.pos);
  const dist = vlen(toP) || 1;
  const dirP = vmul(toP, 1 / dist);

  if (e.type === 'drone') {
    const a = game.time * 0.35 + e.phase;
    const want = [
      e.home[0] + Math.cos(a) * 46 - e.pos[0],
      e.home[1] + Math.sin(game.time * 1.1 + e.phase) * 6 - e.pos[1],
      e.home[2] + Math.sin(a) * 46 - e.pos[2]
    ];
    e.vel = vlerp(e.vel, vmul(want, 1.6), 1 - Math.exp(-dt * 2.4));
    e.rot += dt * 1.1;
  } else if (e.type === 'interceptor') {
    // Close to a firing distance, then orbit and weave.
    const want = dist > 230 ? vmul(dirP, 150) : dist < 130 ? vmul(dirP, -120) : vmul(dirP, 0);
    const side = vnorm(vcross(dirP, [0, 1, 0]));
    const orbit = vmul(side, Math.sin(game.time * 0.8 + e.phase) * 95);
    e.vel = vlerp(e.vel, vadd(want, orbit), 1 - Math.exp(-dt * 1.9));
    e.roll = clamp(-Math.sin(game.time * 0.8 + e.phase) * 0.5, -0.6, 0.6);
    e.rot = Math.atan2(e.vel[0], e.vel[2]);
  } else if (e.type === 'gunship') {
    const want = dist > 340 ? vmul(dirP, 70) : dist < 240 ? vmul(dirP, -50) : [0, 0, 0];
    const drift = [Math.cos(game.time * 0.4 + e.phase) * 24, 0, Math.sin(game.time * 0.4 + e.phase) * 24];
    e.vel = vlerp(e.vel, vadd(want, drift), 1 - Math.exp(-dt * 1.1));
    e.rot += dt * 0.35;
  } else if (e.type === 'carrier') {
    // Slow orbit around the bay centre; the boss does not chase.
    const a = game.time * 0.10 + e.phase;
    const cx = 60 + Math.cos(a) * 620, cz = Math.sin(a) * 620;
    const want = [cx - e.pos[0], 0, cz - e.pos[2]];
    e.vel = vlerp(e.vel, vmul(want, 0.55), 1 - Math.exp(-dt * 0.8));
    e.rot += dt * 0.16;
  }

  e.pos = vadd(e.pos, vmul(e.vel, dt));
  const gh = Math.max(terrainHeight(e.pos[0], e.pos[2]), 0);
  if (e.pos[1] < gh + 26) { e.pos[1] = gh + 26; if (e.vel[1] < 0) e.vel[1] = 0; }
  if (e.pos[1] > 520) { e.pos[1] = 520; if (e.vel[1] > 0) e.vel[1] = 0; }
  const lim = BOUNDARY - 260;
  e.pos[0] = clamp(e.pos[0], -lim, lim);
  e.pos[2] = clamp(e.pos[2], -lim, lim);
}

function enemyShoot(e, dt) {
  const dist = vdist(e.pos, plane.pos);
  if (!plane.alive) return;
  e.fireT -= dt;
  if (e.fireT > 0) return;

  if (e.type === 'drone') {
    if (dist < 760) {
      fireEnemyBullet(e, 150, 6, 0.05, 0, 3.4);
      audio.enemyShot(0.5);
    }
    e.fireT = 2.4 + Math.random() * 1.4;
  } else if (e.type === 'interceptor') {
    if (dist < 900) {
      e.burst = 3; e.burstT = 0;
      e.fireT = 2.0 + Math.random() * 0.8;
    } else e.fireT = 0.6;
  } else if (e.type === 'gunship') {
    if (dist < 1100) {
      if (Math.random() < 0.45) {
        fireEnemyBullet(e, 90, 14, 0, 1.5, 5.0);
        audio.enemyShot(0.8);
      } else {
        for (let i = 0; i < 5; i++) fireEnemyBullet(e, 130, 7, 0.42, 0, 3.0);
        audio.enemyShot(0.7);
      }
    }
    e.fireT = 2.6 + Math.random() * 1.2;
  } else if (e.type === 'carrier') {
    const hurt = e.hp / e.maxHp < 0.5;
    if (dist < 1600) {
      const n = hurt ? 11 : 7;
      for (let i = 0; i < n; i++) fireEnemyBullet(e, 140, 9, hurt ? 0.55 : 0.4, 0, 3.4);
      audio.enemyShot(1.0);
      // Escort launches: the carrier keeps feeding the fight.
      if (hurt && Math.random() < 0.5 && enemies.length < 12) spawnEnemy('drone');
    }
    e.fireT = hurt ? 1.5 : 2.3;
  }
  if (e.burst > 0) { e.burstT = 0; }
}

function updateEnemies(dt) {
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    if (!e.alive) { enemies.splice(i, 1); continue; }
    if (e.spawnT > 0) { e.spawnT -= dt; }
    if (e.hitT > 0) e.hitT -= dt;
    moveEnemy(e, dt);

    if (e.type === 'interceptor' && e.burst > 0) {
      e.burstT -= dt;
      if (e.burstT <= 0) {
        fireEnemyBullet(e, 260, 5, 0.035, 0.6, 2.2);
        audio.enemyShot(0.35);
        e.burst--; e.burstT = 0.12;
      }
    } else {
      enemyShoot(e, dt);
    }

    // Collision with the player is mutual damage.
    if (plane.alive && vdist(e.pos, plane.pos) < e.r + 5) {
      damagePlayer(e.type === 'carrier' ? 34 : 20, e.pos);
      hurtEnemy(e, 40);
    }
  }
  updateEnemyBullets(dt);
}

/* ---------- damage ---------- */
function hurtEnemy(e, dmg, crit) {
  if (!e.alive) return false;
  e.hp -= dmg;
  e.hitT = 0.09;
  spawnGlow(e.pos, [0, 0, 0], 3.2, 0.10, crit ? [1, 0.95, 0.55] : [1, 0.6, 0.3], 6);
  if (e.hp <= 0) {
    e.alive = false;
    killEnemy(e);
    return true;
  }
  return false;
}

function killEnemy(e) {
  const def = e.def;
  explode(e.pos, e.type === 'carrier' ? 3.0 : e.type === 'gunship' ? 1.7 : 1.0);
  game.shake = Math.max(game.shake, e.type === 'carrier' ? 1.3 : 0.3);
  creditKill(e);
  audio.explosion();
  if (e.type === 'carrier') {
    // The boss leaves a field of secondary blasts.
    for (let i = 0; i < 8; i++) {
      const off = [e.pos[0] + (Math.random() - 0.5) * 46, e.pos[1] + (Math.random() - 0.5) * 26, e.pos[2] + (Math.random() - 0.5) * 46];
      explode(off, 0.9);
    }
    game.shake = 2.0;
  }
  // Clear hostile fire when the boss dies so the win reads clearly.
  if (e.type === 'carrier') ebullets.length = 0;
}
