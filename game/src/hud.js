/* DUSK PATROL — hud.js
   The 2D overlay: title, flight HUD, warnings, lock box, wave banner,
   upgrade cards, pause and results. Loaded as a classic script in order
   (see index.html); globals are shared. */
'use strict';

function pad(n, w) { return String(Math.max(0, Math.floor(n))).padStart(w, '0'); }
function blinkOn(rate) { return Math.sin(game.time * rate) > -0.2; }

/* ---------- small widgets ---------- */
// Horizontal gauge with a label, a value readout and an optional overheat tint.
function drawGauge(x, y, w, h, frac, col, bg) {
  hud.fillStyle = bg || 'rgba(8,6,16,0.55)';
  hud.fillRect(x - 1, y - 1, w + 2, h + 2);
  hud.fillStyle = 'rgba(242,230,208,0.12)';
  hud.fillRect(x, y, w, h);
  const fw = Math.round(w * clamp(frac, 0, 1));
  if (fw > 0) {
    hud.fillStyle = col;
    hud.fillRect(x, y, fw, h);
  }
}

function drawReticle() {
  hud.fillStyle = 'rgba(242,230,208,0.82)';
  hud.fillRect(235, 134, 3, 1); hud.fillRect(242, 134, 3, 1);
  hud.fillRect(239, 130, 1, 3); hud.fillRect(239, 137, 1, 3);
  hud.fillStyle = 'rgba(255,180,92,0.9)';
  hud.fillRect(239, 134, 2, 1);
}

/* ---------- targets ---------- */
function bestTarget() {
  const fwd = vnorm(vsub(cam.look, cam.pos));
  let best = null, bestDot = 0.55, bestDist = 1e9;
  for (const e of enemies) {
    if (!e.alive) continue;
    const to = vsub(e.pos, cam.pos), dist = vlen(to);
    const dd = vdot(fwd, vmul(to, 1 / Math.max(dist, 0.001)));
    if (dd > bestDot && dist < bestDist) { bestDot = dd; best = e; bestDist = dist; }
  }
  return best ? { e: best, dist: bestDist } : null;
}

function drawTargetBox() {
  const lock = game.lock && game.lock.alive ? game.lock : null;
  const t = lock ? { e: lock, dist: vdist(lock.pos, plane.pos) } : bestTarget();
  if (!t) return;
  const p = projPoint(vpM, t.e.pos);
  if (!p || p[0] < 8 || p[0] > W - 8 || p[1] < 18 || p[1] > H - 22) return;
  const x = Math.round(p[0]), y = Math.round(p[1]);
  const boss = t.e.type === 'carrier';
  const s = boss ? 12 : lock ? 6 : 7;
  hud.fillStyle = lock ? 'rgba(255,90,95,0.95)' : 'rgba(255,180,92,0.95)';
  hud.fillRect(x - s, y - s, 4, 1); hud.fillRect(x - s, y - s, 1, 4);
  hud.fillRect(x + s - 3, y - s, 4, 1); hud.fillRect(x + s, y - s, 1, 4);
  hud.fillRect(x - s, y + s, 4, 1); hud.fillRect(x - s, y + s - 3, 1, 4);
  hud.fillRect(x + s - 3, y + s, 4, 1); hud.fillRect(x + s, y + s - 3, 1, 4);
  const label = (lock ? 'LOCK ' : t.e.def.name + ' ') + (t.dist / 1000).toFixed(1) + 'KM';
  drawTextC(label, x, y + s + 3, lock ? COL.red : COL.amber, 1, 0);
  // Health pips above the box for anything that survives one burst.
  if (t.e.maxHp > 120) {
    const f = clamp(t.e.hp / t.e.maxHp, 0, 1);
    drawGauge(x - 12, y - s - 6, 24, 2, f, f > 0.5 ? '#ffb45c' : '#ff5a5f');
  }
}

