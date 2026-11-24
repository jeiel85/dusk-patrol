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
  const cx = W / 2, cy = game.camMode === 1 ? 96 : H / 2, margin = 22;
  const botLimit = game.camMode === 1 ? H - 92 : H - 32;
  let target = null, dist = 1e9;
  for (const e of enemies) {
    if (!e.alive) continue;
    const p = projPoint(vpM, e.pos);
    const onScreen = p && p[0] > 14 && p[0] < W - 14 && p[1] > 24 && p[1] < botLimit;
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
  const halfW = cx - margin, halfH = Math.min(cy - margin, botLimit - cy);
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
    clamp(Math.round(ey - ay * 11), 22, botLimit - 8), COL.amber, 1, 0);
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
  drawTextSh('B / 2X A,D', 262, 168, COL.amber, 1, 0); drawTextSh('ROLL', 336, 168, COL.bone, 1, 0);
  drawTextSh('C / 1-4', 262, 180, COL.amber, 1, 0); drawTextSh('CAMERA', 322, 180, COL.bone, 1, 0);
  drawTextSh('P / M / R', 262, 192, COL.amber, 1, 0); drawTextSh('PAUSE MUTE RETRY', 322, 192, COL.bone, 1, 0);
  drawTextC('CLEAR EVERY WAVE. A CARRIER GUARDS EVERY 5TH.', 240, 214, COL.dim, 1, 0);
  drawTextC('EACH WAVE CLEARED, PICK ONE UPGRADE', 240, 228, COL.dim, 1, 0);
}

/* ---------- cockpit (pixel-art canopy, HUD combiner & instrument dash) ---------- */
function drawCockpitProjector() {
  const ox = Math.round(cam.cockpitX * 0.45);
  const oy = Math.round(cam.cockpitY * 0.45);
  const gx = 160 + ox, gy = 48 + oy, gw = 160, gh = 114;
  const cx = gx + gw / 2, cy = gy + gh / 2;
  const roll = planeVisualRoll();

  // Translucent holographic HUD combiner glass pane.
  hud.fillStyle = 'rgba(130,245,195,0.08)';
  hud.fillRect(gx, gy, gw, gh);
  hud.strokeStyle = 'rgba(165,255,220,0.28)';
  hud.lineWidth = 1;
  hud.strokeRect(gx + 0.5, gy + 0.5, gw - 1, gh - 1);
  // Subtle combiner glass specular streak.
  hud.fillStyle = 'rgba(220,255,240,0.06)';
  hud.fillRect(gx + 6, gy + 4, 24, 2);
  hud.fillRect(gx + 10, gy + 8, 14, 2);

  hud.save();
  hud.beginPath();
  hud.rect(gx + 1, gy + 1, gw - 2, gh - 2);
  hud.clip();

  // Rotating/pitching artificial horizon & pitch ladder inside glass.
  hud.save();
  hud.translate(cx, cy + clamp(plane.pitch * 95, -90, 90));
  hud.rotate(-roll);
  // Horizon bar
  hud.fillStyle = 'rgba(110,255,170,0.72)';
  hud.fillRect(-52, 0, 36, 1); hud.fillRect(16, 0, 36, 1);
  hud.fillRect(-52, 0, 1, 4); hud.fillRect(51, 0, 1, 4);
  // Pitch rungs (+15, +30, -15, -30)
  for (const deg of [-30, -15, 15, 30]) {
    const py = Math.round(-deg * 1.45);
    hud.fillStyle = 'rgba(110,255,170,0.45)';
    if (deg > 0) {
      hud.fillRect(-26, py, 14, 1); hud.fillRect(12, py, 14, 1);
      hud.fillRect(-26, py, 1, 3); hud.fillRect(25, py, 1, 3);
    } else {
      for (let d = 0; d < 12; d += 4) {
        hud.fillRect(-26 + d, py, 2, 1);
        hud.fillRect(12 + d, py, 2, 1);
      }
      hud.fillRect(-26, py - 2, 1, 3); hud.fillRect(25, py - 2, 1, 3);
    }
  }
  hud.restore();

  // Left vertical speed tape & right vertical altitude tape.
  hud.fillStyle = 'rgba(110,255,170,0.58)';
  hud.fillRect(gx + 16, gy + 16, 1, gh - 32);
  hud.fillRect(gx + gw - 17, gy + 16, 1, gh - 32);
  const spdOff = Math.floor(plane.speed * 0.4) % 10;
  const altOff = Math.floor(plane.agl * 0.6) % 10;
  for (let i = 0; i < 8; i++) {
    const sy = gy + 20 + i * 10 + (spdOff % 10);
    const ay = gy + 20 + i * 10 + (altOff % 10);
    if (sy > gy + 16 && sy < gy + gh - 16) hud.fillRect(gx + 12, sy, 4, 1);
    if (ay > gy + 16 && ay < gy + gh - 16) hud.fillRect(gx + gw - 16, ay, 4, 1);
  }
  drawText(String(Math.round(plane.speed * 2.2)), gx + 4, cy - 3, '#72ffb0', 1, 0);
  drawTextR(String(Math.round(Math.max(0, plane.agl * 12))), gx + gw - 4, cy - 3, '#72ffb0', 1, 0);

  // Top heading compass tape inside combiner.
  const hdg = (((-plane.yaw * 180 / Math.PI) % 360) + 360) % 360;
  hud.fillStyle = 'rgba(110,255,170,0.45)';
  hud.fillRect(cx - 42, gy + 11, 84, 1);
  hud.fillRect(cx, gy + 12, 1, 3);
  drawTextC(pad(hdg, 3), cx, gy + 3, '#72ffb0', 1, 0);

  // Center boresight chevron.
  hud.fillStyle = 'rgba(120,255,175,0.92)';
  hud.fillRect(cx - 7, cy, 4, 1); hud.fillRect(cx + 4, cy, 4, 1);
  hud.fillRect(cx - 3, cy + 1, 2, 1); hud.fillRect(cx + 2, cy + 1, 2, 1);
  hud.fillRect(cx, cy + 2, 1, 1);
  hud.restore();
}

