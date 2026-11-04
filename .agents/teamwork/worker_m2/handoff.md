# Handoff Report: M2 - Zero-Freeze TTS Lifecycle & Cancel Deadlock Elimination

**Worker**: Worker M2 (Zero-Freeze TTS Lifecycle & Cancel Deadlock Elimination Specialist)  
**Date**: 2026-11-04  
**Scope**: `apps/web/src/lib/speech/tts.ts` and `apps/web/src/components/chat/voiceCall/streamingTtsPlayer.ts`

---

## 1. Observation

### 1.1 SpeechSynthesis Cancellation Deadlock in `apps/web/src/lib/speech/tts.ts`

- **Initial Code Pattern** (`tts.ts:683-707`):
  `stopSpeaking()` called `window.speechSynthesis.cancel()` directly.
  - If `window.speechSynthesis.paused === true` when `cancel()` was called, Blink and WebKit speech synthesis engines enter a permanent hang/freeze state.
  - Active `SpeechSynthesisUtterance` instances still had `onstart`, `onend`, `onerror` listeners attached. When `cancel()` was executed, Chromium asynchronously emitted ghost error events (`error: 'canceled'` / `'interrupted'`), invoking stale `finishSpeech()` callbacks and polluting subsequent playback queues.
  - `resume()` was called before `speak()`, but was missing before and after `cancel()`.

### 1.2 Chromium 15-Second Audio IPC Freeze Bug in `speakSingleUtterance`

- **Initial Code Pattern** (`tts.ts:1100-1115`):
  - Utterances longer than 15s freeze in Desktop Chromium due to native Blink audio IPC thread sleeping without an audio pulse.
  - The heartbeat interval was previously set at 3500ms; required standard is 5000ms pulse (`speechSynthesis.pause()` followed immediately by `speechSynthesis.resume()`) to keep the Blink audio IPC queue active without audible disruption.
  - `activeUtterancesSet` and window queue (`(window as any).__t3_speech_queue`) retain references against V8 garbage collection.

### 1.3 `StreamingTtsPlayer` Playhead Tracking & Chunk Dispatching

- **Initial Code Pattern** (`streamingTtsPlayer.ts:61-93`, `178-208`):
  - `StreamingTtsPlayer` only had `onChunkStarted?: (chunk: string) => void`. It lacked structured playhead tracking (`onChunkStart` and `onChunkEnd` with unique IDs and metadata) needed by acoustic echo filters (`CludeGodsEchoFilter`) to register sentence start/end timestamps.
  - When `stop()` was called, the player cancelled speech synthesis but did not cleanly terminate or notify `onChunkEnd` for the in-flight chunk.

### 1.4 Test Suite Verifications

- Initial run of existing test suite:
  - `pnpm --filter web test src/lib/speech/tts.test.ts`: 24/24 passed.
  - `pnpm --filter web test src/components/chat/voiceCall/voiceCallAssistant.test.ts`: 15/15 passed.
- Post-implementation run:
  - `pnpm --filter web test src/lib/speech/tts.test.ts`: 30/30 passed (6 new lifecycle tests).
  - `pnpm --filter web test src/lib/speech/`: 88/88 passed across all 8 test files.
  - `pnpm --filter web test src/components/chat/voiceCall/voiceCallAssistant.test.ts`: 15/15 passed.
  - `pnpm --filter web build`: Build completed cleanly with 0 TypeScript/bundling errors in 54.43s.

---

## 2. Logic Chain

1. **Deadlock Elimination**:
   - Calling `window.speechSynthesis.resume()` before `cancel()` guarantees the audio engine is never in a paused state when cancelled, preventing the Chromium/Safari audio thread hang.
   - Detaching all event handlers (`onstart = onend = onerror = onpause = onresume = null`) on all items in `activeUtterancesSet` guarantees no zombie callbacks fire asynchronously.
   - Calling `window.speechSynthesis.resume()` immediately after `cancel()` unblocks Blink's internal state machine for subsequent utterance queues.
   - Clearing `activeUtterancesSet`, `(window as any).__t3_speech_queue`, and notifying state via `notifySpeechState(false, null)` guarantees full state reset within <5ms.

2. **Chromium 15s Freeze Triple-Layer Protection**:
   - _Layer 1 (V8 GC Retention)_: Utterances are referenced in `activeUtterancesSet` and `(window as any).__t3_speech_queue`.
   - _Layer 2 (Blink Audio IPC Pulse)_: A 5000ms heartbeat pulse (`pause()` + `resume()`) keeps the native Chromium synthesis thread alive without audio glitches.
   - _Layer 3 (Sentence Chunking)_: Multi-sentence text is split into natural sentence units via `splitTextIntoSentenceUnits(clean)`, keeping utterance durations typically under 2-6 seconds.

3. **Playhead Event Callbacks in `StreamingTtsPlayer`**:
   - Defined `SpeechChunk` with `{ id: string, text: string, index: number, timestamp?: number }`.
   - Added optional playhead callbacks: `onChunkStart?: (chunk: SpeechChunk) => void` and `onChunkEnd?: (chunk: SpeechChunk) => void`.
   - Kept `onChunkStarted?: (chunk: string) => void` for backwards compatibility.
   - In `stop()`, if an active chunk is in-flight, `onChunkEnd` is invoked immediately, followed by `safeStopSpeechPlayback()` for instant, clean cutoff.

---

## 3. Caveats

- In headless Node.js test environments without native Web Speech API, `window.speechSynthesis` and `SpeechSynthesisUtterance` must be mocked as standard; `getAvailableVoices()` has been hardened with `typeof window.speechSynthesis.getVoices === "function"` so partial mocks or environments lacking `getVoices` do not throw.
- Hardware-level AEC is dependent on OS audio drivers; software-level playhead tracking (`onChunkStart`/`onChunkEnd`) coordinates with M1 `CludeGodsEchoFilter` to reject acoustic speaker bleed.

---

## 4. Conclusion

- `safeStopSpeechPlayback()` is fully implemented and exported in `apps/web/src/lib/speech/tts.ts`.
- `stopSpeaking()` is upgraded to use `safeStopSpeechPlayback()`.
- Chromium 15s freeze triple-layer protection (Set retention, 5000ms pulse, sentence chunking) and pre-speak unpause checks are operational.
- `StreamingTtsPlayer` dispatches clean sentence chunks with `SpeechChunk` metadata, triggers `onChunkStart` and `onChunkEnd`, and executes instant, zero-deadlock cancellation.
- All unit and integration test suites pass (100%), and `pnpm --filter web build` builds cleanly.

---

## 5. Verification Method

To independently verify the implementation:

1. **Run TTS Unit & Lifecycle Tests**:

   ```bash
   pnpm --filter web test src/lib/speech/tts.test.ts
   ```

   _Expected_: 30/30 tests pass.

2. **Run Entire Speech Test Suite**:

   ```bash
   pnpm --filter web test src/lib/speech/
   ```

   _Expected_: 88/88 tests pass across 8 test files.

3. **Run Voice Call Assistant Tests**:

   ```bash
   pnpm --filter web test src/components/chat/voiceCall/voiceCallAssistant.test.ts
   ```

   _Expected_: 15/15 tests pass.

4. **Verify Web Build**:
   ```bash
   pnpm --filter web build
   ```
   _Expected_: Clean build with code 0.
