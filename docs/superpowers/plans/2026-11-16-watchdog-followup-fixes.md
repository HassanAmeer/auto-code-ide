# Watchdog Follow-up Fixes Implementation Plan

**Goal:** Fix the eight additional findings approved by the user.
**Architecture:** Preserve engine selection. Capture a run baseline commit for semantic diffs; finalize worker/goal telemetry only after verification; always release owned allocations. Keep standalone work in process and support bounded file reads and targeted edits. Capture adapter prompt response text and reject HTTP failures.
**Tech Stack:** TypeScript, Node, Vitest.
**Spec:** Eight findings in the current conversation; user requested implementation and continuation.

## Constraints

- Preserve all unrelated workspace edits. No push or deployment requested.
- No external daemon for the standalone engine.
- Implement natively in the current session.

## Review Focus

- A merged commit must appear in verifier evidence.
- Cancellation or crash must never yield success or leave running telemetry/resources.
- Requirement/test repairs must not bypass build validation.
- Existing file contents must be readable and preserved by targeted edits.
- Verifier responses must remain read-only and adapter HTTP failures must fail closed.

## Tasks

- [x] Add bridge regression tests for response scope, reading/editing existing files, read-only verification, adapter model output and HTTP failure; observe failures and implement fixes.
- [x] Add real Git test for baseline diff after merge; observe failure and add optional baseline to getWorktreeDiff.
- [x] Add supervisor tests for crashed/cancelled workers, telemetry before/after verification, and build/tests after requirement repairs; observe failures and implement lifecycle gates.
- [x] Run focused DSH tests, diff checks and report full-suite/typecheck evidence or limitations.

## Verification

- DSH suite: 6 files, 47 tests passed.
- git diff --check passed.
- Full project suite failed in provider OpenCode integration tests (13 failures) and threads-sync; log: /tmp/opencode/watchdog-project-tests.log.
- Full server typecheck did not finish after over 20 minutes and was terminated. Focused compilation completed with five existing Effect diagnostics: console.warn in opencodeBridge, Math.random at three supervisor sites and one pool site. No ordinary TypeScript errors were emitted in the focused run. Log: /tmp/opencode/watchdog-focused-types.log.
