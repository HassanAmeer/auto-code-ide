import { loadSoundSettings } from "./soundSettings";

let globalAudioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    if (!globalAudioCtx || globalAudioCtx.state === "closed") {
      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      globalAudioCtx = new AudioContextClass();
    }
    if (globalAudioCtx.state === "suspended") {
      void globalAudioCtx.resume().catch(() => undefined);
    }
    return globalAudioCtx;
  } catch {
    return null;
  }
}

/** Called on user interaction to unlock audio playback in browser */
export function unlockAudioContext(): void {
  const ctx = getAudioContext();
  if (ctx && ctx.state === "suspended") {
    void ctx.resume().catch(() => undefined);
  }
}

let lastResponseDoneAt = 0;
let lastNotificationAt = 0;
let lastErrorAt = 0;

/**
 * 1. Response Done Sound (Chime)
 * Pleasant 3-note harmonic chime (C5 -> E5 -> G5)
 */
export function playResponseDoneSound(force = false): void {
  const now = Date.now();
  if (!force && now - lastResponseDoneAt < 1200) return;

  const settings = loadSoundSettings();
  if (!force && (!settings.masterSoundEnabled || !settings.responseDoneSound)) return;

  const ctx = getAudioContext();
  if (!ctx) return;

  lastResponseDoneAt = now;

  const ctxTime = ctx.currentTime;
  const masterVolume = settings.soundVolume * 0.45;

  const notes = [
    { freq: 523.25, time: ctxTime }, // C5
    { freq: 659.25, time: ctxTime + 0.12 }, // E5
    { freq: 783.99, time: ctxTime + 0.24 }, // G5
  ];

  notes.forEach(({ freq, time }) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, time);

    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(masterVolume, time + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.85);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(time);
    osc.stop(time + 0.9);
  });
}

/**
 * 2. Notification Alert Sound
 * Snappy pleasant dual-tone ping (D5 -> A5)
 */
export function playNotificationSound(force = false): void {
  const now = Date.now();
  if (!force && now - lastNotificationAt < 1200) return;

  const settings = loadSoundSettings();
  if (!force && (!settings.masterSoundEnabled || !settings.notificationSound)) return;

  const ctx = getAudioContext();
  if (!ctx) return;

  lastNotificationAt = now;

  const ctxTime = ctx.currentTime;
  const masterVolume = settings.soundVolume * 0.4;

  const notes = [
    { freq: 587.33, time: ctxTime }, // D5
    { freq: 880.0, time: ctxTime + 0.09 }, // A5
  ];

  notes.forEach(({ freq, time }) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, time);

    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(masterVolume, time + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.55);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(time);
    osc.stop(time + 0.6);
  });
}

/**
 * 3. Error Sound
 * Gentle subtle warning tone (E4 -> C4 warm triangle/sine)
 */
export function playErrorSound(force = false): void {
  const now = Date.now();
  if (!force && now - lastErrorAt < 1200) return;

  const settings = loadSoundSettings();
  if (!force && (!settings.masterSoundEnabled || !settings.errorSound)) return;

  const ctx = getAudioContext();
  if (!ctx) return;

  lastErrorAt = now;

  const ctxTime = ctx.currentTime;
  const masterVolume = settings.soundVolume * 0.38;

  const notes = [
    { freq: 329.63, time: ctxTime }, // E4
    { freq: 261.63, time: ctxTime + 0.14 }, // C4
  ];

  notes.forEach(({ freq, time }) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    osc.type = "triangle";
    osc.frequency.setValueAtTime(freq, time);

    filter.type = "lowpass";
    filter.frequency.setValueAtTime(800, time);

    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(masterVolume, time + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.65);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    osc.start(time);
    osc.stop(time + 0.7);
  });
}

/**
 * 4. Timeout Sound
 * Dual staccato woodblock ping (440 Hz -> 370 Hz)
 */
export function playTimeoutSound(force = false): void {
  const settings = loadSoundSettings();
  if (!force && (!settings.masterSoundEnabled || !settings.timeoutSound)) return;

  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const masterVolume = settings.soundVolume * 0.42;

  const notes = [
    { freq: 440.0, time: now }, // A4
    { freq: 369.99, time: now + 0.16 }, // F#4
  ];

  notes.forEach(({ freq, time }) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, time);

    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(masterVolume, time + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.28);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(time);
    osc.stop(time + 0.3);
  });
}

/**
 * 5. Waiting / Wave Ambient Sound (Ocean swell whoosh)
 */
let activeWaitingSource: AudioBufferSourceNode | null = null;
let activeWaitingGain: GainNode | null = null;
let activeWaitingLfo: OscillatorNode | null = null;

function createNoiseBuffer(ctx: AudioContext, seconds = 4): AudioBuffer {
  const sampleRate = ctx.sampleRate;
  const bufferSize = sampleRate * seconds;
  const buffer = ctx.createBuffer(1, bufferSize, sampleRate);
  const data = buffer.getChannelData(0);

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

export function startWaitingWaveSound(force = false): void {
  const settings = loadSoundSettings();
  if (!force && (!settings.masterSoundEnabled || !settings.waitingWaveSound)) return;
  if (activeWaitingSource) return; // already playing

  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const masterVolume = settings.soundVolume * 0.16;

  try {
    const noiseBuffer = createNoiseBuffer(ctx, 4);
    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer;
    source.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(380, now);
    filter.Q.setValueAtTime(1.1, now);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(masterVolume, now + 0.4);

    const lfo = ctx.createOscillator();
    lfo.frequency.setValueAtTime(0.25, now);

    const lfoGain = ctx.createGain();
    lfoGain.gain.setValueAtTime(110, now);

    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    source.start(now);
    lfo.start(now);

    activeWaitingSource = source;
    activeWaitingGain = gain;
    activeWaitingLfo = lfo;
  } catch {
    activeWaitingSource = null;
  }
}

export function stopWaitingWaveSound(): void {
  if (!activeWaitingGain || !activeWaitingSource) return;

  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  try {
    activeWaitingGain.gain.cancelScheduledValues(now);
    activeWaitingGain.gain.setValueAtTime(activeWaitingGain.gain.value, now);
    activeWaitingGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);

    const src = activeWaitingSource;
    const lfo = activeWaitingLfo;
    setTimeout(() => {
      try {
        src.stop();
        src.disconnect();
        lfo?.stop();
        lfo?.disconnect();
      } catch {
        // Ignored
      }
    }, 400);
  } catch {
    // Ignored
  } finally {
    activeWaitingSource = null;
    activeWaitingGain = null;
    activeWaitingLfo = null;
  }
}

/**
 * Preview any sound effect on demand (ignoring mute settings)
 */
export type SoundEffectType =
  | "response-done"
  | "waiting-wave"
  | "notification"
  | "error"
  | "timeout";

export function previewSound(type: SoundEffectType): void {
  unlockAudioContext();
  switch (type) {
    case "response-done":
      playResponseDoneSound(true);
      break;
    case "notification":
      playNotificationSound(true);
      break;
    case "error":
      playErrorSound(true);
      break;
    case "timeout":
      playTimeoutSound(true);
      break;
    case "waiting-wave":
      startWaitingWaveSound(true);
      setTimeout(() => {
        stopWaitingWaveSound();
      }, 3000);
      break;
  }
}
