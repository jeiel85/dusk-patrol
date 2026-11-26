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
  // Broad shoulders: the shelf has to fade into the hills without a terraced cliff.
  const mx = smoothstep(60, 160, d) * (1 - smoothstep(430, 720, d));
  const mz = 1 - smoothstep(380, 700, Math.abs(z + 520));
  return Math.min(mx, mz);
}
function terrainHeight(x, z) {
  const shore = coastX(z);
  const d = x - shore;
  let h;
  if (d < -140) h = -9 - Math.min(42, (-d - 140) * 0.018);
  else if (d < 0) {
    h = -9 * (1 - (d + 140) / 140);
  } else {
    h = smoothstep(0, 140, d) * 15;
    const inland = smoothstep(90, 950, d);
    h += (fbm(x * 0.00125 + 9.1, z * 0.00125 - 3.4, 4) - 0.5) * 52 * inland;
    h += Math.max(0, fbm(x * 0.00072 + 2.2, z * 0.00072 + 8.5, 4) - 0.40) * 240 * inland;
  }
  // Western headland across the bay: frames the seaward horizon.
  const ix = coastX(-500) - 1650, iz = -500;
  const iq = Math.hypot((x - ix) / 880, (z - iz) / 820);
  if (iq < 1) {
    const isl = Math.pow(1 - iq, 1.5) * 280 - 14;
    const rough = (fbm(x * 0.0042 + 6.1, z * 0.0042 - 9.3, 3) - 0.5) * 70 * (1 - iq);
    h = Math.max(h, isl + rough);
  }
  const north = smoothstep(-700, -2400, z);
  const east = smoothstep(900, 2400, d);
  const mm = Math.max(north * 0.95, east * 0.8) * smoothstep(60, 520, d);
  if (mm > 0.001) h += mm * (80 + ridged(x * 0.00068 + 4.4, z * 0.00068 - 2.1) * 520);
  // Sentinel headland: one broad peak anchors the northern coast on the horizon.
  const px = coastX(-700) + 1250, pz = -700;
  const pd = Math.hypot((x - px) * 0.75, z - pz) / 1050;
  if (pd < 1) h += Math.pow(1 - pd, 1.7) * 520;
  const city = cityMask(x, z);
  return h * (1 - city) + 11 * city;
}

const PAL = {
  wet: rgb('#cbb083'), sand: rgb('#efd9ab'), sand2: rgb('#e4c797'),
  pale: rgb('#d8cf87'), olive: rgb('#98a344'), green: rgb('#6d8340'), ochre: rgb('#dca048'),
  amber: rgb('#c47a38'), rust: rgb('#bb5335'), red: rgb('#9c3338'),
  forest: rgb('#4f6334'),
  plum: rgb('#74475f'), rock: rgb('#8a6878'), rock2: rgb('#5f4a68'),
  snow: rgb('#f1e4e7'), asphalt: rgb('#5d566c'),
  seaDeep: rgb('#0f6f9c'), seaShallow: rgb('#7fe0d4'), seaWarm: rgb('#f0b894'),
  fog: rgb('#e0a87f'), sun: [1.0, 0.80, 0.55], skyAmb: [0.60, 0.55, 0.74]
};
const CITY_WALLS = [rgb('#9a9099'), rgb('#a79a92'), rgb('#8d8892'), rgb('#b1a297'), rgb('#968d90')];

const mixRGB = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

function terrainColor(x, z, h, slope) {
  const fine = fbm(x * 0.011, z * 0.011, 2);
  const patch = fbm(x * 0.0040 + 4.2, z * 0.0040 - 8.1, 3);
  const patch2 = fbm(x * 0.0019 - 12.0, z * 0.0019 + 3.4, 3);
  const patch3 = fbm(x * 0.0085 - 3.3, z * 0.0085 + 11.7, 2);
  // Sand only hugs the actual shore; inland low ground stays field-coloured
  // so the city shelf does not read as a beach running through the hills.
  const shore = coastX(z);
  const beach = 1 - smoothstep(50, 200, x - shore);
  let c;
  if (h < 1.4) c = mixRGB(PAL.wet, PAL.olive, (1 - beach) * 0.8);
  else if (h < 6.5) c = mixRGB(mixRGB(PAL.sand, PAL.sand2, fine), mixRGB(PAL.pale, PAL.olive, patch), 1 - beach);
  else {
    // Warm autumn patchwork: pale grass, olive, ochre and rust fields.
    c = mixRGB(PAL.pale, PAL.olive, smoothstep(0.28, 0.52, patch));
    c = mixRGB(c, PAL.green, (1 - smoothstep(0.40, 0.58, patch3)) * 0.35);
    c = mixRGB(c, PAL.forest, smoothstep(30, 110, h) * (1 - smoothstep(0.42, 0.58, patch3)) * 0.42);
    c = mixRGB(c, PAL.ochre, smoothstep(0.36, 0.60, patch2) * 0.92);
    c = mixRGB(c, PAL.rust, smoothstep(0.48, 0.68, patch2) * 0.90);
    c = mixRGB(c, PAL.red, smoothstep(0.58, 0.80, patch * 0.5 + patch2 * 0.62) * 0.62);
    c = mixRGB(c, PAL.rust, smoothstep(0.56, 0.80, patch3) * 0.50);
    // Ridges cool into plum and violet rock, with snow on the highest shoulders.
    c = mixRGB(c, PAL.plum, smoothstep(90, 250, h) * 0.55);
    c = mixRGB(c, PAL.rock, smoothstep(190, 340, h));
    c = mixRGB(c, PAL.rock2, smoothstep(300, 470, h) * 0.8);
    if (h > 260) c = mixRGB(c, PAL.snow, smoothstep(290, 470, h) * (1 - clamp(slope, 0, 1) * 0.45));
  }
  if (slope > 0.62 && h > 16 && h < 300) c = mixRGB(c, PAL.rock2, smoothstep(0.62, 0.92, slope) * 0.7);
  if (cityMask(x, z) > 0.5 && h < 16) c = mixRGB(c, PAL.asphalt, 0.35);
  const v = 0.90 + fine * 0.20;
  return [c[0] * v, c[1] * v, c[2] * v];
}

