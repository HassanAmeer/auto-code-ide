# Dispatch for Worker M3: Instant Barge-in & Continuous STT Keep-Alive Integration

You own exclusively:

- `apps/web/src/components/chat/voiceCall/useVoiceCallAssistant.ts`
- `apps/web/src/components/chat/voiceCall/voiceCallAssistant.test.ts`

Mission:
Integrate M1 (`cludeGodsEchoFilter.ts`) and M2 (`safeStopSpeechPlayback` in `tts.ts` + `streamingTtsPlayer.ts`) into `useVoiceCallAssistant.ts` to satisfy R1, R2, R3, R4:

1. R1: Instant Interruption & Barge-in (<150ms cutoff):
   - Replace the barge-in logic in `recognition.onresult`:
     - Run `echoFilter.processInterimTranscript(...)` on incoming interim speech.
     - If `decision.action === "barge"` or explicit command ("Stop", "Ruko", "Wait", "Tehro", "Suno", "Cancel", "Halt") detected:
       - Instantly stop speech playback using `safeStopSpeechPlayback()` and `streamingPlayerRef.current?.stop()`.
       - Abort active LLM generation stream if generating.
       - **CRITICAL (FIXES THE ABORT BUG)**: DO NOT call `recognitionRef.current?.abort()`! In `interruptSpeaking`, separate voice barge-in from manual UI stop. Voice barge-in MUST keep `SpeechRecognition` running so the user's speech buffer is preserved from word 1!
       - **CRITICAL (FIXES THE PURE STOP STATE HANG)**: If user said ONLY "Stop" / "Ruko" (i.e. `stripped === ""`):
         - Clear prompt, cancel pending auto-dispatch timer, reset transcript, and transition status immediately to `"listening"`.
         - If user said speech-over or "Stop" + query (e.g. "Ruko, line 45 check karo"):
           - Keep words in prompt, set status to `"user-speaking"`, and let normal silence countdown auto-dispatch.
2. R2: Continuous STT Keep-Alive:
   - Handle `onend` with resilient auto-restart (30ms desktop, 180ms mobile).
   - In `onerror`, treat `no-speech` and `aborted` as benign events (do not crash or terminate call).
   - Auto-recover on `network` error with backoff.
3. R3: Acoustic Echo Integration:
   - Instantiate `CludeGodsEchoFilter`.
   - Wire `streamingPlayerRef.current` `onChunkStart` and `onChunkEnd` to `echoFilter.registerPlaybackStart` and `registerPlaybackEnd`.
   - In `recognition.onresult`: drop interim/final transcripts if `echoFilter` reports `action === "drop"`.
4. R4: Preserve existing browser settings, voice selections, language fallbacks, and chat view synchronization.
5. Expand unit tests in `voiceCallAssistant.test.ts` to verify all barge-in, pure stop, echo filtering, and keep-alive behaviors.
6. Verify all tests pass:
   `pnpm --filter web test src/components/chat/voiceCall/voiceCallAssistant.test.ts`
   `pnpm --filter web test src/lib/speech/`

DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

## 2026-11-04T10:40:16Z

[Message] timestamp=2026-11-04T10:40:16Z sender=21f0c9dc-dca6-48e4-a0d7-5ba869aaf28d priority=MESSAGE_PRIORITY_HIGH
Worker M3: Barge-In and Lifecycle Integration Specialist dispatched.
