/**
 * Mobile Browser OS Sleep & Background Restrictions Workaround
 *
 * Provides:
 * 1. Screen Wake Lock API (keeps mobile screen awake while call is active).
 * 2. Silent Audio Loop (preserves Web Audio / Media playback background priority on iOS/Android).
 * 3. MediaSession API (lock screen / notification bar controls and active call status).
 * 4. Visibility & Focus auto-resumption (re-establishes recognition and audio pipeline on screen unlock).
 */

// 1-second silent stereo 44.1kHz WAV base64
const SILENT_WAV_BASE64 =
  "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAAAA";

export interface MobileVoiceKeepAliveOptions {
  onResumeNeeded: () => void;
  onHangup?: () => void;
}

let wakeLockSentinel: any = null;
let silentAudioEl: HTMLAudioElement | null = null;
let visibilityListener: (() => void) | null = null;
let isKeepAliveActive = false;
let currentOptions: MobileVoiceKeepAliveOptions | null = null;

async function requestScreenWakeLock(): Promise<void> {
  if (typeof navigator === "undefined" || !("wakeLock" in navigator)) {
    return;
  }
  try {
    if (!wakeLockSentinel) {
      wakeLockSentinel = await (navigator as any).wakeLock.request("screen");
      wakeLockSentinel.addEventListener("release", () => {
        wakeLockSentinel = null;
      });
    }
  } catch (err) {
    // Wake lock might fail if battery saver is strict or document is hidden
    console.debug("[MobileKeepAlive] WakeLock request notice:", err);
  }
}

function releaseScreenWakeLock(): void {
  if (wakeLockSentinel) {
    try {
      void wakeLockSentinel.release();
    } catch {
      // ignore
    }
    wakeLockSentinel = null;
  }
}

function startSilentAudioLoop(): void {
  try {
    if (!silentAudioEl) {
      silentAudioEl = new Audio(SILENT_WAV_BASE64);
      silentAudioEl.loop = true;
      silentAudioEl.volume = 0.01;
      silentAudioEl.setAttribute("playsinline", "true");
      silentAudioEl.setAttribute("aria-hidden", "true");
    }
    void silentAudioEl.play().catch(() => {});
  } catch (err) {
    console.debug("[MobileKeepAlive] Silent audio start notice:", err);
  }
}

function stopSilentAudioLoop(): void {
  if (silentAudioEl) {
    try {
      silentAudioEl.pause();
      silentAudioEl.currentTime = 0;
    } catch {
      // ignore
    }
  }
}

function setupMediaSession(onHangup?: () => void): void {
  if (typeof navigator === "undefined" || !("mediaSession" in navigator)) {
    return;
  }
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: "T3 Agent Voice Call",
      artist: "Active Voice Assistant",
      album: "T3 Code Call Session",
    });
    navigator.mediaSession.playbackState = "playing";

    if (onHangup) {
      navigator.mediaSession.setActionHandler("stop", onHangup);
      try {
        navigator.mediaSession.setActionHandler("hangup" as any, onHangup);
      } catch {
        // 'hangup' action might not be supported in all browsers
      }
    }
  } catch (err) {
    console.debug("[MobileKeepAlive] MediaSession setup notice:", err);
  }
}

function teardownMediaSession(): void {
  if (typeof navigator === "undefined" || !("mediaSession" in navigator)) {
    return;
  }
  try {
    navigator.mediaSession.playbackState = "none";
    navigator.mediaSession.metadata = null;
    navigator.mediaSession.setActionHandler("stop", null);
    try {
      navigator.mediaSession.setActionHandler("hangup" as any, null);
    } catch {
      // ignore
    }
  } catch {
    // ignore
  }
}

/**
 * Starts keep-alive services:
 * - Locks screen on
 * - Starts background silent audio playback
 * - Binds MediaSession handlers
 * - Listens for visibility changes to auto-heal audio & speech on return
 */
export function startMobileVoiceKeepAlive(options: MobileVoiceKeepAliveOptions): void {
  isKeepAliveActive = true;
  currentOptions = options;

  void requestScreenWakeLock();
  startSilentAudioLoop();
  setupMediaSession(options.onHangup);

  if (!visibilityListener && typeof document !== "undefined") {
    visibilityListener = () => {
      if (!isKeepAliveActive) return;

      if (document.visibilityState === "visible") {
        // Re-request wake lock since browsers release it automatically when page was hidden
        void requestScreenWakeLock();
        startSilentAudioLoop();

        // Resume SpeechSynthesis in case browser paused audio threads during lock
        if (typeof window !== "undefined" && "speechSynthesis" in window) {
          try {
            window.speechSynthesis.resume();
          } catch {
            // ignore
          }
        }

        // Notify assistant to re-verify speech recognition and audio pipeline
        currentOptions?.onResumeNeeded();
      }
    };

    document.addEventListener("visibilitychange", visibilityListener);
    window.addEventListener("focus", visibilityListener);
    window.addEventListener("pageshow", visibilityListener);
  }
}

/**
 * Stops keep-alive services and releases all wake locks and audio loops
 */
export function stopMobileVoiceKeepAlive(): void {
  isKeepAliveActive = false;
  currentOptions = null;

  releaseScreenWakeLock();
  stopSilentAudioLoop();
  teardownMediaSession();

  if (visibilityListener && typeof document !== "undefined") {
    document.removeEventListener("visibilitychange", visibilityListener);
    window.removeEventListener("focus", visibilityListener);
    window.removeEventListener("pageshow", visibilityListener);
    visibilityListener = null;
  }
}
