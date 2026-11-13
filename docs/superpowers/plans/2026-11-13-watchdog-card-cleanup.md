# Watchdog Card Cleanup — Implementation Plan

> **For agentic workers:** Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Watchdog/parallel workers run ONLY on explicit `/parallel-subagents`; remove the `flow: watchdog/direct` toggle; make the background-task list show only live running tasks with a stop button; make the watchdog card show only its live supervision action.

**Architecture:** Remove the implicit auto-dispatch from `/api/super-agent/chat` and the persisted `super_agent_flow_mode` setting. Keep the explicit `/parallel-subagents` → `/api/super-agent/dispatch-worker` path untouched. Two web components are simplified; server snapshot drops `flowMode`.

**Tech Stack:** React 19 + TS, Effect-TS HTTP server, Vitest, pnpm monorepo.

**Spec:** conversation-approved design (2026-11-13): no implicit watchdog, toggle removed, live-only background tasks, watchdog = "what is it doing right now".

## Global Constraints

- Roman Urdu for user-facing replies (AGENTS.md §1).
- Never revert/overwrite other sessions' code (AGENTS.md §2) — check `git status` before commit.
- Do NOT touch `active_core_engine` / `opencode-full-engine` / `opencode-adapter` switching (AGENTS.md §3).
- Engine rule: no port 4099 dependency when full-engine is active.
- Deploy via `./deploy/deploy-vps.sh` only on explicit deploy request (here: GitHub push only).

## Review Focus

1. A normal "bana do" / complex message must NOT spawn watchdog → chat route guard test.
2. `/parallel-subagents` must still dispatch → existing `ChatView` path untouched.
3. Completed `command_execution` turn items must not appear in Background Tasks → widget test.
4. No "Background tasks" label/list inside WatchdogCard → card render test.
5. Stop icon only on running tasks with terminal target → widget test.

---

### Task 1: Server — remove implicit watchdog + flow mode

**Files:**

- Modify: `apps/server/src/http.ts:1385-1467` (chat route trigger), `:3689-3710` (GET watchdog route), imports `:128`
- Modify: `apps/server/src/dsh/watchdogSupervisor.ts:98-129` (snapshot + constant)
- Test: `apps/server/src/dsh/watchdogSupervisor.test.ts:168-174`

- [x] **Step 1:** In `http.ts` chat route, replaced the `isTeamworkTrigger`/`isTaskIntent`/`shouldUseWatchdog` block so watchdog runs only when `lastUserMsg` starts with `/parallel-subagents` (or `/teamwork-preview` kept as legacy explicit alias). `startWatchdogSupervision` call + reply intact.
- [x] **Step 2:** Removed `super_agent_flow_mode` read from that block; `appSettings` kept for `super_agent_worker_lanes` + `active_core_engine`. Removed `isComplexTask` import.
- [x] **Step 3:** In GET `/api/super-agent/watchdog`, dropped settings read + `flowMode`; returns `getWatchdogSnapshot(...)` directly.
- [x] **Step 4:** In `watchdogSupervisor.ts`, deleted `SUPER_AGENT_FLOW_MODE_KEY`, `flowMode` from snapshot return type + return object. Test asserts `snapshot.active === 0`.
- [x] **Step 5:** Server `pnpm exec tsc --noEmit` passes.

### Task 2: WatchdogCard — remove toggle + background tasks, promote live action

**Files:**

- Modify: `apps/web/src/components/background/WatchdogCard.tsx`

- [x] **Step 1:** Removed `flowMode` state, `handleFlowModeChange`, its button, and `data?.flowMode` handling in `load`.
- [x] **Step 2:** Removed `WatchdogBackgroundTask` interface, `backgroundTasks` prop, and BOTH "Background tasks" render blocks.
- [x] **Step 3:** Aligned `WatchdogWorkerRow` type with server: `model?`, `logs?`.
- [x] **Step 4:** Promoted live action with a `status` phase badge (`phaseLabel`/`phaseTone` → Roman-Urdu labels); derived `X/Y sub-agents done · N parallel` from `workers[]`; renders `issues[]`; on `completed` adds `→ Super Agent ko final result de diya`.
- [x] **Step 5:** Kept worker rows, verdict, checklist, recoveries, stop controls. Also fixed a pre-existing `exactOptionalPropertyTypes` error (`AbortSignal | undefined` → conditional spread).

### Task 3: BackgroundServicesWidget — live-only tasks, stop icon, remove connector/prop

**Files:**

- Modify: `apps/web/src/components/background/BackgroundServicesWidget.tsx`
- Test: `apps/web/src/components/background/BackgroundServicesWidget.test.tsx`

- [x] **Step 1:** Extract two exported pure helpers — `collectRunningTurnItemTasks()` (only `status === "running"` turn items → tasks) and `filterLiveBackgroundTasks()` (running-only, cap 30). Aggregation (section C) now uses the first; `visibleBackgroundTasks` uses the second.
- [x] **Step 2:** Row: removed "Run now", chevron/detail-expansion, scheduled-task detail; keep only the stop button for running terminal tasks. Header keeps collapse + running count. Removed now-dead `handleRunTask`, `runTaskNow`, `canOperate`, `expandedTaskId`, `PlayIcon`, `AuthOrchestrationOperateScope`.
- [x] **Step 3:** Removed `backgroundTasks` prop passed to `WatchdogCard` and deleted the "supervises & controls" divider.
- [x] **Step 4:** Test assertions: no "Background tasks"/"supervises & controls"/"flow:" in rendered markup, completed/failed/pending commands absent, running turn items kept. Also fixed a pre-existing red assertion (subagent row names were asserted while the section is collapsed by default).

