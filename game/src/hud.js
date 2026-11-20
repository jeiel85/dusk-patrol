/* DUSK PATROL — hud.js
   The 2D overlay: title, flight HUD, warnings, lock box, pause and results.
   Loaded as a classic script in order (see index.html); globals are shared. */
'use strict';

function pad(n, w) { return String(Math.max(0, Math.floor(n))).padStart(w, '0'); }
function fmtTime(t) { const s = Math.ceil(Math.max(0, t)); return pad(Math.floor(s / 60), 2) + ':' + pad(s % 60, 2); }
function blinkOn(rate) { return Math.sin(game.time * rate) > -0.2; }

function drawReticle() {
  hud.fillStyle = 'rgba(242,230,208,0.82)';
  hud.fillRect(235, 134, 3, 1); hud.fillRect(242, 134, 3, 1);
  hud.fillRect(239, 130, 1, 3); hud.fillRect(239, 137, 1, 3);
  hud.fillStyle = 'rgba(255,180,92,0.9)';
  hud.fillRect(239, 134, 2, 1);
}

function bestTarget() {
  const fwd = vnorm(vsub(cam.look, cam.pos));
  let best = null, bestDot = 0.55, bestDist = 1e9;
  for (const d of drones) {
    if (!d.alive) continue;
    const to = vsub(d.pos, cam.pos), dist = vlen(to);
    const dd = vdot(fwd, vmul(to, 1 / Math.max(dist, 0.001)));
    if (dd > bestDot && dist < bestDist) { bestDot = dd; best = d; bestDist = dist; }
  }
  return best ? { d: best, dist: bestDist } : null;
}

// Missile lock (red, "LOCK") wins over the nearest drone in view (amber).
function drawTargetBox() {
  const lock = game.lock && game.lock.alive ? game.lock : null;
  const t = lock ? { d: lock, dist: vdist(lock.pos, plane.pos) } : bestTarget();
  if (!t) return;
  const p = projPoint(vpM, t.d.pos);
  if (!p || p[0] < 8 || p[0] > W - 8 || p[1] < 18 || p[1] > H - 22) return;
  const x = Math.round(p[0]), y = Math.round(p[1]), s = lock ? 6 : 7;
  hud.fillStyle = lock ? 'rgba(255,90,95,0.95)' : 'rgba(255,180,92,0.95)';
  hud.fillRect(x - s, y - s, 4, 1); hud.fillRect(x - s, y - s, 1, 4);
  hud.fillRect(x + s - 3, y - s, 4, 1); hud.fillRect(x + s, y - s, 1, 4);
  hud.fillRect(x - s, y + s, 4, 1); hud.fillRect(x - s, y + s - 3, 1, 4);
  hud.fillRect(x + s - 3, y + s, 4, 1); hud.fillRect(x + s, y + s - 3, 1, 4);
  drawTextC((lock ? 'LOCK ' : 'DRONE ') + (t.dist / 1000).toFixed(1) + 'KM', x, y + 11, lock ? COL.red : COL.amber, 1, 0);
}

function drawOffscreenArrow() {
  if (!plane.alive) return;
  const cx = W / 2, cy = H / 2, margin = 22;
  let target = null, dist = 1e9;
  for (const d of drones) {
    if (!d.alive) continue;
    const p = projPoint(vpM, d.pos);
    const onScreen = p && p[0] > 14 && p[0] < W - 14 && p[1] > 24 && p[1] < H - 32;
    if (onScreen) continue;
    const dd = vlen(vsub(d.pos, plane.pos));
    if (dd < dist) { target = d; dist = dd; }
  }
  if (!target) return;
  const px = target.pos[0], py = target.pos[1], pz = target.pos[2];
  const vx = viewM[0] * px + viewM[4] * py + viewM[8] * pz + viewM[12];
  const vy = viewM[1] * px + viewM[5] * py + viewM[9] * pz + viewM[13];
  const vz = viewM[2] * px + viewM[6] * py + viewM[10] * pz + viewM[14];
  let ax = vx * projM[0], ay = -vy * projM[5];
  if (vz > 0) { ax = -ax; ay = -ay; } // behind the camera: point the way to turn
  let m = Math.hypot(ax, ay);
  if (m < 1e-3) { ax = 0; ay = 1; m = 1; } // exactly behind: point down
  ax /= m; ay /= m;
  const halfW = cx - margin, halfH = cy - margin;
  const t = Math.min(halfW / Math.max(Math.abs(ax), 1e-4), halfH / Math.max(Math.abs(ay), 1e-4));
  const ex = Math.round(cx + ax * t), ey = Math.round(cy + ay * t);
  hud.save();
  hud.translate(ex, ey);
  hud.rotate(Math.atan2(ay, ax));
  hud.fillStyle = 'rgba(255,180,92,0.95)';
  hud.beginPath();
  hud.moveTo(6, 0); hud.lineTo(-4, -5); hud.lineTo(-1, 0); hud.lineTo(-4, 5);
  hud.closePath(); hud.fill();
  hud.restore();
  drawTextC((dist / 1000).toFixed(1) + 'KM',
    clamp(Math.round(ex - ax * 12), 26, W - 26),
    clamp(Math.round(ey - ay * 11), 22, H - 26), COL.amber, 1, 0);
}

