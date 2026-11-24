/* DUSK PATROL — render.js
   Draws one frame of the 3D scene into the low-res framebuffer and runs
   the dither/grade post pass to the screen.
   Loaded as a classic script in order (see index.html); globals are shared. */
'use strict';

const IDENT = m4id(m4());
const eM = m4(), jetM = m4(), cloudM = m4();
const CORNERS = [[-1, -1], [1, -1], [1, 1], [-1, -1], [1, 1], [-1, 1]];
const camRight = [1, 0, 0], camUp = [0, 1, 0];

function drawSky() {
  gl.useProgram(skyProg);
  const fwd = vnorm(vsub(cam.look, cam.pos));
  const right = vnorm(vcross(fwd, cam.up));
  const up = vcross(right, fwd);
  const tanFov = 1 / projM[5];
  gl.uniform3fv(U(skyProg, 'uRight'), right);
  gl.uniform3fv(U(skyProg, 'uUp'), up);
  gl.uniform3fv(U(skyProg, 'uFwd'), fwd);
  gl.uniform3fv(U(skyProg, 'uSun'), SUN_DIR);
  gl.uniform1f(U(skyProg, 'uTanFov'), tanFov);
  gl.uniform1f(U(skyProg, 'uAspect'), W / H);
  gl.uniform1f(U(skyProg, 'uTime'), game.time);
  gl.bindVertexArray(fsVao);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

const SOLID_SUN = [1.0, 0.78, 0.50], SOLID_AMB = [0.44, 0.42, 0.64];
const JET_SUN = [1.0, 0.84, 0.60], JET_AMB = [0.60, 0.58, 0.76];
const shadowM = m4();
function beginSolid() {
  gl.useProgram(solidProg);
  gl.uniformMatrix4fv(U(solidProg, 'uVP'), false, vpM);
  gl.uniform3fv(U(solidProg, 'uSun'), SUN_DIR);
  gl.uniform3fv(U(solidProg, 'uSunColor'), SOLID_SUN);
  gl.uniform3fv(U(solidProg, 'uAmbient'), SOLID_AMB);
  gl.uniform3fv(U(solidProg, 'uFogColor'), FOG_COL);
  gl.uniform1f(U(solidProg, 'uFogDensity'), FOG_DENS);
  gl.uniform3fv(U(solidProg, 'uCam'), cam.pos);
  gl.uniform1f(U(solidProg, 'uSpec'), 0.0);
  gl.uniform1f(U(solidProg, 'uContour'), 0.0);
}

function drawTerrain() {
  beginSolid();
  gl.uniform1f(U(solidProg, 'uContour'), 1.0);
  gl.uniformMatrix4fv(U(solidProg, 'uModel'), false, IDENT);
  updateFrustum(vpM);
  game.visibleChunks = 0;
  gl.bindVertexArray(terrainVao);
  for (const ch of terrainChunks) {
    if (!boxInFrustum(ch.min, ch.max)) continue;
    gl.drawArrays(gl.TRIANGLES, ch.first, ch.count);
    game.visibleChunks++;
  }
  gl.bindVertexArray(null);
}

function drawWater() {
  gl.useProgram(waterProg);
  gl.uniformMatrix4fv(U(waterProg, 'uVP'), false, vpM);
  gl.uniform3fv(U(waterProg, 'uCam'), cam.pos);
  gl.uniform3fv(U(waterProg, 'uSun'), SUN_DIR);
  gl.uniform3fv(U(waterProg, 'uFogColor'), FOG_COL);
  gl.uniform1f(U(waterProg, 'uTime'), game.time);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, heightTex);
  gl.uniform1i(U(waterProg, 'uHeight'), 0);
  gl.bindVertexArray(waterVao);
  gl.drawArrays(gl.TRIANGLES, 0, 6);
}

function drawCity() {
  gl.useProgram(cityProg);
  gl.uniformMatrix4fv(U(cityProg, 'uVP'), false, vpM);
  gl.uniform3fv(U(cityProg, 'uSun'), SUN_DIR);
  gl.uniform3fv(U(cityProg, 'uSunColor'), SOLID_SUN);
  gl.uniform3fv(U(cityProg, 'uAmbient'), SOLID_AMB);
  gl.uniform3fv(U(cityProg, 'uFogColor'), FOG_COL);
  gl.uniform1f(U(cityProg, 'uFogDensity'), FOG_DENS);
  gl.uniform3fv(U(cityProg, 'uCam'), cam.pos);
  gl.uniform1f(U(cityProg, 'uTime'), game.time);
  gl.bindVertexArray(cityVao);
  gl.drawArraysInstanced(gl.TRIANGLES, 0, 36, buildings.length);
}

