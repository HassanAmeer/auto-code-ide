# BRIEFING — 2026-11-04T10:41:00Z

## Mission

Integrate instant interruption (<150ms barge-in), CludeGods echo filtering, safe TTS cancellation, and continuous STT keep-alive into useVoiceCallAssistant.ts and expand test coverage in voiceCallAssistant.test.ts.

## 🔒 My Identity

- Archetype: worker
- Roles: implementer, qa, specialist
- Working directory: /home/hasan/Documents/reactjs/t3forweb/.agents/teamwork/worker_m3
- Original parent: 21f0c9dc-dca6-48e4-a0d7-5ba869aaf28d
- Milestone: M3

## 🔒 Key Constraints

- HAMESHA Roman Urdu mein jawab dein.
- Zero code reversion across sessions.
- Exclusive write ownership:
  - apps/web/src/components/chat/voiceCall/useVoiceCallAssistant.ts
  - apps/web/src/components/chat/voiceCall/voiceCallAssistant.test.ts
- Genuine implementations only: no dummy/facade implementations, no hardcoded test results.
- Sub-150ms barge-in with safeStopSpeechPlayback.
- DO NOT call recognition.abort() on voice barge-in; preserve user speech from word 1.
- Pure "Stop"/"Ruko" immediately returns to "listening" state (no hang in "user-speaking").
- Acoustic echo filtering with CludeGodsEchoFilter (drop interim/final speaker bleed).
- Continuous STT keep-alive (resilient onend restart, benign no-speech/aborted, network recovery).
- Preserve existing settings, voices, fallbacks, and chat view synchronization.

## Current Parent

- Conversation ID: 21f0c9dc-dca6-48e4-a0d7-5ba869aaf28d
- Updated: not yet

## Task Summary

- **What to build**: Full integration of CludeGodsEchoFilter and safeStopSpeechPlayback into useVoiceCallAssistant.ts; voice barge-in without STT abort; pure stop state transition; continuous STT keep-alive; expanded unit tests.
- **Success criteria**: All requirements R1, R2, R3, R4 met; voiceCallAssistant.test.ts and speech tests pass 100%; web build succeeds.
- **Interface contracts**: PROJECT.md § Interface Contracts
- **Code layout**: PROJECT.md § Code Layout

## Change Tracker

- **Files modified**: None yet
- **Build status**: Untested
- **Pending issues**: None

## Quality Status

- **Build/test result**: Pending implementation
- **Lint status**: Clean
- **Tests added/modified**: Pending

## Key Decisions Made

- Use CludeGodsEchoFilter playhead registration hooked into StreamingTtsPlayer onChunkStart and onChunkEnd.
- In handleVoiceBargeIn, do NOT abort recognitionRef.current; only halt TTS and LLM stream.
- In recognition.onresult, filter transcripts through echoFilter.processInterimTranscript / processFinalTranscript.
- Differentiate between pure interrupt command (stripped === "") which returns to "listening", and command + query or speech-over which sets "user-speaking".

## Artifact Index

- /home/hasan/Documents/reactjs/t3forweb/.agents/teamwork/worker_m3/DISPATCH.md — Dispatch instructions
- /home/hasan/Documents/reactjs/t3forweb/.agents/teamwork/worker_m3/BRIEFING.md — Situational awareness
- /home/hasan/Documents/reactjs/t3forweb/.agents/teamwork/worker_m3/progress.md — Heartbeat and progress log