function drawPops() {
  for (const p of pops) {
    const sp = projPoint(vpM, p.p);
    if (!sp) continue;
    hud.globalAlpha = clamp(p.t, 0, 1);
    drawTextC(p.text, sp[0], sp[1] - 10, COL.amber, 1, 0);
    hud.globalAlpha = 1;
  }
}

function drawTitleScreen() {
  hud.fillStyle = 'rgba(6,4,12,0.30)';
  hud.fillRect(0, 0, W, H);
  const tw = textWidth('DUSK PATROL', 3, 2);
  const tx = Math.round((W - tw) / 2);
  drawText('DUSK PATROL', tx + 2, 53, COL.dark, 3, 2);
  drawText('DUSK PATROL', tx, 50, COL.amber, 3, 2);
  hud.fillStyle = 'rgba(255,180,92,0.5)';
  hud.fillRect(160, 104, 160, 1);
  drawTextC('A PIXEL PATROL OVER THE COAST', 240, 112, COL.bone, 1, 0);
  drawTextC('BEST  ' + pad(game.best, 6), 240, 126, COL.amber, 1, 0);
  if (blinkOn(3.4)) drawTextC(touch.on ? 'TAP TO FLY' : 'PRESS ENTER TO FLY', 240, 154, COL.bone, 1, 1);

  hud.fillStyle = 'rgba(8,6,16,0.42)';
  hud.fillRect(96, 196, 288, 52);
  hud.fillStyle = 'rgba(255,180,92,0.25)';
  hud.fillRect(96, 196, 288, 1);
  if (touch.on) {
    drawTextSh('LEFT STICK', 108, 204, COL.amber, 1, 0); drawTextSh('FLY / LOOP', 210, 204, COL.bone, 1, 0);
    drawTextSh('BOOST', 108, 216, COL.amber, 1, 0); drawTextSh('AFTERBURNER', 210, 216, COL.bone, 1, 0);
    drawTextSh('FIRE', 108, 228, COL.amber, 1, 0); drawTextSh('MISSILE (HOLD)', 210, 228, COL.bone, 1, 0);
    drawTextSh('ROLL', 268, 204, COL.amber, 1, 0); drawTextSh('BARREL', 306, 204, COL.bone, 1, 0);
    drawTextSh('CAM', 268, 216, COL.amber, 1, 0); drawTextSh('VIEW', 306, 216, COL.bone, 1, 0);
    drawTextSh('II', 268, 228, COL.amber, 1, 0); drawTextSh('PAUSE', 306, 228, COL.bone, 1, 0);
    drawTextC(innerHeight > innerWidth ? 'TURN YOUR PHONE SIDEWAYS FOR A BIGGER VIEW' : 'SHOOT THE TRAINING DRONES OVER THE BAY', 240, 254, COL.dim, 1, 0);
    return;
  }
  drawTextSh('WASD / ARROWS', 108, 204, COL.amber, 1, 0); drawTextSh('FLY / LOOP', 210, 204, COL.bone, 1, 0);
  drawTextSh('SHIFT / SPC', 108, 216, COL.amber, 1, 0); drawTextSh('BOOST', 210, 216, COL.bone, 1, 0);
  drawTextSh('F', 108, 228, COL.amber, 1, 0); drawTextSh('MISSILE', 210, 228, COL.bone, 1, 0);
  drawTextSh('C', 268, 204, COL.amber, 1, 0); drawTextSh('CAMERA', 288, 204, COL.bone, 1, 0);
  drawTextSh('B', 268, 216, COL.amber, 1, 0); drawTextSh('BARREL ROLL', 288, 216, COL.bone, 1, 0);
  drawTextSh('P / M', 268, 228, COL.amber, 1, 0); drawTextSh('PAUSE / MUTE', 306, 228, COL.bone, 1, 0);
  drawTextC('1/2/3 VIEW  /  SHOOT THE TRAINING DRONES OVER THE BAY', 240, 254, COL.dim, 1, 0);
}

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