function drawCockpitFrame() {
  const ox = Math.round(cam.cockpitX);
  const oy = Math.round(cam.cockpitY);
  const roll = planeVisualRoll();

  // 1) Curved metallic canopy arch sweeping around the windshield.
  hud.save();
  hud.strokeStyle = '#151722';
  hud.lineWidth = 18;
  hud.beginPath();
  hud.ellipse(W / 2 + ox * 0.5, 224 + oy * 0.5, 258, 222, 0, Math.PI, TAU);
  hud.stroke();
  hud.strokeStyle = '#2d3345';
  hud.lineWidth = 10;
  hud.beginPath();
  hud.ellipse(W / 2 + ox * 0.5, 224 + oy * 0.5, 252, 217, 0, Math.PI, TAU);
  hud.stroke();
  hud.strokeStyle = '#636d86';
  hud.lineWidth = 2;
  hud.beginPath();
  hud.ellipse(W / 2 + ox * 0.5, 224 + oy * 0.5, 246, 211, 0, Math.PI, TAU);
  hud.stroke();

  // Rivets along the canopy arch.
  hud.fillStyle = '#8b95b0';
  for (let i = 1; i <= 11; i++) {
    const a = Math.PI + (i / 12) * Math.PI;
    const rx = Math.round(W / 2 + ox * 0.5 + Math.cos(a) * 252);
    const ry = Math.round(224 + oy * 0.5 + Math.sin(a) * 217);
    hud.fillRect(rx, ry, 2, 2);
  }

  // Subtle curved canopy glare streaks.
  hud.fillStyle = 'rgba(245,230,210,0.09)';
  hud.fillRect(36 + ox, 78 + oy, 3, 28);
  hud.fillRect(42 + ox, 66 + oy, 2, 18);
  hud.fillRect(438 + ox, 78 + oy, 3, 28);
  hud.restore();

  // 2) Instrument console chassis at bottom of frame.
  const dy = 186 + Math.round(oy * 0.6);
  const dx = Math.round(ox * 0.7);
  // Top glare shield lip with bevel
  hud.fillStyle = '#0d0f18';
  hud.fillRect(0, dy - 3, W, H - dy + 8);
  hud.fillStyle = '#262b3b';
  hud.fillRect(0, dy, W, H - dy + 4);
  hud.fillStyle = '#485068';
  hud.fillRect(0, dy, W, 2);
  hud.fillStyle = '#141722';
  hud.fillRect(0, dy + 2, W, 2);
  // Warm amber trim accents on glare shield (nod to classic pixel cockpit)
  hud.fillStyle = '#d67438';
  hud.fillRect(62 + dx, dy - 2, 54, 2);
  hud.fillRect(364 + dx, dy - 2, 54, 2);
  hud.fillRect(198 + dx, dy - 2, 84, 2);

  // Center raised hood housing around attitude indicator
  hud.fillStyle = '#1b1f2d';
  hud.fillRect(184 + dx, dy - 6, 112, 86);
  hud.fillStyle = '#3c445c';
  hud.fillRect(184 + dx, dy - 6, 112, 2);
  hud.fillStyle = '#10131c';
  hud.fillRect(186 + dx, dy - 4, 108, 2);

  // 3) LEFT MFD: Live tactical phosphor radar with sweep beam
  const lx = 40 + dx, ly = dy + 8, lw = 96, lh = 64;
  hud.fillStyle = '#12151f';
  hud.fillRect(lx - 3, ly - 3, lw + 6, lh + 6);
  hud.fillStyle = '#3b4259';
  hud.fillRect(lx - 2, ly - 2, lw + 4, 1);
  hud.fillStyle = '#071b14';
  hud.fillRect(lx, ly, lw, lh);
  // Subtle CRT scanlines & grid
  hud.fillStyle = 'rgba(65,210,130,0.14)';
  for (let gx = lx + 16; gx < lx + lw; gx += 16) hud.fillRect(gx, ly, 1, lh);
  for (let gy = ly + 16; gy < ly + lh; gy += 16) hud.fillRect(lx, gy, lw, 1);

  const rcx = lx + lw / 2, rcy = ly + lh / 2, rr = 26;
  hud.strokeStyle = 'rgba(72,225,140,0.34)';
  hud.lineWidth = 1;
  hud.beginPath(); hud.arc(rcx, rcy, rr, 0, TAU); hud.stroke();
  hud.beginPath(); hud.arc(rcx, rcy, rr * 0.55, 0, TAU); hud.stroke();
  // Rotating phosphor sweep line
  const sweepA = game.time * 2.4;
  hud.strokeStyle = 'rgba(110,255,170,0.75)';
  hud.beginPath();
  hud.moveTo(rcx, rcy);
  hud.lineTo(rcx + Math.cos(sweepA) * rr, rcy + Math.sin(sweepA) * rr);
  hud.stroke();
  // Hostile blips on MFD radar
  const fwd = flightForward();
  const heading = Math.atan2(fwd[0], -fwd[2]);
  const rcos = Math.cos(-heading), rsin = Math.sin(-heading);
  for (const e of enemies) {
    if (!e.alive) continue;
    const edx = e.pos[0] - plane.pos[0], edz = e.pos[2] - plane.pos[2];
    let px = rcx + ((edx * rcos - edz * rsin) / 1500) * rr;
    let py = rcy + ((edx * rsin + edz * rcos) / 1500) * rr;
    const d = Math.hypot(px - rcx, py - rcy);
    if (d > rr - 2) { px = rcx + (px - rcx) / d * (rr - 2); py = rcy + (py - rcy) / d * (rr - 2); }
    hud.fillStyle = e.type === 'carrier' ? '#ff5a5f' : '#80ffb8';
    const sz = e.type === 'carrier' ? 3 : 2;
    hud.fillRect(Math.round(px - 1), Math.round(py - 1), sz, sz);
  }
  hud.fillStyle = '#e8ffe8';
  hud.fillRect(rcx - 1, rcy - 2, 2, 4);
  hud.fillRect(rcx - 2, rcy, 4, 1);
  drawText('RDR', lx + 3, ly + 3, '#58e098', 1, 0);

  // 4) LEFT WARNING ANNUNCIATOR LEDs (x: 144..178)
  const wx = 144 + dx;
  const leds = [
    ['LCK', !!game.lock, '#ff4c52'],
    ['LOW', plane.agl < 50 && blinkOn(10), '#ff4c52'],
    ['OVR', weapons.overheated || weapons.heat > 75, weapons.overheated ? '#ff4c52' : '#ffb45c'],
    ['SHD', game.shield >= game.mods.shieldMax * 0.9, '#5fa8ff']
  ];
  for (let i = 0; i < leds.length; i++) {
    const [lbl, on, col] = leds[i];
    const by = dy + 10 + i * 15;
    hud.fillStyle = '#11131c';
    hud.fillRect(wx, by, 32, 11);
    hud.fillStyle = on ? col : '#262b3a';
    hud.fillRect(wx + 2, by + 2, 5, 7);
    drawText(lbl, wx + 10, by + 2, on ? col : '#52586e', 1, 0);
  }

  // 5) CENTER SPHERICAL ATTITUDE INDICATOR (Artificial Horizon Ball)
  const acx = 240 + dx, acy = dy + 36, ar = 31;
  // Metallic outer ring + corner rivets
  hud.fillStyle = '#10121b';
  hud.beginPath(); hud.arc(acx, acy, ar + 5, 0, TAU); hud.fill();
  hud.strokeStyle = '#505872';
  hud.lineWidth = 2;
  hud.beginPath(); hud.arc(acx, acy, ar + 3, 0, TAU); hud.stroke();
  hud.fillStyle = '#8b95b0';
  for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    hud.fillRect(acx + sx * (ar + 1) - 1, acy + sy * (ar + 1) - 1, 2, 2);
  }
  // Clipped rotating pitch/roll horizon sphere
  hud.save();
  hud.beginPath(); hud.arc(acx, acy, ar, 0, TAU); hud.clip();
  hud.translate(acx, acy);
  hud.rotate(-roll);
  const pShift = clamp(plane.pitch * 36, -ar, ar);
  // Sky hemisphere (warm dusk sky blue -> peach horizon)
  hud.fillStyle = '#2d6ea8';
  hud.fillRect(-ar - 10, -ar - 40 + pShift, (ar + 10) * 2, ar + 40);
  hud.fillStyle = '#6da4c8';
  hud.fillRect(-ar - 10, -10 + pShift, (ar + 10) * 2, 10);
  // Ground hemisphere (warm dark umber earth)
  hud.fillStyle = '#7c4c28';
  hud.fillRect(-ar - 10, pShift, (ar + 10) * 2, ar + 40);
  hud.fillStyle = '#4f301b';
  hud.fillRect(-ar - 10, 14 + pShift, (ar + 10) * 2, ar + 30);
  // Crisp white horizon & pitch ticks
  hud.fillStyle = '#f5ecd8';
  hud.fillRect(-ar - 6, Math.round(pShift), (ar + 6) * 2, 1);
  for (const off of [-16, -8, 8, 16]) {
    const w = Math.abs(off) === 8 ? 10 : 16;
    hud.fillRect(-w / 2, Math.round(pShift + off), w, 1);
  }
  hud.restore();
  // Fixed orange miniature wings reference in center of ball (with crisp dark outline)
  hud.fillStyle = '#141722';
  hud.fillRect(acx - 17, acy - 2, 12, 4);
  hud.fillRect(acx + 5, acy - 2, 12, 4);
  hud.fillRect(acx - 3, acy - 2, 6, 4);
  hud.fillRect(acx - 2, acy + 1, 4, 4);
  hud.fillStyle = '#ff9d3b';
  hud.fillRect(acx - 16, acy - 1, 10, 2);
  hud.fillRect(acx + 6, acy - 1, 10, 2);
  hud.fillRect(acx - 2, acy - 1, 4, 2);
  hud.fillRect(acx - 1, acy + 1, 2, 3);
  // Top roll index triangle
  hud.fillStyle = '#ffd166';
  hud.fillRect(acx - 1, acy - ar + 1, 3, 2);
  hud.fillRect(acx, acy - ar + 3, 1, 2);

  // 6) RIGHT WEAPONS & COUNTERMEASURE STATUS (x: 304..336)
  const rx = 304 + dx;
  hud.fillStyle = '#11131c';
  hud.fillRect(rx, dy + 10, 32, 60);
  drawText('MSL', rx + 3, dy + 13, '#ffb45c', 1, 0);
  const mMax = Math.min(8, game.mods.missileMax);
  for (let i = 0; i < mMax; i++) {
    hud.fillStyle = i < weapons.ammo ? '#ffb45c' : '#262b3a';
    hud.fillRect(rx + 3 + (i % 4) * 7, dy + 23 + Math.floor(i / 4) * 6, 5, 4);
  }
  drawText('FLR', rx + 3, dy + 38, '#5ee0d0', 1, 0);
  for (let i = 0; i < Math.min(5, game.mods.flareMax); i++) {
    hud.fillStyle = i < weapons.flares ? '#5ee0d0' : '#262b3a';
    hud.fillRect(rx + 3 + i * 5, dy + 48, 4, 4);
  }
  drawText('ROL', rx + 3, dy + 57, weapons.rollCd <= 0 ? '#72ffb0' : '#52586e', 1, 0);
  hud.fillStyle = weapons.rollCd <= 0 ? '#72ffb0' : '#262b3a';
  hud.fillRect(rx + 23, dy + 58, 6, 5);

  // 7) RIGHT MFD: Aircraft schematic, digital ALT/SPD & vertical Thruster/Hull/Heat bars
  const mx = 344 + dx, my = dy + 8, mw = 96, mh = 64;
  hud.fillStyle = '#12151f';
  hud.fillRect(mx - 3, my - 3, mw + 6, mh + 6);
  hud.fillStyle = '#3b4259';
  hud.fillRect(mx - 2, my - 2, mw + 4, 1);
  hud.fillStyle = '#09151c';
  hud.fillRect(mx, my, mw, mh);

  // Digital ALT / SPD telemetry
  drawText(pad(Math.max(0, plane.agl * 12), 5), mx + 4, my + 4, '#ffb45c', 1, 0);
  drawText('ALT', mx + 4, my + 13, '#5c7c8a', 1, 0);
  drawText(pad(plane.speed * 2.2, 3), mx + 4, my + 44, '#72ffb0', 1, 0);
  drawText('KTS', mx + 4, my + 53, '#5c7c8a', 1, 0);

  // Pixel-art fighter schematic colored by hull integrity + shield outline + thruster flame
  const sx = mx + 46, sy = my + 32;
  const hFrac = clamp(game.hull / game.mods.hullMax, 0, 1);
  const sFrac = clamp(game.shield / game.mods.shieldMax, 0, 1);
  const jetCol = hFrac > 0.55 ? '#55e898' : hFrac > 0.28 ? '#ffb45c' : '#ff5a5f';
  if (sFrac > 0.05) {
    hud.strokeStyle = 'rgba(95,168,255,' + (0.25 + sFrac * 0.55).toFixed(2) + ')';
    hud.lineWidth = 1;
    hud.beginPath(); hud.arc(sx, sy, 18, 0, TAU); hud.stroke();
  }
  hud.fillStyle = jetCol;
  hud.fillRect(sx - 2, sy - 14, 4, 24);      // fuselage
  hud.fillRect(sx - 1, sy - 17, 2, 4);       // nose
  hud.fillRect(sx - 13, sy - 2, 26, 5);      // main wings
  hud.fillRect(sx - 9, sy - 5, 18, 3);       // swept leading edge
  hud.fillRect(sx - 7, sy + 7, 14, 3);       // tail stabilizers
  // Animated twin thruster flame pixels on schematic
  const fl = 3 + Math.round(plane.boost * 5 + (Math.sin(game.time * 32) > 0 ? 1 : 0));
  hud.fillStyle = plane.boost > 0.4 ? '#ffe478' : '#ff7b36';
  hud.fillRect(sx - 3, sy + 11, 2, fl);
  hud.fillRect(sx + 1, sy + 11, 2, fl);

  // Twin vertical segmented bar gauges: Boost/Thrust (left) & Heat (right)
  const drawSegBar = (bx, by, frac, hotCol, normCol) => {
    const segs = 10;
    for (let i = 0; i < segs; i++) {
      const f = (i + 1) / segs;
      const lit = frac >= f - 0.05;
      hud.fillStyle = lit ? (f > 0.75 ? hotCol : normCol) : '#182830';
      hud.fillRect(bx, by + (segs - 1 - i) * 5, 7, 3);
    }
  };
  drawSegBar(mx + 74, my + 8, clamp(0.35 + plane.boost * 0.65, 0, 1), '#ffe066', '#55e898');
  drawSegBar(mx + 85, my + 8, weapons.heat / 100, '#ff5a5f', '#ffb45c');

  // 8) Side console switches & throttle details
  hud.fillStyle = '#151824';
  hud.fillRect(4 + dx, dy + 12, 28, 56);
  hud.fillRect(448 + dx, dy + 12, 28, 56);
  for (let i = 0; i < 4; i++) {
    hud.fillStyle = i === 0 ? '#ff6a3c' : '#55e898';
    hud.fillRect(10 + dx, dy + 18 + i * 11, 6, 4);
    hud.fillStyle = '#485068';
    hud.fillRect(20 + dx, dy + 18 + i * 11, 8, 4);
    hud.fillStyle = i < 2 ? '#ffb45c' : '#5fa8ff';
    hud.fillRect(454 + dx, dy + 18 + i * 11, 6, 4);
    hud.fillStyle = '#485068';
    hud.fillRect(464 + dx, dy + 18 + i * 11, 8, 4);
  }
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
  const fpv = game.camMode === 1 && plane.alive;
  if (fpv) {
    drawCockpitProjector();
    drawCockpitFrame();
  } else {
    hud.fillStyle = 'rgba(8,6,16,0.34)';
    hud.fillRect(0, H - 14, W, 14);
  }

  const camName = ['CHASE', 'FPV', 'TOP', 'CINEMA'][game.camMode];
  if (!fpv) drawTextSh('DP ' + camName, 8, 258, COL.dim, 1, 0);

  drawWaveInfo();
  drawTextC(pad(game.score, 6), 240, 2, COL.amber, 2, 0);
  if (game.combo > 1) {
    drawTextC('X' + game.combo + ' COMBO', 240, 20, blinkOn(10) ? COL.amber : COL.bone, 1, 0);
  }
  drawTextR('BEST ' + pad(game.best, 6), 472, 6, COL.dim, 1, 0);
  if (!fpv) {
    drawTextR('MSL ' + weapons.ammo + '/' + game.mods.missileMax, 472, 18, weapons.ammo ? COL.bone : COL.red, 1, 0);
    drawTextR('FLR ' + weapons.flares, 472, 30, weapons.flares ? COL.bone : COL.dim, 1, 0);
    const ready = weapons.rollCd <= 0;
    drawTextR('ROLL', 446, 42, ready ? COL.amber : COL.dim, 1, 0);
    drawGauge(450, 44, 22, 3, ready ? 1 : clamp(1 - weapons.rollCd / game.mods.rollCd, 0, 1), ready ? '#ffb45c' : '#8f84a2');

    drawBars();
    drawRadar(W - 40, H - 66, 27);
  }

  if (plane.alive) {
    let wy = 46;
    const warn = (text, color) => { drawTextC(text, 240, wy, color, 1, 1); wy += 12; };
    if (plane.agl < 45 && flightForward()[1] < -0.05 && blinkOn(8)) warn('PULL UP', COL.red);
    if (plane.edge > BOUNDARY_WARN && blinkOn(4)) warn('RETURN TO PATROL AREA', COL.red);
    planeMatrix(camMat, plane.pos, plane.yaw, plane.pitch, planeVisualRoll());
    if (camMat[5] < -0.3 && plane.barrelT <= 0) warn('INVERTED', COL.amber);
  }
  if (game.debug) drawTextSh('FPS ' + Math.round(game.fps) + '  E ' + aliveEnemies() + '  Q ' + campaign.queue.length + '  CH ' + game.visibleChunks + '/64', 8, 216, COL.dim, 1, 0);

  if (!fpv && game.camMode !== 2) drawReticle();
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
