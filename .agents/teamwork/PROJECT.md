# Project: Web Voice Call Assistant Upgrade

## Architecture

- **Client-Side Conversational Voice Stack**:
  - `apps/web/src/components/chat/voiceCall/`: UI view, audio visualizer canvas, full-duplex session coordinator (`useVoiceCallAssistant.ts`), streaming chunk player (`streamingTtsPlayer.ts`), mobile background keep-alive (`mobileVoiceKeepAlive.ts`).
  - `apps/web/src/lib/speech/`: Speech Recognition (`stt.ts`), Speech Synthesis (`tts.ts`), DSP acoustic filter (`acousticNoiseShield.ts`), CludeGods acoustic echo filter (`cludeGodsEchoFilter.ts`), Roman Urdu phonetic converters (`romanUrduSpeechAdapter.ts`, `romanUrduTransliterate.ts`).
- **Data & Event Flow**:
  1. User speaks -> Browser `SpeechRecognition` emits `interimResults`.
  2. Interim transcript is processed by `CludeGodsEchoFilter` with playhead timestamp matching against currently active or recent assistant speech.
  3. If echo -> dropped immediately (<2.5ms) without interrupting assistant playback.
  4. If real user speech or explicit interrupt command ("Stop", "Ruko", "Wait") -> Instant barge-in triggered:
     - `safeStopSpeechPlayback()` terminates browser TTS within 5ms without `cancel()` deadlock.
     - `StreamingTtsPlayer` stopped, ambient sounds stopped, active LLM generation aborted.
     - **CRITICAL**: `SpeechRecognition` is NOT aborted; user's speech buffer is preserved from word 1.
  5. If user said ONLY "Stop" / "Ruko" -> return to "listening" immediately with clean prompt.
  6. If user spoke a new query -> retain words in composer, wait for conversational silence (1.8s - 3.8s), auto-dispatch to chat.
  7. Assistant response streams text to ChatView and sentence chunks to `StreamingTtsPlayer` with triple-layer 15s Chromium freeze bypass.

## Code Layout

- `apps/web/src/lib/speech/cludeGodsEchoFilter.ts`: Pure TypeScript CludeGods sequence matching & echo filter engine.
- `apps/web/src/lib/speech/cludeGodsEchoFilter.test.ts`: Unit tests for echo filter (Levenshtein, loose word matching, stopword shield, sliding char matching, Roman Urdu).
- `apps/web/src/lib/speech/tts.ts`: `safeStopSpeechPlayback()`, Chromium 15s GC pause/resume pulse, unpaused `cancel()`, utterance listeners cleanup.
- `apps/web/src/components/chat/voiceCall/streamingTtsPlayer.ts`: Playhead event tracking (`onChunkStart`, `onChunkEnd`), clean interruption.
- `apps/web/src/components/chat/voiceCall/useVoiceCallAssistant.ts`: Instant barge-in (<150ms), eliminate `recognition.abort()` on barge-in, pure "Stop" state machine transition, continuous STT keep-alive loop, chat sync.
- `apps/web/src/components/chat/voiceCall/voiceCallAssistant.test.ts`: Expanded voice assistant unit & integration tests.
- `apps/web/src/components/chat/voiceCall/voiceCallE2E.test.ts`: Comprehensive E2E test suite covering Tiers 1-4.

## Feature Inventory

