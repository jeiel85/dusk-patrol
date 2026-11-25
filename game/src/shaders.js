/* DUSK PATROL — shaders.js
   GLSL sources for every pass and the compiled programs, plus the shared
   sun direction and fog constants.
   Loaded as a classic script in order (see index.html); globals are shared. */
'use strict';

// Fullscreen-triangle vertex shader shared by the sky and post passes.
const FS_VS = `#version 300 es
layout(location=0) in vec2 aPos;
out vec2 vUV;
void main(){ vUV = aPos*0.5+0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`;

const SKY_FS = `#version 300 es
precision highp float;
in vec2 vUV;
out vec4 outColor;
uniform vec3 uRight, uUp, uFwd, uSun;
uniform float uTanFov, uAspect, uTime;

float h21(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
float noise(vec2 p){
  vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  float a=h21(i), b=h21(i+vec2(1,0)), c=h21(i+vec2(0,1)), d=h21(i+vec2(1,1));
  return mix(mix(a,b,f.x), mix(c,d,f.x), f.y);
}
void main(){
  vec2 p = vUV*2.0-1.0;
  vec3 dir = normalize(uFwd + uRight*p.x*uTanFov*uAspect + uUp*p.y*uTanFov);
  float y = dir.y;
  float t = clamp(y, 0.0, 1.0);
  // Pastel dusk: lilac zenith -> dusty rose -> warm cream horizon.
  vec3 zenith = vec3(0.42,0.36,0.58);
  vec3 mid    = vec3(0.80,0.62,0.71);
  vec3 horizon= vec3(1.00,0.86,0.70);
  vec3 col = mix(horizon, mid, smoothstep(0.0,0.34,t));
  col = mix(col, zenith, smoothstep(0.28,0.98,t));
  col = mix(col, vec3(1.00,0.79,0.62), exp(-max(y,0.0)*13.0)*0.30);

  float sd = max(dot(dir,uSun),0.0);
  vec3 sunCol = vec3(1.0,0.88,0.62);
  col += sunCol * pow(sd, 16.0) * 0.09;
  col += sunCol * pow(sd, 140.0) * 0.22;
  float disc = smoothstep(0.99870, 0.99920, sd);
  vec3 discCol = vec3(1.0,0.95,0.74);
  col = mix(col, discCol, disc);
  col = mix(col, vec3(1.0,0.99,0.92), disc * smoothstep(0.9993,0.9998,sd));

  // Thin horizontal cloud streaks, softly dithered at the edges.
  vec2 cuv = dir.xz / max(dir.y+0.08, 0.02);
  float cl = noise(cuv*vec2(0.40,2.3) + vec2(uTime*0.003,0.0));
  float band = smoothstep(0.56,0.76,cl) * smoothstep(0.02,0.10,y) * (1.0-smoothstep(0.30,0.60,y));
  vec3 cloudCol = mix(vec3(0.94,0.72,0.76), vec3(1.0,0.88,0.76), pow(sd,2.0));
  col = mix(col, cloudCol, band*0.38);

  col = mix(vec3(0.19,0.15,0.26), col, smoothstep(-0.10, 0.0, y));
  outColor = vec4(col, 1.0);
}`;

const WATER_VS = `#version 300 es
layout(location=0) in vec2 aPos;
uniform mat4 uVP;
out vec3 vW;
void main(){ vW = vec3(aPos.x, 0.0, aPos.y); gl_Position = uVP*vec4(vW,1.0); }`;

