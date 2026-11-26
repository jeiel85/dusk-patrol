/* DUSK PATROL — meshes.js
   GPU geometry built once at start-up: terrain chunks, city instances,
   cloud and puff sprites, jet, drone, afterburner and dynamic buffers.
   Loaded as a classic script in order (see index.html); globals are shared. */
'use strict';

/* fullscreen triangle (sky + post) */
const fsVao = gl.createVertexArray();
gl.bindVertexArray(fsVao);
gl.bindBuffer(gl.ARRAY_BUFFER, buf(FS_TRI));
attr(0, 2);

/* water quad */
const waterVao = gl.createVertexArray();
gl.bindVertexArray(waterVao);
gl.bindBuffer(gl.ARRAY_BUFFER, buf(new Float32Array([
  -7000, -7000, 7000, -7000, 7000, 7000,
  -7000, -7000, 7000, 7000, -7000, 7000
])));
attr(0, 2);
gl.bindVertexArray(null);

/* ---------- terrain ---------- */
const TN = 320, TSTEP = WORLD / TN;
const th = new Float32Array((TN + 1) * (TN + 1));
for (let j = 0; j <= TN; j++) {
  const z = -HALF + j * TSTEP;
  for (let i = 0; i <= TN; i++) th[j * (TN + 1) + i] = terrainHeight(-HALF + i * TSTEP, z);
}
const triTotal = TN * TN * 2;
const tPos = new Float32Array(triTotal * 9);
const tNor = new Float32Array(triTotal * 9);
const tCol = new Float32Array(triTotal * 9);
let tOff = 0;
const HGT = (i, j) => th[j * (TN + 1) + i];
function emitTerrainTri(ax, az, bx, bz, cx, cz, ha, hb, hc) {
  const ux = bx - ax, uy = hb - ha, uz = bz - az;
  const vx = cx - ax, vy = hc - ha, vz = cz - az;
  let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
  if (ny < 0) {
    let t = bx; bx = cx; cx = t; t = bz; bz = cz; cz = t; t = hb; hb = hc; hc = t;
    nx = -nx; ny = -ny; nz = -nz;
  }
  const mx = (ax + bx + cx) / 3, mz = (az + bz + cz) / 3, mh = (ha + hb + hc) / 3;
  const c = terrainColor(mx, mz, mh, 1 - ny);
  tPos[tOff] = ax; tPos[tOff + 1] = ha; tPos[tOff + 2] = az;
  tPos[tOff + 3] = bx; tPos[tOff + 4] = hb; tPos[tOff + 5] = bz;
  tPos[tOff + 6] = cx; tPos[tOff + 7] = hc; tPos[tOff + 8] = cz;
  for (let k = 0; k < 3; k++) {
    tNor[tOff + k * 3] = nx; tNor[tOff + k * 3 + 1] = ny; tNor[tOff + k * 3 + 2] = nz;
    tCol[tOff + k * 3] = c[0]; tCol[tOff + k * 3 + 1] = c[1]; tCol[tOff + k * 3 + 2] = c[2];
  }
  tOff += 9;
}
// Split the terrain into 8x8 chunks so distant ground can be frustum-culled.
const TCH = 8, TPC = TN / TCH;
const terrainChunks = [];
for (let cj = 0; cj < TCH; cj++) {
  for (let ci = 0; ci < TCH; ci++) {
    const floatStart = tOff;
    let minY = 1e9, maxY = -1e9;
    for (let j = cj * TPC; j < (cj + 1) * TPC; j++) {
      const z0 = -HALF + j * TSTEP, z1 = z0 + TSTEP;
      for (let i = ci * TPC; i < (ci + 1) * TPC; i++) {
        const x0 = -HALF + i * TSTEP, x1 = x0 + TSTEP;
        const ha = HGT(i, j), hb = HGT(i, j + 1), hc = HGT(i + 1, j), hd = HGT(i + 1, j + 1);
        minY = Math.min(minY, ha, hb, hc, hd); maxY = Math.max(maxY, ha, hb, hc, hd);
        emitTerrainTri(x0, z0, x0, z1, x1, z0, ha, hb, hc);
        emitTerrainTri(x1, z0, x0, z1, x1, z1, hc, hb, hd);
      }
    }
    terrainChunks.push({
      first: floatStart / 3, count: (tOff - floatStart) / 3,
      min: [-HALF + ci * TPC * TSTEP, minY - 3, -HALF + cj * TPC * TSTEP],
      max: [-HALF + (ci + 1) * TPC * TSTEP, maxY + 3, -HALF + (cj + 1) * TPC * TSTEP]
    });
  }
}
// One VAO over the shared buffers: each chunk draws its own [first, count) range.
const terrainVao = gl.createVertexArray();
gl.bindVertexArray(terrainVao);
gl.bindBuffer(gl.ARRAY_BUFFER, buf(tPos)); attr(0, 3);
gl.bindBuffer(gl.ARRAY_BUFFER, buf(tNor)); attr(1, 3);
gl.bindBuffer(gl.ARRAY_BUFFER, buf(tCol)); attr(2, 3);
gl.bindVertexArray(null);