| #   | Feature                                     | Description                                                                        | Milestone            | Source                    |
| --- | ------------------------------------------- | ---------------------------------------------------------------------------------- | -------------------- | ------------------------- |
| 1   | CludeGods Timestamp Sequence Matching       | Timestamp playhead tracking [t_start - 300ms, t_end + 1500ms]                      | M1                   | R3 (ORIGINAL_REQUEST)     |
| 2   | Multi-Tier Loose Word & Char Echo Rejection | Loose word equivalence, 4-char prefix, Levenshtein, sliding char ratio >= 0.58     | M1                   | R3 (ORIGINAL_REQUEST)     |
| 3   | Roman Urdu & Bilingual Echo Handling        | Urdu transliteration normalization, numeral expansion, stopword shielding          | M1                   | R3, R4 (ORIGINAL_REQUEST) |
| 4   | Safe TTS Cancellation & Deadlock Prevention | `safeStopSpeechPlayback()`, unpause before cancel, listener nullification          | M2                   | R1, R2 (ORIGINAL_REQUEST) |
| 5   | Chromium 15s GC Freeze & Stalling Bypass    | Global Set retention, 5s heartbeat pause/resume pulse, sentence unit chunking      | M2                   | R2 (ORIGINAL_REQUEST)     |
| 6   | Instant Interruption (<150ms Cutoff)        | Interim STT keyword detection ("Stop", "Ruko", "Wait"), sub-150ms TTS halt         | M3                   | R1 (ORIGINAL_REQUEST)     |
| 7   | Zero-Drop Barge-in Utterance Preservation   | Eliminate `recognition.abort()` on voice barge-in, preserve speech from word 1     | M3                   | R1 (ORIGINAL_REQUEST)     |
| 8   | Pure Stop State Machine Transition          | Immediate return to "listening" when user says only "Stop" / "Ruko" (no hang)      | M3                   | R1 (ORIGINAL_REQUEST)     |
| 9   | Continuous STT Keep-Alive Loop              | Resilient `onend` auto-restart (30ms desktop, 180ms mobile), non-fatal `no-speech` | M3                   | R2 (ORIGINAL_REQUEST)     |
| 10  | Settings Preservation & Seamless Chat Sync  | Retain existing voice/STT/TTS settings, sync completed turns to ChatView           | M3                   | R4 (ORIGINAL_REQUEST)     |
| 11  | Opaque-Box E2E Testing Suite (Tiers 1-4)    | Comprehensive requirement-driven tests covering all R1-R4 acceptance criteria      | M4 (E2E Track)       | ORIGINAL_REQUEST          |
| 12  | Adversarial Hardening & Forensic Audit      | White-box stress tests (Tier 5) + Forensic Integrity Audit                         | M4 (Final Milestone) | ORIGINAL_REQUEST          |

## Milestones

| #   | Name                                                     | Scope                                                                   | Dependencies  | Status  |
| --- | -------------------------------------------------------- | ----------------------------------------------------------------------- | ------------- | ------- |
| M1  | CludeGods Echo Filter Engine                             | `cludeGodsEchoFilter.ts` + unit tests                                   | none          | DONE    |
| M2  | Zero-Freeze TTS Lifecycle & Cancel Deadlock Elimination  | `tts.ts` + `streamingTtsPlayer.ts`                                      | none          | DONE    |
| M3  | Instant Barge-in & Continuous STT Keep-Alive Integration | `useVoiceCallAssistant.ts` integration with M1 & M2                     | M1, M2        | PLANNED |
| M4  | E2E Testing Track, Full Verification & Audit             | Tiers 1-4 E2E test pass + Tier 5 Adversarial Hardening + Forensic Audit | M3, E2E Track | PLANNED |

## Interface Contracts

### `CludeGodsEchoFilter` (`apps/web/src/lib/speech/cludeGodsEchoFilter.ts`)

```typescript
export interface SpokenUtterance {
  id: string;
  text: string;
  startTime: number;
  endTime: number | null;
}

export interface EchoFilterDecision {
  action: "drop" | "barge" | "emit";
  cleanedText: string;
  reason: string;
  isBargeIn: boolean;
  charEchoScore: number;
  wordOverlapRatio: number;
}

export class CludeGodsEchoFilter {
  constructor(options?: CludeGodsEchoFilterOptions);
  registerPlaybackStart(id: string, text: string): void;
  registerPlaybackEnd(id: string): void;
  processInterimTranscript(rawTranscript: string, eventTimestamp?: number): EchoFilterDecision;
  processFinalTranscript(rawTranscript: string, eventTimestamp?: number): EchoFilterDecision;
  reset(): void;
}
```

### `safeStopSpeechPlayback` (`apps/web/src/lib/speech/tts.ts`)

```typescript
export function safeStopSpeechPlayback(): void;
```

- Halts any active `SpeechSynthesis` playback within 5ms.
- Always checks `window.speechSynthesis.paused` and calls `resume()` before `cancel()`.
- Nullifies `onstart`, `onend`, `onerror` on all active utterances.
- Calls `cancel()` followed immediately by `resume()`.
- Resets internal utterance sets and queues.

### `handleVoiceBargeIn` in `useVoiceCallAssistant.ts`

- Triggered when `echoFilter.processInterimTranscript` reports `action: "barge"` or explicit command detected.
- Calls `safeStopSpeechPlayback()`.
- Does NOT call `recognition.abort()`.
- Strips interrupt commands. If remaining text is empty, updates status to `"listening"` immediately.
- If remaining text exists, preserves words, sets status to `"user-speaking"`, and arms auto-dispatch timer.
