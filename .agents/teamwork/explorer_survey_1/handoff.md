# Voice Calling Architecture Survey & Technical Overview

## 1. Observation

### 1.1 Complete Inventory of Voice & Speech Files in Codebase

The repository contains a dedicated, highly modular voice calling and speech pipeline located entirely in the frontend application (`apps/web`):

#### A. Voice Call Components & Hooks (`apps/web/src/components/chat/voiceCall/` - 19 files):

1. **`useVoiceCallAssistant.ts`** (2,096 lines, 71.4 KB): Central coordinator hook. Manages continuous full-duplex `SpeechRecognition`, `StreamingTtsPlayer`, silence heartbeat timer, interrupt detection, acoustic echo suppression, microphone track control, and real-time state mirroring into refs.
2. **`SuperCallAssistantView.tsx`** (3,461 lines, 152.8 KB): Full-screen route (`/bot`) and modal interface. Displays circular/geometric audio wave visualizers, real-time interim & final transcripts, spoken assistant sentence banners, model/preset pickers, and tool execution progress.
3. **`streamingTtsPlayer.ts`** (210 lines, 6.0 KB): Sequential queue player. Implements `extractSpeechChunks()` (sentence delimiter regex, code block & reasoning tag stripping) and chunk-by-chunk playback via browser `SpeechSynthesis`.
4. **`mobileVoiceKeepAlive.ts`** (185 lines, 5.5 KB): Mobile OS background persistence layer. Requests Screen Wake Lock API, plays a continuous 1-second silent stereo WAV audio loop (`SILENT_WAV_BASE64`), binds `navigator.mediaSession`, and auto-resumes recognition on visibility/focus return.
5. **`VoiceVisualizerWaves.tsx`** (185 lines, 6.5 KB): 50-bar responsive canvas/CSS visualizer with curved bell factor. Renders distinct animations across 5 states: `idle`, `listening` (breathing), `user-speaking` (Web Audio AnalyserNode FFT), `thinking` (shimmer wave), and `speaking` (speech cadence formants).
6. **`GrokGeometricVoiceWaves.tsx`** (388 lines, 13.5 KB): Alternative geometric orbital/frequency wave canvas rendering.
7. **`VoiceCallButton.tsx`** (368 lines, 11.9 KB): Interactive trigger button and circular pulse wave animation (`CircularVoiceWaves`).
8. **`VoiceCallFloatingWidget.tsx`** (130 lines, 4.5 KB) & **`GlobalVoiceCallWidget.tsx`** (136 lines, 4.4 KB): Global floating pill widget for persistent voice calls when navigating away from `/bot`.
9. **`thinkingAmbientSound.ts`** (150 lines, 5.2 KB): Synthesizes subtle Web Audio ambient tones while the LLM model is thinking.
10. **`voiceCallState.ts`** (20 lines, 735 B): Global state coordinator (`isVoiceCallActive`, `setVoiceCallActiveState`). Suppresses completion chimes and toast alerts during active calls.
11. **`voiceCallSettings.ts`** (73 lines, 2.2 KB): Voice settings loader and localStorage/server sync subscriber (`t3code:speech:voice-call-settings:v1`).
12. **`superAgentEngine.ts`** & **`superAgentEngine.test.ts`** (57.9 KB & 10.0 KB): Dispatches and handles voice instructions against the active session.
13. **`superAgentPrompt.ts`** (12.3 KB): System prompt definitions for SuperCall voice persona.
14. **`useLiveKitCall.ts`** (220 lines, 7.8 KB): LiveKit WebRTC alternative client bridge.
15. **`voiceCallAssistant.test.ts`** (324 lines, 14.3 KB): 15 comprehensive unit tests for interruption, speech chunk extraction, and echo isolation.
16. **`AutonomousTaskBoard.tsx`** & **`index.ts`**: Re-exports and voice task board UI.

#### B. Speech Library & Core Engines (`apps/web/src/lib/speech/` - 14 files):