/* ---------- cloud textures ---------- */
const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
function makeCloudTexture(seed) {
  const S = 64, r = mulberry32(seed);
  const blobs = [];
  const nb = 4 + ((r() * 3) | 0);
  for (let i = 0; i < nb; i++) blobs.push([0.16 + r() * 0.68, 0.40 + r() * 0.18, 0.18 + r() * 0.21]);
  return spriteTex(S, (x, y) => {
    const nx = x / S, ny = y / S;
    let f = 0;
    for (const b of blobs) {
      const dx = (nx - b[0]) * 1.10, dy = (ny - b[1]) * 1.50;
      f = Math.max(f, 1 - Math.sqrt(dx * dx + dy * dy) / b[2]);
    }
    f += (fbm(nx * 7 + seed, ny * 5) - 0.5) * 0.30;
    // Flatten the underside so banks read as fair-weather cumulus.
    f -= smoothstep(0.54, 0.84, ny) * 0.18;
    const b = (BAYER4[(y & 3) * 4 + (x & 3)] + 0.5) / 16 - 0.5;
    return f > 0.17 || (f > 0.12 && b > 0) ? 1 : 0;
  });
}
const cloudTexes = [makeCloudTexture(11), makeCloudTexture(29), makeCloudTexture(53), makeCloudTexture(97)];

const cloudVao = gl.createVertexArray();
gl.bindVertexArray(cloudVao);
gl.bindBuffer(gl.ARRAY_BUFFER, buf(new Float32Array([
  -1, -1, 0, 0, 0, 1, -1, 0, 1, 0, 1, 1, 0, 1, 1,
  -1, -1, 0, 0, 0, 1, 1, 0, 1, 1, -1, 1, 0, 0, 1
])));
attr(0, 3, 20, 0);
attr(1, 2, 20, 12);
gl.bindVertexArray(null);

/* ---------- mesh builder ---------- */
function MeshBuilder() { this.p = []; this.n = []; this.c = []; }
MeshBuilder.prototype.tri = function (a, b, c, col, hint) {
  let ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
  let vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  if (hint && nx * hint[0] + ny * hint[1] + nz * hint[2] < 0) {
    const t = b; b = c; c = t; nx = -nx; ny = -ny; nz = -nz;
  }
  const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
  for (const p of [a, b, c]) {
    this.p.push(p[0], p[1], p[2]);
    this.n.push(nx, ny, nz);
    this.c.push(col[0], col[1], col[2]);
  }
};
MeshBuilder.prototype.quad = function (a, b, c, d, col, hint) {
  this.tri(a, b, c, col, hint);
  this.tri(a, c, d, col, hint);
};
MeshBuilder.prototype.build = function () {
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, buf(new Float32Array(this.p))); attr(0, 3);
  gl.bindBuffer(gl.ARRAY_BUFFER, buf(new Float32Array(this.n))); attr(1, 3);
  gl.bindBuffer(gl.ARRAY_BUFFER, buf(new Float32Array(this.c))); attr(2, 3);
  gl.bindVertexArray(null);
  return { vao, count: this.p.length / 3 };
};

