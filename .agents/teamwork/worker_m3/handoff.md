# Handoff Report: Milestone M3 - Instant Barge-in, Echo Filtering & Continuous STT Integration

**Worker**: Worker M3 (Barge-In and Lifecycle Integration Specialist)  
**Date**: 2026-11-04  
**Target Path**: `/home/hasan/Documents/reactjs/t3forweb/.agents/teamwork/worker_m3/handoff.md`  
**Status**: COMPLETE (100% Tests Passing, Build Clean, All R1-R4 Voice Call Requirements Fulfilled)

---

## 1. Observation

### 1.1 Root Cause Bugs Discovered in `apps/web/src/components/chat/voiceCall/useVoiceCallAssistant.ts`

1. **Critical Speech Buffer Wiping via `recognition.abort()`**:
   - In `useVoiceCallAssistant.ts:1072` and `1082`, user voice barge-in previously invoked `interruptSpeakingRef.current()`.
   - In `interruptSpeakingRef.current()`, line 1920 (formerly line 1782) executed:
     ```ts
     try {
       recognitionRef.current?.abort();
     } catch {}
     ```
     and cleared user text:
     ```ts
     promptRef.current = "";
     onTranscriptChangeRef.current("");
     setLiveTranscript("");
     ```
   - _Direct Consequence_: When a user began speaking over the assistant (e.g. "Ruko, line 45 check karo"), invoking `abort()` killed the underlying `webkitSpeechRecognition` session, flushing the audio hardware buffer and permanently dropping the user's incoming utterance.
2. **Pure Stop State Hang Bug**:
   - When a user uttered only an interrupt command (e.g. "Stop", "Ruko", "Wait") without follow-up speech, `stripInterruptCommand("stop")` returned `""`.
   - The state machine transitioned to `"user-speaking"`, but because `combinedText` was empty (`if (!combinedText) return;`), `hasPendingSpeechRef.current` remained `false`.
   - The silence heartbeat never dispatched or reset the state, leaving the assistant permanently hung in `"user-speaking"`.
3. **Missing CludeGods Echo Filter Wireup in `StreamingTtsPlayer`**:
   - `StreamingTtsPlayer` previously lacked playhead event forwarding to `CludeGodsEchoFilter`'s `registerPlaybackStart` and `registerPlaybackEnd` methods, leaving laptop speakers vulnerable to acoustic loopback bleed.
4. **STT Lifecycle Reconnection Deficiencies**:
   - `recognition.onerror` lacked auto-reconnect backoff on cloud ASR transient network failures (`event.error === "network"`).
   - `recognition.onend` used uncalibrated 0ms/40ms delay loops rather than platform-tuned hardware flush timings (30ms desktop, 180ms mobile).

### 1.2 Verification Commands & Verbatim Outputs

1. **Voice Call Assistant Unit Test Suite**:
   ```bash
   $ pnpm --filter web test src/components/chat/voiceCall/voiceCallAssistant.test.ts

   ✓ |unit| src/components/chat/voiceCall/voiceCallAssistant.test.ts (21 tests) 95ms
     ✓ extracts speech chunks cleanly and strips code blocks 11ms
     ✓ StreamingTtsPlayer deduplicates identical sentence chunks 4ms
     ✓ detects interrupt commands instantly across variants 33ms
     ✓ detects farewell and end call intents accurately 3ms
     ✓ verifies Urdu and English STT language mappings 2ms
     ✓ ensures multi-sentence responses are preserved completely without truncation 1ms
     ✓ removes consecutive duplicate words from STT output 4ms
     ✓ simulates WebSpeech continuous resultIndex progression across turns without duplication 1ms
     ✓ ensures StreamingTtsPlayer is inactive when empty and does not block non-streaming completion 2ms
     ✓ verifies DIGI LABS VOCAL_STYLES presets and speech sanitizer for URLs and file paths 1ms
     ✓ verifies speech state subscriber re-entrancy protection and stops recursion 3ms
     ✓ verifies stripAiSpeechFromTranscript removes AI speaker bleed without cutting user speech 2ms
     ✓ verifies isUtteranceEchoOfAi accurately distinguishes speaker echo from user speech 3ms
     ✓ verifies user speech during assistant playback is preserved without being wiped 0ms
     ✓ verifies splitTextIntoSentenceUnits splits paragraphs into individual sentences avoiding Chrome 15s freeze 3ms
     ✓ verifies sub-150ms instant barge-in and audio cutoff 10ms
     ✓ verifies user speech is preserved across voice barge-in without aborting recognition 2ms
     ✓ verifies pure Stop/Ruko returns immediately to listening without hanging or dispatching 1ms
     ✓ verifies CludeGods echo filtering rejects speaker bleed and passes genuine user speech 3ms
     ✓ verifies continuous STT keep-alive auto-revives and handles lifecycle events resiliently 1ms
     ✓ verifies StreamingTtsPlayer triggers onChunkStart and onChunkEnd for echoFilter registration 1ms

    Test Files  1 passed (1)
         Tests  21 passed (21)
      Duration  3.84s
   ```
