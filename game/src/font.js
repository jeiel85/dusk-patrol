/* DUSK PATROL — font.js
   1-bit pixel font baked at run time and the HUD text helpers.
   Loaded as a classic script in order (see index.html); globals are shared. */
'use strict';

const CHARSET = ' ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.,:;!?/+-%()[]<>';
const COL = { bone: '#f2e6d0', amber: '#ffb45c', red: '#ff5a5f', dim: '#8f84a2', dark: '#1a1524', white: '#ffffff' };
const ATLAS = {};
function buildAtlas(color) {
  const SH = 12;
  const c = document.createElement('canvas');
  c.width = 760; c.height = SH;
  const x = c.getContext('2d');
  x.font = 'bold 10px "Courier New", monospace';
  x.textBaseline = 'top';
  x.fillStyle = '#fff';
  let px = 1;
  const map = {};
  for (const ch of CHARSET) {
    const w = Math.max(1, Math.ceil(x.measureText(ch).width));
    x.fillText(ch, px, 0);
    map[ch] = { x: px, w };
    px += w + 1;
  }
  const img = x.getImageData(0, 0, c.width, SH), d = img.data;
  const col = rgb(color);
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] > 64) {
      d[i] = col[0] * 255; d[i + 1] = col[1] * 255; d[i + 2] = col[2] * 255; d[i + 3] = 255;
    } else d[i + 3] = 0;
  }
  x.putImageData(img, 0, 0);
  return { c, map, h: SH };
}
function atlas(color) { if (!ATLAS[color]) ATLAS[color] = buildAtlas(color); return ATLAS[color]; }
function textWidth(str, scale, spacing) {
  const a = atlas(COL.bone);
  let w = 0;
  for (const ch of (str + '').toUpperCase()) { const m = a.map[ch] || a.map[' ']; w += (m.w + (spacing || 0)) * (scale || 1); }
  return w;
}
function drawText(str, x, y, color, scale, spacing) {
  const a = atlas(color);
  scale = scale || 1; spacing = spacing || 0;
  str = (str + '').toUpperCase();
  let px = x | 0;
  const py = y | 0;
  for (const ch of str) {
    const m = a.map[ch] || a.map[' '];
    hud.drawImage(a.c, m.x, 0, m.w, a.h, px, py, m.w * scale, a.h * scale);
    px += (m.w + spacing) * scale;
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