function drawShadows() {
  gl.useProgram(shadowProg);
  gl.uniformMatrix4fv(U(shadowProg, 'uVP'), false, vpM);
  gl.uniform1i(U(shadowProg, 'uTex'), 0);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.depthMask(false);

  // Projected cloud shadows on sea / coastal plains.
  gl.activeTexture(gl.TEXTURE0);
  gl.bindVertexArray(cloudShadowVao);
  gl.uniform1f(U(shadowProg, 'uUseTex'), 1.0);
  for (const c of cloudDefs) {
    const cx = c.x + Math.sin(game.time * 0.01 + c.drift) * 25;
    const off = Math.min(c.y * 0.65, 220);
    const sx = cx - SUN_DIR[0] * off;
    const sz = c.z - SUN_DIR[2] * off;
    const gh = terrainHeight(sx, sz);
    if (gh > 42) continue;
    const sy = Math.max(gh, 0) + 0.55;
    const rad = c.sx * 0.92;
    if (!sphereInFrustum(sx, sy, sz, rad)) continue;
    const dist = Math.hypot(sx - cam.pos[0], sy - cam.pos[1], sz - cam.pos[2]);
    if (dist > 2800) continue;
    const alpha = 0.28 * (1 - smoothstep(1400, 2800, dist));
    if (alpha < 0.02) continue;
    m4id(shadowM);
    shadowM[0] = rad; shadowM[10] = c.sy * 1.45;
    shadowM[12] = sx; shadowM[13] = sy; shadowM[14] = sz;
    gl.uniformMatrix4fv(U(shadowProg, 'uModel'), false, shadowM);
    gl.uniform1f(U(shadowProg, 'uAlpha'), alpha);
    gl.bindTexture(gl.TEXTURE_2D, cloudTexes[c.tex]);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  // Player jet shadow projected cleanly onto the water or ground below.
  if (plane.alive && plane.agl < 420) {
    const shift = Math.min(plane.agl * 0.45, 95);
    const jx = plane.pos[0] - SUN_DIR[0] * shift;
    const jz = plane.pos[2] - SUN_DIR[2] * shift;
    const jy = Math.max(terrainHeight(jx, jz), 0) + 0.78;
    const sc = 1.05 + clamp(plane.agl / 300, 0, 0.85);
    const bankScale = Math.max(0.28, Math.abs(Math.cos(planeVisualRoll())));
    const alpha = clamp(0.46 * (1 - plane.agl / 420), 0.06, 0.46);
    m4rotY(shadowM, plane.yaw);
    shadowM[0] *= sc * bankScale; shadowM[2] *= sc * bankScale;
    shadowM[8] *= sc; shadowM[10] *= sc;
    shadowM[12] = jx; shadowM[13] = jy; shadowM[14] = jz;
    gl.uniformMatrix4fv(U(shadowProg, 'uModel'), false, shadowM);
    gl.uniform1f(U(shadowProg, 'uUseTex'), 0.0);
    gl.uniform1f(U(shadowProg, 'uAlpha'), alpha);
    gl.bindVertexArray(jetShadowVao);
    gl.drawArrays(gl.TRIANGLES, 0, jetShadowCount);
  }

  gl.depthMask(true);
  gl.disable(gl.BLEND);
}

function drawJet() {
  const m = planeMatrix(jetM, plane.pos, plane.yaw, plane.pitch, planeVisualRoll());
  beginSolid();
  // Blink the hull while respawn invulnerability is running.
  const inv = plane.invuln > 0 && (Math.sin(game.time * 26) > 0);
  gl.uniform3fv(U(solidProg, 'uAmbient'), inv ? [0.75, 0.95, 1.0] : JET_AMB);
  gl.uniform3fv(U(solidProg, 'uSunColor'), JET_SUN);
  gl.uniform1f(U(solidProg, 'uSpec'), 0.65);
  gl.uniformMatrix4fv(U(solidProg, 'uModel'), false, m);
  gl.bindVertexArray(jetMesh.vao);
  gl.drawArrays(gl.TRIANGLES, 0, jetMesh.count);

  gl.useProgram(burnProg);
  gl.uniformMatrix4fv(U(burnProg, 'uVP'), false, vpM);
  gl.uniformMatrix4fv(U(burnProg, 'uModel'), false, m);
  gl.uniform1f(U(burnProg, 'uLen'), 2.5 + plane.boost * 4.5 + plane.gLoad * 0.6);
  gl.uniform1f(U(burnProg, 'uZ0'), 4.9);
  gl.uniform1f(U(burnProg, 'uIntensity'), 0.56 + plane.boost * 0.85);
  gl.uniform1f(U(burnProg, 'uTime'), game.time);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
  gl.depthMask(false);
  gl.bindVertexArray(burnVao);
  gl.drawArrays(gl.TRIANGLES, 0, burnCount);
  gl.depthMask(true);
  gl.disable(gl.BLEND);
}

function drawTrails() {
  let q = 0;
  for (let s = 0; s < 2; s++) {
    const tr = wingTrails[s];
    if (tr.length < 2) continue;
    for (let i = 0; i < tr.length - 1; i++) {
      if (q >= TRAIL_QUAD_MAX) break;
      const a = tr[i], b = tr[i + 1];
      const ta = clamp(1 - a.age / 1.35, 0, 1);
      const tb = clamp(1 - b.age / 1.35, 0, 1);
      if (ta <= 0.01 && tb <= 0.01) continue;
      // Camera-facing ribbon cross axis so trails stay crisp in Chase, Overhead & Cinema.
      const tx = b.p[0] - a.p[0], ty = b.p[1] - a.p[1], tz = b.p[2] - a.p[2];
      const vx = cam.pos[0] - a.p[0], vy = cam.pos[1] - a.p[1], vz = cam.pos[2] - a.p[2];
      const distA = Math.hypot(vx, vy, vz);
      const distB = Math.hypot(cam.pos[0] - b.p[0], cam.pos[1] - b.p[1], cam.pos[2] - b.p[2]);
      const nearA = smoothstep(5.5, 13.0, distA);
      const nearB = smoothstep(5.5, 13.0, distB);
      if (nearA <= 0.01 && nearB <= 0.01) continue;
      let sx = ty * vz - tz * vy, sy = tz * vx - tx * vz, sz = tx * vy - ty * vx;
      const sl = Math.hypot(sx, sy, sz) || 1;
      sx /= sl; sy /= sl; sz /= sl;
      // Scale ribbon width gently when far (Overhead view) while keeping close chase trails razor-crisp.
      const farScale = clamp(distA / 48, 0.75, 2.4);
      const wa = a.w * farScale * (0.35 + 0.65 * ta), wb = b.w * farScale * (0.35 + 0.65 * tb);
      const aa = a.a * ta * ta * nearA, ab = b.a * tb * tb * nearB;
      const ax0 = a.p[0] - sx * wa, ay0 = a.p[1] - sy * wa, az0 = a.p[2] - sz * wa;
      const ax1 = a.p[0] + sx * wa, ay1 = a.p[1] + sy * wa, az1 = a.p[2] + sz * wa;
      const bx0 = b.p[0] - sx * wb, by0 = b.p[1] - sy * wb, bz0 = b.p[2] - sz * wb;
      const bx1 = b.p[0] + sx * wb, by1 = b.p[1] + sy * wb, bz1 = b.p[2] + sz * wb;
      let o = q * 42;
      const putV = (x, y, z, al) => {
        trailData[o] = x; trailData[o + 1] = y; trailData[o + 2] = z;
        trailData[o + 3] = 1.0; trailData[o + 4] = 0.96; trailData[o + 5] = 0.90; trailData[o + 6] = al;
        o += 7;
      };
      putV(ax0, ay0, az0, aa); putV(ax1, ay1, az1, aa); putV(bx1, by1, bz1, ab);
      putV(ax0, ay0, az0, aa); putV(bx1, by1, bz1, ab); putV(bx0, by0, bz0, ab);
      q++;
    }
  }
  if (q <= 0) return;
  gl.bindBuffer(gl.ARRAY_BUFFER, trailVbo);
  gl.bufferSubData(gl.ARRAY_BUFFER, 0, trailData.subarray(0, q * 42));
  gl.useProgram(trailProg);
  gl.uniformMatrix4fv(U(trailProg, 'uVP'), false, vpM);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.depthMask(false);
  gl.bindVertexArray(trailVao);
  gl.drawArrays(gl.TRIANGLES, 0, q * 6);
  gl.depthMask(true);
  gl.disable(gl.BLEND);
}

function drawEnemies() {
  beginSolid();
  for (const e of enemies) {
    if (!e.alive) continue;
    const mesh = enemyMesh(e.type);
    const flash = e.hitT > 0;
    gl.uniform3fv(U(solidProg, 'uAmbient'), flash ? [1.0, 0.95, 0.85] : SOLID_AMB);
    gl.uniform3fv(U(solidProg, 'uSunColor'), flash ? [1.0, 1.0, 1.0] : SOLID_SUN);
    if (e.spawnT > 0) {
      const s = 1 - e.spawnT / 0.55;
      m4rotY(eM, e.rot);
      const sc = 0.35 + 0.65 * s;
      eM[0] *= sc; eM[1] *= sc; eM[2] *= sc;
      eM[4] *= sc; eM[5] *= sc; eM[6] *= sc;
      eM[8] *= sc; eM[9] *= sc; eM[10] *= sc;
    } else {
      m4rotY(eM, e.rot);
      if (e.roll) {
        const c = Math.cos(e.roll), s = Math.sin(e.roll);
        const a = eM[0], b = eM[1], cc = eM[2];
        eM[0] = a * c + eM[4] * s; eM[1] = b * c + eM[5] * s; eM[2] = cc * c + eM[6] * s;
        eM[4] = eM[4] * c - a * s; eM[5] = eM[5] * c - b * s; eM[6] = eM[6] * c - cc * s;
      }
    }
    eM[12] = e.pos[0]; eM[13] = e.pos[1]; eM[14] = e.pos[2];
    gl.uniformMatrix4fv(U(solidProg, 'uModel'), false, eM);
    gl.bindVertexArray(mesh.vao);
    gl.drawArrays(gl.TRIANGLES, 0, mesh.count);
  }
  gl.uniform3fv(U(solidProg, 'uAmbient'), SOLID_AMB);
  gl.uniform3fv(U(solidProg, 'uSunColor'), SOLID_SUN);
}

function drawClouds() {
  gl.useProgram(cloudProg);
  gl.uniformMatrix4fv(U(cloudProg, 'uVP'), false, vpM);
  gl.uniform3fv(U(cloudProg, 'uFogColor'), FOG_COL);
  gl.uniform1f(U(cloudProg, 'uFogDensity'), FOG_DENS);
  gl.uniform3fv(U(cloudProg, 'uCam'), cam.pos);
  gl.uniform1i(U(cloudProg, 'uTex'), 0);
  gl.uniform3fv(U(cloudProg, 'uShade'), [0.40, 0.32, 0.48]);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindVertexArray(cloudVao);
  const tint = new Float32Array(3);
  for (const c of cloudDefs) {
    const cx = c.x + Math.sin(game.time * 0.01 + c.drift) * 25;
    if (!sphereInFrustum(cx, c.y, c.z, Math.hypot(c.sx, c.sy))) continue;
    // Spherical billboarding keeps clouds volumetric from Overhead, Chase and Cockpit views.
    cloudM[0] = camRight[0] * c.sx; cloudM[1] = camRight[1] * c.sx; cloudM[2] = camRight[2] * c.sx; cloudM[3] = 0;
    cloudM[4] = camUp[0] * c.sy;    cloudM[5] = camUp[1] * c.sy;    cloudM[6] = camUp[2] * c.sy;    cloudM[7] = 0;
    cloudM[8] = 0; cloudM[9] = 0; cloudM[10] = 0; cloudM[11] = 0;
    cloudM[12] = cx; cloudM[13] = c.y; cloudM[14] = c.z; cloudM[15] = 1;
    gl.uniformMatrix4fv(U(cloudProg, 'uModel'), false, cloudM);
    tint[0] = 1.0; tint[1] = c.tintY + 0.08; tint[2] = 0.78;
    gl.uniform3fv(U(cloudProg, 'uTint'), tint);
    gl.bindTexture(gl.TEXTURE_2D, cloudTexes[c.tex]);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }
}

const PT_LIGHT = [1.0, 0.60, 0.26], PT_DRONE = [1.0, 0.18, 0.12], PT_MISSILE = [1.0, 0.86, 0.55];
const PT_ENEMY = [1.0, 0.24, 0.20], PT_BULLET = [1.0, 0.45, 0.22];
const PT_LEFT = [1.0, 0.18, 0.18], PT_RIGHT = [0.35, 1.0, 0.55];
const ptScratch = [0, 0, 0], ptLeft = [0, 0, 0], ptRight = [0, 0, 0];
function buildPoints() {
  let n = 0;
  const put = (p, col, size, phase) => {
    if (n >= POINT_MAX) return;
    const o = n * 8;
    pointData[o] = p[0]; pointData[o + 1] = p[1]; pointData[o + 2] = p[2];
    pointData[o + 3] = col[0]; pointData[o + 4] = col[1]; pointData[o + 5] = col[2];
    pointData[o + 6] = size; pointData[o + 7] = phase;
    n++;
  };
  for (let i = 0; i < streetLights.length; i++) {
    const p = streetLights[i];
    if (sphereInFrustum(p[0], p[1], p[2], 2)) put(p, PT_LIGHT, 1.25, i * 0.37);
  }
  for (const e of enemies) {
    if (!e.alive || e.spawnT > 0) continue;
    ptScratch[0] = e.pos[0]; ptScratch[1] = e.pos[1] + e.r * 0.5; ptScratch[2] = e.pos[2];
    put(ptScratch, PT_ENEMY, -2.4, e.phase);
  }
  for (const m of missiles) put(m.p, PT_MISSILE, 1.9, game.time);
  for (const b of ebullets) put(b.p, PT_BULLET, b.kind ? -1.6 : 1.3, game.time);
  const showJet = game.state !== 'title' ? (game.camMode !== 1 && plane.alive) : plane.alive;
  if (showJet) {
    planeMatrix(camMat, plane.pos, plane.yaw, plane.pitch, planeVisualRoll());
    for (let i = 0; i < 3; i++) {
      ptLeft[i] = plane.pos[i] + camMat[i] * 4.9;
      ptRight[i] = plane.pos[i] - camMat[i] * 4.9;
    }
    put(ptLeft, PT_LEFT, -1.0, 0.0);
    put(ptRight, PT_RIGHT, -1.0, 0.5);
  }
  if (n > 0) {
    gl.bindBuffer(gl.ARRAY_BUFFER, pointVbo);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, pointData.subarray(0, n * 8));
  }
  return n;
}
function drawPoints(n) {
  if (n <= 0) return;
  gl.useProgram(pointProg);
  gl.uniformMatrix4fv(U(pointProg, 'uVP'), false, vpM);
  gl.uniform3fv(U(pointProg, 'uCam'), cam.pos);
  gl.uniform1f(U(pointProg, 'uTime'), game.time);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
  gl.depthMask(false);
  gl.bindVertexArray(pointVao);
  gl.drawArrays(gl.POINTS, 0, n);
  gl.depthMask(true);
  gl.disable(gl.BLEND);
}

