# BRIEFING — 2026-11-04T10:21:45Z

## Mission

Investigate and map out the entire existing voice calling architecture in t3forweb (STT, TTS, speech recognition, audio playback, call modal/interface, voice settings, state management, testing frameworks, and integration points for barge-in and echo filtering).

## 🔒 My Identity

- Archetype: explorer
- Roles: investigation, synthesis
- Working directory: /home/hasan/Documents/reactjs/t3forweb/.agents/teamwork/explorer_survey_1
- Original parent: 21f0c9dc-dca6-48e4-a0d7-5ba869aaf28d
- Milestone: voice_architecture_survey

## 🔒 Key Constraints

- Read-only investigation — do NOT implement
- Never edit code outside .agents/teamwork/explorer_survey_1
- Always converse in Roman Urdu as per user rules (AGENTS.md / GEMINI.md)
- Follow 5-component handoff report protocol

## Current Parent

- Conversation ID: 21f0c9dc-dca6-48e4-a0d7-5ba869aaf28d
- Updated: not yet

## Investigation State

- **Explored paths**:
  - `ORIGINAL_REQUEST.md`
  - `apps/web/src/components/chat/voiceCall/*` (19 files: `useVoiceCallAssistant.ts`, `SuperCallAssistantView.tsx`, `streamingTtsPlayer.ts`, `mobileVoiceKeepAlive.ts`, `voiceCallAssistant.test.ts`, etc.)
  - `apps/web/src/lib/speech/*` (14 files: `stt.ts`, `tts.ts`, `acousticNoiseShield.ts`, `romanUrduSpeechAdapter.ts`, `romanUrduTransliterate.ts`, `voiceCallLogger.ts`, etc.)
  - `apps/web/src/components/settings/*` (`SttTtsSettingsPanel.tsx`, `SoundSettingsPanel.tsx`, `SttSettingsPanel.tsx`)
  - Root & web `package.json` test/build scripts
- **Key findings**:
  - Full-duplex Web Speech API architecture with React hooks & extensive refs to eliminate async stale closures.
  - Streaming sentence chunking with code block & thinking tag stripping.
  - Active keep-alive mechanisms: mobile screen wake lock, silent audio loop, 3.5s pause/resume kick for Chromium 15s bug.
  - Bilingual Roman Urdu / Urdu / English bidirectional transliteration and phonetic synthesis adaptation.
  - 8 Vitest test suites with 73 passing tests.
  - Integration gaps identified: recognition.abort() destroying speech buffers on barge-in, untimestamped echo memory risking false positive drops.
- **Unexplored areas**: None. Codebase voice architecture is completely mapped.

## Key Decisions Made

- Organized the handoff report into the standard 5-component structure with deep technical details, exact file references, and line numbers.

## Artifact Index

- `/home/hasan/Documents/reactjs/t3forweb/.agents/teamwork/explorer_survey_1/handoff.md` — Complete voice calling architecture report
- `/home/hasan/Documents/reactjs/t3forweb/.agents/teamwork/explorer_survey_1/progress.md` — Progress tracker
- `/home/hasan/Documents/reactjs/t3forweb/.agents/teamwork/explorer_survey_1/DISPATCH.md` — Dispatch message