/* ---------- city: one unit cube instanced per building ---------- */
const cube = new MeshBuilder();
const CUBE_FACES = [ // outward normal, then the four corners of the face
  [[1, 0, 0], [1, 0, 0], [1, 0, 1], [1, 1, 1], [1, 1, 0]],
  [[-1, 0, 0], [0, 0, 0], [0, 1, 0], [0, 1, 1], [0, 0, 1]],
  [[0, 0, 1], [0, 0, 1], [0, 1, 1], [1, 1, 1], [1, 0, 1]],
  [[0, 0, -1], [0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]],
  [[0, 1, 0], [0, 1, 0], [1, 1, 0], [1, 1, 1], [0, 1, 1]],
  [[0, -1, 0], [0, 0, 0], [0, 0, 1], [1, 0, 1], [1, 0, 0]]
];
for (const [n, a, b, c, d] of CUBE_FACES) cube.quad(a, b, c, d, n, n);

const instData = new Float32Array(buildings.length * 10);
for (let i = 0; i < buildings.length; i++) {
  const b = buildings[i], o = i * 10;
  instData.set([b.x - b.w / 2, 11, b.z - b.d / 2, b.w, b.h, b.d, b.seed, b.wall[0], b.wall[1], b.wall[2]], o);
}
const cityVao = gl.createVertexArray();
gl.bindVertexArray(cityVao);
gl.bindBuffer(gl.ARRAY_BUFFER, buf(new Float32Array(cube.p))); attr(0, 3);
gl.bindBuffer(gl.ARRAY_BUFFER, buf(new Float32Array(cube.n))); attr(1, 3);
gl.bindBuffer(gl.ARRAY_BUFFER, buf(instData));
attr(2, 3, 40, 0, 1);  // offset
attr(3, 3, 40, 12, 1); // size
attr(4, 1, 40, 24, 1); // window seed
attr(5, 3, 40, 28, 1); // wall colour
gl.bindVertexArray(null);

/* ---------- jet ---------- */
const JET_LIGHT = rgb('#e9e6e0'), JET_MID = rgb('#b7b8bc'), JET_DARK = rgb('#6b6e76');
const JET_WING = rgb('#a7a8ac'), JET_WING_BOT = rgb('#6a6a72'), JET_EDGE = rgb('#f6f3ec');
const JET_FIN = rgb('#7c7f88'), JET_CANOPY = rgb('#26344e'), JET_CANOPY_HI = rgb('#9fd6ee');
const JET_ORANGE = rgb('#f2602f'), JET_GOLD = rgb('#ffa552');

const jet = new MeshBuilder();
function ringPts(z, rx, ry, y0) {
  const p = [];
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * TAU;
    p.push([Math.cos(a) * rx, y0 + Math.sin(a) * ry, z]);
  }
  return p;
}
const FR = [
  ringPts(-3.7, 0.52, 0.44, 0.08),
  ringPts(0.1, 0.74, 0.62, 0.05),
  ringPts(3.0, 0.82, 0.66, 0.02),
  ringPts(4.9, 0.58, 0.44, 0.0)
];
for (let r = 0; r < FR.length - 1; r++) {
  for (let i = 0; i < 6; i++) {
    const a = FR[r][i], b = FR[r][(i + 1) % 6], c = FR[r + 1][(i + 1) % 6], d = FR[r + 1][i];
    const cy = (a[1] + b[1] + c[1] + d[1]) / 4;
    const col = cy > 0.42 ? JET_LIGHT : (cy > -0.12 ? JET_MID : JET_DARK);
    jet.quad(a, b, c, d, col, [(a[0] + b[0] + c[0] + d[0]) / 4, cy - 0.06, 0]);
  }
}
const tip = [0, 0.10, -7.4];
for (let i = 0; i < 6; i++) {
  const a = FR[0][i], b = FR[0][(i + 1) % 6];
  jet.tri(tip, b, a, JET_MID, [a[0] + b[0], (a[1] + b[1]) / 2 - 0.06, 0]);
}
for (let i = 0; i < 6; i++) {
  const a = FR[3][i], b = FR[3][(i + 1) % 6];
  jet.tri([0, 0.0, 5.35], a, b, JET_DARK, [0, 0, -1]);
}

