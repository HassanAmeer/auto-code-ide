# Accurate Provider Error Details Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the actual safe provider failure message and preserved response JSON, and prevent fallback or automatic retry error cards after a successful assistant response.

**Architecture:** Extend orchestration failure payloads with an optional bounded, redacted response body and populate it when adapters receive the original response. Render that body in the error card's Response view. Remove fabricated fallback errors and only auto-retry genuine retryable failures, suppressing error cards when the same run produced successful assistant output.

**Tech Stack:** TypeScript, Effect Schema, React, Vitest/Vite Plus.

**Spec:** Approved design in the conversation checkpoint: preserve safe-redacted provider response text; avoid hard-coded APIError fallbacks; successful assistant output suppresses a later error/retry card; only retry eligible failures.

## Global Constraints

- Redact provider-controlled text before it crosses or persists across transport boundaries.
- Bound failure message and response-body sizes; response body maximum is 16,384 characters.
- Never fabricate an HTTP status, API error code, or provider body if unavailable.
- Leave pre-existing Watchdog changes and unrelated untracked files untouched.
- Do not deploy, commit, or stage unrelated workspace changes.

## Review Focus

- Credential-bearing JSON, bearer values, URLs, and provider tokens must be redacted before persistence (Task 1 mixed-secret test).
- Oversized and malformed/non-JSON bodies must stay bounded and render as text without crashing (Tasks 1 and 4).
- Successful assistant output before/after a failure must not create a fallback error card or automatic retry (Tasks 2 and 4).
- Failed attempts without an actual failure message must not become fabricated APIErrors (Task 2).
- Legitimate retryable failures continue retrying; non-retryable errors and user interruptions do not (Task 4).

---

### Task 1: Preserve safe provider response details

**Files:**

- Modify: `packages/contracts/src/orchestrationV2.ts` — optional bounded `responseBody` on `OrchestrationV2ProviderFailure`.
- Modify: `packages/provider-core/src/server/failure.ts` — sanitize/bound response body and add it to `makeProviderFailure`.
- Modify: `packages/provider-core/src/server/failure.test.ts` — sanitizer/factory regression tests.
- Modify: provider adapters and their tests that receive original provider error details, including `apps/server/src/orchestration-v2/Adapters/CodexAdapterV2.ts` and `ClaudeAdapterV2.ts`; find other producers during implementation.

**Interfaces:**

- Produces `OrchestrationV2ProviderFailure.responseBody?: string` and `makeProviderFailure({ responseBody?: string | null, ... }): OrchestrationV2ProviderFailure`.
- Reuse the existing provider-failure redaction rules; truncate response body to 16,384 characters after sanitizing.

- [ ] **Step 1: Write failing sanitizer/factory tests**

Test a JSON response containing `"api_key":"secret-value"`, `Bearer bearer-secret`, and a URL with credentials/query secrets; assert secrets are redacted, length is at most 16,384, and missing/null body omits the optional field.

- [ ] **Step 2: Run focused tests to verify failure**

Run: `pnpm --filter @t3tools/provider-core exec vp test run --config ../../vite.config.ts --dir . src/server/failure.test.ts`
Expected: FAIL because response-body support does not exist.

- [ ] **Step 3: Implement schema, sanitizer, and failure factory support**

Use existing redaction in `failure.ts`; add optional schema validation capped at 16,384. Propagate actual provider response text from adapter error sources only when available—never synthesize a body from a message. Add adapter-specific regression tests for propagated bodies.

- [ ] **Step 4: Run focused tests to verify success**

Run the provider-core test command above and each changed adapter test file. Expected: PASS.

### Task 2: Remove fabricated errors and suppress recovered failures

**Files:**

- Modify: `apps/web/src/session-logic.ts` — remove the synthetic `APIError` fallback and derive fallback only from a real failure value already present in the projection/attempt data; if there is no real failure detail, do not synthesize a card. Ensure a run with substantial assistant output cannot generate a fallback error.
- Modify: `apps/web/src/session-logic.test.ts` — cover no fabricated APIError, real failure detail preservation, and successful answer followed by failed attempt.

**Interfaces:**

- Consumes Task 1 failure response metadata without changing the timeline entry's source item.
- Fallback presentation uses real failure message/code/class only; absence of those values produces no fallback card.