1. **`stt.ts`** (477 lines, 15.1 KB): Browser Speech-to-Text wrapper using `window.SpeechRecognition` / `window.webkitSpeechRecognition`. Implements `createSttSession`, language fallback (`ur-PK` -> `hi-IN` -> `en-IN` -> `en-US`), rapid duplicate filtering (<2500ms), and `deduplicateOverlap()`.
2. **`tts.ts`** (1,239 lines, 38.9 KB): Browser Text-to-Speech wrapper using `window.speechSynthesis`. Curates 6 voice presets in `TTS_ACCENTS`, splits paragraphs into sentence units (`splitTextIntoSentenceUnits`), implements Chromium 15s freeze bypass (pause/resume every 3.5s), and strips code/markdown.
3. **`acousticNoiseShield.ts`** (241 lines, 8.8 KB): Web Audio DSP pipeline. 85Hz highpass filter (cuts ceiling fan hum), agate dynamic gate (-36dB default), and speaker bleed echo attenuation.
4. **`romanUrduSpeechAdapter.ts`** (675 lines, 16.1 KB): Converts Roman Urdu to Urdu Unicode script (for `ur-PK` voices), Devanagari (for `hi-IN` voices), or phonetic respelling (for `en-US`/`en-IN` synthesizers).
5. **`romanUrduTransliterate.ts`** (600 lines, 16.7 KB): Converts Urdu script recognized by Google STT back into phonetic Roman Urdu for composer display.
6. **`multiTurnSessionLedger.ts`** (322 lines, 10.8 KB): Structured memory ledger tracking agreements and decisions across multi-turn voice consultations.
7. **`voiceCallLogger.ts`** (87 lines, 1.9 KB): Real-time event logger broadcasting `BOT`, `AI`, `LIVEKIT`, `STT`, `INTERRUPT`, `NOISE_GATE`, `TTS`, and `SYSTEM` logs.
8. **Test Suites**: `stt.test.ts`, `tts.test.ts`, `acousticNoiseShield.test.ts`, `romanUrduSpeechAdapter.test.ts`, `romanUrduTransliterate.test.ts`, `multiTurnSessionLedger.test.ts`, `voiceCallLogger.test.ts`.

#### C. Settings Panels (`apps/web/src/components/settings/`):

1. **`SttTtsSettingsPanel.tsx`** (714 lines): Unified STT/TTS configuration interface with accent testing, voice selection, noise shield sliders, and language modes.
2. **`SoundSettingsPanel.tsx`** & **`SttSettingsPanel.tsx`**: Granular audio and dictation settings.

---

### 1.2 Web Speech API Usage & State Management Details

#### STT (SpeechRecognition):

- In `stt.ts` (lines 237–304) and `useVoiceCallAssistant.ts` (lines 871–894), `SpeechRecognition` is instantiated with:
  ```ts
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = langCode;
  ```
- **Mobile vs Desktop Rule**: `recognition.continuous` is set to `false` on mobile (`isMobileDevice`) in `stt.ts:300` because Android Chrome duplicates interim chunks when continuous mode is active. On desktop, `continuous = true` keeps the audio pipeline running.
- **Auto-Revival Loop**: In `useVoiceCallAssistant.ts:1211-1254`, `recognition.onend` triggers an immediate 0ms restart loop:
  ```ts
  recognition.onend = () => {
    if (isCallActiveRef.current && !isAbortingRef.current && !disabled && !isUserMutedRef.current) {
      restartTimerRef.current = setTimeout(restartMic, 0);
    }
  };
  ```
- **Watchdog Heartbeat**: `useVoiceCallAssistant.ts:1603-1618` executes an interval every 100ms. If `!isRecognitionRunningRef.current && isCallActiveRef.current`, it restarts recognition automatically to heal silent dropouts.

#### TTS (SpeechSynthesis):

- In `tts.ts:1099-1114`, Chromium's 15-second speech cutoff / GC pause bug is addressed via a periodic keep-alive:
  ```ts
  keepAliveTimer = setInterval(() => {
    if (window.speechSynthesis.speaking) {
      window.speechSynthesis.pause();
      window.speechSynthesis.resume();
    }
  }, 3500);
  ```
- In `tts.ts:1060-1064`, garbage collection is prevented by retaining references:
  ```ts
  activeUtterancesSet.add(utterance);
  (window as any).__t3_speech_queue.push(utterance);
  ```
- In `tts.ts:1213-1227` and `streamingTtsPlayer.ts`, paragraphs are split into individual sentence units (`splitTextIntoSentenceUnits`) so utterances rarely exceed 5–8 seconds.

#### State Management Architecture:

- **Dual-State React + Refs Pattern**: React state (`isCallActive`, `callStatus`, `liveTranscript`, `assistantSpokenText`, `isMicMuted`) provides reactive UI updates. To avoid stale closures in Web Speech callbacks (`onresult`, `onend`, `onerror`), every state variable is mirrored in a Ref (`isCallActiveRef`, `callStatusRef`, `promptRef`, `isTtsActiveRef`, `turnStartResultIndexRef`, etc.).
- **Global Coordination**: `voiceCallState.ts` maintains module-scoped variables `let isVoiceCallActiveGlobally = false` and `let activeVoiceCallThreadId = null` to coordinate with `ChatView.tsx` and `ThreadNotificationCoordinator.tsx`.
- **Pub-Sub Custom Events**: Settings update via `window.dispatchEvent(new CustomEvent("t3-stt-settings-changed", ...))` and server settings sync.