function drawOffscreenArrow() {
  if (!plane.alive) return;
  const cx = W / 2, cy = H / 2, margin = 22;
  let target = null, dist = 1e9;
  for (const e of enemies) {
    if (!e.alive) continue;
    const p = projPoint(vpM, e.pos);
    const onScreen = p && p[0] > 14 && p[0] < W - 14 && p[1] > 24 && p[1] < H - 32;
    if (onScreen) continue;
    const dd = vlen(vsub(e.pos, plane.pos));
    // The boss always wins the arrow, even when far away.
    const score = e.type === 'carrier' ? dd * 0.25 : dd;
    if (score < dist) { target = e; dist = score; }
  }
  if (!target) return;
  const px = target.pos[0], py = target.pos[1], pz = target.pos[2];
  const vx = viewM[0] * px + viewM[4] * py + viewM[8] * pz + viewM[12];
  const vy = viewM[1] * px + viewM[5] * py + viewM[9] * pz + viewM[13];
  const vz = viewM[2] * px + viewM[6] * py + viewM[10] * pz + viewM[14];
  let ax = vx * projM[0], ay = -vy * projM[5];
  if (vz > 0) { ax = -ax; ay = -ay; }
  let m = Math.hypot(ax, ay);
  if (m < 1e-3) { ax = 0; ay = 1; m = 1; }
  ax /= m; ay /= m;
  const halfW = cx - margin, halfH = cy - margin;
  const t = Math.min(halfW / Math.max(Math.abs(ax), 1e-4), halfH / Math.max(Math.abs(ay), 1e-4));
  const ex = Math.round(cx + ax * t), ey = Math.round(cy + ay * t);
  hud.save();
  hud.translate(ex, ey);
  hud.rotate(Math.atan2(ay, ax));
  hud.fillStyle = target.type === 'carrier' ? 'rgba(255,90,95,0.95)' : 'rgba(255,180,92,0.95)';
  hud.beginPath();
  hud.moveTo(6, 0); hud.lineTo(-4, -5); hud.lineTo(-1, 0); hud.lineTo(-4, 5);
  hud.closePath(); hud.fill();
  hud.restore();
  drawTextC((vdist(target.pos, plane.pos) / 1000).toFixed(1) + 'KM',
    clamp(Math.round(ex - ax * 12), 26, W - 26),
    clamp(Math.round(ey - ay * 11), 22, H - 26), COL.amber, 1, 0);
}

function drawPops() {
  for (const p of pops) {
    const sp = projPoint(vpM, p.p);
    if (!sp) continue;
    hud.globalAlpha = clamp(p.t, 0, 1);
    drawTextC(p.text, sp[0], sp[1] - 10, p.col || COL.amber, 1, 0);
    hud.globalAlpha = 1;
  }
}

/* ---------- radar ---------- */
// Top-down sweep centred on the jet; hostiles clamp to the rim when far.
function drawRadar(cx, cy, r) {
  hud.fillStyle = 'rgba(8,6,16,0.42)';
  hud.beginPath(); hud.arc(cx, cy, r, 0, TAU); hud.fill();
  hud.strokeStyle = 'rgba(242,230,208,0.22)';
  hud.lineWidth = 1;
  hud.beginPath(); hud.arc(cx, cy, r, 0, TAU); hud.stroke();
  hud.beginPath(); hud.arc(cx, cy, r * 0.55, 0, TAU); hud.stroke();
  hud.beginPath(); hud.moveTo(cx - r, cy); hud.lineTo(cx + r, cy); hud.moveTo(cx, cy - r); hud.lineTo(cx, cy + r); hud.stroke();

  const range = 1500;
  const fwd = flightForward();
  const heading = Math.atan2(fwd[0], -fwd[2]);
  const cos = Math.cos(-heading), sin = Math.sin(-heading);
  hud.fillStyle = 'rgba(255,180,92,0.9)';
  for (const e of enemies) {
    if (!e.alive) continue;
    let dx = e.pos[0] - plane.pos[0], dz = e.pos[2] - plane.pos[2];
    const rx = (dx * cos - dz * sin) / range;
    const rz = (dx * sin + dz * cos) / range;
    let px = cx + rx * r, py = cy + rz * r;
    const d = Math.hypot(px - cx, py - cy);
    const clamped = d > r - 2;
    if (clamped) { px = cx + (px - cx) / d * (r - 2); py = cy + (py - cy) / d * (r - 2); }
    hud.fillStyle = e.type === 'carrier' ? '#ff5a5f' : clamped ? 'rgba(255,180,92,0.45)' : '#ffb45c';
    const s = e.type === 'carrier' ? 3 : 1;
    hud.fillRect(Math.round(px - s / 2), Math.round(py - s / 2), s + (s === 1 ? 1 : 0), s + (s === 1 ? 1 : 0));
  }
  // The jet sits at the centre, pointing up.
  hud.fillStyle = '#f2e6d0';
  hud.beginPath(); hud.moveTo(cx, cy - 3); hud.lineTo(cx - 2, cy + 3); hud.lineTo(cx + 2, cy + 3); hud.closePath(); hud.fill();
}

