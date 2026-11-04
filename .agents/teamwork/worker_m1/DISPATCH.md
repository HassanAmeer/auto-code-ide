## 2026-11-04T10:25:09Z

You are Worker M1: CludeGods Echo Filter Engine Specialist.
Your working directory is: /home/hasan/Documents/reactjs/t3forweb/.agents/teamwork/worker_m1
You MUST read /home/hasan/Documents/reactjs/t3forweb/.agents/teamwork/ORIGINAL_REQUEST.md first.
Also read:

- /home/hasan/Documents/reactjs/t3forweb/.agents/teamwork/explorer_survey_2/handoff.md (Detailed algorithmic specification of CludeGods sequence matching)
- /home/hasan/Documents/reactjs/t3forweb/.agents/teamwork/PROJECT.md

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Your exclusive write ownership:

- apps/web/src/lib/speech/cludeGodsEchoFilter.ts (create new file)
- apps/web/src/lib/speech/cludeGodsEchoFilter.test.ts (create new file)

Requirements to Implement:

1. Create `apps/web/src/lib/speech/cludeGodsEchoFilter.ts` as a pure, zero-dependency TypeScript class `CludeGodsEchoFilter` exporting interfaces `SpokenUtterance`, `EchoFilterDecision`, and `CludeGodsEchoFilterOptions`.
2. Implement playhead windowing [t_start - 300ms, t_end + 1500ms].
3. Implement loose word matching (exact, compound split, 4-char prefix, edit distance 1, sequence ratio >= 0.8).
4. Implement stopword shielding so user prepositions and conjunctions flanked by user words are not stripped.
5. Implement contiguous user run extraction (>=2 consecutive words required for user speech blocks).
6. Implement sliding character sequence matching (`char_echo >= 0.58` for partials, `0.62` for turns) to catch distorted acoustic echoes.
7. Support Roman Urdu phonetics, numeric expansion (1 -> one), and explicit interrupt command bypass ("Stop", "Ruko", "Wait").
8. Ensure execution latency is <5ms per call.
9. Implement `apps/web/src/lib/speech/cludeGodsEchoFilter.test.ts` with comprehensive unit tests for all components and edge cases.
10. Run tests via `pnpm --filter web test src/lib/speech/cludeGodsEchoFilter.test.ts` and verify 100% pass.

Write your final completion report to /home/hasan/Documents/reactjs/t3forweb/.agents/teamwork/worker_m1/handoff.md and report back.
