/* DUSK PATROL — gl.js
   WebGL2 context and helpers (programs, buffers, attributes, textures),
   the low-res scene framebuffer and the terrain height texture.
   Loaded as a classic script in order (see index.html); globals are shared. */
'use strict';

const glCanvas = document.getElementById('gl');
const hudCanvas = document.getElementById('hud');
const gl = glCanvas.getContext('webgl2', { antialias: false, alpha: false, depth: true, powerPreference: 'high-performance' });
const hud = hudCanvas.getContext('2d');
const errBox = document.getElementById('error');
function showError(msg) {
  console.error(msg);
  errBox.textContent += msg + ' | ';
}
if (!gl) showError('WebGL2 is not available in this browser.');
hud.imageSmoothingEnabled = false;

const uniCache = new Map();
function U(p, n) {
  let m = uniCache.get(p);
  if (!m) { m = {}; uniCache.set(p, m); }
  if (!(n in m)) m[n] = gl.getUniformLocation(p, n);
  return m[n];
}
function compile(type, src, name) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    showError('SHADER ' + name + ': ' + gl.getShaderInfoLog(s));
    return null;
  }
  return s;
}
function makeProg(vsSrc, fsSrc, name) {
  const v = compile(gl.VERTEX_SHADER, vsSrc, name + '.vs');
  const f = compile(gl.FRAGMENT_SHADER, fsSrc, name + '.fs');
  if (!v || !f) return null;
  const p = gl.createProgram();
  gl.attachShader(p, v); gl.attachShader(p, f); gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    showError('LINK ' + name + ': ' + gl.getProgramInfoLog(p));
    return null;
  }
  return p;
}
function buf(data, usage) {
  const b = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, b);
  gl.bufferData(gl.ARRAY_BUFFER, data, usage || gl.STATIC_DRAW);
  return b;
}
// Float vertex attribute on the currently bound ARRAY_BUFFER.
function attr(loc, size, stride, offset, divisor) {
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride || 0, offset || 0);
  if (divisor) gl.vertexAttribDivisor(loc, divisor);
}
// Creates and binds a clamped 2D texture; the caller uploads the pixels.
function makeTex(filter) {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return t;
}
// White sprite whose alpha comes from alphaAt(x, y) in 0..1.
function spriteTex(S, alphaAt) {
  const c = document.createElement('canvas'); c.width = c.height = S;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(S, S), d = img.data;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = (y * S + x) * 4;
    d[i] = d[i + 1] = d[i + 2] = 255; d[i + 3] = clamp(alphaAt(x, y), 0, 1) * 255;
  }
  ctx.putImageData(img, 0, 0);
  const t = makeTex(gl.NEAREST);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, c);
  return t;
}
const FS_TRI = new Float32Array([-1, -1, 3, -1, -1, 3]);

const sceneTex = makeTex(gl.NEAREST);
gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, W, H, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
const depthRb = gl.createRenderbuffer();
gl.bindRenderbuffer(gl.RENDERBUFFER, depthRb);
gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, W, H);
const sceneFbo = gl.createFramebuffer();
gl.bindFramebuffer(gl.FRAMEBUFFER, sceneFbo);
gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, sceneTex, 0);
gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depthRb);
if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) showError('Scene framebuffer incomplete');
gl.bindFramebuffer(gl.FRAMEBUFFER, null);

const heightTex = makeTex(gl.LINEAR);
gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, 512, 512, 0, gl.RED, gl.UNSIGNED_BYTE, buildHeightData(512));
