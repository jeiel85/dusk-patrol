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
const JET_SUN = [1.0, 0.80, 0.55], JET_AMB = [0.58, 0.56, 0.74];
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
}

function drawTerrain() {
  beginSolid();
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

function drawJet() {
  const m = planeMatrix(jetM, plane.pos, plane.yaw, plane.pitch, plane.roll + plane.barrel);
  beginSolid();
  // Blink the hull while respawn invulnerability is running.
  const inv = plane.invuln > 0 && (Math.sin(game.time * 26) > 0);
  gl.uniform3fv(U(solidProg, 'uAmbient'), inv ? [0.75, 0.95, 1.0] : JET_AMB);
  gl.uniform3fv(U(solidProg, 'uSunColor'), JET_SUN);
  gl.uniform1f(U(solidProg, 'uSpec'), 0.55);
  gl.uniformMatrix4fv(U(solidProg, 'uModel'), false, m);
  gl.bindVertexArray(jetMesh.vao);
  gl.drawArrays(gl.TRIANGLES, 0, jetMesh.count);

  gl.useProgram(burnProg);
  gl.uniformMatrix4fv(U(burnProg, 'uVP'), false, vpM);
  gl.uniformMatrix4fv(U(burnProg, 'uModel'), false, m);
  gl.uniform1f(U(burnProg, 'uLen'), 2.6 + plane.boost * 7.5);
  gl.uniform1f(U(burnProg, 'uZ0'), 4.9);
  gl.uniform1f(U(burnProg, 'uIntensity'), 0.28 + plane.boost * 0.92);
  gl.uniform1f(U(burnProg, 'uTime'), game.time);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
  gl.depthMask(false);
  gl.bindVertexArray(burnVao);
  gl.drawArrays(gl.TRIANGLES, 0, burnCount);
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
    const dx = cam.pos[0] - cx, dy = cam.pos[1] - c.y, dz = cam.pos[2] - c.z;
    const dl = Math.hypot(dx, dy, dz) || 1;
    let rx = dz / dl, rz = -dx / dl;
    let rl = Math.hypot(rx, rz);
    if (rl < 0.01) { rx = 1; rz = 0; rl = 1; } else { rx /= rl; rz /= rl; }
    cloudM[0] = rx * c.sx; cloudM[1] = 0; cloudM[2] = rz * c.sx; cloudM[3] = 0;
    cloudM[4] = 0; cloudM[5] = c.sy; cloudM[6] = 0; cloudM[7] = 0;
    cloudM[8] = 0; cloudM[9] = 0; cloudM[10] = 0; cloudM[11] = 0;
    cloudM[12] = cx; cloudM[13] = c.y; cloudM[14] = c.z; cloudM[15] = 1;
    gl.uniformMatrix4fv(U(cloudProg, 'uModel'), false, cloudM);
    tint[0] = 1.0; tint[1] = c.tintY; tint[2] = 0.68;
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
    planeMatrix(camMat, plane.pos, plane.yaw, plane.pitch, plane.roll + plane.barrel);
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
  drawCity();
  const showJet = plane.alive && !(game.state !== 'title' && game.camMode === 1);
  if (showJet) drawJet();
  drawEnemies();
  drawClouds();

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