/* ---------- title ---------- */
function drawTitleScreen() {
  hud.fillStyle = 'rgba(6,4,12,0.32)';
  hud.fillRect(0, 0, W, H);
  const tw = textWidth('DUSK PATROL', 3, 2);
  const tx = Math.round((W - tw) / 2);
  drawText('DUSK PATROL', tx + 2, 40, COL.dark, 3, 2);
  drawText('DUSK PATROL', tx, 37, COL.amber, 3, 2);
  hud.fillStyle = 'rgba(255,180,92,0.5)';
  hud.fillRect(160, 74, 160, 1);
  drawTextC('ENDLESS WAVE CAMPAIGN', 240, 82, COL.bone, 1, 0);
  drawTextC('BEST  ' + pad(game.best, 6) + '   WAVE  ' + campaign.bestWave, 240, 96, COL.amber, 1, 0);
  if (blinkOn(3.4)) drawTextC(touch.on ? 'TAP TO FLY' : 'PRESS ENTER TO FLY', 240, 122, COL.bone, 1, 1);

  hud.fillStyle = 'rgba(8,6,16,0.45)';
  hud.fillRect(64, 146, 352, 96);
  hud.fillStyle = 'rgba(255,180,92,0.25)';
  hud.fillRect(64, 146, 352, 1);
  if (touch.on) {
    drawTextSh('LEFT STICK', 76, 156, COL.amber, 1, 0); drawTextSh('FLY / LOOP', 178, 156, COL.bone, 1, 0);
    drawTextSh('FIRE', 76, 168, COL.amber, 1, 0); drawTextSh('HOLD: AUTOCANNON', 178, 168, COL.bone, 1, 0);
    drawTextSh('MSL', 76, 180, COL.amber, 1, 0); drawTextSh('MISSILE LOCK', 178, 180, COL.bone, 1, 0);
    drawTextSh('FLARE', 76, 192, COL.amber, 1, 0); drawTextSh('BREAK LOCK', 178, 192, COL.bone, 1, 0);
    drawTextSh('BOOST', 262, 156, COL.amber, 1, 0); drawTextSh('AFTERBURNER', 322, 156, COL.bone, 1, 0);
    drawTextSh('ROLL', 262, 168, COL.amber, 1, 0); drawTextSh('DODGE', 322, 168, COL.bone, 1, 0);
    drawTextSh('CAM', 262, 180, COL.amber, 1, 0); drawTextSh('VIEW', 322, 180, COL.bone, 1, 0);
    drawTextSh('II', 262, 192, COL.amber, 1, 0); drawTextSh('PAUSE', 322, 192, COL.bone, 1, 0);
    drawTextC(innerHeight > innerWidth ? 'TURN YOUR PHONE SIDEWAYS' : 'CLEAR EVERY WAVE. A CARRIER GUARDS EVERY 5TH.', 240, 214, COL.dim, 1, 0);
    drawTextC('EACH WAVE CLEARED, PICK ONE UPGRADE', 240, 228, COL.dim, 1, 0);
    return;
  }
  drawTextSh('WASD / ARROWS', 76, 156, COL.amber, 1, 0); drawTextSh('FLY / LOOP', 178, 156, COL.bone, 1, 0);
  drawTextSh('SPACE / LMB', 76, 168, COL.amber, 1, 0); drawTextSh('AUTOCANNON', 178, 168, COL.bone, 1, 0);
  drawTextSh('F / RMB', 76, 180, COL.amber, 1, 0); drawTextSh('MISSILE', 178, 180, COL.bone, 1, 0);
  drawTextSh('X', 76, 192, COL.amber, 1, 0); drawTextSh('FLARES', 178, 192, COL.bone, 1, 0);
  drawTextSh('SHIFT', 262, 156, COL.amber, 1, 0); drawTextSh('BOOST', 322, 156, COL.bone, 1, 0);
  drawTextSh('B', 262, 168, COL.amber, 1, 0); drawTextSh('BARREL ROLL', 322, 168, COL.bone, 1, 0);
  drawTextSh('C / 1-3', 262, 180, COL.amber, 1, 0); drawTextSh('CAMERA', 322, 180, COL.bone, 1, 0);
  drawTextSh('P / M / R', 262, 192, COL.amber, 1, 0); drawTextSh('PAUSE MUTE RETRY', 322, 192, COL.bone, 1, 0);
  drawTextC('CLEAR EVERY WAVE. A CARRIER GUARDS EVERY 5TH.', 240, 214, COL.dim, 1, 0);
  drawTextC('EACH WAVE CLEARED, PICK ONE UPGRADE', 240, 228, COL.dim, 1, 0);
}

