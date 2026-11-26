// MERIDIAN RUN — synthesized sound, no audio files.
// One clear job: engine hum, wind, ring chimes and impacts, all from WebAudio.

export function createAudio() {
  let ctx = null;
  let engineOsc = null;
  let engineGain = null;
  let engineFilter = null;
  let windGain = null;
  let windFilter = null;
  let muted = false;
  let started = false;

  function ensure() {
    if (started) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      // Engine: a low sawtooth through a low-pass, pitch follows throttle.
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 62;
      engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 320;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      engineOsc.connect(engineFilter).connect(engineGain).connect(ctx.destination);
      engineOsc.start();
      // Wind: looped noise through a band-pass, loudness follows airspeed.
      const len = ctx.sampleRate * 2;
      const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      noise.loop = true;
      windFilter = ctx.createBiquadFilter();
      windFilter.type = 'bandpass';
      windFilter.frequency.value = 620;
      windFilter.Q.value = 0.6;
      windGain = ctx.createGain();
      windGain.gain.value = 0;
      noise.connect(windFilter).connect(windGain).connect(ctx.destination);
      noise.start();
      started = true;
      return true;
    } catch {
      return false;
    }
  }

  function blip(freq, when, dur, vol, type = 'sine') {
    if (!ctx) return;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(vol, when + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    osc.connect(g).connect(ctx.destination);
    osc.start(when);
    osc.stop(when + dur + 0.05);
  }

  return {
    // Call from the first user gesture (click / keypress).
    unlock() {
      if (ensure() && ctx.state === 'suspended') ctx.resume();
    },
    toggleMute() {
      muted = !muted;
      return muted;
    },
    isMuted() {
      return muted;
    },
    // Called every frame while flying.
    update(throttle01, speed01, flying) {
      if (!ctx || !started) return;
      const t = ctx.currentTime;
      const target = muted || !flying ? 0 : 0.045 + throttle01 * 0.05;
      engineGain.gain.setTargetAtTime(target, t, 0.1);
      engineOsc.frequency.setTargetAtTime(52 + throttle01 * 68, t, 0.1);
      engineFilter.frequency.setTargetAtTime(240 + throttle01 * 620, t, 0.1);
      const windTarget = muted || !flying ? 0 : speed01 * speed01 * 0.11;
      windGain.gain.setTargetAtTime(windTarget, t, 0.15);
      windFilter.frequency.setTargetAtTime(420 + speed01 * 900, t, 0.15);
    },
    ring(center) {
      if (!ctx || muted) return;
      const t = ctx.currentTime;
      blip(880, t, 0.35, 0.22);
      blip(1318, t + 0.07, 0.4, 0.18);
      if (center) blip(1760, t + 0.14, 0.45, 0.12);
    },
    crash() {
      if (!ctx || muted) return;
      const t = ctx.currentTime;
      const len = ctx.sampleRate * 0.35;
      const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 420;
      const g = ctx.createGain();
      g.gain.value = 0.5;
      src.connect(filter).connect(g).connect(ctx.destination);
      src.start(t);
      blip(70, t, 0.4, 0.3, 'triangle');
    },
    land() {
      if (!ctx || muted) return;
      const t = ctx.currentTime;
      blip(392, t, 0.25, 0.2);
      blip(523, t + 0.09, 0.35, 0.2);
      blip(659, t + 0.18, 0.5, 0.18);
    },
  };
}