/* ---------- cannon tracers ---------- */
function drawTracers() {
  const n = Math.min(tracers.length, TRACER_MAX);
  if (n <= 0) return;
  for (let i = 0; i < n; i++) {
    const t = tracers[tracers.length - 1 - i], o = i * 6;
    tracerData[o] = t.a[0]; tracerData[o + 1] = t.a[1]; tracerData[o + 2] = t.a[2];
    tracerData[o + 3] = t.b[0]; tracerData[o + 4] = t.b[1]; tracerData[o + 5] = t.b[2];
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, tracerVbo);
  gl.bufferSubData(gl.ARRAY_BUFFER, 0, tracerData.subarray(0, n * 6));
  gl.useProgram(tracerProg);
  gl.uniformMatrix4fv(U(tracerProg, 'uVP'), false, vpM);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
  gl.depthMask(false);
  gl.bindVertexArray(tracerVao);
  gl.drawArrays(gl.LINES, 0, n * 2);
  gl.depthMask(true);
  gl.disable(gl.BLEND);
}

function fillParticles(list, batch, glowMode) {
  const d = batch.data;
  let n = 0;
  for (const p of list) {
    if (n >= batch.max) break;
    const t = clamp(p.life / p.max, 0, 1);
    let a = glowMode ? Math.min(1, t * 1.5) : t * p.a;
    if (a <= 0.01) continue;
    const s = p.size;
    if (!sphereInFrustum(p.p[0], p.p[1], p.p[2], s * 1.5)) continue;
    let o = n * 60;
    for (let k = 0; k < 6; k++) {
      d[o] = p.p[0]; d[o + 1] = p.p[1]; d[o + 2] = p.p[2];
      d[o + 3] = CORNERS[k][0]; d[o + 4] = CORNERS[k][1];
      d[o + 5] = p.col[0]; d[o + 6] = p.col[1]; d[o + 7] = p.col[2]; d[o + 8] = a;
      d[o + 9] = s;
      o += 10;
    }
    n++;
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, batch.vbo);
  if (n > 0) gl.bufferSubData(gl.ARRAY_BUFFER, 0, d.subarray(0, n * 60));
  return n;
}
function drawParticleBatch(batch, count, tex, additive) {
  if (count <= 0) return;
  gl.useProgram(partProg);
  gl.uniformMatrix4fv(U(partProg, 'uVP'), false, vpM);
  gl.uniform3fv(U(partProg, 'uRight'), camRight);
  gl.uniform3fv(U(partProg, 'uUp'), camUp);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.uniform1i(U(partProg, 'uTex'), 0);
  gl.enable(gl.BLEND);
  if (additive) gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
  else gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.depthMask(false);
  gl.bindVertexArray(batch.vao);
  gl.drawArrays(gl.TRIANGLES, 0, count * 6);
  gl.depthMask(true);
  gl.disable(gl.BLEND);
}

