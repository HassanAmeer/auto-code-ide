# Progress Log — Explorer Survey 3 (Lifecycle & Barge-in)

- **Started**: 2026-11-04T10:14:40Z
- **Last visited**: 2026-11-04T10:22:15Z
- **Status**: Completed codebase inspection and root cause analysis of R1 & R2.
- **Key Milestones**:
  1. Inspected existing STT (`stt.ts`, `stt.test.ts`) and TTS (`tts.ts`, `tts.test.ts`) implementations.
  2. Inspected `useVoiceCallAssistant.ts`, `streamingTtsPlayer.ts`, `acousticNoiseShield.ts`, `mobileVoiceKeepAlive.ts`.
  3. Verified all existing 58 unit tests in `src/lib/speech/` and 15 tests in `voiceCallAssistant.test.ts` pass.
  4. Discovered critical bug in `useVoiceCallAssistant.ts`: `interruptSpeaking` aborts `recognitionRef.current?.abort()`, which destroys active recognition and drops user's utterance during STT barge-in.
  5. Discovered state hang bug: when user says pure "Stop", status becomes stuck in `"user-speaking"` with no speech pending.
  6. Analyzed Chromium 15s GC pause/freeze bug and proved 3-layer remedy (Global Set retention, 5-7s pause/resume pulse, sentence chunking).
  7. Analyzed SpeechSynthesis `cancel()` deadlock (paused-cancel freeze, race conditions with immediate speak, zombie event listeners) and formulated zero-deadlock pattern.
  8. Formulated Continuous STT Keep-Alive state machine with resilient `onend`/`onerror` handling and turn index tracking.
