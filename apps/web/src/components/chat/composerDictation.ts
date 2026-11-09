/**
 * Shared composer dictation state (module-level, like the web-search toggle).
 *
 * The dictation mic floats inside the prompt input box (see
 * `ComposerDictationMicButton`) while the composer's primary actions need the
 * same "is dictation running" signal so the send button can stop it. Both
 * share this tiny module store and the same `t3:speech-stream` window events
 * the composer already listens to; the transcript itself is applied by
 * `ChatComposer`, not here.
 */
import { useEffect, useState } from "react";
import { createSttSession, type SttController } from "~/lib/speech/stt";

let controller: SttController | null = null;
let dictating = false;
const listeners = new Set<() => void>();

const emit = () => {
  for (const listener of listeners) listener();
};

const setDictating = (value: boolean) => {
  if (dictating === value) return;
  dictating = value;
  emit();
};

export function subscribeComposerDictation(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function isComposerDictating(): boolean {
  return dictating;
}

function dispatchSpeechStream(detail: Record<string, unknown>): void {
  window.dispatchEvent(new CustomEvent("t3:speech-stream", { detail }));
}

/** Stop dictation. `finalize` runs the dictation cleanup pass (mic toggle); send skips it. */
export function stopComposerDictation(options: { finalize?: boolean } = {}): void {
  const { finalize = true } = options;
  controller?.stop();
  controller = null;
  setDictating(false);
  if (finalize) {
    dispatchSpeechStream({ finalize: true });
  }
  dispatchSpeechStream({ reset: true });
}

export function toggleComposerDictation(): void {
  if (dictating) {
    stopComposerDictation({ finalize: true });
    return;
  }
  const session = createSttSession({
    onResult: (text, isFinal, cumulative) => {
      dispatchSpeechStream({
        text: text.trim(),
        isFinal,
        cumulative: cumulative?.trim(),
      });
    },
    onStateChange: (active) => {
      setDictating(active);
      if (!active) {
        controller = null;
        dispatchSpeechStream({ reset: true });
      }
    },
    onError: (err) => {
      console.warn("STT error:", err);
      controller = null;
      setDictating(false);
      dispatchSpeechStream({ reset: true });
    },
  });
  controller = session;
  session.start();
  setDictating(true);
}

/** React hook: live dictating flag + toggle/stop actions. */
export function useComposerDictation() {
  const [isDictating, setIsDictating] = useState(() => isComposerDictating());
  useEffect(() => {
    const unsubscribe = subscribeComposerDictation(() => setIsDictating(isComposerDictating()));
    return () => {
      unsubscribe();
      stopComposerDictation({ finalize: false });
    };
  }, []);
  return { isDictating, toggle: toggleComposerDictation, stop: stopComposerDictation };
}