/* ---------- cockpit ---------- */
function drawCockpitFrame() {
  hud.fillStyle = 'rgba(10,8,16,0.76)';
  hud.fillRect(0, 0, W, 3);
  hud.fillRect(0, 0, 3, H);
  hud.fillRect(W - 3, 0, 3, H);
  for (let i = 0; i < 12; i++) {
    hud.fillRect(3 + i * 5, 3 + i * 2, 40 - i * 3, 2);
    hud.fillRect(W - 43 + i * 3, 3 + i * 2, 40 - i * 3, 2);
  }
  hud.fillStyle = 'rgba(10,8,16,0.62)';
  hud.fillRect(0, H - 27, W, 2);
  hud.fillStyle = 'rgba(255,180,92,0.35)';
  hud.fillRect(26, H - 23, 72, 1);
  hud.fillRect(W - 98, H - 23, 72, 1);
}

function drawCockpitProjector() {
  const cx = 240, cy = 134;
  hud.fillStyle = 'rgba(255,180,92,0.20)';
  for (let i = 0; i < 24; i++) {
    const a = i / 24 * TAU;
    hud.fillRect(Math.round(cx + Math.cos(a) * 16), Math.round(cy + Math.sin(a) * 16), 1, 1);
  }
  hud.save();
  hud.translate(cx, cy + clamp(plane.pitch * 70, -82, 82));
  hud.rotate(-plane.roll);
  hud.fillStyle = 'rgba(242,230,208,0.30)';
  hud.fillRect(-42, 0, 28, 1); hud.fillRect(14, 0, 28, 1);
  hud.fillStyle = 'rgba(255,180,92,0.45)';
  hud.fillRect(-6, 0, 12, 1);
  hud.restore();
}

/* ---------- flight HUD ---------- */
function drawBars() {
  const m = game.mods;
  // Hull and shield, bottom-left.
  drawTextSh('HULL ' + Math.ceil(game.hull), 8, 224, game.hull / m.hullMax > 0.3 ? COL.bone : COL.red, 1, 0);
  drawGauge(8, 234, 78, 4, game.hull / m.hullMax, game.hull / m.hullMax > 0.3 ? '#5ee0d0' : '#ff5a5f');
  drawGauge(8, 242, 78, 3, game.shield / m.shieldMax, '#5fa8ff');

  // Heat, bottom-right, under the radar.
  const heat = weapons.heat / 100;
  const over = weapons.overheated;
  drawTextR(over ? 'OVERHEAT' : 'HEAT', 472, 232, over ? COL.red : COL.dim, 1, 0);
  drawGauge(394, 242, 78, 4, heat, over ? (blinkOn(14) ? '#ff5a5f' : '#ffb45c') : heat > 0.7 ? '#ffb45c' : '#f2e6d0');
}

