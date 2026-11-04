# Progress — Worker M2

Last visited: 2026-11-04T10:38:20Z

## Status

All implementation requirements for M2 completed and verified against unit tests. Awaiting final web build check, then writing handoff.md.

## Steps

- [x] Initial setup: DISPATCH.md, BRIEFING.md, progress.md created
- [x] Read references and understand architecture & requirements
- [x] Inspect existing `apps/web/src/lib/speech/tts.ts`, `apps/web/src/components/chat/voiceCall/streamingTtsPlayer.ts`, `apps/web/src/lib/speech/tts.test.ts`
- [x] Run baseline test: `pnpm --filter web test src/lib/speech/tts.test.ts` (24/24 passed)
- [x] Design and implement changes in `apps/web/src/lib/speech/tts.ts`
  - [x] Implement and export `safeStopSpeechPlayback()`
  - [x] Upgrade `stopSpeaking()` to use `safeStopSpeechPlayback()`
  - [x] Chromium 15s freeze triple-layer protection (activeUtterancesSet, 5000ms pulse heartbeat, sentence chunking)
  - [x] Pre-speak `resume()` check if paused
- [x] Design and implement changes in `apps/web/src/components/chat/voiceCall/streamingTtsPlayer.ts`
  - [x] Export `SpeechChunk` interface
  - [x] Add `onChunkStart?: (chunk: SpeechChunk) => void` and `onChunkEnd?: (chunk: SpeechChunk) => void`
  - [x] Support instant stop without synthesis deadlock
- [x] Add unit tests in `apps/web/src/lib/speech/tts.test.ts` (30/30 passed)
- [x] Verify all speech stack tests pass: `pnpm --filter web test src/lib/speech/` (88/88 passed across 8 test files)
- [x] Verify voice assistant tests pass: `pnpm --filter web test src/components/chat/voiceCall/voiceCallAssistant.test.ts` (15/15 passed)
- [ ] Verify web package build
- [ ] Write handoff.md and report to parent