function buildWing(sign) {
  const poly = [[0.5, -1.5], [0.5, 2.8], [2.3, 3.15], [4.95, 2.15], [4.95, 1.45], [1.8, -1.0]];
  for (let i = 1; i < poly.length - 1; i++) {
    jet.tri(
      [sign * poly[0][0], 0.07, poly[0][1]],
      [sign * poly[i][0], 0.07, poly[i][1]],
      [sign * poly[i + 1][0], 0.07, poly[i + 1][1]],
      JET_WING, [0, 1, 0]
    );
    jet.tri(
      [sign * poly[0][0], -0.23, poly[0][1]],
      [sign * poly[i + 1][0], -0.23, poly[i + 1][1]],
      [sign * poly[i][0], -0.23, poly[i][1]],
      JET_WING_BOT, [0, -1, 0]
    );
  }
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    const cx = sign * (p[0] + q[0]) / 2;
    jet.quad(
      [sign * p[0], 0.07, p[1]], [sign * q[0], 0.07, q[1]],
      [sign * q[0], -0.23, q[1]], [sign * p[0], -0.23, p[1]],
      JET_EDGE, [cx, 0, (p[1] + q[1]) / 2 - 1.5]
    );
  }
  jet.quad(
    [sign * 3.55, 0.08, 2.62], [sign * 4.95, 0.08, 2.15],
    [sign * 4.95, 0.08, 1.45], [sign * 3.55, 0.08, 1.72],
    JET_ORANGE, [0, 1, 0]
  );
}
buildWing(1); buildWing(-1);

function buildFin(sign) {
  const p0 = [0.48 * sign, 0.5, 2.5], p1 = [0.48 * sign, 0.5, 4.7];
  const p2 = [0.98 * sign, 1.75, 4.95], p3 = [0.98 * sign, 1.75, 3.95];
  for (const off of [-0.04, 0.04]) {
    jet.quad(
      [p0[0] + off, p0[1], p0[2]], [p1[0] + off, p1[1], p1[2]],
      [p2[0] + off, p2[1], p2[2]], [p3[0] + off, p3[1], p3[2]],
      JET_FIN, [sign, 0.15, 0]
    );
  }
  jet.quad(p0, p1, [p2[0] - sign * 0.04, 1.75, 4.95], [p3[0] - sign * 0.04, 1.75, 3.95], JET_EDGE, [sign, 0.3, 0]);
  // Tail fin tip accent offset outside both fin faces so it renders cleanly.
  for (const off of [-0.046, 0.046]) {
    jet.quad(
      [0.86 * sign + off, 1.48, 3.82], [0.86 * sign + off, 1.48, 4.90],
      [0.98 * sign + off, 1.75, 4.95], [0.98 * sign + off, 1.75, 3.95],
      JET_ORANGE, [off > 0 ? 1 : -1, 0.25, 0]
    );
  }
}
buildFin(1); buildFin(-1);

function buildStab(sign) {
  const poly = [[0.45, 3.15], [0.45, 4.55], [1.3, 4.8], [2.7, 4.45], [2.7, 4.15], [1.2, 3.95]];
  for (let i = 1; i < poly.length - 1; i++) {
    jet.tri(
      [sign * poly[0][0], -0.01, poly[0][1]], [sign * poly[i][0], -0.01, poly[i][1]],
      [sign * poly[i + 1][0], -0.01, poly[i + 1][1]], JET_WING, [0, 1, 0]
    );
    jet.tri(
      [sign * poly[0][0], -0.15, poly[0][1]], [sign * poly[i + 1][0], -0.15, poly[i + 1][1]],
      [sign * poly[i][0], -0.15, poly[i][1]], JET_WING_BOT, [0, -1, 0]
    );
  }
}
buildStab(1); buildStab(-1);

const c0 = [-0.4, 0.42, -3.55], c1 = [0.4, 0.42, -3.55], c2 = [0.48, 0.4, -1.45], c3 = [-0.48, 0.4, -1.45];
const rd0 = [0, 0.96, -3.0], rd1 = [0, 0.99, -1.75];
jet.tri(c0, c1, rd0, JET_CANOPY, [0, 0.4, -1]);
jet.tri(c1, c2, rd1, JET_CANOPY, [1, 0.4, 0]);
jet.tri(c1, rd1, rd0, JET_CANOPY_HI, [1, 0.8, 0]);
jet.tri(c3, rd1, c2, JET_CANOPY, [-1, 0.4, 0]);
jet.tri(c3, c0, rd0, JET_CANOPY, [-1, 0.4, 0]);
jet.tri(c3, rd0, rd1, JET_CANOPY_HI, [-1, 0.8, 0]);
jet.tri(c2, c3, rd1, JET_CANOPY, [0, 0.4, 1]);