function drawWaveInfo() {
  drawTextSh('WAVE ' + campaign.wave, 8, 6, COL.amber, 1, 0);
  const left = campaign.queue.length + aliveEnemies();
  drawTextSh(campaign.bossWave ? 'BOSS' : left + ' LEFT', 8, 18, campaign.bossWave ? COL.red : COL.dim, 1, 0);
  if (campaign.boss && campaign.boss.alive) {
    const b = campaign.boss;
    const f = clamp(b.hp / b.maxHp, 0, 1);
    const w = 150;
    drawGauge(Math.round(240 - w / 2), 32, w, 4, f, f > 0.5 ? '#ff8a5c' : '#ff5a5f', 'rgba(8,6,16,0.7)');
    drawTextC('CARRIER', 240, 40, COL.red, 1, 0);
  }
}

function drawWaveBanner() {
  if (game.waveBanner <= 0) return;
  const a = clamp(game.waveBanner / 0.5, 0, 1) * clamp((2.6 - game.waveBanner) / 0.25, 0, 1);
  hud.globalAlpha = a;
  if (campaign.bossWave) {
    drawTextC('WARNING', 240, 88, COL.red, 2, 1);
    drawTextC('CARRIER INBOUND', 240, 112, COL.red, 1, 1);
  } else {
    drawTextC('WAVE ' + campaign.wave, 240, 92, COL.amber, 2, 1);
  }
  hud.globalAlpha = 1;
}

function drawPlayHUD() {
  if (game.camMode === 1 && plane.alive) drawCockpitFrame();
  hud.fillStyle = 'rgba(8,6,16,0.34)';
  hud.fillRect(0, H - 14, W, 14);

  const camName = ['CHASE', 'FPV', 'CINEMA'][game.camMode];
  drawTextSh('DP ' + camName, 8, 258, COL.dim, 1, 0);

  drawWaveInfo();
  drawTextC(pad(game.score, 6), 240, 2, COL.amber, 2, 0);
  if (game.combo > 1) {
    drawTextC('X' + game.combo + ' COMBO', 240, 20, blinkOn(10) ? COL.amber : COL.bone, 1, 0);
  }
  drawTextR('BEST ' + pad(game.best, 6), 472, 6, COL.dim, 1, 0);
  drawTextR('MSL ' + weapons.ammo + '/' + game.mods.missileMax, 472, 18, weapons.ammo ? COL.bone : COL.red, 1, 0);
  drawTextR('FLR ' + weapons.flares, 472, 30, weapons.flares ? COL.bone : COL.dim, 1, 0);
  const ready = weapons.rollCd <= 0;
  hud.fillStyle = ready ? 'rgba(255,180,92,0.9)' : 'rgba(242,230,208,0.25)';
  hud.fillRect(462, 31, ready ? 10 : Math.round(10 * (1 - weapons.rollCd / game.mods.rollCd)), 2);

  drawBars();
  drawRadar(W - 40, H - 66, 27);

  if (plane.alive) {
    let wy = 46;
    const warn = (text, color) => { drawTextC(text, 240, wy, color, 1, 1); wy += 12; };
    if (plane.agl < 45 && flightForward()[1] < -0.05 && blinkOn(8)) warn('PULL UP', COL.red);
    if (plane.edge > BOUNDARY_WARN && blinkOn(4)) warn('RETURN TO PATROL AREA', COL.red);
    planeMatrix(camMat, plane.pos, plane.yaw, plane.pitch, plane.roll + plane.barrel);
    if (camMat[5] < -0.3 && plane.barrelT <= 0) warn('INVERTED', COL.amber);
  }
  if (game.debug) drawTextSh('FPS ' + Math.round(game.fps) + '  E ' + aliveEnemies() + '  Q ' + campaign.queue.length + '  CH ' + game.visibleChunks + '/64', 8, 216, COL.dim, 1, 0);

  drawReticle();
  if (game.camMode === 1 && plane.alive) drawCockpitProjector();
  drawTargetBox();
  drawOffscreenArrow();

  if (!plane.alive) {
    drawTextC(plane.dead ? 'HULL FAILURE' : 'CRASHED', 240, 108, COL.red, 2, 1);
    drawTextC(plane.dead ? 'RUN ENDING' : 'RESPAWNING  -30 HULL', 240, 140, COL.bone, 1, 1);
  }
  drawPops();
  drawWaveBanner();
}

