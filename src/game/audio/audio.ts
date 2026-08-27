/**
 * Procedural crash-lab audio. Everything is synthesised with the Web Audio API
 * — no asset files — so it ships in the bundle for free and scales with the
 * physics. One AudioContext, a master gain for muting, and a small set of
 * voices: an engine drone, wind, tyre screech, and one-shot impact/glass/metal
 * hits. All calls are guarded; if audio is unavailable the game is unaffected.
 *
 * Browsers block audio until a user gesture — call `unlock()` from the crash
 * launch (a click) before starting ambience.
 */

class CrashAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private muted = false;

  // Ambient voices (created on startAmbient, torn down on stopAmbient).
  private engineOscs: OscillatorNode[] = [];
  private engineGain: GainNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private windSrc: AudioBufferSourceNode | null = null;
  private windGain: GainNode | null = null;
  private screechSrc: AudioBufferSourceNode | null = null;
  private screechGain: GainNode | null = null;
  private screechFilter: BiquadFilterNode | null = null;
  private electric = false;

  private ensure(): boolean {
    if (typeof window === 'undefined') return false;
    if (!this.ctx) {
      try {
        const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!AC) return false;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.muted ? 0 : 0.9;
        this.master.connect(this.ctx.destination);
        this.noiseBuffer = this.makeNoise(this.ctx, 2);
      } catch {
        return false;
      }
    }
    return !!this.ctx;
  }

  private makeNoise(ctx: AudioContext, seconds: number): AudioBuffer {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  /** Resume the context from a user gesture. Safe to call repeatedly. */
  unlock() {
    if (!this.ensure() || !this.ctx) return;
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(muted ? 0 : 0.9, this.ctx.currentTime, 0.05);
    }
  }

  isMuted() {
    return this.muted;
  }

  // ---- Ambient engine + wind + screech ----
  startAmbient(electric: boolean) {
    if (!this.ensure() || !this.ctx || !this.master || !this.noiseBuffer) return;
    this.stopAmbient();
    this.electric = electric;
    const ctx = this.ctx;

    // Engine: detuned oscillators through a lowpass.
    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = electric ? 2200 : 900;
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0.0;
    this.engineFilter.connect(this.engineGain).connect(this.master);

    const shapes: OscillatorType[] = electric ? ['triangle', 'sine'] : ['sawtooth', 'square'];
    for (let i = 0; i < 2; i++) {
      const osc = ctx.createOscillator();
      osc.type = shapes[i];
      osc.frequency.value = electric ? 220 : 70;
      osc.detune.value = i === 0 ? -6 : 8;
      osc.connect(this.engineFilter);
      osc.start();
      this.engineOscs.push(osc);
    }

    // Wind: looping noise through a bandpass, volume rises with speed.
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    const windFilter = ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 500;
    windFilter.Q.value = 0.7;
    this.windSrc = ctx.createBufferSource();
    this.windSrc.buffer = this.noiseBuffer;
    this.windSrc.loop = true;
    this.windSrc.connect(windFilter).connect(this.windGain).connect(this.master);
    this.windSrc.start();

    // Tyre screech: noise through a resonant bandpass, gated by screech amount.
    this.screechGain = ctx.createGain();
    this.screechGain.gain.value = 0;
    this.screechFilter = ctx.createBiquadFilter();
    this.screechFilter.type = 'bandpass';
    this.screechFilter.frequency.value = 1600;
    this.screechFilter.Q.value = 6;
    this.screechSrc = ctx.createBufferSource();
    this.screechSrc.buffer = this.noiseBuffer;
    this.screechSrc.loop = true;
    this.screechSrc.connect(this.screechFilter).connect(this.screechGain).connect(this.master);
    this.screechSrc.start();
  }

  /**
   * Update ambience from the current playback state.
   * @param speedKmh vehicle speed
   * @param timeScale playback rate (slow-mo lowers pitch)
   * @param screech 0..1 tyre-screech amount
   */
  updateAmbient(speedKmh: number, timeScale: number, screech: number) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const norm = Math.min(1, speedKmh / 200);
    if (this.engineGain && this.engineFilter && this.engineOscs.length) {
      const baseFreq = this.electric ? 200 : 65;
      const topFreq = this.electric ? 900 : 240;
      const freq = (baseFreq + (topFreq - baseFreq) * norm) * Math.max(0.15, timeScale);
      for (const osc of this.engineOscs) osc.frequency.setTargetAtTime(freq, t, 0.06);
      this.engineFilter.frequency.setTargetAtTime((this.electric ? 1400 : 700) + norm * 1800, t, 0.08);
      this.engineGain.gain.setTargetAtTime(0.06 + norm * 0.12, t, 0.08);
    }
    if (this.windGain) this.windGain.gain.setTargetAtTime(Math.pow(norm, 1.5) * 0.22, t, 0.1);
    if (this.screechGain) this.screechGain.gain.setTargetAtTime(Math.min(1, screech) * 0.16, t, 0.03);
  }

  stopAmbient() {
    const stop = (n: AudioScheduledSourceNode | null) => { try { n?.stop(); } catch { /* already stopped */ } };
    this.engineOscs.forEach(stop);
    this.engineOscs = [];
    stop(this.windSrc); this.windSrc = null;
    stop(this.screechSrc); this.screechSrc = null;
    this.engineGain = this.engineFilter = this.windGain = this.screechGain = this.screechFilter = null;
  }

  /**
   * One-shot impact. `intensity` 0..1 scales loudness & brightness.
   * `glass` adds a high shatter, `metal` adds a groaning bend.
   */
  impact(intensity: number, opts: { glass?: boolean; metal?: boolean } = {}) {
    if (!this.ensure() || !this.ctx || !this.master || !this.noiseBuffer) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const amp = 0.35 + intensity * 0.6;

    // Low boom.
    const boom = ctx.createOscillator();
    boom.type = 'sine';
    boom.frequency.setValueAtTime(120, t);
    boom.frequency.exponentialRampToValueAtTime(38, t + 0.28);
    const boomGain = ctx.createGain();
    boomGain.gain.setValueAtTime(amp, t);
    boomGain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    boom.connect(boomGain).connect(this.master);
    boom.start(t); boom.stop(t + 0.55);

    // Crunch: filtered noise burst.
    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    const nf = ctx.createBiquadFilter();
    nf.type = 'lowpass';
    nf.frequency.setValueAtTime(2500 + intensity * 3500, t);
    nf.frequency.exponentialRampToValueAtTime(400, t + 0.3);
    const nGain = ctx.createGain();
    nGain.gain.setValueAtTime(amp * 0.9, t);
    nGain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    noise.connect(nf).connect(nGain).connect(this.master);
    noise.start(t); noise.stop(t + 0.4);

    if (opts.metal) {
      const metal = ctx.createOscillator();
      metal.type = 'sawtooth';
      metal.frequency.setValueAtTime(320, t + 0.04);
      metal.frequency.exponentialRampToValueAtTime(90, t + 0.6);
      const mf = ctx.createBiquadFilter();
      mf.type = 'bandpass'; mf.frequency.value = 700; mf.Q.value = 3;
      const mGain = ctx.createGain();
      mGain.gain.setValueAtTime(amp * 0.4, t + 0.04);
      mGain.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
      metal.connect(mf).connect(mGain).connect(this.master);
      metal.start(t + 0.04); metal.stop(t + 0.72);
    }

    if (opts.glass) {
      const g = ctx.createBufferSource();
      g.buffer = this.noiseBuffer;
      const gf = ctx.createBiquadFilter();
      gf.type = 'highpass'; gf.frequency.value = 5000;
      const gGain = ctx.createGain();
      gGain.gain.setValueAtTime(amp * 0.5, t + 0.02);
      gGain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
      g.connect(gf).connect(gGain).connect(this.master);
      g.start(t + 0.02); g.stop(t + 0.28);
    }
  }

  /** Short UI/countdown blip. */
  blip(freq = 660, dur = 0.08) {
    if (!this.ensure() || !this.ctx || !this.master) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.18, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.master);
    osc.start(t); osc.stop(t + dur + 0.02);
  }
}

export const audio = new CrashAudio();
