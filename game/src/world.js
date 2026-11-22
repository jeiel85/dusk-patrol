/* DUSK PATROL — world.js
   The procedural world as data: coastline, terrain height and colour,
   city blocks, street lights, cloud layout and drone home points.
   Loaded as a classic script in order (see index.html); globals are shared. */
'use strict';

function coastX(z) {
  return 20
    + (vnoise(z * 0.00075 + 3.7, 11.2) - 0.5) * 540
    + (vnoise(z * 0.0021 - 5.1, 2.3) - 0.5) * 120
    + Math.sin(z * 0.0009 + 1.2) * 70;
}
function cityMask(x, z) {
  const d = x - coastX(z);
  const mx = smoothstep(70, 150, d) * (1 - smoothstep(650, 790, d));
  const mz = 1 - smoothstep(700, 870, Math.abs(z - 40));
  return Math.min(mx, mz);
}
function terrainHeight(x, z) {
  const shore = coastX(z);
  const d = x - shore;
  if (d < -140) return -9 - Math.min(42, (-d - 140) * 0.018);
  let h;
  if (d < 0) {
    h = -9 * (1 - (d + 140) / 140);
  } else {
    h = smoothstep(0, 170, d) * 17;
    const inland = smoothstep(220, 1900, d);
    h += (fbm(x * 0.00125 + 9.1, z * 0.00125 - 3.4, 4) - 0.5) * 30 * inland;
    h += Math.max(0, fbm(x * 0.00072 + 2.2, z * 0.00072 + 8.5, 4) - 0.44) * 170 * inland;
  }
  const north = smoothstep(-1000, -2700, z);
  const east = smoothstep(1100, 2700, d);
  const mm = Math.max(north * 0.95, east * 0.8) * smoothstep(60, 520, d);
  if (mm > 0.001) h += mm * (70 + ridged(x * 0.00068 + 4.4, z * 0.00068 - 2.1) * 430);
  const city = cityMask(x, z);
  return h * (1 - city) + 11 * city;
}

const PAL = {
  wet: rgb('#ab8660'), sand: rgb('#d8b184'), grass: rgb('#6d7847'), grass2: rgb('#92713e'),
  rock: rgb('#5b4c60'), rock2: rgb('#3d3349'), snow: rgb('#d5c9de'), asphalt: rgb('#363542'),
  seaDeep: rgb('#0a4a60'), seaShallow: rgb('#4fc6ba'), seaWarm: rgb('#e7a184'),
  fog: rgb('#d19173'), sun: [1.0, 0.78, 0.5], skyAmb: [0.42, 0.4, 0.62]
};
const CITY_WALLS = [rgb('#394059'), rgb('#454b68'), rgb('#2d3349'), rgb('#4b4664'), rgb('#3f3a52')];

function terrainColor(x, z, h, slope) {
  const n = fbm(x * 0.012, z * 0.012, 2);
  let c;
  if (h < 1.2) c = PAL.wet;
  else if (h < 6.5) c = PAL.sand;
  else if (h < 70 + n * 28) c = n > 0.56 ? PAL.grass2 : PAL.grass;
  else if (h < 190 + n * 40) c = PAL.rock;
  else if (h < 330) c = PAL.rock2;
  else c = PAL.snow;
  if (slope > 0.62 && h > 8) c = PAL.rock;
  if (h > 270 && slope < 0.38) c = PAL.snow;
  if (cityMask(x, z) > 0.5 && h < 16) c = PAL.asphalt;
  const v = 0.9 + n * 0.18;
  return [c[0] * v, c[1] * v, c[2] * v];
}

/* city buildings */
const buildings = [];
(function generateCity() {
  const r = mulberry32(44117);
  for (let z = -760; z <= 830; z += 30) {
    const shore = coastX(z);
    for (let d = 120; d <= 690; d += 28) {
      if (r() < 0.17) continue;
      const w = 12 + r() * 14;
      const dp = 10 + r() * 12;
      let hgt = 9 + Math.pow(r(), 2.1) * 52;
      if (r() < 0.055) hgt += 60 + r() * 80;
      buildings.push({
        x: shore + d + (r() - 0.5) * 9,
        z: z + (r() - 0.5) * 6,
        w, d: dp, h: hgt, seed: r() * 1000,
        wall: CITY_WALLS[(r() * CITY_WALLS.length) | 0]
      });
    }
  }
})();

/* street lights along the roads */
const streetLights = [];
(function generateLights() {
  const r = mulberry32(991);
  for (let z = -740; z <= 820; z += 34) {
    const shore = coastX(z);
    for (let d = 130; d <= 690; d += 46) {
      if (r() < 0.28) continue;
      streetLights.push([shore + d + 13 + r() * 4, 15.5, z + 13 + r() * 4]);
    }
  }
})();

/* clouds */
const cloudDefs = [];
(function generateClouds() {
  const r = mulberry32(31007);
  for (let i = 0; i < 56; i++) {
    cloudDefs.push({
      x: (r() * 2 - 1) * 2800, y: 280 + r() * 430, z: (r() * 2 - 1) * 2800,
      sx: 130 + r() * 270, sy: 55 + r() * 105, tex: (r() * 4) | 0, drift: r() * TAU
    });
  }
  for (let i = 0; i < 16; i++) {
    const z = (r() * 2 - 1) * 2200;
    cloudDefs.push({
      x: coastX(z) - 900 + r() * 1800, y: 95 + r() * 90, z,
      sx: 90 + r() * 160, sy: 35 + r() * 50, tex: (r() * 4) | 0, drift: r() * TAU
    });
  }
  for (const c of cloudDefs) c.tintY = 0.80 + Math.sin(c.drift) * 0.04;
})();

function droneHome(i) {
  const r = mulberry32(9001 + i * 733);
  const z = -380 + r() * 1420;
  const x = coastX(z) - 140 - r() * 700;
  return [x, 110 + r() * 150, z];
}

// Height texture encoding shared with the water shader: tex = (h + BIAS) / RANGE.
const HGT_BIAS = 60, HGT_RANGE = 720;
function buildHeightData(size) {
  const data = new Uint8Array(size * size);
  for (let j = 0; j < size; j++) {
    const z = -HALF + (j + 0.5) / size * WORLD;
    for (let i = 0; i < size; i++) {
      const x = -HALF + (i + 0.5) / size * WORLD;
      data[j * size + i] = clamp((terrainHeight(x, z) + HGT_BIAS) / HGT_RANGE, 0, 1) * 255;
    }
  }
  return data;
}
