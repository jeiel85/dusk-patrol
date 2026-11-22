/* DUSK PATROL — meshes2.js
   Extra GPU geometry for the wave campaign: interceptor, gunship, carrier,
   and the dynamic tracer buffer. Loaded after meshes.js. */
'use strict';

/* ---------- interceptor: dart-shaped fighter ---------- */
const INTC_HULL = rgb('#7a86ad'), INTC_DARK = rgb('#39415e'), INTC_GLOW = rgb('#ff4a3c');
const intc = new MeshBuilder();
(function buildInterceptor() {
  const nose = [0, 0.1, -6.4];
  const body = [[-0.85, 0.35, 1.2], [0.85, 0.35, 1.2], [0.85, -0.35, 1.2], [-0.85, -0.35, 1.2]];
  // Four tapered sides from the nose to the body box.
  for (let i = 0; i < 4; i++) {
    const a = body[i], b = body[(i + 1) % 4];
    intc.tri(nose, a, b, i === 3 ? INTC_DARK : INTC_HULL, [(a[0] + b[0]) / 2, 0.1, 0]);
  }
  intc.quad(body[0], body[1], body[2], body[3], INTC_DARK, [0, 0, 1]);
  // Swept wings, both sides, with a red leading edge.
  for (const s of [-1, 1]) {
    const poly = [[0.7 * s, 0.05, -0.6], [0.7 * s, 0.05, 1.9], [3.6 * s, 0.05, 2.6], [4.4 * s, 0.05, 2.2], [1.5 * s, 0.05, -1.5]];
    for (let i = 1; i < poly.length - 1; i++) {
      intc.tri(poly[0], poly[i], poly[i + 1], INTC_HULL, [0, 1, 0]);
      intc.tri(
        [poly[0][0], -0.14, poly[0][2]], [poly[i + 1][0], -0.14, poly[i + 1][2]], [poly[i][0], -0.14, poly[i][2]],
        INTC_DARK, [0, -1, 0]);
    }
    intc.quad([1.5 * s, 0.06, -1.5], [4.4 * s, 0.06, 2.2], [4.4 * s, 0.06, 2.55], [1.5 * s, 0.06, -1.15], INTC_GLOW, [0, 1, 0]);
    // Tail fin.
    intc.quad([0.6 * s, 0.3, 0.4], [0.6 * s, 1.55, 1.6], [0.6 * s, 1.55, 2.1], [0.6 * s, 0.3, 1.6], INTC_DARK, [s, 0.2, 0]);
  }
  // Engine glow block.
  intc.quad([-0.6, 0.25, 1.25], [0.6, 0.25, 1.25], [0.6, -0.25, 1.25], [-0.6, -0.25, 1.25], INTC_GLOW, [0, 0, 1]);
})();
const intcMesh = intc.build();

/* ---------- gunship: heavy block with side pods ---------- */
const GUN_HULL = rgb('#5d6355'), GUN_DARK = rgb('#33372f'), GUN_TRIM = rgb('#c9a253');
const gun = new MeshBuilder();
(function buildGunship() {
  // Main hull box.
  const x0 = -3.2, x1 = 3.2, y0 = -1.1, y1 = 1.3, z0 = -4.2, z1 = 4.6;
  const V = (x, y, z) => [x, y, z];
  const box = [
    [V(x0, y1, z0), V(x1, y1, z0), V(x1, y1, z1), V(x0, y1, z1), [0, 1, 0], GUN_HULL],
    [V(x0, y0, z1), V(x1, y0, z1), V(x1, y0, z0), V(x0, y0, z0), [0, -1, 0], GUN_DARK],
    [V(x1, y0, z0), V(x1, y0, z1), V(x1, y1, z1), V(x1, y1, z0), [1, 0, 0], GUN_HULL],
    [V(x0, y0, z1), V(x0, y0, z0), V(x0, y1, z0), V(x0, y1, z1), [-1, 0, 0], GUN_HULL],
    [V(x0, y0, z0), V(x1, y0, z0), V(x1, y1, z0), V(x0, y1, z0), [0, 0, -1], GUN_TRIM],
    [V(x1, y0, z1), V(x0, y0, z1), V(x0, y1, z1), V(x1, y1, z1), [0, 0, 1], GUN_DARK]
  ];
  for (const f of box) gun.quad(f[0], f[1], f[2], f[3], f[5], f[4]);
  // Side weapon pods.
  for (const s of [-1, 1]) {
    const px = 3.2 * s;
    gun.quad([px, 0.9, -1.6], [px + 1.5 * s, 0.9, -0.9], [px + 1.5 * s, -0.9, -0.9], [px, -0.9, -1.6], GUN_DARK, [s, 0, 0]);
    gun.quad([px + 1.5 * s, 0.55, -0.9], [px + 1.5 * s, 0.55, 2.4], [px + 1.5 * s, -0.55, 2.4], [px + 1.5 * s, -0.55, -0.9], GUN_TRIM, [s, 0, 0]);
    gun.quad([px + 1.5 * s, 0.55, 2.4], [px, 0.9, 2.9], [px, -0.9, 2.9], [px + 1.5 * s, -0.55, 2.4], GUN_DARK, [0, 0, 1]);
  }
  // Rotor ring on top.
  for (let i = 0; i < 8; i++) {
    const a0 = i / 8 * TAU, a1 = (i + 1) / 8 * TAU;
    gun.tri([0, 2.4, 0], [Math.cos(a0) * 3.4, 1.35, Math.sin(a0) * 3.4], [Math.cos(a1) * 3.4, 1.35, Math.sin(a1) * 3.4], GUN_DARK, [0, 1, 0]);
  }
})();
const gunMesh = gun.build();