### Task 4 (new user request): Subagents only in right-side panel

**Goal:** Subagents must NOT appear as new chat-history threads in the left sidebar; they stay in the right "Subagents" section — running, completed (greyed), failed/warning, or cancelled (cross-circle icon) — and clicking a row opens that subagent's chat screen; a stop icon stays beside running ones.

**Key finding:** Two distinct systems exist. **System A** = Orchestration-V2 delegated subagents (real DB child threads, `lineage.relationshipToParent === "subagent"`, `projection.subagents[].childThreadId`) — these were the unwanted left-sidebar entries. **System B** = dsh `/parallel-subagents` telemetry workers (in-memory `Map`, NO thread, no `childThreadId`) — never in the left sidebar. The active sidebar is `LegacySidebar.tsx` (`useLegacySidebarEnabled()` is hardcoded `true`), which filtered ONLY `archivedAt`, so System A child threads leaked in. The unused V2 `Sidebar.tsx` already hid them via `filterSidebarV2VisibleThreads`.

**Files:**

- Modify: `apps/web/src/components/Sidebar.logic.ts` (+ `filterLegacySidebarVisibleThreads`)
- Modify: `apps/web/src/components/LegacySidebar.tsx` (4 visibility spots)
- Test: `apps/web/src/components/Sidebar.logic.test.ts`
- Modify: `apps/web/src/components/background/BackgroundServicesWidget.tsx`

- [x] **Step 1:** Added exported pure `filterLegacySidebarVisibleThreads()` (archived + subagent excluded), applied at all 4 LegacySidebar visibility points; added a unit test (root + fork kept, subagent + archived dropped).
- [x] **Step 2:** Removed the 3-minute freshness gate from `combinedSubagents`; `seenSubagentsRef` retains every sub-agent ever seen (running first, then most-recent), so finished/cancelled/failed rows grey out in place (`opacity-70`) instead of vanishing after server telemetry pruning.
- [x] **Step 3:** Row click → `useNavigate()` + `buildThreadRouteParams(scopeThreadRef(environmentId, childThreadId))` (same pattern as `ChatView.tsx:7572` / `ThreadRelationshipsControl.tsx:292`). Only rows WITH `childThreadId` are clickable (`role="button"`, Enter/Space); dsh telemetry rows stay inert (no thread to open). `CancelledCircleIcon` (⊗) already renders for `cancelled`; `SquareIcon` stop button stays for `running`.
- [x] **Step 4:** `childThreadId` is preserved across `apiWorkers`/`storedWorkers` merges via the retained history map.

### Task 5: Verify + commit + push

- [x] **Step 1:** Typecheck: `cd apps/web && pnpm exec tsc --noEmit` (exit 0, re-run after final fix: exit 0). `cd apps/server && pnpm exec tsc --noEmit` exits 1 on **pre-existing baseline errors** (missing `testkit/fixtures/*` modules, `vitest` type resolution, Effect lint diagnostics in `ServerBrowser.ts`, `Orchestrator.ts`, etc.). A detached-HEAD baseline worktree `tsc --noEmit` produced the SAME error set (187 raw / 109 deduped) vs. our tree (162 raw / 84 deduped — fewer, due to line shifts); error-code+message comparison found zero genuine regressions (the single apparent "new" item is the identical `http.ts` TS2379 at line 644 vs. 645, same message). Server tests (17) pass.
- [x] **Step 2:** Tests: web `BackgroundServicesWidget.test.tsx` + `Sidebar.logic.test.ts` (152 passed), server `watchdogSupervisor.test.ts` (17 passed).
- [ ] **Step 3:** `git status` → stage touched files + plan doc, commit, `git push origin main`.

## Notes / Decisions (Task 4)

- "Chat screen open" is only honest for System A (real child threads). No new backend thread creation for dsh telemetry workers was added — that would be a large orchestration change, not one of the 3 requested UI fixes.
- The `super_agent_workers` / `active_subagents` localStorage keys are read but never written anywhere in the app, so retention is session-scoped (`useRef`). Old rows stay grey for the lifetime of the page; a reload rebuilds from projection/API.
- Hiding happens at display/filter level only — child threads are still persisted (needed for chat open, relationships panel, stop). No deletion, no lineage rewrite.

## Notes / Decisions

- Web `/parallel-subagents` (`ChatView.tsx:9660`) already fires `/api/super-agent/dispatch-worker` AND then sends the **clean** task text to the normal Super Agent chat. So the chat-route guard (which only matches a literal leading `/parallel-subagents`) does NOT double-dispatch. Normal "bana do" / complex messages now stay on the plain model path — the Super Agent remains free for discussion.
- `/teamwork-preview` kept as an explicit legacy alias in the chat-route fallback; no other implicit trigger (`isComplexTask`, intent-based) remains.
- `super_agent_flow_mode` setting, `SUPER_AGENT_FLOW_MODE_KEY`, snapshot `flowMode`, and the `flow: watchdog/direct` toggle are fully removed. `GET /api/super-agent/watchdog` returns the snapshot directly.
- Watchdog card handoff is UI-only on `completed`: `→ Super Agent ko final result de diya` (matches the server's existing verdict → chat reply; no dedicated final Super Agent LLM turn exists).
- No engine-switching / port-4099 code was touched (AGENTS.md §3).