function drawPlayHUD() {
  if (game.camMode === 1 && plane.alive) drawCockpitFrame();
  hud.fillStyle = 'rgba(8,6,16,0.34)';
  hud.fillRect(0, H - 14, W, 14);

  const camName = ['CHASE', 'FPV', 'CINEMA'][game.camMode];
  drawTextSh('DP ' + camName + ' ' + (game.camMode + 1) + '/3', 8, 6, COL.dim, 1, 0);
  const hurry = game.timer <= 10;
  drawTextC(fmtTime(game.timer), 240, 4, hurry && blinkOn(6) ? COL.red : COL.amber, 2, 0);
  drawTextR('SCORE ' + pad(game.score, 6), 472, 6, COL.bone, 1, 0);

  drawTextSh('SPD ' + pad(plane.speed * 1.94, 3), 8, 258, COL.amber, 1, 0);
  drawTextSh('ALT ' + pad(plane.pos[1], 4), 86, 258, COL.bone, 1, 0);
  drawTextR('MSL ' + mslAmmo + '/8', 472, 258, mslAmmo ? COL.bone : COL.red, 1, 0);

  if (plane.alive) {
    // Warnings stack under the timer, most urgent first.
    let wy = 28;
    const warn = (text, color) => { drawTextC(text, 240, wy, color, 1, 1); wy += 12; };
    if (plane.agl < 45 && flightForward()[1] < -0.05 && blinkOn(8)) warn('PULL UP', COL.red);
    if (plane.edge > BOUNDARY_WARN && blinkOn(4)) warn('RETURN TO PATROL AREA', COL.red);
    // Upside down = the jet's up axis points at the ground (pitch or roll past 90°).
    planeMatrix(camMat, plane.pos, plane.yaw, plane.pitch, plane.roll + plane.barrel);
    if (camMat[5] < -0.3 && plane.barrelT <= 0) warn('INVERTED', COL.amber);
  }
  if (game.debug) drawTextSh('FPS ' + Math.round(game.fps) + '  P ' + Math.round(plane.pitch / DEG) + '  R ' + Math.round(plane.roll / DEG) + '  CH ' + game.visibleChunks + '/64', 8, 220, COL.dim, 1, 0);

  drawReticle();
  if (game.camMode === 1 && plane.alive) drawCockpitProjector();
  drawTargetBox();
  drawOffscreenArrow();

  if (!plane.alive) {
    drawTextC('CRASHED', 240, 108, COL.red, 2, 1);
    drawTextC('RESPAWNING', 240, 140, COL.bone, 1, 1);
  }
  drawPops();
}

function renderHUD() {
  hud.clearRect(0, 0, W, H);
  if (game.state === 'title') drawTitleScreen();
  else if (game.state === 'play') drawPlayHUD();
  else if (game.state === 'pause') {
    drawPlayHUD();
    hud.fillStyle = 'rgba(6,4,12,0.62)';
    hud.fillRect(0, 0, W, H);
    drawTextC('PAUSED', 240, 78, COL.amber, 2, 1);
    if (touch.on) {
      drawTextC('TAP TO RESUME', 240, 118, COL.bone, 1, 0);
    } else {
      drawTextC('P TO RESUME', 240, 118, COL.bone, 1, 0);
      drawTextC('R TO RESTART   M TO MUTE', 240, 134, COL.dim, 1, 0);
      hud.fillStyle = 'rgba(255,180,92,0.3)';
      hud.fillRect(112, 154, 256, 1);
      drawTextC('WASD FLY   SHIFT BOOST   F MISSILE', 240, 170, COL.bone, 1, 0);
      drawTextC('C / 1-3 VIEW   B BARREL ROLL', 240, 186, COL.bone, 1, 0);
    }
  } else if (game.state === 'results') {
    hud.fillStyle = 'rgba(6,4,12,0.55)';
    hud.fillRect(0, 0, W, H);
    drawTextC('PATROL COMPLETE', 240, 62, COL.amber, 2, 1);
    hud.fillStyle = 'rgba(255,180,92,0.4)';
    hud.fillRect(150, 92, 180, 1);
    drawTextC('SCORE  ' + pad(game.score, 6), 240, 104, COL.bone, 1, 0);
    drawTextC('BEST   ' + pad(game.best, 6), 240, 118, COL.amber, 1, 0);
    const acc = game.shots ? Math.round(game.kills / game.shots * 100) : 0;
    drawTextC('DRONES DOWN  ' + game.kills + '   HIT RATE  ' + acc + '%', 240, 134, COL.dim, 1, 0);
    if (game.newBest && game.score > 0) drawTextC('NEW BEST', 240, 148, COL.amber, 1, 0);
    if (blinkOn(3.4)) drawTextC(touch.on ? 'TAP TO FLY AGAIN' : 'PRESS ENTER TO FLY AGAIN', 240, 164, COL.bone, 1, 1);
  }
}