- [ ] **Step 1: Write failing regression tests**

Test that a failed attempt with no matching error item and no persisted failure detail creates no error entry or `APIError`; a real failure detail remains visible; a non-empty assistant message for the same run suppresses the fallback card.

- [ ] **Step 2: Run test to verify failure**

Run: `pnpm --filter @t3tools/web exec vp test run --project unit src/session-logic.test.ts`
Expected: fabricated-error test FAILS against the current fallback.

- [ ] **Step 3: Implement minimal fallback change**

Remove the hard-coded message, code, and retryability. Use a persisted real failure only if the data model provides it; otherwise skip generating a fallback entry. Preserve current genuine error items and attempt retry/supersession behavior.

- [ ] **Step 4: Run focused tests to verify success**

Run the command above. Expected: PASS, including existing timeline recovery tests.

### Task 3: Display exact provider response JSON

**Files:**

- Modify: `apps/web/src/components/chat/MessagesTimeline.tsx` — allow `CupertinoTimelineErrorCard` to receive structured provider response body and use it as the Response tab payload; preserve raw failure message in details/raw view.
- Modify: `apps/web/src/components/chat/MessagesTimeline.test.tsx` — verify structured response display and fallback behavior.

**Interfaces:**

- Error-card input gains optional `responseBody?: string`; V2 error rows pass `item.failure.responseBody`.
- Valid JSON is pretty-printed from the exact parsed response body. Invalid/non-JSON content is displayed verbatim as text. If no body exists, keep existing behavior based on `rawError`.

- [ ] **Step 1: Write failing rendering tests**

Render an error item whose message differs from its JSON response body; assert Response view contains formatted original JSON and raw/details view contains the actual failure message. Add malformed JSON test asserting verbatim text without render failure.

- [ ] **Step 2: Run test to verify failure**

Run: `pnpm --filter @t3tools/web exec vp test run --project unit src/components/chat/MessagesTimeline.test.tsx`
Expected: FAIL because card receives only the message string today.

- [ ] **Step 3: Implement structured response rendering**

Thread the optional response body into the card, preferring it only for response display; retain provider failure message for title/subtitle/raw diagnostics.

- [ ] **Step 4: Run focused tests to verify success**

Run the command above. Expected: PASS, including existing provider retry rendering cases.

### Task 4: Gate automatic retries on a real eligible failure

**Files:**

- Modify: `apps/web/src/components/ChatView.tsx` — derive auto-retry eligibility from the terminal run/error state and retryability; stop countdown when assistant output has completed successfully.
- Modify: `apps/web/src/components/chat/MessagesTimeline.tsx` — only enable the error-card retry countdown for eligible terminal retryable errors; preserve explicit manual retry behavior and interruption checks.
- Modify: relevant `ChatView`/timeline tests — cover retry eligibility and recovered-success suppression.

**Interfaces:**

- Existing `failure.retryable`, provider retry metadata, auto-retry settings, and same-run assistant output determine automatic retry eligibility.
- Manual retry action remains available where current UX supports it; this task gates automatic countdown, not explicit user action.

- [ ] **Step 1: Add failing retry regression tests**

Cover a successful assistant response followed by a late error (no retry countdown), a non-retryable terminal failure (no automatic retry), a retryable terminal failure (countdown remains), and a user-interrupted run (no automatic retry).

- [ ] **Step 2: Run focused tests to verify failures**

Run the affected ChatView/timeline unit tests. Expected: false-retry cases FAIL before the fix.

- [ ] **Step 3: Implement eligibility guard**

Use the persisted error metadata and run status; cancel any pending countdown once success/assistant output is observed. Keep existing favorite-model, user-stop, pause, settings, and retry-limit safeguards.

- [ ] **Step 4: Run focused tests to verify success**

Run affected unit tests. Expected: PASS for all eligibility and existing retry behavior.

### Task 5: Verify cross-package contracts and targeted behavior

**Files:**

- Verify only; do not modify unrelated files.

- [ ] Run `pnpm --filter @t3tools/provider-core typecheck` and `pnpm --filter @t3tools/web typecheck`.
- [ ] Run the focused provider-core, changed adapter, session-logic, and MessagesTimeline tests from Tasks 1–4.
- [ ] Inspect `git status --short`; confirm only intended implementation files changed and existing Watchdog/design work remains intact.