---

### 1.3 Roman Urdu / English Configuration & Chat Synchronization

1. **Bidirectional Transliteration**:
   - Google Chrome SpeechRecognition on Subcontinental locales (`ur-PK`, `hi-IN`) produces Urdu Unicode script (e.g. `میں نے کہا تھا`).
   - `formatSttTranscript` (`stt.ts:181-195`) converts this via `transliterateUrduToRoman()` (`romanUrduTransliterate.ts`) into Latin phonetic Roman Urdu (`main ne kaha tha`).
   - For playback, `adaptRomanUrduForVoice()` (`romanUrduSpeechAdapter.ts`) converts Roman Urdu back to Urdu script if the synthesis engine voice is `ur-PK`, Devanagari if `hi-IN`, or phonetically respells it if an English synthesizer is selected.
2. **Chat & Voice Turn Synchronization**:
   - User speaking: `onTranscriptChange(combinedText)` updates the chat composer input in real time.
   - Silence detector: 100ms interval in `useVoiceCallAssistant.ts:1667-1685` measures silence duration (`elapsed >= requiredSilence`, where 1 word = 3.8s, 2 words = 2.8s, 3+ words = 1.8s). When silence completes, `dispatchAutoSend()` submits the prompt to the chat thread.
   - Assistant streaming: `useEffect` in `useVoiceCallAssistant.ts:2022-2079` watches `promptHistoryMessages`. New assistant message tokens are chunked by `extractSpeechChunks(text, offset, isComplete)` and enqueued into `StreamingTtsPlayer` for instant voice playback while the text streams into the chat view.

---

### 1.4 Test Infrastructure & Test Command Execution

- **Test Framework**: Vitest with Vite-Plus (`vp`).
- **Targeted Voice Test Run**:
  Command: `npx vitest run src/components/chat/voiceCall/voiceCallAssistant.test.ts`
  Result: **15 passed (15)** in 2.94s.
- **Speech Library Test Run**:
  Command: `npx vitest run src/lib/speech/`
  Result: **7 test files passed, 58 passed (58)** in 3.42s (`acousticNoiseShield.test.ts`, `multiTurnSessionLedger.test.ts`, `romanUrduSpeechAdapter.test.ts`, `romanUrduTransliterate.test.ts`, `stt.test.ts`, `tts.test.ts`, `voiceCallLogger.test.ts`).
- **Combined Voice Suites**: 8 test suites, **73 passing tests**.
- **Typecheck Observation**: `pnpm --filter @t3tools/web typecheck` (`tsc --noEmit`) revealed strict index access type errors (e.g. `TTS_ACCENTS[0]` inferred as `TtsAccentPreset | undefined` under `noUncheckedIndexedAccess`) and test imports (`import { describe } from "vitest"` vs `"vite-plus/test"`). Vitest executes cleanly with runtime resolution.

---

### 1.5 Identified Integration Points & Potential Conflicts

1. **Barge-in Audio Destruction Bug**:
   In `useVoiceCallAssistant.ts:1781-1783`:
   ```ts
   try {
     recognitionRef.current?.abort();
   } catch {}
   ```
   Calling `abort()` during an interrupt terminates the browser audio capture session, throwing away the user's incoming utterance that initiated the interruption and inducing a 300–800ms dead zone.
2. **Untimestamped Echo Memory (False-Positive Echo Dropping)**:
   In `useVoiceCallAssistant.ts:741-764`:
   `recentAiSpokenPhrasesRef` accumulates up to 25 AI phrases without timestamp expiration. If a user repeats a technical term or phrase spoken by the AI several minutes earlier, `isUtteranceEchoOfAi()` can falsely classify the user's valid speech as speaker echo and discard it.
3. **Barge-in Word Threshold Latency**:
   In `useVoiceCallAssistant.ts:991-1014`, unless an exact trigger word in `INTERRUPT_COMMAND_TRIGGERS` is uttered, barge-in requires 3 words during streaming playback. A user speaking 1-2 urgent words (e.g., "Wait, stop that" or "Galat hai") may experience delayed cutoff.
4. **Chromium `speechSynthesis.cancel()` Deadlock**:
   In `tts.ts:1232-1237`, a workaround delay of 80ms is applied after `stopSpeaking()`, but if multiple cancels occur rapidly during active barge-in, the browser synthesis queue can deadlock unless `window.speechSynthesis.resume()` is explicitly triggered.

---

## 2. Logic Chain

