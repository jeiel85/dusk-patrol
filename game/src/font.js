/* DUSK PATROL — font.js
   A hand-drawn 5x7 bitmap font baked into per-colour atlases at run time,
   plus the HUD text helpers. No canvas font is involved, so every glyph
   stays crisp at integer scales and never smears at small sizes.
   Loaded as a classic script in order (see index.html); globals are shared. */
'use strict';

const COL = { bone: '#f2e6d0', amber: '#ffb45c', red: '#ff5a5f', dim: '#8f84a2', dark: '#1a1524', white: '#ffffff' };

const GLYPH_W = 5, GLYPH_H = 7, GLYPH_ADV = 6;

const GLYPHS = {
  ' ': ['.....', '.....', '.....', '.....', '.....', '.....', '.....'],
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  C: ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'],
  D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
  G: ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.###.'],
  H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  I: ['.###.', '..#..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  J: ['..###', '...#.', '...#.', '...#.', '...#.', '#..#.', '.##..'],
  K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
  N: ['#...#', '##..#', '#.#.#', '#.#.#', '#..##', '#...#', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  Q: ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  V: ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  W: ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '##.##', '#...#'],
  X: ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
  Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
  Z: ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],
  0: ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
  1: ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  2: ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
  3: ['####.', '....#', '....#', '.###.', '....#', '....#', '####.'],
  4: ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
  5: ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  6: ['..##.', '.#...', '#....', '####.', '#...#', '#...#', '.###.'],
  7: ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
  8: ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  9: ['.###.', '#...#', '#...#', '.####', '....#', '...#.', '.##..'],
  '.': ['.....', '.....', '.....', '.....', '.....', '.##..', '.##..'],
  ',': ['.....', '.....', '.....', '.....', '.##..', '.##..', '.#...'],
  ':': ['.....', '.##..', '.##..', '.....', '.##..', '.##..', '.....'],
  ';': ['.....', '.##..', '.##..', '.....', '.##..', '.##..', '.#...'],
  '!': ['..#..', '..#..', '..#..', '..#..', '..#..', '.....', '..#..'],
  '?': ['.###.', '#...#', '....#', '...#.', '..#..', '.....', '..#..'],
  '/': ['....#', '...#.', '...#.', '..#..', '.#...', '.#...', '#....'],
  '+': ['.....', '..#..', '..#..', '#####', '..#..', '..#..', '.....'],
  '-': ['.....', '.....', '.....', '#####', '.....', '.....', '.....'],
  '=': ['.....', '.....', '#####', '.....', '#####', '.....', '.....'],
  '%': ['##..#', '##..#', '...#.', '..#..', '.#...', '#..##', '#..##'],
  '(': ['...#.', '..#..', '.#...', '.#...', '.#...', '..#..', '...#.'],
  ')': ['.#...', '..#..', '...#.', '...#.', '...#.', '..#..', '.#...'],
  '[': ['.###.', '.#...', '.#...', '.#...', '.#...', '.#...', '.###.'],
  ']': ['.###.', '...#.', '...#.', '...#.', '...#.', '...#.', '.###.'],
  '<': ['...#.', '..#..', '.#...', '#....', '.#...', '..#..', '...#.'],
  '>': ['.#...', '..#..', '...#.', '....#', '...#.', '..#..', '.#...'],
  '*': ['.....', '#.#.#', '.###.', '#####', '.###.', '#.#.#', '.....'],
  '\u00b7': ['.....', '.....', '.....', '..#..', '.....', '.....', '.....']
};

const CHARSET = Object.keys(GLYPHS);
const ATLAS = {};

// Bake every glyph into one strip for a given colour. 1px padding between
// glyphs keeps nearest-neighbour scaling from bleeding neighbours together.
function buildAtlas(color) {
  const pad = 1;
  let x = 0;
  const map = {};
  for (const ch of CHARSET) { map[ch] = { x, w: GLYPH_W }; x += GLYPH_W + pad; }
  const c = document.createElement('canvas');
  c.width = Math.max(1, x); c.height = GLYPH_H;
  const ctx = c.getContext('2d');
  ctx.fillStyle = color;
  for (const ch of CHARSET) {
    const g = GLYPHS[ch], ox = map[ch].x;
    for (let row = 0; row < GLYPH_H; row++) {
      const line = g[row];
      for (let col = 0; col < GLYPH_W; col++) {
        if (line[col] === '#') ctx.fillRect(ox + col, row, 1, 1);
      }
    }
  }
  return { c, map, h: GLYPH_H, adv: GLYPH_ADV };
}
function atlas(color) { if (!ATLAS[color]) ATLAS[color] = buildAtlas(color); return ATLAS[color]; }

function textWidth(str, scale, spacing) {
  const a = atlas(COL.bone);
  scale = scale || 1; spacing = spacing || 0;
  const chars = (str + '').toUpperCase();
  if (!chars.length) return 0;
  let w = 0;
  for (const ch of chars) w += (a.adv + spacing) * scale;
  return w - (spacing ? 0 : scale); // trailing gap is not part of the drawn width
}

function drawText(str, x, y, color, scale, spacing) {
  const a = atlas(color);
  scale = scale || 1; spacing = spacing || 0;
  const chars = (str + '').toUpperCase();
  let px = x | 0;
  const py = y | 0;
  const step = (a.adv + spacing) * scale;
  for (const ch of chars) {
    const m = a.map[ch] || a.map[' '];
    hud.drawImage(a.c, m.x, 0, m.w, a.h, px, py, m.w * scale, a.h * scale);
    px += step;
  }
  return px;
}
function drawTextSh(str, x, y, color, scale, spacing) {
  drawText(str, x + 1, y + 1, COL.dark, scale, spacing);
  drawText(str, x, y, color, scale, spacing);
}
function drawTextC(str, cx, y, color, scale, spacing) {
  const w = textWidth(str, scale, spacing);
  drawTextSh(str, Math.round(cx - w / 2), y, color, scale, spacing);
}
function drawTextR(str, rx, y, color, scale, spacing) {
  const w = textWidth(str, scale, spacing);
  drawTextSh(str, Math.round(rx - w), y, color, scale, spacing);
}
