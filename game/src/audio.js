/* DUSK PATROL — audio.js
   Web Audio synth: engine drone, wind, afterburner hiss and one-shots.
   Loaded as a classic script in order (see index.html); globals are shared. */
'use strict';

const audio = {
  ctx: null, master: null, eng: null, engFilter: null, osc1: null, osc2: null,
  wind: null, windGain: null, boostGain: null, muted: false,
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const ctx = new AC();
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.32;
      this.master.connect(ctx.destination);

      this.engFilter = ctx.createBiquadFilter();
      this.engFilter.type = 'lowpass';
      this.engFilter.frequency.value = 420;
      this.eng = ctx.createGain();
      this.eng.gain.value = 0.0;
      this.osc1 = ctx.createOscillator(); this.osc1.type = 'sawtooth'; this.osc1.frequency.value = 58;
      this.osc2 = ctx.createOscillator(); this.osc2.type = 'sawtooth'; this.osc2.frequency.value = 58.7;
      this.osc1.connect(this.engFilter); this.osc2.connect(this.engFilter);
      this.engFilter.connect(this.eng); this.eng.connect(this.master);
      this.osc1.start(); this.osc2.start();

      const len = ctx.sampleRate * 2;
      const nb = ctx.createBuffer(1, len, ctx.sampleRate);
      const nd = nb.getChannelData(0);
      for (let i = 0; i < len; i++) nd[i] = Math.random() * 2 - 1;
      this.noiseBuf = nb;

      const windSrc = ctx.createBufferSource(); windSrc.buffer = nb; windSrc.loop = true;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 620; bp.Q.value = 0.5;
      this.windGain = ctx.createGain(); this.windGain.gain.value = 0.035;
      windSrc.connect(bp); bp.connect(this.windGain); this.windGain.connect(this.master);
      windSrc.start();

      const boostSrc = ctx.createBufferSource(); boostSrc.buffer = nb; boostSrc.loop = true;
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1400;
      this.boostGain = ctx.createGain(); this.boostGain.gain.value = 0.0;
      boostSrc.connect(hp); hp.connect(this.boostGain); this.boostGain.connect(this.master);
      boostSrc.start();
    } catch (e) { console.warn('audio unavailable', e); }
  },
  update(speed, boost) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.osc1.frequency.setTargetAtTime(40 + speed * 0.22, t, 0.12);
    this.osc2.frequency.setTargetAtTime(40.5 + speed * 0.23, t, 0.12);
    this.engFilter.frequency.setTargetAtTime(300 + speed * 3.4, t, 0.15);
    this.eng.gain.setTargetAtTime(0.028 + speed * 0.00016, t, 0.2);
    this.boostGain.gain.setTargetAtTime(boost * 0.05, t, 0.12);
    this.windGain.gain.setTargetAtTime(0.018 + speed * 0.0002, t, 0.2);
  },
  burst(dur, freq, q, gain, sweep) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = q || 1;
    f.frequency.setValueAtTime(freq, t);
    if (sweep) f.frequency.exponentialRampToValueAtTime(Math.max(80, sweep), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + dur + 0.05);
  },
  missile() { this.burst(0.55, 2600, 1.2, 0.16, 420); },
  explosion() {
    this.burst(1.1, 900, 0.6, 0.42, 90);
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(32, t + 0.5);
    g.gain.setValueAtTime(0.30, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + 0.65);
  },
  beep(f) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'square'; o.frequency.value = f || 660;
    g.gain.setValueAtTime(0.045, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + 0.1);
  },
  toggle() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.32, this.ctx.currentTime, 0.05);
    if (!this.muted) this.beep(520);
  }
};
