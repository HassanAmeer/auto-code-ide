# Watchdog Safety Fixes Implementation Plan

> **For agentic workers:** Native implementation in this session; steps use checkbox syntax.

**Goal:** Ensure watchdog runs cannot report unverified/no-op work as success, continue repairs after cancellation, or silently omit requested subtasks.

**Architecture:** Add regression coverage around the watchdog supervisor, task decomposer, and worker-role classifier. Keep the existing architecture; make checklist evidence advisory until semantic verification, fail closed on ambiguous verifier output, and apply cancellation checks before and after repair work.

**Tech Stack:** TypeScript, Vitest, pnpm monorepo.

**Spec:** User-approved scope from the conversation: fix the six watchdog/goals/subagent findings previously reported.

## Global Constraints

- Preserve existing local edits and unrelated untracked files.
- Keep standalone-engine selection and adapter behavior intact.
- Roman Urdu for user-facing communication.
- Add regression tests before implementation and verify the relevant server suite.

## Review Focus

- A worker that changes no files must not yield a clean verdict.
- Only an unambiguous verifier PASS can clear missing checklist items.
- Stop during verification must prevent repair, recheck, and merge.
- Explicit user-listed subtasks beyond the first four must remain represented.
- Worker roles must reflect task/category rather than spawn order.

---

### Task 1: Watchdog verification and cancellation gates

**Files:** `apps/server/src/dsh/watchdogSupervisor.ts`, `apps/server/src/dsh/watchdogSupervisor.test.ts`, and the optional verifier-output capture in `apps/server/src/dsh/opencodeBridge.ts`.

- [ ] Add tests for empty/ambiguous verifier output, no-op workers, and stop during verification.
- [ ] Confirm the new tests expose the current unsafe behavior.
- [ ] Require explicit PASS, fail no-op worker tasks, and check cancellation before repair/recheck; pass `isStopped` into those stages.
- [ ] Run focused supervisor tests.

### Task 2: Checklist and explicit task preservation

**Files:** `apps/server/src/dsh/watchdogSupervisor.ts`, `apps/server/src/dsh/watchdogSupervisor.test.ts`, `apps/server/src/dsh/taskDecomposer.ts`, plus task-decomposer tests.

- [ ] Add tests proving keyword overlap alone is not semantic success and all explicit bullets survive decomposition.
- [ ] Make static diff matching advisory and remove the four-item truncation.
- [ ] Ensure semantic PASS (including after repair) updates checklist status and clears resolved findings.
- [ ] Run focused tests.

### Task 3: Task-aligned worker roles

**Files:** `apps/server/src/dsh/workerRegistry.ts` and its focused tests.

- [ ] Add tests for title/category-derived specialist roles at multiple worker orders.
- [ ] Retain worker numbering while deriving the specialist label from the work.
- [ ] Run focused tests and then the server test suite/typecheck.