/* city buildings */
const buildings = [];
(function generateCity() {
  const r = mulberry32(44117);
  for (let z = -860; z <= -260; z += 36) {
    const shore = coastX(z);
    for (let d = 150; d <= 410; d += 34) {
      if (r() < 0.46) continue;
      const w = 15 + r() * 13;
      const dp = 12 + r() * 11;
      let hgt = 5 + Math.pow(r(), 2.4) * 14;
      if (r() < 0.02) hgt += 10 + r() * 20;
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
  for (let z = -880; z <= -220; z += 40) {
    const shore = coastX(z);
    for (let d = 160; d <= 420; d += 56) {
      if (r() < 0.42) continue;
      streetLights.push([shore + d + 13 + r() * 4, 15.5, z + 13 + r() * 4]);
    }
  }
})();

/* clouds */
const cloudDefs = [];
(function generateClouds() {
  const r = mulberry32(31007);
  // High fair-weather cumulus. Cards stay small: a cumulus is a cluster of
  // puffs, and oversized billboards read as pale walls whenever the camera nears.
  for (let i = 0; i < 34; i++) {
    cloudDefs.push({
      x: (r() * 2 - 1) * 3000, y: 430 + r() * 340, z: (r() * 2 - 1) * 3000,
      sx: 90 + r() * 170, sy: 55 + r() * 75, tex: (r() * 4) | 0, drift: r() * TAU
    });
  }
  // Small mid puffs floating over the headlands, bottoms above the ridgelines.
  for (let i = 0; i < 16; i++) {
    const z = (r() * 2 - 1) * 2800;
    cloudDefs.push({
      x: coastX(z) - 1000 + r() * 2200, y: 330 + r() * 120, z,
      sx: 60 + r() * 90, sy: 40 + r() * 45, tex: (r() * 4) | 0, drift: r() * TAU
    });
  }
  // A far bank behind the northern mountains, like a weather front on the horizon.
  for (let i = 0; i < 8; i++) {
    const z = -2300 - r() * 600;
    cloudDefs.push({
      x: -1600 + r() * 3200, y: 360 + r() * 90, z,
      sx: 160 + r() * 160, sy: 90 + r() * 70, tex: (r() * 4) | 0, drift: r() * TAU
    });
  }
  for (const c of cloudDefs) c.tintY = 0.86 + Math.sin(c.drift) * 0.04;
})();

/* Scrub and tree specks: the cheapest, strongest scale cue on the headlands. */
const treePoints = [];
(function generateTrees() {
  const r = mulberry32(77003);
  let guard = 0;
  while (treePoints.length < 6000 && guard++ < 180000) {
    const x = (r() * 2 - 1) * 2900;
    const z = (r() * 2 - 1) * 2900;
    const h = terrainHeight(x, z);
    if (h < 12 || h > 300) continue;
    if (cityMask(x, z) > 0.2) continue;
    const grove = fbm(x * 0.0062 + 5.5, z * 0.0062 - 2.7, 3);
    if (r() > grove * grove * 3.4) continue;
    // Two or three specks per clump reads as woodland instead of scattered pepper.
    treePoints.push([x, h + 2.4, z, r()]);
    const extra = 1 + ((r() * 2) | 0);
    for (let k = 0; k < extra && treePoints.length < 6000; k++) {
      const tx = x + (r() - 0.5) * 11, tz = z + (r() - 0.5) * 11;
      const th = terrainHeight(tx, tz);
      if (th < 10 || th > 300) continue;
      treePoints.push([tx, th + 2.2, tz, r()]);
    }
  }
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
