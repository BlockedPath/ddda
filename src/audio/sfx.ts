/**
 * Tiny procedural SFX bus — no assets required.
 * Grok owns; Cursor can later add UI mute + meters.
 */
export class SfxBus {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private enabled = true;
  private volume = 0.22;
  private lastImpact = 0;

  private ensure(): AudioContext | null {
    if (!this.enabled) return null;
    if (!this.ctx) {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  /** 0–1 master volume (UI slider). */
  setVolume(v: number): void {
    this.volume = Math.min(1, Math.max(0, v));
    if (this.master) this.master.gain.value = this.volume;
  }

  getVolume(): number {
    return this.volume;
  }

  /** Contact impulse → click/thud */
  impact(impulse: number): void {
    const now = performance.now();
    if (now - this.lastImpact < 28) return; // rate limit
    this.lastImpact = now;

    const ctx = this.ensure();
    if (!ctx || !this.master) return;

    const t = ctx.currentTime;
    const amp = Math.min(0.55, 0.04 + impulse * 0.012);
    const freq = 120 + Math.min(800, impulse * 40);

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = freq * 2;

    osc.type = impulse > 8 ? 'triangle' : 'sine';
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.35, t + 0.08);

    gain.gain.setValueAtTime(amp, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    osc.start(t);
    osc.stop(t + 0.14);
  }

  boom(): void {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const t = ctx.currentTime;

    const bufferSize = ctx.sampleRate * 0.25;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 400;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.4, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    noise.start(t);
    noise.stop(t + 0.3);
  }

  pin(): void {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(880, t);
    osc.frequency.exponentialRampToValueAtTime(440, t + 0.06);
    gain.gain.setValueAtTime(0.08, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t);
    osc.stop(t + 0.09);
  }
}