const WATER_FS = `#version 300 es
precision highp float;
in vec3 vW;
out vec4 outColor;
uniform sampler2D uHeight;
uniform vec3 uCam, uSun, uFogColor;
uniform float uTime;

void main(){
  vec2 uv = vW.xz/6000.0+0.5;
  float inside = step(0.0,uv.x)*step(uv.x,1.0)*step(0.0,uv.y)*step(uv.y,1.0);
  // Terrain height, decoded from the biased 8-bit texture: -60 .. +660.
  // Outside the map there is open ocean, so treat it as deep water.
  float h = (texture(uHeight, clamp(uv,0.001,0.999)).r*720.0-60.0);
  float depth = inside > 0.5 ? max(-h, 0.0) : 60.0;

  vec3 deep = vec3(0.05,0.21,0.42);
  vec3 shallow = vec3(0.25,0.60,0.66);
  vec3 col = mix(shallow, deep, smoothstep(1.0, 35.0, depth));
  col = mix(col, vec3(0.15,0.31,0.50), smoothstep(30.0, 120.0, depth)*0.60);

  // Low swells only: high-frequency ripples alias into hard rays at this resolution.
  vec2 q = vW.xz*0.020;
  float t = uTime;
  float e = sin(q.x*5.0 + t*1.1)*0.004 + sin(q.y*6.3 - t*0.8)*0.0035 + sin((q.x+q.y)*3.4 + t*0.6)*0.003;
  vec3 n = normalize(vec3(e, 1.0, e*0.65));
  vec3 V = normalize(uCam - vW);
  vec3 H = normalize(uSun + V);

  float fres = pow(1.0-max(dot(n,V),0.0), 3.0);
  col = mix(col, vec3(0.84,0.66,0.74), fres*0.26 * smoothstep(0.05,0.35,1.0-V.y));

  float spec = pow(max(dot(n,H),0.0), 120.0);
  col += vec3(1.0,0.84,0.62) * spec * 0.14 * smoothstep(0.04,0.30,1.0-V.y);

  // Broad sun path: a wide warm shimmer instead of uniform sparkle noise.
  vec3 flatV = normalize(vec3(uCam.x - vW.x, 0.0, uCam.z - vW.z));
  float path = pow(max(dot(flatV, normalize(vec3(uSun.x, 0.0, uSun.z))), 0.0), 7.0);
  col += vec3(1.0, 0.82, 0.60) * path * 0.06 * smoothstep(0.04,0.30,1.0-V.y);

  // Dual-band animated coastal surf foam.
  float foamInner = 1.0 - smoothstep(0.3, 4.5, depth);
  float foamWave = sin(depth * 1.15 - t * 2.4 + q.x * 1.5) * 0.5 + 0.5;
  float foamOuter = (1.0 - smoothstep(2.0, 14.0, depth)) * smoothstep(0.64, 0.92, foamWave);
  float fnoise = 0.5+0.5*sin(q.x*4.0+q.y*3.0+t*1.3);
  float foam = clamp(foamInner * (0.22 + fnoise * 0.44) + foamOuter * 0.22, 0.0, 0.72);
  col = mix(col, vec3(0.94,0.96,0.92), foam);

  float fog = 1.0-exp(-length(vW-uCam)*0.00024);
  col = mix(col, uFogColor, fog);
  outColor = vec4(col,1.0);
}`;
/* ============================================================
   SHADERS — solid, city, clouds, points, particles, post
   ============================================================ */
