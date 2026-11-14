# Message Sync and Compact Thread Details — Implementation Plan

> **For agentic workers:** Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent sent prompts from reappearing after ambiguous transport failures, make command retries idempotent, reconcile stale thread projections, restore real connection-state gating, and integrate the approved compact Watchdog/Subagents presentation into Thread Details without unmounting lower sections.

**Architecture:** Keep send-outcome policy in pure helpers, attach a stable `commandId` to every single-thread dispatch, use the durable server receipt as the idempotency boundary, and classify failures as definite rejection versus ambiguous transport outcome. Refresh only the active thread projection after successful dispatch. Pass real environment connection presentation into the composer instead of hardcoded connected values. Integrate the existing background-services data through compact dedicated Watchdog and Subagents sections while preserving the existing lower Thread Details sections.

**Tech Stack:** React 19, TypeScript, Effect RPC/client-runtime, Vite Plus tests, pnpm monorepo.

**Spec:** Approved conversation design from 2026-11-14 and confirmed root-cause investigation.

## Global Constraints

- Roman Urdu for user-facing replies.
- Never revert, discard, or overwrite another session's changes.
- Use TDD: add one focused failing regression test, verify the expected failure, then implement the minimum fix.
- Do not deploy to VPS. Push only to GitHub after verification.
- Compact Thread Details changes density only; lower sections remain mounted.

## Task 1: Classify Send Failures Before Restoring Drafts

**Files:**

- `apps/web/src/components/ChatView.logic.ts`
- `apps/web/src/components/ChatView.logic.test.ts`
- `apps/web/src/components/ChatView.tsx`

- [ ] Extend the failing regression tests to cover a newer draft that must not be overwritten.
- [ ] Add `shouldRestoreComposerDraftAfterSendFailure({ failureMessage })` using the existing transport-error classifier: transport failures are ambiguous and do not restore; definite server/business rejection restores.
- [ ] Wire the helper into the single-thread failure path.
- [ ] Restore only when the current composer draft still equals the submitted draft; preserve any newer user input.
- [ ] Run `pnpm exec vp test run --project unit src/components/ChatView.logic.test.ts` from `apps/web`.

## Task 2: Give Single-Thread Sends Stable Command Identity

**Files:**

- `apps/web/src/components/ChatView.tsx`
- `packages/client-runtime/src/operations/commands.ts`
- relevant command-operation tests

- [ ] Add a regression test proving a caller-supplied `commandId` is forwarded unchanged by `startThreadTurn` and duplicate dispatch uses the same identity.
- [ ] Allocate the stable `commandId` before dispatching a single-thread turn.
- [ ] Pass it through the command input/result path so an ambiguous retry resolves to the existing durable receipt rather than creating a second turn.
- [ ] Keep optimistic-message insertion keyed by the stable submission identity to suppress duplicates.
- [ ] Run the focused client-runtime and web tests.

## Task 3: Reconcile Active Thread Projection After Success

**Files:**

- `apps/web/src/state/threads.ts`
- `apps/web/src/state/entities.ts`
- `apps/web/src/components/ChatView.tsx`
- relevant state tests

- [ ] Add a regression test for refreshing one active thread projection after a successful command when subscription delivery is delayed.
- [ ] Expose a narrowly scoped refresh/invalidation operation for one `ScopedThreadRef`.
- [ ] Refresh the active thread projection after a successful single-thread dispatch, without replacing the whole thread store.
- [ ] Verify the stale projection is replaced with the server projection and unrelated threads are untouched.

## Task 4: Restore Real Connection-State Presentation

**Files:**

- `apps/web/src/components/ChatView.tsx`
- `apps/web/src/components/chat/ChatComposer.tsx`
- `apps/web/src/state/presentation.ts`
- relevant component tests

- [ ] Add regression tests showing offline/reconnecting environments disable send and expose the correct unavailable state.
- [ ] Derive active environment connection phase from the real environment presentation.
- [ ] Pass `isConnecting`, `environmentUnavailable`, and project-selection requirements into `ChatComposer` instead of hardcoded values.
- [ ] Remove the composer's internal `false`/`null` overrides while preserving its send/action gates.
- [ ] Verify connected environments remain sendable.

## Task 5: Integrate Compact Watchdog and Subagents Sections

**Files:**

- `apps/web/src/components/chat/ThreadDetailsPanel.tsx`
- `apps/web/src/components/chat/ThreadDetailsPanel.test.tsx`
- `apps/web/src/components/background/BackgroundServicesWidget.tsx`
- `apps/web/src/components/background/WatchdogCard.tsx`
- focused styling files as required

- [ ] Add a failing Thread Details test for dedicated compact Watchdog and Subagents sections with emoji/status icons.
- [ ] Reuse the existing live Watchdog/subagent data and actions instead of duplicating server state.
- [ ] Render compact, quickly scannable rows with simple emoji icons and readable status text.
- [ ] Keep Version Control, Background Services, Automations, and Relationships mounted in compact/essential density.

## Task 6: Verification and GitHub Push

- [ ] Run focused web tests for changed components.
- [ ] Run the broader web test suite.
- [ ] Run focused and broader server/client-runtime tests.
- [ ] Run `pnpm exec tsc --noEmit` from `apps/web` and the relevant package workspaces.
- [ ] Inspect `git diff` and `git status`; preserve all unrelated workspace changes.
- [ ] Commit all intended changes with a descriptive message.
- [ ] Push to `origin/main`; do not run the VPS deployment script.
