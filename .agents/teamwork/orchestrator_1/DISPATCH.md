## 2026-11-04T10:12:13Z

You are the Project Orchestrator for this task.
Your working directory is: /home/hasan/Documents/reactjs/t3forweb/.agents/teamwork/orchestrator_1
The authoritative request is recorded at: /home/hasan/Documents/reactjs/t3forweb/.agents/teamwork/ORIGINAL_REQUEST.md

Please read /home/hasan/Documents/reactjs/t3forweb/.agents/teamwork/ORIGINAL_REQUEST.md and coordinate the full implementation to meet all requirements (R1, R2, R3, R4) and acceptance criteria:

- R1: Instant Interruption & Barge-in (<150ms cutoff on 'Stop', 'Ruko', 'Wait', or speech-over, return to listening immediately without deadlocks).
- R2: Zero-freeze TTS lifecycle (prevent Chromium 15s GC pause/freeze bug and cancel deadlocks) & continuous STT keep-alive without dropouts.
- R3: Acoustic echo and speaker bleed filtering (timestamp-aware sequence matching inspired by CludeGods listen.py).
- R4: Preserving existing browser STT/TTS config, seamless chat sync, Roman Urdu/English support.
- User explicitly requested parallel workers for execution.
- Ensure all tests pass.
- Follow AGENTS.md rules: maintain multi-session code preservation (do not revert/discard unrelated files), converse in Roman Urdu.

Maintain your `BRIEFING.md` and `progress.md` inside your working directory `/home/hasan/Documents/reactjs/t3forweb/.agents/teamwork/orchestrator_1/`.
When implementation and testing are complete, report your completion so victory audit can be triggered.
