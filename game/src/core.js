/* DUSK PATROL — core.js
   Shared constants and small math: clamp/lerp, seeded RNG, value noise,
   vec3 and mat4 helpers, frustum tests, hex colours.
   Loaded as a classic script in order (see index.html); globals are shared. */
'use strict';

const W = 480, H = 270, WORLD = 6000, HALF = WORLD / 2;
const TAU = Math.PI * 2, DEG = Math.PI / 180;
const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const wrapAngle = a => { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; };
const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/* ---------- seeded rng ---------- */
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/* ---------- value noise ---------- */
function hash2(ix, iy) {
  let h = Math.imul(ix, 374761393) + Math.imul(iy, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function vnoise(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy), b = hash2(ix + 1, iy), c = hash2(ix, iy + 1), d = hash2(ix + 1, iy + 1);
  const ab = a + (b - a) * ux, cd = c + (d - c) * ux;
  return ab + (cd - ab) * uy;
}
function fbm(x, y, oct) {
  let a = 0, amp = 0.5, f = 1;
  for (let i = 0; i < (oct || 4); i++) { a += vnoise(x * f, y * f) * amp; f *= 2.02; amp *= 0.5; }
  return a;
}
function ridged(x, y) {
  let a = 0, amp = 0.55, f = 1;
  for (let i = 0; i < 4; i++) {
    const n = 1 - Math.abs(vnoise(x * f, y * f) * 2 - 1);
    a += n * n * amp; f *= 2.03; amp *= 0.5;
  }
  return clamp(a, 0, 1);
}

/* ---------- vec3 ---------- */
const vadd = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const vsub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const vmul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const vdot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const vcross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const vlen = a => Math.hypot(a[0], a[1], a[2]);
function vnorm(a) { const l = vlen(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
function vlerp(a, b, t) { return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]; }
function vdist(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); }

/* ---------- mat4 (column major) ---------- */
const m4 = () => new Float32Array(16);
function m4id(o) { o.fill(0); o[0] = o[5] = o[10] = o[15] = 1; return o; }
function m4mul(o, a, b) {
  for (let c = 0; c < 4; c++) {
    const b0 = b[c * 4], b1 = b[c * 4 + 1], b2 = b[c * 4 + 2], b3 = b[c * 4 + 3];
    o[c * 4] = a[0] * b0 + a[4] * b1 + a[8] * b2 + a[12] * b3;
    o[c * 4 + 1] = a[1] * b0 + a[5] * b1 + a[9] * b2 + a[13] * b3;
    o[c * 4 + 2] = a[2] * b0 + a[6] * b1 + a[10] * b2 + a[14] * b3;
    o[c * 4 + 3] = a[3] * b0 + a[7] * b1 + a[11] * b2 + a[15] * b3;
  }
  return o;
}
function m4persp(o, fovy, aspect, near, far) {
  const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
  o.fill(0); o[0] = f / aspect; o[5] = f; o[10] = (far + near) * nf; o[11] = -1; o[14] = 2 * far * near * nf;
  return o;
}
function m4look(o, eye, center, up) {
  const z = vnorm(vsub(eye, center));
  let x = vcross(up, z); if (vlen(x) < 1e-6) x = [1, 0, 0]; x = vnorm(x);
  const y = vcross(z, x);
  o[0] = x[0]; o[1] = y[0]; o[2] = z[0]; o[3] = 0;
  o[4] = x[1]; o[5] = y[1]; o[6] = z[1]; o[7] = 0;
  o[8] = x[2]; o[9] = y[2]; o[10] = z[2]; o[11] = 0;
  o[12] = -vdot(x, eye); o[13] = -vdot(y, eye); o[14] = -vdot(z, eye); o[15] = 1;
  return o;
}
function m4rotY(o, a) { const c = Math.cos(a), s = Math.sin(a); m4id(o); o[0] = c; o[2] = -s; o[8] = s; o[10] = c; return o; }
function m4rotX(o, a) { const c = Math.cos(a), s = Math.sin(a); m4id(o); o[5] = c; o[6] = s; o[9] = -s; o[10] = c; return o; }
function m4rotZ(o, a) { const c = Math.cos(a), s = Math.sin(a); m4id(o); o[0] = c; o[1] = s; o[4] = -s; o[5] = c; return o; }
const _mA = m4(), _mB = m4(), _mC = m4(), _mD = m4();
function planeMatrix(o, p, yaw, pitch, roll) {
  m4rotY(_mA, yaw); m4rotX(_mB, pitch); m4rotZ(_mC, roll);
  m4mul(_mD, _mA, _mB); m4mul(_mA, _mD, _mC);
  m4id(o); o.set(_mA);
  o[12] = p[0]; o[13] = p[1]; o[14] = p[2];
  return o;
}
function projPoint(vp, p) {
  const x = p[0], y = p[1], z = p[2];
  const cx = vp[0] * x + vp[4] * y + vp[8] * z + vp[12];
  const cy = vp[1] * x + vp[5] * y + vp[9] * z + vp[13];
  const cw = vp[3] * x + vp[7] * y + vp[11] * z + vp[15];
  if (cw <= 0.001) return null;
  return [(cx / cw * 0.5 + 0.5) * W, (1 - (cy / cw * 0.5 + 0.5)) * H, cw];
}

/* ---------- frustum culling ---------- */
const frustumPlanes = new Float32Array(24);
function setFrustumPlane(i, a, b, c, d) {
  const l = Math.hypot(a, b, c) || 1, o = i * 4;
  frustumPlanes[o] = a / l; frustumPlanes[o + 1] = b / l;
  frustumPlanes[o + 2] = c / l; frustumPlanes[o + 3] = d / l;
}
function updateFrustum(m) {
  setFrustumPlane(0, m[3] + m[0], m[7] + m[4], m[11] + m[8], m[15] + m[12]);
  setFrustumPlane(1, m[3] - m[0], m[7] - m[4], m[11] - m[8], m[15] - m[12]);
  setFrustumPlane(2, m[3] + m[1], m[7] + m[5], m[11] + m[9], m[15] + m[13]);
  setFrustumPlane(3, m[3] - m[1], m[7] - m[5], m[11] - m[9], m[15] - m[13]);
  setFrustumPlane(4, m[3] + m[2], m[7] + m[6], m[11] + m[10], m[15] + m[14]);
  setFrustumPlane(5, m[3] - m[2], m[7] - m[6], m[11] - m[10], m[15] - m[14]);
}
function boxInFrustum(min, max) {
  for (let i = 0; i < 6; i++) {
    const o = i * 4, a = frustumPlanes[o], b = frustumPlanes[o + 1], c = frustumPlanes[o + 2], d = frustumPlanes[o + 3];
    const x = a >= 0 ? max[0] : min[0], y = b >= 0 ? max[1] : min[1], z = c >= 0 ? max[2] : min[2];
    if (a * x + b * y + c * z + d < 0) return false;
  }
  return true;
}
// Conservative sphere test: the radius keeps partially visible quads from popping.
function sphereInFrustum(x, y, z, r) {
  for (let i = 0; i < 6; i++) {
    const o = i * 4;
    if (frustumPlanes[o] * x + frustumPlanes[o + 1] * y + frustumPlanes[o + 2] * z + frustumPlanes[o + 3] < -r) return false;
  }
  return true;
}

/* ---------- color ---------- */
function rgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
}