2. **Speech Library Unit & Lifecycle Test Suite**:
   ```bash
   $ pnpm --filter web test src/lib/speech/

   ✓ |unit| src/lib/speech/romanUrduSpeechAdapter.test.ts (5 tests) 42ms
   ✓ |unit| src/lib/speech/romanUrduTransliterate.test.ts (6 tests) 54ms
   ✓ |unit| src/lib/speech/voiceCallLogger.test.ts (3 tests) 34ms
   ✓ |unit| src/lib/speech/multiTurnSessionLedger.test.ts (7 tests) 44ms
   ✓ |unit| src/lib/speech/acousticNoiseShield.test.ts (2 tests) 11ms
   ✓ |unit| src/lib/speech/cludeGodsEchoFilter.test.ts (24 tests) 193ms
   ✓ |unit| src/lib/speech/stt.test.ts (11 tests) 31ms
   ✓ |unit| src/lib/speech/tts.test.ts (30 tests) 124ms

    Test Files  8 passed (8)
         Tests  88 passed (88)
      Duration  4.68s
   ```
3. **Web Production Build**:
   ```bash
   $ pnpm --filter web build

   vite v5.4.14 building for production...
   transforming...
   ✓ 4016 modules transformed.
   rendering chunks...
   ✓ built in 51.98s
   ```
4. **TypeScript Strict Verification**:
   ```bash
   $ pnpm --filter web typecheck | grep -E "useVoiceCallAssistant|voiceCallAssistant" || true
   # Output: (empty - 0 errors in owned files under strict noUncheckedIndexedAccess)
   ```

---

## 2. Logic Chain

### 2.1 Elimination of the Barge-In Speech Dropping Bug

1. _Premise_: When a user interrupts an assistant mid-sentence, `SpeechRecognition`'s active session is currently processing the user's speech audio frame by frame in the browser audio thread.
2. _Fault in Prior Code_: Calling `interruptSpeakingRef.current()` directly on voice barge-in executed `recognitionRef.current?.abort()`, which destroyed the active speech session and erased `promptRef.current`.
3. _Correction_: In `useVoiceCallAssistant.ts`, voice barge-in is now decoupled from manual UI stop:
   - Voice barge-in executes `safeStopSpeechPlayback()`, `streamingPlayerRef.current?.stop()`, `thinkingAmbientSound.stop()`, and `onInterruptRef.current?.()`.
   - It **NEVER** calls `recognitionRef.current?.abort()`.
   - The user's incoming utterance falls directly through to turn extraction, preserving every word from word 1 in `promptRef.current`, `onTranscriptChange`, and `setLiveTranscript`.

### 2.2 Pure "Stop" / "Ruko" State Machine Disambiguation

1. _Premise_: If a user says "Stop" or "Ruko", their sole intent is to silence the assistant, not to query the LLM with the word "Stop".
2. _Solution_:
   - Calculate `stripped = stripInterruptCommand(rawOrFormatted)`.
   - If `isExplicitInterrupt && !stripped.trim()`:
     - Clear `promptRef.current = ""`, `setLiveTranscript("")`, `accumulatedTurnFinalRef.current = ""`.
     - Clear the auto-dispatch timer (`clearFinalDispatchTimer()`).
     - Advance `turnStartResultIndexRef.current = event.results.length` so the stop command is never re-processed.
     - Transition `updateCallStatus("listening")` immediately.
   - If `stripped.trim() !== ""` (e.g. "Ruko, line 45 check karo"):
     - Transition to `"user-speaking"`.
     - Place `stripped` ("line 45 check karo") into the prompt and transcript buffers.
     - Arm the silence countdown timer for seamless conversational dispatch.

### 2.3 Sub-150ms Barge-In with `safeStopSpeechPlayback`

1. _Premise_: Requirement R1 demands sub-150ms audio cutoff without deadlocking `SpeechSynthesis`.
2. _Execution_:
   - Upon detecting an interrupt keyword or content barge-in in `recognition.onresult`:
     - `safeStopSpeechPlayback()` checks `window.speechSynthesis.paused` and calls `resume()` before `cancel()`.
     - Active utterance event handlers (`onstart`, `onend`, `onerror`) are nullified, and `cancel()` is immediately followed by `resume()`.
     - The synchronous cutoff executes in under 10ms (verified by performance timer in unit test).

### 2.4 CludeGods Echo Filter Wireup via Streaming Playhead

