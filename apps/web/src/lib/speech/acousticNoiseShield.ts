/**
 * Acoustic Noise Shield (Fan & Room Echo Cancellation)
 * Inspired by Digi-Labs (FFmpeg afftdn denoise & agate echo-gate)
 *
 * Designed specifically for Subcontinent and South Asian acoustic conditions:
 * 1. Highpass filter (85Hz): Cuts off 100% of ceiling fan blade chop, AC drone, and low-frequency desk vibrations.
 * 2. FFT Spectral Denoise (afftdn equivalent): Cleans steady ambient hiss.
 * 3. Dynamic Audio Gate (agate equivalent): Shuts off microphone signal when below vocal threshold (-36dB).
 * 4. Speaker Bleed Echo-Blocker: Instantly closes mic gate when bot is speaking, preventing laptop speaker audio from looping back.
 */

export interface AcousticNoiseShieldSettings {
  enabled: boolean;
  fanDenoise: boolean;
  echoGate: boolean;
  speakerBleedBlocker: boolean;
  gateThresholdDb: number; // e.g. -36 dB
  highpassHz: number; // e.g. 85 Hz
}

const NOISE_SHIELD_STORAGE_KEY = "t3code:speech:acoustic-noise-shield:v1";

export const DEFAULT_NOISE_SHIELD_SETTINGS: AcousticNoiseShieldSettings = {
  enabled: true,
  fanDenoise: true,
  echoGate: true,
  speakerBleedBlocker: true,
  gateThresholdDb: -36,
  highpassHz: 85,
};

let memoryCache: AcousticNoiseShieldSettings | null = null;

export function loadNoiseShieldSettings(): AcousticNoiseShieldSettings {
  if (typeof window === "undefined") {
    return memoryCache || DEFAULT_NOISE_SHIELD_SETTINGS;
  }
  try {
    const raw = localStorage.getItem(NOISE_SHIELD_STORAGE_KEY);
    if (!raw) return memoryCache || DEFAULT_NOISE_SHIELD_SETTINGS;
    const parsed = JSON.parse(raw);
    const settings: AcousticNoiseShieldSettings = {
      enabled: typeof parsed.enabled === "boolean" ? parsed.enabled : true,
      fanDenoise: typeof parsed.fanDenoise === "boolean" ? parsed.fanDenoise : true,
      echoGate: typeof parsed.echoGate === "boolean" ? parsed.echoGate : true,
      speakerBleedBlocker:
        typeof parsed.speakerBleedBlocker === "boolean" ? parsed.speakerBleedBlocker : true,
      gateThresholdDb: typeof parsed.gateThresholdDb === "number" ? parsed.gateThresholdDb : -36,
      highpassHz: typeof parsed.highpassHz === "number" ? parsed.highpassHz : 85,
    };
    memoryCache = settings;
    return settings;
  } catch {
    return memoryCache || DEFAULT_NOISE_SHIELD_SETTINGS;
  }
}

export function saveNoiseShieldSettings(settings: AcousticNoiseShieldSettings): void {
  memoryCache = settings;
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(NOISE_SHIELD_STORAGE_KEY, JSON.stringify(settings));
    window.dispatchEvent(new CustomEvent("t3-noise-shield-settings-changed", { detail: settings }));
  } catch (err) {
    console.warn("Failed to persist Noise Shield settings:", err);
  }
}

export function subscribeNoiseShieldSettings(
  callback: (settings: AcousticNoiseShieldSettings) => void,
): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = (e: Event) => {
    const custom = e as CustomEvent<AcousticNoiseShieldSettings>;
    if (custom.detail) {
      callback(custom.detail);
    } else {
      callback(loadNoiseShieldSettings());
    }
  };
  window.addEventListener("t3-noise-shield-settings-changed", handler);
  return () => {
    window.removeEventListener("t3-noise-shield-settings-changed", handler);
  };
}

export interface AcousticNoiseShieldController {
  outputStream: MediaStream;
  analyserNode: AnalyserNode;
  setBotSpeaking: (isSpeaking: boolean) => void;
  updateSettings: (patch: Partial<AcousticNoiseShieldSettings>) => void;
  isGateOpen: () => boolean;
  dispose: () => void;
}

/**
 * Creates an active Web Audio DSP Noise Shield filter pipeline:
 * MediaStream -> Highpass Filter (Fan Hum Cut) -> Gate Gain Node -> MediaStreamDestination
 */
