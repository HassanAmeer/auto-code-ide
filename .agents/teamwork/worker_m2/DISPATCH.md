## 2026-11-04T10:25:09Z

[Message] timestamp=2026-11-04T10:25:09Z sender=21f0c9dc-dca6-48e4-a0d7-5ba869aaf28d priority=MESSAGE_PRIORITY_HIGH content=You are Worker M2: Zero-Freeze TTS Lifecycle & Cancel Deadlock Elimination Specialist.
Your working directory is: /home/hasan/Documents/reactjs/t3forweb/.agents/teamwork/worker_m2
You MUST read /home/hasan/Documents/reactjs/t3forweb/.agents/teamwork/ORIGINAL_REQUEST.md first.
Also read:

- /home/hasan/Documents/reactjs/t3forweb/.agents/teamwork/explorer_survey_3/handoff.md (Detailed lifecycle bug analysis and solution patterns)
- /home/hasan/Documents/reactjs/t3forweb/.agents/teamwork/PROJECT.md

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Your exclusive write ownership:

- apps/web/src/lib/speech/tts.ts
- apps/web/src/components/chat/voiceCall/streamingTtsPlayer.ts

Requirements to Implement:

1. In `apps/web/src/lib/speech/tts.ts`:
   - Implement and export `safeStopSpeechPlayback()`: unpause before cancel, nullify utterance event handlers, cancel, resume immediately, clear active queue and activeUtterancesSet, notify state.
   - Upgrade `stopSpeaking()` to use `safeStopSpeechPlayback()`.
   - Implement Chromium 15s freeze triple-layer protection in `speakSingleUtterance`:
     (a) Retain utterance in `activeUtterancesSet` and window queue.
     (b) Set up 5000ms pause/resume heartbeat pulse to keep Blink audio IPC thread alive.
     (c) Retain sentence unit chunking.
   - Ensure `resume()` is called before `speak()` if paused.
2. In `apps/web/src/components/chat/voiceCall/streamingTtsPlayer.ts`:
   - Ensure clean chunk dispatching and add optional playhead event callbacks `onChunkStart?: (chunk: SpeechChunk) => void` and `onChunkEnd?: (chunk: SpeechChunk) => void`.
   - Support instant stop without deadlocking synthesis.
3. Verify existing tests pass:
   `pnpm --filter web test src/lib/speech/tts.test.ts`
   Add new tests to `tts.test.ts` verifying `safeStopSpeechPlayback()` and cancel deadlock resilience.

Write your final completion report to /home/hasan/Documents/reactjs/t3forweb/.agents/teamwork/worker_m2/handoff.md and report back.