const SOLID_VS = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNormal;
layout(location=2) in vec3 aColor;
uniform mat4 uVP, uModel;
out vec3 vW, vN, vC;
void main(){
  vec4 w = uModel*vec4(aPos,1.0);
  vW = w.xyz; vN = mat3(uModel)*aNormal; vC = aColor;
  gl_Position = uVP*w;
}`;

const SOLID_FS = `#version 300 es
precision highp float;
in vec3 vW, vN, vC;
out vec4 outColor;
uniform vec3 uSun, uSunColor, uAmbient, uFogColor, uCam;
uniform float uFogDensity, uSpec, uContour;
float h21(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
float vnoise(vec2 p){
  vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  float a=h21(i), b=h21(i+vec2(1,0)), c=h21(i+vec2(0,1)), d=h21(i+vec2(1,1));
  return mix(mix(a,b,f.x), mix(c,d,f.x), f.y);
}
void main(){
  vec3 N = normalize(vN), V = normalize(uCam-vW);
  float ndl = max(dot(N,uSun),0.0);
  float wrap = max((dot(N,uSun)+0.30)/1.30, 0.0);
  vec3 base = vC;
  float dCam = length(vW-uCam);
  if (uContour > 0.5) {
    // Painterly ground grain: breaks up flat vertex-colour fields at close range.
    float nfade = 1.0 - smoothstep(650.0, 2300.0, dCam);
    float m1 = vnoise(vW.xz*0.055) - 0.5;
    float m2 = vnoise(vW.xz*0.015 + 3.7) - 0.5;
    base *= 1.0 + (m1*0.15 + m2*0.22) * nfade;
    base.g *= 1.0 + m2*0.06*nfade;
    base.r *= 1.0 - m1*0.05*nfade;
    // Patchwork fields, painted per pixel so the parcel edges stay crisp.
    float landMask = smoothstep(7.0, 18.0, vW.y) * (1.0 - smoothstep(170.0, 300.0, vW.y));
    float f1 = vnoise(vW.xz*0.0092 + 7.7);
    float f2 = vnoise(vW.xz*0.0210 + 1.3);
    vec3 tune = mix(vec3(1.14,1.05,0.80), vec3(1.06,0.72,0.54), smoothstep(0.40,0.48,f1));
    tune = mix(tune, vec3(0.88,1.04,0.76), smoothstep(0.56,0.63,f2)*0.55);
    tune = mix(tune, vec3(1.12,0.94,0.66), smoothstep(0.66,0.74,f2)*0.45);
    base *= mix(vec3(1.0), tune, landMask * 0.85 * nfade);
    // Dark woodland: clumped specks and broad copses give the near hills weight.
    float wFade = 1.0 - smoothstep(1200.0, 2800.0, dCam);
    float woodPatch = vnoise(vW.xz*0.0055 + 31.7);
    float woodFleck = vnoise(vW.xz*0.070 + 12.9);
    float wood = smoothstep(0.50,0.72,woodPatch) * smoothstep(0.34,0.62,woodFleck);
    base = mix(base, base*vec3(0.62,0.73,0.54), wood*landMask*0.60*wFade);
    base = mix(base, base*vec3(0.80,0.86,0.70), smoothstep(0.44,0.68,woodPatch)*landMask*0.28*wFade);
    // Airbrushed elevation tint: warm lowlands, cooler violet ridges.
    base *= mix(vec3(1.05,1.00,0.97), vec3(0.92,0.90,1.05), smoothstep(40.0,380.0,vW.y));
    if (vW.y > 24.0) {
      // Faint elevation bands, the way painted maps hint at relief.
      float band = fract(vW.y / 26.0);
      float line = 1.0 - smoothstep(0.0, 0.05, band);
      base *= 1.0 - line * 0.06;
    }
  }
  vec3 col = base*(uAmbient + uSunColor*(0.74*ndl + 0.26*wrap));
  vec3 H = normalize(uSun+V);
  col += uSunColor * pow(max(dot(N,H),0.0), 40.0) * uSpec;
  float rim = pow(1.0-max(dot(N,V),0.0), 3.0);
  col += uSunColor * rim * 0.10;
  vec3 fogCol = mix(uFogColor, vec3(0.74,0.68,0.84), smoothstep(140.0, 480.0, vW.y) * 0.55);
  float fog = 1.0-exp(-dCam*uFogDensity);
  col = mix(col, fogCol, fog);
  outColor = vec4(col,1.0);
}`;

const CITY_VS = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNormal;
layout(location=2) in vec3 aOffset;
layout(location=3) in vec3 aSize;
layout(location=4) in float aSeed;
layout(location=5) in vec3 aColor;
uniform mat4 uVP;
out vec3 vW, vN, vC, vLocal, vSize;
out float vSeed;
void main(){
  vec3 w = aOffset + aPos*aSize;
  vW = w; vN = aNormal; vC = aColor;
  vLocal = aPos; vSize = aSize; vSeed = aSeed;
  gl_Position = uVP*vec4(w,1.0);
}`;

const CITY_FS = `#version 300 es
precision highp float;
in vec3 vW, vN, vC, vLocal, vSize;
in float vSeed;
out vec4 outColor;
uniform vec3 uSun, uSunColor, uAmbient, uFogColor, uCam;
uniform float uFogDensity;

float h21(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }

void main(){
  vec3 n = normalize(vN);
  float ndl = max(dot(n,uSun),0.0);
  vec3 col = vC*(uAmbient*1.36 + uSunColor*ndl*1.02);

  if (abs(n.y) < 0.5) {
    float u = (abs(n.x) > 0.5 ? vLocal.z*vSize.z : vLocal.x*vSize.x);
    float v = vLocal.y*vSize.y;
    vec2 g = vec2(u/7.0, (v-2.6)/7.4);
    vec2 cell = floor(g);
    vec2 f = fract(g);
    float win = step(0.22,f.x)*step(f.x,0.68)*step(0.26,f.y)*step(f.y,0.70);
    float rnd = h21(cell + vec2(vSeed*7.13, vSeed*3.77));
    float on = step(0.80, rnd);
    vec3 wc = vec3(1.0,0.78,0.46);
    if (rnd > 0.998) wc = vec3(0.82,0.93,1.0);
    float wfade = 1.0 - smoothstep(1400.0, 3200.0, length(vW-uCam));
    col = mix(col, vec3(0.16,0.16,0.22), win*0.38);
    col += wc * win * on * 0.40 * wfade;
    if (vLocal.y > 0.985) col = vC*0.95 + vec3(0.12,0.11,0.13);
    if (vLocal.y < 0.02) col *= 0.62;
  } else if (n.y > 0.5) {
    col = vC*0.55 + vec3(0.05,0.04,0.08);
  }
  float fog = 1.0-exp(-length(vW-uCam)*uFogDensity);
  col = mix(col, uFogColor, fog);
  outColor = vec4(col,1.0);
}`;

const CLOUD_VS = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec2 aUV;
uniform mat4 uVP, uModel;
out vec2 vUV; out vec3 vW;
void main(){
  vec4 w = uModel*vec4(aPos,1.0);
  vW = w.xyz; vUV = aUV;
  gl_Position = uVP*w;
}`;

const CLOUD_FS = `#version 300 es
precision highp float;
in vec2 vUV; in vec3 vW;
out vec4 outColor;
uniform sampler2D uTex;
uniform vec3 uTint, uShade, uFogColor, uCam;
uniform float uFogDensity, uAlpha;
void main(){
  vec4 t = texture(uTex, vUV);
  if (t.a < 0.5) discard;
  vec3 col = mix(uShade, uTint, clamp((vUV.y-0.10)/0.90, 0.0, 1.0));
  // Cauliflower form from the mask itself: lit crown, cool shaded underside.
  float upA = texture(uTex, vUV + vec2(0.0, 0.07)).a;
  float dnA = texture(uTex, vUV - vec2(0.0, 0.07)).a;
  col = mix(col, uTint*1.05, (1.0-upA)*0.55);
  col = mix(col, uShade*0.84, (1.0-dnA)*0.60);
  float fog = 1.0-exp(-length(vW-uCam)*uFogDensity);
  col = mix(col, uFogColor, fog);
  outColor = vec4(col, uAlpha);
}`;

const POINT_VS = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aColor;
layout(location=2) in float aSize;
layout(location=3) in float aPhase;
uniform mat4 uVP;
uniform vec3 uCam;
uniform float uTime;
out vec3 vCol; out float vFade; out float vBlink;
void main(){
  gl_Position = uVP*vec4(aPos,1.0);
  float d = length(aPos-uCam);
  gl_PointSize = clamp(abs(aSize)*700.0/max(d,50.0), 1.0, 7.0);
  vCol = aColor;
  vFade = 1.0 - smoothstep(900.0, 3000.0, d);
  vBlink = aSize < 0.0 ? step(0.0, sin(uTime*5.0 + aPhase*6.283))
                       : 0.86 + 0.14*sin(uTime*2.2 + aPhase*19.0);
}`;

const POINT_FS = `#version 300 es
precision highp float;
in vec3 vCol; in float vFade; in float vBlink;
out vec4 outColor;
void main(){
  vec2 q = gl_PointCoord*2.0-1.0;
  float r = dot(q,q);
  if (r > 1.0) discard;
  float a = (1.0-r); a *= a;
  outColor = vec4(vCol, a*vFade*vBlink);
}`;

const PART_VS = `#version 300 es
layout(location=0) in vec3 aCenter;
layout(location=1) in vec2 aCorner;
layout(location=2) in vec4 aColor;
layout(location=3) in float aSize;
uniform mat4 uVP;
uniform vec3 uRight, uUp;
out vec2 vUV; out vec4 vCol;
void main(){
  vec3 p = aCenter + uRight*aCorner.x*aSize + uUp*aCorner.y*aSize;
  vUV = aCorner*0.5+0.5;
  vCol = aColor;
  gl_Position = uVP*vec4(p,1.0);
}`;

const PART_FS = `#version 300 es
precision highp float;
in vec2 vUV; in vec4 vCol;
out vec4 outColor;
uniform sampler2D uTex;
void main(){
  vec4 t = texture(uTex, vUV);
  if (t.a < 0.02) discard;
  outColor = vec4(vCol.rgb, vCol.a*t.a);
}`;

const BURN_VS = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in float aT;
uniform mat4 uVP, uModel;
uniform float uLen, uZ0;
out float vT;
void main(){
  vec3 p = vec3(aPos.x, aPos.y, uZ0 + aPos.z*uLen);
  vT = aT;
  gl_Position = uVP*uModel*vec4(p,1.0);
}`;

const BURN_FS = `#version 300 es
precision highp float;
in float vT;
out vec4 outColor;
uniform float uIntensity, uTime;
void main(){
  float flick = 0.78 + 0.22*sin(vT*42.0 - uTime*56.0);
  float shock = 0.85 + 0.15*sin(vT*24.0 - uTime*32.0);
  float a = pow(1.0-vT, 1.25)*flick*uIntensity;
  vec3 hot = vec3(1.0, 0.98, 0.86);
  vec3 mid = vec3(1.0, 0.62, 0.14);
  vec3 tail = vec3(0.98, 0.22, 0.04);
  vec3 col = vT < 0.35 ? mix(hot, mid, vT/0.35) : mix(mid, tail, (vT-0.35)/0.65);
  col *= shock;
  outColor = vec4(col, a);
}`;

// Wingtip contrail ribbons: crisp curving vapor trails.
const TRAIL_VS = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec4 aCol;
uniform mat4 uVP;
out vec4 vCol;
void main(){ vCol = aCol; gl_Position = uVP * vec4(aPos, 1.0); }`;

const TRAIL_FS = `#version 300 es
precision highp float;
in vec4 vCol;
out vec4 outColor;
void main(){ outColor = vCol; }`;

// Ground/water projected shadows for clouds and aircraft silhouettes.
const SHADOW_VS = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec2 aUV;
uniform mat4 uVP, uModel;
out vec2 vUV;
void main(){ vUV = aUV; gl_Position = uVP * uModel * vec4(aPos, 1.0); }`;

const SHADOW_FS = `#version 300 es
precision highp float;
in vec2 vUV;
out vec4 outColor;
uniform sampler2D uTex;
uniform float uAlpha, uUseTex;
void main(){
  float m = uUseTex > 0.5 ? texture(uTex, vUV).a : 1.0;
  if (m < 0.45) discard;
  outColor = vec4(0.03, 0.05, 0.14, uAlpha * m);
}`;

const POST_FS = `#version 300 es
precision highp float;
in vec2 vUV;
out vec4 outColor;
uniform sampler2D uScene;
uniform float uHurt;
float bayer2(vec2 a){ a=floor(a); return fract(a.x*0.5 + a.y*a.y*0.75); }
float bayer4(vec2 a){ return bayer2(0.5*a)*0.25 + bayer2(a); }
float bayer8(vec2 a){ return bayer4(0.5*a)*0.25 + bayer2(a); }
void main(){
  vec3 c = texture(uScene, vUV).rgb;
  // Gentle grade: keep the pastel gamut, lift shadows a touch, no hard banding.
  float l = dot(c, vec3(0.299,0.587,0.114));
  c = mix(vec3(l), c, 1.06);
  c = pow(max(c,0.0), vec3(0.92,0.98,1.02));
  c = c*1.03 + vec3(0.010,0.006,0.014);
  c += (1.0-l)*vec3(0.020,0.0,0.045);
  vec2 d = vUV-0.5;
  c *= 1.0 - 0.16*pow(length(d)*1.40, 2.4);
  // Damage flash: red edge burn that leaves the centre readable.
  float edge = smoothstep(0.16, 0.62, length(d));
  c = mix(c, vec3(0.62,0.05,0.07), uHurt * edge * 0.85);
  c = mix(c, vec3(0.9,0.2,0.2), uHurt * 0.10);
  // Fine 4x4 ordered dither into 40 levels: a whisper of texture, not a screen door.
  float bay = (bayer4(gl_FragCoord.xy) - 0.5) / 40.0;
  c = floor(c*40.0 + 0.5 + bay)/40.0;
  outColor = vec4(clamp(c,0.0,1.0), 1.0);
}`;

// Cannon tracers: thin additive lines, faded at the muzzle end.
const TRACER_VS = `#version 300 es
layout(location=0) in vec3 aPos;
uniform mat4 uVP;
void main(){ gl_Position = uVP*vec4(aPos,1.0); }`;

const TRACER_FS = `#version 300 es
precision highp float;
out vec4 outColor;
void main(){ outColor = vec4(1.0, 0.82, 0.42, 0.9); }`;

const skyProg = makeProg(FS_VS, SKY_FS, 'sky');
const waterProg = makeProg(WATER_VS, WATER_FS, 'water');
const solidProg = makeProg(SOLID_VS, SOLID_FS, 'solid');
const cityProg = makeProg(CITY_VS, CITY_FS, 'city');
const cloudProg = makeProg(CLOUD_VS, CLOUD_FS, 'cloud');
const pointProg = makeProg(POINT_VS, POINT_FS, 'point');
const partProg = makeProg(PART_VS, PART_FS, 'part');
const burnProg = makeProg(BURN_VS, BURN_FS, 'burn');
const postProg = makeProg(FS_VS, POST_FS, 'post');
const tracerProg = makeProg(TRACER_VS, TRACER_FS, 'tracer');
const trailProg = makeProg(TRAIL_VS, TRAIL_FS, 'trail');
const shadowProg = makeProg(SHADOW_VS, SHADOW_FS, 'shadow');
const SUN_DIR = vnorm([0.40, 0.15, -0.90]);
const FOG_COL = [0.96, 0.77, 0.70];
const FOG_DENS = 0.00022;