/* ---------- carrier: boss hull ---------- */
const CAR_HULL = rgb('#5a4f68'), CAR_DARK = rgb('#2a2436'), CAR_TRIM = rgb('#e0603f'), CAR_LIGHT = rgb('#8a7c9c');
const car = new MeshBuilder();
(function buildCarrier() {
  const x0 = -8, x1 = 8, y0 = -3, y1 = 3, z0 = -20, z1 = 16;
  const V = (x, y, z) => [x, y, z];
  const box = [
    [V(x0, y1, z0), V(x1, y1, z0), V(x1, y1, z1), V(x0, y1, z1), [0, 1, 0], CAR_LIGHT],
    [V(x0, y0, z1), V(x1, y0, z1), V(x1, y0, z0), V(x0, y0, z0), [0, -1, 0], CAR_DARK],
    [V(x1, y0, z0), V(x1, y0, z1), V(x1, y1, z1), V(x1, y1, z0), [1, 0, 0], CAR_HULL],
    [V(x0, y0, z1), V(x0, y0, z0), V(x0, y1, z0), V(x0, y1, z1), [-1, 0, 0], CAR_HULL],
    [V(x0, y0, z0), V(x1, y0, z0), V(x1, y1, z0), V(x0, y1, z0), [0, 0, -1], CAR_TRIM],
    [V(x1, y0, z1), V(x0, y0, z1), V(x0, y1, z1), V(x1, y1, z1), [0, 0, 1], CAR_DARK]
  ];
  for (const f of box) car.quad(f[0], f[1], f[2], f[3], f[5], f[4]);
  // Bow wedge.
  car.quad(V(x0, y1, z0), V(x1, y1, z0), V(0, y1 - 1.2, z0 - 7), V(0, y1 - 1.2, z0 - 7), CAR_TRIM, [0, 1, 0]);
  for (const s of [-1, 1]) {
    // Flight deck wings.
    car.quad([8 * s, 1.4, -9], [22 * s, 1.4, 3], [22 * s, 1.4, 8], [8 * s, 1.4, 12], CAR_HULL, [0, 1, 0]);
    car.quad([8 * s, -1.2, 12], [22 * s, -1.2, 8], [22 * s, -1.2, 3], [8 * s, -1.2, -9], CAR_DARK, [0, -1, 0]);
    // Engine nacelles.
    for (const zz of [-2, 6]) {
      const ex = 13 * s;
      car.quad([ex - 2, 1.0, zz - 4], [ex + 2, 1.0, zz - 4], [ex + 2, 1.0, zz + 4], [ex - 2, 1.0, zz + 4], CAR_LIGHT, [0, 1, 0]);
      car.quad([ex - 2, -1.4, zz + 4], [ex + 2, -1.4, zz + 4], [ex + 2, -1.4, zz - 4], [ex - 2, -1.4, zz - 4], CAR_DARK, [0, -1, 0]);
      car.quad([ex - 2, 1.0, zz + 4], [ex + 2, 1.0, zz + 4], [ex + 2, -1.4, zz + 4], [ex - 2, -1.4, zz + 4], CAR_TRIM, [0, 0, 1]);
    }
    // Spine towers.
    car.quad([3 * s, 3.0, -12], [5 * s, 3.0, -12], [5 * s, 6.2, -8], [3 * s, 6.2, -8], CAR_LIGHT, [s, 0.4, 0]);
  }
  // Underside glow strip.
  car.quad([-3, -3.05, -16], [3, -3.05, -16], [3, -3.05, 12], [-3, -3.05, 12], CAR_TRIM, [0, -1, 0]);
})();
const carMesh = car.build();

/* ---------- tracers: dynamic line buffer ---------- */
const TRACER_MAX = 96;
const tracerData = new Float32Array(TRACER_MAX * 6);
const tracerVbo = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, tracerVbo);
gl.bufferData(gl.ARRAY_BUFFER, tracerData.byteLength, gl.DYNAMIC_DRAW);
const tracerVao = gl.createVertexArray();
gl.bindVertexArray(tracerVao);
gl.bindBuffer(gl.ARRAY_BUFFER, tracerVbo);
attr(0, 3);
gl.bindVertexArray(null);

/* ---------- pick the mesh for an enemy type ---------- */
function enemyMesh(type) {
  if (type === 'interceptor') return intcMesh;
  if (type === 'gunship') return gunMesh;
  if (type === 'carrier') return carMesh;
  return droneMesh;
}
