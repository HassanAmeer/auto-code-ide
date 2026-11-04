# E2E Test Infra: Web Voice Call Assistant Upgrade

## Test Philosophy

- Opaque-box, requirement-driven testing derived from `ORIGINAL_REQUEST.md`.
- No dependency on internal implementation details; exercises public interfaces, browser event simulations, and lifecycle flows.
- Methodology: Category-Partition, Boundary Value Analysis, Pairwise Combinatorial Testing, and Real-World Conversational Workloads.

## Feature Inventory & Test Coverage

| #   | Feature                                             | Requirement | Tier 1 (Isolated) | Tier 2 (Boundary/Edge) | Tier 3 (Cross-Feature) | Tier 4 (Real-World) |
| --- | --------------------------------------------------- | ----------- | :---------------: | :--------------------: | :--------------------: | :-----------------: |
| F1  | Instant Interruption (<150ms cutoff)                | R1          |         5         |           5            |           ✓            |          ✓          |
| F2  | Immediate Return to Listening (No Deadlock)         | R1          |         5         |           5            |           ✓            |          ✓          |
| F3  | Zero-Drop Barge-in Utterance Preservation           | R1          |         5         |           5            |           ✓            |          ✓          |
| F4  | Pure "Stop"/"Ruko" Disambiguation & State Reset     | R1          |         5         |           5            |           ✓            |          ✓          |
| F5  | Chromium 15s TTS Freeze Bypass (GC & Heartbeat)     | R2          |         5         |           5            |           ✓            |          ✓          |
| F6  | SpeechSynthesis Cancel Deadlock Elimination         | R2          |         5         |           5            |           ✓            |          ✓          |
| F7  | Continuous STT Keep-Alive Across Silence Pauses     | R2          |         5         |           5            |           ✓            |          ✓          |
| F8  | CludeGods Timestamp-Aware Sequence Matching         | R3          |         5         |           5            |           ✓            |          ✓          |
| F9  | Multi-Tier Loose Word & Sliding Char Echo Rejection | R3          |         5         |           5            |           ✓            |          ✓          |
| F10 | Roman Urdu & Settings Preservation / Chat Sync      | R4          |         5         |           5            |           ✓            |          ✓          |

## Test Architecture

- **Test Runner**: Vitest (`npx vitest run src/components/chat/voiceCall/voiceCallE2E.test.ts src/lib/speech/cludeGodsEchoFilter.test.ts`)
- **Pass / Fail Semantics**: Zero failures, exit code 0.
- **Directory Layout**:
  - `apps/web/src/lib/speech/cludeGodsEchoFilter.test.ts`: Pure unit tests for the CludeGods algorithm.
  - `apps/web/src/components/chat/voiceCall/voiceCallAssistant.test.ts`: Existing + updated integration tests.
  - `apps/web/src/components/chat/voiceCall/voiceCallE2E.test.ts`: New requirement-driven E2E test suite covering Tiers 1-4.

## Real-World Application Scenarios (Tier 4)

1. **Scenario 1: Rapid Conversational Barge-In**: Assistant begins speaking a multi-sentence response; at t=800ms user says "Ruko, dusra sawal suno"; audio stops instantly (<150ms), user's query is preserved, status transitions cleanly, and new answer begins.
2. **Scenario 2: Long Assistant Speech (>20 seconds) in Chromium**: Assistant speaks an answer exceeding 25 seconds; verify speech synthesis does not cut off or freeze at 15 seconds.
3. **Scenario 3: Severe Speaker Bleed & Echo Distortion**: Assistant speaks loud output through laptop speakers; mic hears distorted echo ("vps par deploy kr dya"); verify zero false barge-ins and zero echo re-prompts.
4. **Scenario 4: Mixed Echo & Legitimate Interruption**: Assistant speaking; user says "Wait, check line 45 instead"; filter strips the echo words, preserves "check line 45 instead", cuts TTS, and submits new turn.
5. **Scenario 5: Multi-Turn Voice Consultation Across Long Pauses**: User and assistant converse for 5 successive turns with 10-20s pauses in between; verify STT never dies silently and no manual restarts are required.

## Coverage Thresholds

- Tier 1: ≥5 per feature (50 tests minimum)
- Tier 2: ≥5 per feature (50 tests minimum)
- Tier 3: Pairwise combinations of major features (≥10 tests)
- Tier 4: ≥5 realistic multi-turn scenarios
- Total E2E test cases: ≥115 tests
