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
  vec3 zenith = vec3(0.135,0.10,0.27);
  vec3 mid    = vec3(0.46,0.26,0.44);
  vec3 horizon= vec3(0.97,0.62,0.42);
  vec3 col = mix(horizon, mid, smoothstep(0.0,0.30,t));
  col = mix(col, zenith, smoothstep(0.24,0.90,t));
  col = mix(col, vec3(0.83,0.50,0.42), exp(-max(y,0.0)*16.0)*0.55);

  float sd = max(dot(dir,uSun),0.0);
  vec3 sunCol = vec3(1.0,0.80,0.52);
  col += sunCol * pow(sd, 42.0) * 0.22;
  col += sunCol * pow(sd, 220.0) * 0.85;
  float disc = smoothstep(0.99945, 0.99978, sd);
  col = mix(col, vec3(1.0,0.95,0.80), disc);

  vec3 sr = normalize(cross(vec3(0.0,1.0,0.0), uSun));
  vec3 su = cross(uSun, sr);
  float ang = atan(dot(dir,su), dot(dir,sr));
  float ray = 0.5+0.5*sin(ang*27.0);
  ray = pow(ray,4.0) * pow(sd,3.0) * smoothstep(0.0,0.16,y);
  col += vec3(1.0,0.50,0.28) * ray * 0.20;

  vec2 cuv = dir.xz / max(dir.y+0.09, 0.02);
  float cl = noise(cuv*vec2(0.55,2.2) + vec2(uTime*0.004,0.0));
  float band = smoothstep(0.55,0.74,cl) * smoothstep(0.015,0.16,y) * (1.0-smoothstep(0.48,0.82,y));
  vec3 cloudCol = mix(vec3(0.98,0.58,0.55), vec3(1.0,0.84,0.66), pow(sd,2.0));
  col = mix(col, cloudCol, band*0.5);

  col = mix(vec3(0.08,0.09,0.15), col, smoothstep(-0.16, 0.0, y));
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

  vec3 deep = vec3(0.010,0.105,0.20);
  vec3 shallow = vec3(0.14,0.50,0.52);
  vec3 col = mix(shallow, deep, smoothstep(3.0,80.0,depth));
  col = mix(col, vec3(0.07,0.30,0.39), smoothstep(70.0,240.0,depth)*0.35);

  vec2 q = vW.xz*0.055;
  float t = uTime;
  float e = sin(q.x*1.6 + t*1.2)*0.045 + sin(q.y*2.1 - t*0.9)*0.035 + sin((q.x+q.y)*0.8 + t*0.6)*0.05;
  vec3 n = normalize(vec3(e, 1.0, e*0.65));
  vec3 V = normalize(uCam - vW);
  vec3 H = normalize(uSun + V);

  float fres = pow(1.0-max(dot(n,V),0.0), 3.0);
  col = mix(col, vec3(0.78,0.50,0.44), fres*0.32);

  float spec = pow(max(dot(n,H),0.0), 110.0);
  col += vec3(1.0,0.74,0.46) * spec * 1.35;

  float foamBand = 1.0 - smoothstep(0.4, 7.0, depth);
  float fnoise = 0.5+0.5*sin(q.x*4.0+q.y*3.0+t*1.3);
  col = mix(col, vec3(0.86,0.92,0.86), foamBand*(0.22+fnoise*0.55));

  float fog = 1.0-exp(-length(vW-uCam)*0.00027);
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
uniform float uFogDensity, uSpec;
void main(){
  vec3 N = normalize(vN), V = normalize(uCam-vW);
  float ndl = max(dot(N,uSun),0.0);
  float wrap = max((dot(N,uSun)+0.25)/1.25, 0.0);
  vec3 col = vC*(uAmbient + uSunColor*(0.55*ndl + 0.45*wrap));
  vec3 H = normalize(uSun+V);
  col += uSunColor * pow(max(dot(N,H),0.0), 36.0) * uSpec;
  float rim = pow(1.0-max(dot(N,V),0.0), 3.0);
  col += uSunColor * rim * 0.05;
  float fog = 1.0-exp(-length(vW-uCam)*uFogDensity);
  col = mix(col, uFogColor, fog);
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
  vec3 col = vC*(uAmbient*1.05 + uSunColor*ndl*0.95);

  if (abs(n.y) < 0.5) {
    float u = (abs(n.x) > 0.5 ? vLocal.z*vSize.z : vLocal.x*vSize.x);
    float v = vLocal.y*vSize.y;
    vec2 g = vec2(u/3.8, (v-1.5)/4.2);
    vec2 cell = floor(g);
    vec2 f = fract(g);
    float win = step(0.16,f.x)*step(f.x,0.80)*step(0.22,f.y)*step(f.y,0.80);
    float rnd = h21(cell + vec2(vSeed*7.13, vSeed*3.77));
    float on = step(0.40, rnd);
    vec3 wc = vec3(1.0,0.72,0.36);
    if (rnd < 0.055) wc = vec3(0.55,0.82,1.0);
    col = mix(col, vec3(0.05,0.06,0.11), win*0.6);
    col += wc * win * on * 1.45;
    if (vLocal.y > 0.985) col = vC*0.5 + vec3(0.03,0.02,0.05);
    if (vLocal.y < 0.02) col *= 0.55;
  } else if (n.y > 0.5) {
    col = vC*0.40 + vec3(0.02,0.015,0.04);
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
uniform float uFogDensity;
void main(){
  vec4 t = texture(uTex, vUV);
  if (t.a < 0.5) discard;
  vec3 col = mix(uShade, uTint, clamp(vUV.y*1.1-0.05, 0.0, 1.0));
  float fog = 1.0-exp(-length(vW-uCam)*uFogDensity);
  col = mix(col, uFogColor, fog);
  outColor = vec4(col,1.0);
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
  vFade = 1.0 - smoothstep(700.0, 2800.0, d);
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
  float flick = 0.72 + 0.28*sin(vT*38.0 - uTime*44.0);
  float a = pow(1.0-vT, 1.5)*flick*uIntensity;
  vec3 col = mix(vec3(1.0,0.96,0.82), vec3(1.0,0.30,0.04), pow(vT,0.7));
  outColor = vec4(col, a);
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
  // No unsharp pass: nearest-neighbour upscale and dithering carry the pixel look.
  float l = dot(c, vec3(0.299,0.587,0.114));
  c = mix(vec3(l), c, 1.16);
  c = pow(max(c,0.0), vec3(0.94,1.0,1.04));
  c += (1.0-l)*vec3(0.022,0.0,0.055);
  c *= vec3(1.05,1.0,0.97);
  vec2 d = vUV-0.5;
  c *= 1.0 - 0.30*pow(length(d)*1.45, 2.2);
  // Damage flash: red edge burn that leaves the centre readable.
  float edge = smoothstep(0.16, 0.62, length(d));
  c = mix(c, vec3(0.62,0.05,0.07), uHurt * edge * 0.85);
  c = mix(c, vec3(0.9,0.2,0.2), uHurt * 0.10);
  float bay = (bayer8(gl_FragCoord.xy) - 0.5) * 0.55;
  c = floor(c*10.0 + 0.5 + bay)/10.0;
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
const SUN_DIR = vnorm([-0.86, 0.17, -0.40]);
const FOG_COL = [0.80, 0.52, 0.44];
const FOG_DENS = 0.00026;
