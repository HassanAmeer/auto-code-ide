# BRIEFING — 2026-11-04T10:22:30Z

## Mission

Investigate R1 (Instant Interruption/Barge-in <150ms cutoff) and R2 (Zero-Freeze TTS Lifecycle & Continuous STT Keep-Alive) for browser Web Speech API.

## 🔒 My Identity

- Archetype: explorer
- Roles: Lifecycle and Barge-in Specialist
- Working directory: /home/hasan/Documents/reactjs/t3forweb/.agents/teamwork/explorer_survey_3
- Original parent: 21f0c9dc-dca6-48e4-a0d7-5ba869aaf28d
- Milestone: Explorer Survey

## 🔒 Key Constraints

- Read-only investigation — do NOT implement in source code
- Focus on R1 & R2: Instant Barge-in (<150ms), Chromium 15s TTS GC freeze, SpeechSynthesis cancel deadlocks, Continuous STT Keep-Alive
- Preserve multi-session code and zero reversion
- Roman Urdu communication with orchestrator / reports

## Current Parent

- Conversation ID: 21f0c9dc-dca6-48e4-a0d7-5ba869aaf28d
- Updated: not yet

## Investigation State

- **Explored paths**:
  - `apps/web/src/components/chat/voiceCall/useVoiceCallAssistant.ts` (lines 1-2096)
  - `apps/web/src/components/chat/voiceCall/streamingTtsPlayer.ts`
  - `apps/web/src/components/chat/voiceCall/voiceCallAssistant.test.ts`
  - `apps/web/src/lib/speech/stt.ts`, `stt.test.ts`
  - `apps/web/src/lib/speech/tts.ts`, `tts.test.ts`
  - `apps/web/src/lib/speech/acousticNoiseShield.ts`
  - `apps/web/src/components/chat/voiceCall/mobileVoiceKeepAlive.ts`
  - `apps/web/src/components/chat/voiceCall/SuperCallAssistantView.tsx`
- **Key findings**:
  1. STT Barge-in utterance drop bug identified: `useVoiceCallAssistant.ts:1017` invokes `interruptSpeakingRef.current()`, which executes line 1782 `recognitionRef.current?.abort()`, destroying the active recognition session and dropping the user's utterance while attempting to fall through to turn extraction.
  2. Status stuck in `"user-speaking"` on pure stop commands: if the user commands "Stop" or "Ruko", `stripInterruptCommand` returns empty, leaving the assistant stuck in `"user-speaking"` without a pending dispatch timer.
  3. Chromium 15s TTS GC freeze mechanics & 3-layer solution: Global Set reference retention, 5-7s pause/resume pulse, and sentence chunking.
  4. SpeechSynthesis `cancel()` deadlock: Paused-cancel deadlock, IPC race on immediate `.speak()`, and zombie event listeners firing on aborted utterances.
  5. Continuous STT keep-alive: Resilient `onend` loop with platform-tuned delays, non-fatal handling of `no-speech` and `aborted`, and continuous result indexing.
- **Unexplored areas**: None for R1 and R2; findings ready for comprehensive handoff report.

## Key Decisions Made

- Formulated complete state machine and concrete code patterns for zero-freeze, zero-deadlock operation and sub-150ms barge-in.

## Artifact Index

- DISPATCH.md — Task dispatch record
- BRIEFING.md — Persistent context & situational awareness
- progress.md — Liveness heartbeat & progress log
- handoff.md — Final 5-component handoff report
