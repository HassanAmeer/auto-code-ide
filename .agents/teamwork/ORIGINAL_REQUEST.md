# Original User Request

## 2026-11-04T10:11:17Z

Upgrade the web voice call assistant in t3forweb to deliver a stable, non-freezing, real-time voice call experience using the existing browser STT and TTS engines, while integrating CludeGods-inspired instant barge-in (immediate stop on interruption), robust echo/noise handling, and zero-deadlock speech lifecycle management. The user explicitly requested running with parallel workers.

Working directory: /home/hasan/Documents/reactjs/t3forweb
Integrity mode: development

## Requirements

### R1. Instant Interruption & Barge-in ("Stop" / User Speaking Over Assistant)

When the assistant is speaking aloud, if the user says "Stop", "Ruko", "Wait", or speaks a new sentence, the audio playback must cut off immediately (<150ms) without hanging the browser speech engine or dropping the user's incoming utterance.

### R2. Zero-Freeze TTS Lifecycle & Continuous STT Keep-Alive

Maintain the existing browser TTS and STT engines while eliminating known browser bugs:

- Prevent Chromium's 15-second speech synthesis garbage collection pause/freeze bug and cancel deadlocks.
- Ensure continuous speech recognition without silent dropouts during conversational pauses.

### R3. Acoustic Echo & Speaker Bleed Filtering

Implement timestamp-aware sequence matching inspired by CludeGods (`listen.py`) so audio from laptop/mobile speakers playing assistant responses is not mistaken for new user commands or false interrupts.

### R4. Preserving Existing STT/TTS Configuration & Seamless Chat Sync

Preserve existing browser TTS/STT settings and Roman Urdu/English support. Ensure completed voice turns, transcriptions, and assistant answers flow smoothly into the chat view without UI lockup.

## Acceptance Criteria

### Interruption & Flow

- [ ] Saying "Stop", "Ruko", "Wait", or speaking over the assistant cuts off TTS playback within 150ms.
- [ ] After stopping, the assistant does not get stuck in a "speaking" state and returns to "listening" immediately.

### Reliability & Lifecycle

- [ ] Speech recognition stays alive across multiple conversational turns and long pauses without manual restarts.
- [ ] Long assistant answers (>15 seconds) do not freeze or go silent in Chromium browsers.
- [ ] Browser speech synthesis `cancel()` does not deadlock subsequent utterances.

### Audio Integrity & Echo Guard

- [ ] Assistant's own spoken phrases played through speakers do not re-trigger new recognition turns or false barge-ins.
- [ ] Existing browser STT and TTS engine options remain intact and functional.
- [ ] All unit/integration tests for voice call components compile and pass (`pnpm test` or vitest).