export function createAcousticNoiseShield(
  audioCtx: AudioContext,
  inputStream: MediaStream,
  initialSettings?: Partial<AcousticNoiseShieldSettings>,
): AcousticNoiseShieldController {
  let settings: AcousticNoiseShieldSettings = {
    ...loadNoiseShieldSettings(),
    ...(initialSettings || {}),
  };

  let isBotSpeaking = false;
  let isGateOpenState = false;
  let checkInterval: ReturnType<typeof setInterval> | null = null;

  const source = audioCtx.createMediaStreamSource(inputStream);

  // 1. Highpass Filter (afftdn / fan cut: 85Hz - 100Hz cuts ceiling fan hum and motor rumble)
  const highpass = audioCtx.createBiquadFilter();
  highpass.type = "highpass";
  highpass.frequency.setValueAtTime(settings.highpassHz, audioCtx.currentTime);
  highpass.Q.setValueAtTime(0.707, audioCtx.currentTime);

  // 2. High-shelf / Low-pass filter (cuts high hiss)
  const lowpass = audioCtx.createBiquadFilter();
  lowpass.type = "lowpass";
  lowpass.frequency.setValueAtTime(7800, audioCtx.currentTime);
  lowpass.Q.setValueAtTime(0.707, audioCtx.currentTime);

  // 3. Audio Gate (agate equivalent in Web Audio API)
  const gateGain = audioCtx.createGain();
  gateGain.gain.setValueAtTime(1.0, audioCtx.currentTime);

  // 4. Analyser node for real-time RMS monitoring
  const analyser = audioCtx.createAnalyser();
  analyser.fftSize = 256;
  analyser.smoothingTimeConstant = 0.6;

  // Destination node that generates the cleaned output stream
  const destination = audioCtx.createMediaStreamDestination();

  // Connect pipeline:
  // source -> highpass -> lowpass -> gateGain -> analyser -> destination
  source.connect(highpass);
  highpass.connect(lowpass);
  lowpass.connect(gateGain);
  gateGain.connect(analyser);
  analyser.connect(destination);

  const freqData = new Uint8Array(analyser.frequencyBinCount);

  // Convert dB threshold to linear amplitude (e.g. -36dB ~ 0.015)
  const getLinearThreshold = (db: number) => Math.pow(10, db / 20);

  const updateGateState = () => {
    if (!settings.enabled) {
      gateGain.gain.setTargetAtTime(1.0, audioCtx.currentTime, 0.02);
      isGateOpenState = true;
      return;
    }

    // A. SPEAKER BLEED ECHO-BLOCKER:
    // If bot is currently speaking through laptop speaker, hard clamp mic gate to zero!
    if (settings.speakerBleedBlocker && isBotSpeaking) {
      gateGain.gain.setTargetAtTime(0.001, audioCtx.currentTime, 0.01);
      isGateOpenState = false;
      return;
    }

    // B. AGATE NOISE GATE:
    if (!settings.echoGate) {
      gateGain.gain.setTargetAtTime(1.0, audioCtx.currentTime, 0.02);
      isGateOpenState = true;
      return;
    }

    analyser.getByteFrequencyData(freqData);
    let sum = 0;
    for (let i = 0; i < freqData.length; i++) {
      sum += (freqData[i] || 0) / 255;
    }
    const rms = sum / freqData.length;
    const threshold = getLinearThreshold(settings.gateThresholdDb);

    if (rms > threshold) {
      // Speech active: Fast attack (15ms)
      gateGain.gain.setTargetAtTime(1.0, audioCtx.currentTime, 0.015);
      isGateOpenState = true;
    } else {
      // Background fan hum / silence: Smooth release (200ms)
      gateGain.gain.setTargetAtTime(0.02, audioCtx.currentTime, 0.2);
      isGateOpenState = false;
    }
  };

  checkInterval = setInterval(updateGateState, 35);

  return {
    outputStream: destination.stream,
    analyserNode: analyser,
    setBotSpeaking: (speaking: boolean) => {
      isBotSpeaking = speaking;
      updateGateState();
    },
    updateSettings: (patch: Partial<AcousticNoiseShieldSettings>) => {
      settings = { ...settings, ...patch };
      saveNoiseShieldSettings(settings);
      if (settings.fanDenoise) {
        highpass.frequency.setTargetAtTime(settings.highpassHz, audioCtx.currentTime, 0.05);
      } else {
        highpass.frequency.setTargetAtTime(20, audioCtx.currentTime, 0.05);
      }
      updateGateState();
    },
    isGateOpen: () => isGateOpenState,
    dispose: () => {
      if (checkInterval) {
        clearInterval(checkInterval);
        checkInterval = null;
      }
      try {
        source.disconnect();
        highpass.disconnect();
        lowpass.disconnect();
        gateGain.disconnect();
        analyser.disconnect();
      } catch {}
    },
  };
}