/* ---------- upgrade cards ---------- */
function upgradeCardRects() {
  const w = 104, h = 96, gap = 12;
  const total = w * 3 + gap * 2;
  const x0 = Math.round((W - total) / 2);
  const y = 96;
  return [0, 1, 2].map(i => ({ x: x0 + i * (w + gap), y, w, h }));
}

function wrapText(str, maxChars) {
  const words = str.split(' ');
  const lines = [];
  let cur = '';
  for (const w of words) {
    if (!cur) cur = w;
    else if ((cur + ' ' + w).length <= maxChars) cur += ' ' + w;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines;
}

function drawUpgradeScreen() {
  hud.fillStyle = 'rgba(6,4,12,0.72)';
  hud.fillRect(0, 0, W, H);
  drawTextC('WAVE ' + campaign.wave + ' CLEARED', 240, 34, COL.amber, 2, 1);
  drawTextC('+' + game.waveBonus + ' BONUS', 240, 58, COL.bone, 1, 0);
  drawTextC('CHOOSE AN UPGRADE', 240, 76, COL.dim, 1, 0);

  const rects = upgradeCardRects();
  for (let i = 0; i < 3; i++) {
    const r = rects[i], u = campaign.offers[i];
    hud.fillStyle = 'rgba(14,11,24,0.94)';
    hud.fillRect(r.x, r.y, r.w, r.h);
    if (!u) {
      hud.strokeStyle = 'rgba(242,230,208,0.15)';
      hud.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
      drawTextC('---', r.x + r.w / 2, r.y + 44, COL.dim, 1, 0);
      continue;
    }
    const taken = campaign.picks[u.id] || 0;
    hud.strokeStyle = 'rgba(255,180,92,0.85)';
    hud.lineWidth = 1;
    hud.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
    hud.fillStyle = 'rgba(255,180,92,0.12)';
    hud.fillRect(r.x + 1, r.y + 1, r.w - 2, 16);

    drawTextC(String(i + 1), r.x + 10, r.y + 5, COL.amber, 1, 0);
    const titleLines = wrapText(u.name, 12);
    let ty = r.y + 6;
    for (const line of titleLines) { drawTextC(line, r.x + r.w / 2 + 4, ty, COL.amber, 1, 0); ty += 11; }

    const descLines = wrapText(u.desc, 15);
    let dy = r.y + 38;
    for (const line of descLines) { drawTextC(line, r.x + r.w / 2, dy, COL.bone, 1, 0); dy += 11; }

    if (taken > 0) drawTextC('OWNED ' + taken + '/' + u.max, r.x + r.w / 2, r.y + r.h - 14, COL.dim, 1, 0);
    else drawTextC('NEW', r.x + r.w / 2, r.y + r.h - 14, COL.dim, 1, 0);
  }
  drawTextC(touch.on ? 'TAP A CARD' : 'PRESS 1 / 2 / 3 TO INSTALL', 240, 210, blinkOn(3.2) ? COL.bone : COL.dim, 1, 0);
  drawTextC('LOADOUT PERSISTS UNTIL YOU GO DOWN', 240, 226, COL.dim, 1, 0);
}

/* ---------- pause / results ---------- */
function drawPauseScreen() {
  drawPlayHUD();
  hud.fillStyle = 'rgba(6,4,12,0.68)';
  hud.fillRect(0, 0, W, H);
  drawTextC('PAUSED', 240, 74, COL.amber, 2, 1);
  drawTextC('WAVE ' + campaign.wave + '  ·  SCORE ' + pad(game.score, 6), 240, 100, COL.bone, 1, 0);
  if (touch.on) {
    drawTextC('TAP TO RESUME', 240, 128, COL.bone, 1, 0);
  } else {
    drawTextC('P TO RESUME', 240, 128, COL.bone, 1, 0);
    drawTextC('R TO RESTART   M TO MUTE', 240, 142, COL.dim, 1, 0);
    hud.fillStyle = 'rgba(255,180,92,0.3)';
    hud.fillRect(112, 160, 256, 1);
    drawTextC('SPACE CANNON   F MISSILE   X FLARES', 240, 174, COL.bone, 1, 0);
    drawTextC('SHIFT BOOST   B BARREL ROLL   C VIEW', 240, 188, COL.bone, 1, 0);
  }
  // Current loadout summary.
  let sx = 96, sy = 208;
  drawTextC('LOADOUT', 240, 202, COL.dim, 1, 0);
  const owned = Object.keys(campaign.picks);
  if (!owned.length) drawTextC('NONE YET', 240, 216, COL.dim, 1, 0);
  for (const id of owned) {
    const u = UPGRADES.find(x => x.id === id);
    if (!u) continue;
    drawTextSh(u.name + ' ' + campaign.picks[id], sx, sy, COL.amber, 1, 0);
    sx += 84;
    if (sx > 380) { sx = 96; sy += 12; }
  }
}

function drawResultsScreen() {
  hud.fillStyle = 'rgba(6,4,12,0.62)';
  hud.fillRect(0, 0, W, H);
  drawTextC('MISSION END', 240, 28, COL.red, 2, 1);
  hud.fillStyle = 'rgba(255,180,92,0.4)';
  hud.fillRect(150, 56, 180, 1);

  // Big grade letter on the left.
  const g = game.grade;
  const gcol = g === 'S' ? '#ffd75e' : g === 'A' ? '#ffb45c' : g === 'B' ? '#5ee0d0' : g === 'C' ? '#f2e6d0' : '#ff5a5f';
  drawText('GRADE', 74, 70, COL.dim, 1, 0);
  drawText(g, 74, 82, gcol, 4, 0);

  const acc = game.missilesFired ? Math.round(game.missileHits / game.missilesFired * 100) : 0;
  const rows = [
    ['WAVE REACHED', String(campaign.cleared || campaign.wave)],
    ['SCORE', pad(game.score, 6)],
    ['BEST', pad(game.best, 6)],
    ['KILLS', String(game.kills)],
    ['MISSILE HIT', acc + '%'],
    ['BEST COMBO', 'X' + game.bestCombo]
  ];
  let ry = 68;
  for (const [k, v] of rows) {
    drawTextSh(k, 176, ry, COL.dim, 1, 0);
    drawTextR(v, 404, ry, COL.bone, 1, 0);
    ry += 15;
  }
  if (game.newBest && game.score > 0) drawTextC('NEW BEST SCORE', 240, 162, COL.amber, 1, 0);
  else drawTextC('BEST WAVE ' + campaign.bestWave, 240, 162, COL.dim, 1, 0);

  hud.fillStyle = 'rgba(255,180,92,0.25)';
  hud.fillRect(74, 176, 332, 1);
  drawTextC('S: FLAWLESS   A: EXCELLENT   B: SOLID   C: SHAKY   D: SCRAMBLED', 240, 186, COL.dim, 1, 0);
  if (blinkOn(3.4)) drawTextC(touch.on ? 'TAP TO FLY AGAIN' : 'PRESS ENTER TO FLY AGAIN', 240, 208, COL.bone, 1, 1);
  drawTextC('R RESTARTS INSTANTLY', 240, 224, COL.dim, 1, 0);
}

/* ---------- entry ---------- */
function renderHUD() {
  hud.clearRect(0, 0, W, H);
  if (game.state === 'title') drawTitleScreen();
  else if (game.state === 'play') drawPlayHUD();
  else if (game.state === 'upgrade') drawUpgradeScreen();
  else if (game.state === 'pause') drawPauseScreen();
  else if (game.state === 'results') drawResultsScreen();
}