1. **From Observation 1.1 & 1.2**: All voice call logic is isolated to `apps/web/src/components/chat/voiceCall/` and `apps/web/src/lib/speech/`. There are no server dependencies for browser STT/TTS; the entire conversational audio loop runs in the client browser.
2. **From Observation 1.2 & 1.5**: Because `useVoiceCallAssistant.ts` is the single point where `SpeechRecognition`, `StreamingTtsPlayer`, and `AcousticNoiseShield` converge, integrating CludeGods-style barge-in and echo filtering must occur directly at this junction.
3. **From Observation 1.5 (Item 1)**: Aborting recognition upon interruption invalidates requirement R1 ("without hanging the browser speech engine or dropping the user's incoming utterance"). Replacing `recognition.abort()` with index-based turn boundary advancement (`turnStartResultIndexRef`) allows the incoming speech buffer to be preserved intact.
4. **From Observation 1.5 (Item 2)**: Storing AI phrases with precise millisecond playback timestamps (`[startMs, endMs]`) and checking echo against only those phrases playing within `[timestamp - latency, timestamp + latency]` directly fulfills requirement R3 (CludeGods sequence matching) without false-positive dropping of subsequent user speech.
5. **From Observation 1.4**: All 73 existing voice tests compile and pass with `npx vitest run`. New tests for sub-150ms barge-in and timestamped echo filtering can be co-located in `voiceCallAssistant.test.ts` and `src/lib/speech/` without breaking existing test harnesses.

---

## 3. Caveats

1. **Browser Engine Variance**: Web Speech API (`SpeechRecognition` / `webkitSpeechRecognition`) is supported natively in Google Chrome, Chromium, Edge, and Android Chrome. Firefox and Safari desktop lack native `SpeechRecognition` support (which `isSpeechRecognitionSupported()` flags with a user warning).
2. **Audio Hardware Feedback**: On laptops with poor acoustic echo cancellation (hardware AEC disabled or cheap internal microphones), physical speaker bleed can overpower the microphone signal. While Web Audio DSP and software sequence matching filter this effectively, very high speaker volumes require stricter RMS gating thresholds.
3. **Global Typecheck**: `tsc --noEmit` across `@t3tools/web` currently reports strict indexing issues in existing code (e.g. `TTS_ACCENTS[0]!`); runtime tests via Vitest execute without errors.

---

## 4. Conclusion

The existing voice architecture in `t3forweb` provides a solid, modular foundation:

- Dedicated components exist for STT (`stt.ts`), TTS (`tts.ts`), streaming chunking (`streamingTtsPlayer.ts`), DSP filtering (`acousticNoiseShield.ts`), and voice state management (`useVoiceCallAssistant.ts`).
- Full bilingual Roman Urdu / English transliteration and voice adaptation are already active and verified by 73 passing unit tests.
- **Key upgrade vectors for the implementation team**:
  1. Eliminate `recognition.abort()` in `interruptSpeaking()` to preserve user barge-in utterances.
  2. Implement CludeGods-style timestamp-bounded echo matching (`EchoTimelineGuard` with playback window `[t_start - 300ms, t_end + 1500ms]`) to prevent false-positive echo filtering.
  3. Expand instant interrupt commands with sub-150ms cutoff and Chromium cancel-deadlock protection (`speechSynthesis.resume()` auto-kick).

---

## 5. Verification Method

To independently verify all findings and test suites:

1. **Run Targeted Voice Assistant Test Suite**:

   ```bash
   npx vitest run src/components/chat/voiceCall/voiceCallAssistant.test.ts
   ```

   _Expected Output_: 15 passed (15).

2. **Run All Speech Library Test Suites**:

   ```bash
   npx vitest run src/lib/speech/
   ```

   _Expected Output_: 7 test files, 58 passed (58).

3. **Combined Verification Command**:

   ```bash
   npx vitest run src/components/chat/voiceCall/voiceCallAssistant.test.ts src/lib/speech/
   ```

   _Expected Output_: 8 test files, 73 passed (73).

4. **Code Inspection Checkpoints**:
   - Inspect `apps/web/src/components/chat/voiceCall/useVoiceCallAssistant.ts` lines 930–1038 (Barge-in & Echo detection logic).
   - Inspect `apps/web/src/components/chat/voiceCall/useVoiceCallAssistant.ts` line 1782 (`recognitionRef.current?.abort()`).
   - Inspect `apps/web/src/lib/speech/tts.ts` lines 1099–1114 (15s keep-alive interval) and lines 1212–1227 (Sentence chunking).
   - Inspect `apps/web/src/lib/speech/acousticNoiseShield.ts` lines 100–147 (Web Audio DSP filter graph).