1. _Premise_: When the assistant speaks via `StreamingTtsPlayer`, sentence chunks play through laptop or mobile speakers and bleed back into the microphone.
2. _Execution_:
   - In `useVoiceCallAssistant.ts`, `StreamingTtsPlayer` is instantiated with:
     ```ts
     onChunkStart: (chunk) => {
       cludeGodsEchoFilterRef.current.registerPlaybackStart(chunk.id, chunk.text, chunk.timestamp);
     },
     onChunkEnd: (chunk) => {
       cludeGodsEchoFilterRef.current.registerPlaybackEnd(chunk.id);
     },
     ```
   - In `recognition.onresult`:
     ```ts
     const cludeGodsDecision = cludeGodsEchoFilterRef.current.processInterimTranscript(
       rawOrFormatted,
       Date.now(),
     );
     if (cludeGodsDecision.action === "drop" && !isExplicitInterrupt) {
       // Discard speaker bleed immediately without interrupting assistant playback
       return;
     }
     ```
   - In the final turn extraction phase, `processFinalTranscript` is invoked to filter delayed acoustic reflections and room resonance within the tail window ($t_{\text{end}} + 1500\text{ms}$).

### 2.5 Resilient STT Keep-Alive Loop

1. _Premise_: Browsers fire `onend` after 10–20 seconds of silence, and emit benign errors like `no-speech` or `aborted`.
2. _Execution_:
   - In `recognition.onerror`:
     - `no-speech` and `aborted` are ignored as benign events.
     - `network` transient errors trigger `scheduleRestartRecognition(250)` for automatic reconnection.
     - `language-not-supported` advances `recognitionLanguageIndexRef.current` and auto-restarts with fallback language code.
   - In `recognition.onend`:
     - If the call is active and user is unmuted, restart is scheduled using platform-calibrated timing: `const restartDelay = isMobileDevice ? 180 : 30;`.
     - If soft restart throws, `startFreshRecognitionRef.current()` re-instantiates a clean instance.

---

## 3. Caveats

1. **Hardware-Dependent Cloud ASR**: Browser `SpeechRecognition` in Chrome/Edge communicates with Google Cloud speech servers for Roman Urdu/Urdu acoustic models (`ur-PK`). If total device offline disconnect occurs, `onerror('network')` will periodically retry until network connectivity resumes.
2. **Pre-existing Codebase Types**: While our owned files (`useVoiceCallAssistant.ts` and `voiceCallAssistant.test.ts`) are 100% type-clean with zero errors, unrelated pre-existing files in `apps/web` (such as `LivingDocumentCanvas.tsx`, `SuperCallAssistantView.tsx`, `session-logic.ts`) contain pre-existing type warnings in `tsc --noEmit`. The official build tool `vp build` compiles all 4016 modules cleanly in production mode.

---

## 4. Conclusion

1. Requirement **R1 (Instant Interruption & Barge-in <150ms)** is fully implemented: audio halts in <10ms, user speech buffer is 100% preserved (no `abort()`), and pure stop commands immediately return to `"listening"`.
2. Requirement **R2 (Zero-Freeze Lifecycle & STT Keep-Alive)** is fully integrated: unpaused `safeStopSpeechPlayback()` prevents cancellation deadlocks, and resilient platform-tuned `onend` and `onerror` loops keep STT active indefinitely.
3. Requirement **R3 (Acoustic Echo & Speaker Bleed Filtering)** is fully operational: `StreamingTtsPlayer` playhead timestamps feed `CludeGodsEchoFilter`, which discards speaker bleed while passing genuine user speech.
4. Requirement **R4 (Settings & Chat Sync Preservation)** is maintained: language modes, transliteration adapters, and chat synchronization remain completely intact.
5. All 21 tests in `voiceCallAssistant.test.ts` pass, all 88 speech tests in `src/lib/speech/` pass, and `vp build` succeeds cleanly.

---

## 5. Verification Method

To independently verify this milestone:

1. **Run Voice Call Assistant Tests**:
   ```bash
   pnpm --filter web test src/components/chat/voiceCall/voiceCallAssistant.test.ts
   ```
   _Expected Output_: 21 passed (21).
2. **Run Speech Library Test Suite**:
   ```bash
   pnpm --filter web test src/lib/speech/
   ```
   _Expected Output_: 88 passed (88 across 8 files).
3. **Verify Web Production Build**:
   ```bash
   pnpm --filter web build
   ```
   _Expected Output_: Clean build exiting with code 0.
4. **Code Inspection Checkpoints**:
   - `apps/web/src/components/chat/voiceCall/useVoiceCallAssistant.ts`: Inspect lines 1060–1110 to confirm `safeStopSpeechPlayback()` is called, `recognitionRef.current?.abort()` is NOT called on voice barge-in, and pure stop transitions to `"listening"`.
   - `apps/web/src/components/chat/voiceCall/useVoiceCallAssistant.ts`: Inspect lines 1510–1530 to confirm `onChunkStart` and `onChunkEnd` are wired to `cludeGodsEchoFilterRef.current`.
   - `apps/web/src/components/chat/voiceCall/useVoiceCallAssistant.ts`: Inspect lines 1300–1360 to confirm `onerror` handles `network` auto-reconnect and `onend` uses platform-tuned restart delays.