function renderScene() {
  let fx = cam.look[0] - cam.pos[0], fy = cam.look[1] - cam.pos[1], fz = cam.look[2] - cam.pos[2];
  const fl = Math.hypot(fx, fy, fz) || 1; fx /= fl; fy /= fl; fz /= fl;
  let rx = fy * cam.up[2] - fz * cam.up[1];
  let ry = fz * cam.up[0] - fx * cam.up[2];
  let rz = fx * cam.up[1] - fy * cam.up[0];
  const rl = Math.hypot(rx, ry, rz) || 1;
  camRight[0] = rx / rl; camRight[1] = ry / rl; camRight[2] = rz / rl;
  camUp[0] = camRight[1] * fz - camRight[2] * fy;
  camUp[1] = camRight[2] * fx - camRight[0] * fz;
  camUp[2] = camRight[0] * fy - camRight[1] * fx;

  gl.bindFramebuffer(gl.FRAMEBUFFER, sceneFbo);
  gl.viewport(0, 0, W, H);
  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);
  gl.depthMask(true);
  gl.disable(gl.BLEND);
  gl.disable(gl.CULL_FACE);
  gl.clearColor(0.05, 0.05, 0.08, 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  gl.disable(gl.DEPTH_TEST);
  gl.depthMask(false);
  drawSky();
  gl.enable(gl.DEPTH_TEST);
  gl.depthMask(true);

  drawTerrain();
  drawWater();
  drawShadows();
  drawCity();
  const showJet = plane.alive && !(game.state !== 'title' && game.camMode === 1);
  if (showJet) drawJet();
  drawEnemies();
  drawClouds();
  if (showJet || game.state === 'title') drawTrails();

  const pn = buildPoints();
  drawPoints(pn);
  drawTracers();
  const sc = fillParticles(smokeP, smokeBatch, false);
  drawParticleBatch(smokeBatch, sc, smokeTex, false);
  const gc = fillParticles(glowP, glowBatch, true);
  drawParticleBatch(glowBatch, gc, glowTex, true);

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, W, H);
  gl.disable(gl.DEPTH_TEST);
  gl.disable(gl.BLEND);
  gl.useProgram(postProg);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, sceneTex);
  gl.uniform1i(U(postProg, 'uScene'), 0);
  gl.uniform1f(U(postProg, 'uHurt'), clamp(game.hitFlash * 0.55 + (plane.alive ? 0 : 0.35), 0, 1));
  gl.bindVertexArray(fsVao);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}
