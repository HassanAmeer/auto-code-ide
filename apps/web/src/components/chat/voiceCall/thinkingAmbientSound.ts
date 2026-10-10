/**
 * Thinking Ambient Wave Sound Generator
 * Real-time synthesis using Web Audio API (zero external assets).
 * Creates a soft, realistic ocean-wave whoosh noise via low-pass filtered noise and slow breathing ramps.
 */

import { loadVoiceCallSettings } from "./voiceCallSettings";

class ThinkingAmbientSoundController {
  private audioCtx: AudioContext | null = null;
  private sourceNode: AudioBufferSourceNode | null = null;
  private filterNode: BiquadFilterNode | null = null;
  private gainNode: GainNode | null = null;
  private lfoNode: OscillatorNode | null = null;
  private isPlaying = false;
  private stopTimeout: ReturnType<typeof setTimeout> | null = null;

  private createNoiseBuffer(ctx: AudioContext, seconds: number = 5): AudioBuffer {
    const sampleRate = ctx.sampleRate;
    const bufferSize = sampleRate * seconds;
    const buffer = ctx.createBuffer(1, bufferSize, sampleRate);
    const data = buffer.getChannelData(0);

    // Generate gentle pink noise approximation for natural ocean swell
    let b0 = 0,
      b1 = 0,
      b2 = 0,
      b3 = 0,
      b4 = 0,
      b5 = 0,
      b6 = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.969 * b2 + white * 0.153852;
      b3 = 0.8665 * b3 + white * 0.3104856;
      b4 = 0.55 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.016898;
      data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
      b6 = white * 0.115926;
    }
    return buffer;
  }

  public start(): void {
    if (typeof window === "undefined") return;

    // Check user preference
    const settings = loadVoiceCallSettings();
    if (!settings.thinkingWaveSound) {
      return;
    }

    if (this.isPlaying) return;

    if (this.stopTimeout) {
      clearTimeout(this.stopTimeout);
      this.stopTimeout = null;
    }

    try {
      if (!this.audioCtx || this.audioCtx.state === "closed") {
        const AudioCtxClass =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        this.audioCtx = new AudioCtxClass();
      }

      if (this.audioCtx.state === "suspended") {
        void this.audioCtx.resume();
      }

      const now = this.audioCtx.currentTime;

      // 1. Noise Source
      const noiseBuffer = this.createNoiseBuffer(this.audioCtx);
      const source = this.audioCtx.createBufferSource();
      source.buffer = noiseBuffer;
      source.loop = true;

      // 2. Low-Pass Biquad Filter (400Hz base cutoff for deep soft whoosh)
      const filter = this.audioCtx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(400, now);
      filter.Q.setValueAtTime(1.2, now);

      // 3. Master Gain Node with smooth fade-in
      const masterGain = this.audioCtx.createGain();
      masterGain.gain.setValueAtTime(0.0001, now);
      // Soft ramp in over 400ms
      masterGain.gain.exponentialRampToValueAtTime(0.12, now + 0.4);

      // 4. Slow breathing LFO (~0.2 Hz) for wave swell modulation
      const lfo = this.audioCtx.createOscillator();
      lfo.frequency.setValueAtTime(0.2, now); // ~5-second ocean wave cycle

      const lfoGain = this.audioCtx.createGain();
      lfoGain.gain.setValueAtTime(120, now); // Modulate filter cutoff ±120Hz (280Hz - 520Hz)

      lfo.connect(lfoGain);
      lfoGain.connect(filter.frequency);

      // Connect pipeline
      source.connect(filter);
      filter.connect(masterGain);
      masterGain.connect(this.audioCtx.destination);

      source.start(now);
      lfo.start(now);

      this.sourceNode = source;
      this.filterNode = filter;
      this.gainNode = masterGain;
      this.lfoNode = lfo;
      this.isPlaying = true;
    } catch (err) {
      console.warn("Failed to start thinking ambient sound:", err);
      this.isPlaying = false;
    }
  }

  public stop(): void {
    if (!this.isPlaying || !this.audioCtx || !this.gainNode) {
      this.isPlaying = false;
      return;
    }

    try {
      const now = this.audioCtx.currentTime;
      // Smooth exponential fade-out over 180ms
      this.gainNode.gain.cancelScheduledValues(now);
      this.gainNode.gain.setValueAtTime(Math.max(this.gainNode.gain.value, 0.0001), now);
      this.gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);

      const src = this.sourceNode;
      const lfo = this.lfoNode;
      const filter = this.filterNode;
      const gain = this.gainNode;

      this.stopTimeout = setTimeout(() => {
        try {
          src?.stop();
          src?.disconnect();
          lfo?.stop();
          lfo?.disconnect();
          filter?.disconnect();
          gain?.disconnect();
        } catch {
          // ignore disconnect errors on already stopped nodes
        }
        this.sourceNode = null;
        this.filterNode = null;
        this.gainNode = null;
        this.lfoNode = null;
      }, 200);
    } catch (err) {
      console.warn("Failed to stop thinking ambient sound:", err);
    } finally {
      this.isPlaying = false;
    }
  }
}

export const thinkingAmbientSound = new ThinkingAmbientSoundController();