function buildNozzle(sign) {
  const cx = sign * 0.44, z0 = 4.9, z1 = 5.5;
  const a = [], b = [];
  for (let i = 0; i < 6; i++) {
    const ang = i / 6 * TAU;
    a.push([cx + Math.cos(ang) * 0.3, 0.02 + Math.sin(ang) * 0.3, z0]);
    b.push([cx + Math.cos(ang) * 0.25, 0.02 + Math.sin(ang) * 0.25, z1]);
  }
  for (let i = 0; i < 6; i++) {
    jet.quad(a[i], a[(i + 1) % 6], b[(i + 1) % 6], b[i], JET_DARK,
      [(a[i][0] + b[i][0]) / 2 - cx, (a[i][1] + b[i][1]) / 2 - 0.02, 0]);
  }
  for (let i = 0; i < 6; i++) jet.tri([cx, 0.02, z1], b[i], b[(i + 1) % 6], rgb('#7a3b24'), [0, 0, 1]);
}
buildNozzle(1); buildNozzle(-1);
const jetMesh = jet.build();

/* ---------- drone ---------- */
const drone = new MeshBuilder();
const dTop = [], dBot = [];
for (let i = 0; i < 6; i++) {
  const a = i / 6 * TAU;
  dTop.push([Math.cos(a) * 5, 0.7, Math.sin(a) * 5]);
  dBot.push([Math.cos(a) * 5, -0.6, Math.sin(a) * 5]);
}
const DRONE_TOP = rgb('#4a5168'), DRONE_BOT = rgb('#2b3041'), DRONE_SIDE = rgb('#202434');
for (let i = 0; i < 6; i++) {
  drone.tri([0, 0.85, 0], dTop[i], dTop[(i + 1) % 6], DRONE_TOP, [0, 1, 0]);
  drone.tri([0, -0.75, 0], dBot[(i + 1) % 6], dBot[i], DRONE_BOT, [0, -1, 0]);
  drone.quad(dTop[i], dTop[(i + 1) % 6], dBot[(i + 1) % 6], dBot[i], DRONE_SIDE,
    [(dTop[i][0] + dTop[(i + 1) % 6][0]) / 2, 0, (dTop[i][2] + dTop[(i + 1) % 6][2]) / 2]);
}
drone.tri([0, 1.05, 0], [-1.6, 0.86, 1.2], [1.6, 0.86, 1.2], JET_ORANGE, [0, 1, 0]);
drone.tri([0, 1.05, 0], [1.6, 0.86, -1.2], [-1.6, 0.86, -1.2], JET_ORANGE, [0, 1, 0]);
const droneMesh = drone.build();

/* ---------- afterburner cones ---------- */
// Two dual-layer cones behind the nozzles (outer flame + inner white-hot core).
const burnData = [];
for (const cx of [0.44, -0.44]) {
  const cy = 0.02, segs = 10;
  for (const [r, len] of [[0.34, 1.0], [0.18, 0.58]]) {
    for (let i = 0; i < segs; i++) {
      const a0 = i / segs * TAU, a1 = (i + 1) / segs * TAU;
      burnData.push(
        cx + Math.cos(a0) * r, cy + Math.sin(a0) * r, 0, 0,
        cx + Math.cos(a1) * r, cy + Math.sin(a1) * r, 0, 0,
        cx, cy, len, 1
      );
    }
  }
}
const burnCount = burnData.length / 4;
const burnVao = gl.createVertexArray();
gl.bindVertexArray(burnVao);
gl.bindBuffer(gl.ARRAY_BUFFER, buf(new Float32Array(burnData)));
attr(0, 3, 16, 0);
attr(1, 1, 16, 12);
gl.bindVertexArray(null);

/* ---------- ground/water shadow geometry ---------- */
const cloudShadowVao = gl.createVertexArray();
gl.bindVertexArray(cloudShadowVao);
gl.bindBuffer(gl.ARRAY_BUFFER, buf(new Float32Array([
  -1, 0, -1, 0, 0,  1, 0, -1, 1, 0,  1, 0, 1, 1, 1,
  -1, 0, -1, 0, 0,  1, 0, 1, 1, 1,  -1, 0, 1, 0, 1
])));
attr(0, 3, 20, 0);
attr(1, 2, 20, 12);
gl.bindVertexArray(null);

// Flat fighter silhouette in XZ plane for projected jet shadow.
const jetShadowData = new Float32Array([
  // Fuselage dart
  0, 0, -7.4, 0, 0,  -0.95, 0, 4.9, 0, 0,  0.95, 0, 4.9, 0, 0,
  // Left wing
  -0.5, 0, -1.5, 0, 0,  -4.95, 0, 1.6, 0, 0,  -0.5, 0, 3.1, 0, 0,
  // Right wing
  0.5, 0, -1.5, 0, 0,  0.5, 0, 3.1, 0, 0,  4.95, 0, 1.6, 0, 0,
  // Tail stabilizers
  0, 0, 3.0, 0, 0,  -2.8, 0, 4.6, 0, 0,  2.8, 0, 4.6, 0, 0
]);
const jetShadowCount = jetShadowData.length / 5;
const jetShadowVao = gl.createVertexArray();
gl.bindVertexArray(jetShadowVao);
gl.bindBuffer(gl.ARRAY_BUFFER, buf(jetShadowData));
attr(0, 3, 20, 0);
attr(1, 2, 20, 12);
gl.bindVertexArray(null);

/* ---------- puff textures ---------- */
function makePuffTex(glow) {
  const S = 32;
  return spriteTex(S, (x, y) => {
    const a = 1 - Math.min(1, Math.hypot((x + 0.5) / S * 2 - 1, (y + 0.5) / S * 2 - 1));
    return glow ? Math.pow(a, 2.1) : Math.pow(a, 1.15) * (0.55 + 0.45 * vnoise(x * 0.55 + 3, y * 0.55 + 7));
  });
}
const smokeTex = makePuffTex(false);
const glowTex = makePuffTex(true);

/* ---------- dynamic vertex buffers ---------- */
// layout: [location, size] pairs, packed back to back as floats.
function makeDynamic(floats, layout) {
  const data = new Float32Array(floats);
  const vao = gl.createVertexArray();
  const vbo = gl.createBuffer();
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, data.byteLength, gl.DYNAMIC_DRAW);
  const stride = layout.reduce((s, l) => s + l[1], 0) * 4;
  let off = 0;
  for (const [loc, size] of layout) { attr(loc, size, stride, off); off += size * 4; }
  gl.bindVertexArray(null);
  return { vao, vbo, data };
}
// Points: pos3, colour3, size (negative = blinking), phase.
const POINT_MAX = 900;
const { vao: pointVao, vbo: pointVbo, data: pointData } =
  makeDynamic(POINT_MAX * 8, [[0, 3], [1, 3], [2, 1], [3, 1]]);
// Static scenery points (trees & scrub) share the point shader but live in their own buffer.
const SCENERY_COL_A = rgb('#39462a'), SCENERY_COL_B = rgb('#52422c');
const sceneryData = new Float32Array(treePoints.length * 8);
for (let i = 0; i < treePoints.length; i++) {
  const t = treePoints[i], o = i * 8, pick = t[3];
  const col = pick < 0.62 ? SCENERY_COL_A : (pick < 0.88 ? SCENERY_COL_B : rgb('#635a34'));
  sceneryData[o] = t[0]; sceneryData[o + 1] = t[1]; sceneryData[o + 2] = t[2];
  sceneryData[o + 3] = col[0]; sceneryData[o + 4] = col[1]; sceneryData[o + 5] = col[2];
  sceneryData[o + 6] = 1.9 + pick * 1.4; sceneryData[o + 7] = pick;
}
const sceneryVao = gl.createVertexArray();
gl.bindVertexArray(sceneryVao);
gl.bindBuffer(gl.ARRAY_BUFFER, buf(sceneryData));
attr(0, 3, 32, 0); attr(1, 3, 32, 12); attr(2, 1, 32, 24); attr(3, 1, 32, 28);
gl.bindVertexArray(null);
// Particles: six billboard corners of centre3, corner2, rgba4, size.
function makeParticleVAO(max) {
  return Object.assign(makeDynamic(max * 60, [[0, 3], [1, 2], [2, 4], [3, 1]]), { max });
}
const smokeBatch = makeParticleVAO(240);
const glowBatch = makeParticleVAO(260);
// Wingtip contrail ribbons: up to 160 quads of 6 verts x (pos3 + rgba4).
const TRAIL_QUAD_MAX = 160;
const { vao: trailVao, vbo: trailVbo, data: trailData } =
  makeDynamic(TRAIL_QUAD_MAX * 42, [[0, 3], [1, 4]]);
