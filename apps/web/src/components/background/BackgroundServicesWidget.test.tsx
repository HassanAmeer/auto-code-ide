import { describe, expect, it } from "vite-plus/test";
import { renderToStaticMarkup } from "react-dom/server";
import { mergeSubagentStatus } from "./BackgroundSubagentsProvider";
import {
  BackgroundServicesWidget,
  SleekSpinnerRing,
  collectRunningTurnItemTasks,
  filterLiveBackgroundTasks,
  type BackgroundTurnItem,
  type UnifiedBackgroundTaskItem,
} from "./BackgroundServicesWidget";

describe("BackgroundServicesWidget", () => {
  it("renders subagents, background tasks, and goals with sleek indicator design", () => {
    const html = renderToStaticMarkup(
      <BackgroundServicesWidget
        subagents={[
          { id: "sub-1", title: "Server & Deployment Specialist", status: "running" },
          { id: "sub-2", title: "Android Native Specialist", status: "running" },
          { id: "sub-3", title: "Web UI & Signaling Specialist", status: "running" },
        ]}
        goals={[
          {
            id: "goal-1",
            text: "please parallel worker chala k kar lo jaldi ...",
            status: "active",
          },
        ]}
      />,
    );

    // Sections are collapsed by default (quiet sidebar), so only their
    // headers + counts render in static markup — not the row names/text.
    // 1. Subagents Section
    expect(html).toContain("Subagents");
    expect(html).toContain("3");

    // 2. Background Tasks Section (collapsible header remains)
    expect(html).toContain("Background Tasks");

    // 3. Goals Section
    expect(html).toContain("Goals");
    expect(html).toContain("1");

    // Watchdog also stays collapsed until explicitly opened.
    expect(html).not.toContain("No active watchdog");
    expect(html).not.toContain("Server &amp; Deployment Specialist");
    expect(html).not.toContain("please parallel worker chala k kar lo jaldi ...");
    expect((html.match(/aria-expanded="false"/g) ?? []).length).toBe(4);

    // Should NOT contain the external IDE Overview navigation items
    expect(html).not.toContain("Overview");

    // Removed clutter: duplicate task list, connector label and the flow toggle
    // must never leak back into the watchdog area.
    expect(html).not.toContain("supervises &amp; controls");
    expect(html).not.toContain("flow:");
  });

  it("renders SleekSpinnerRing with circular arc", () => {
    const html = renderToStaticMarkup(<SleekSpinnerRing />);
    expect(html).toContain("<svg");
    expect(html).toContain("animate-spin");
    expect(html).toContain('d="M12 3a9 9 0 1 0 9 9"');
  });
});

describe("subagent status reconciliation", () => {
  it("does not let stale running telemetry reopen a terminal subagent", () => {
    expect(
      mergeSubagentStatus(
        { id: "worker-1", title: "Worker", status: "cancelled", completedAt: 10 },
        { id: "worker-1", title: "Worker", status: "running" },
      ),
    ).toMatchObject({ status: "cancelled", completedAt: 10 });
  });

  it("accepts a newer terminal result from any reporting source", () => {
    expect(
      mergeSubagentStatus(
        { id: "worker-1", title: "Worker", status: "cancelled", completedAt: 10 },
        { id: "worker-1", title: "Worker", status: "completed", completedAt: 20 },
      ),
    ).toMatchObject({ status: "completed", completedAt: 20 });
  });
});

describe("Background Tasks — live-only rule", () => {
  const turnItems: ReadonlyArray<BackgroundTurnItem> = [
    {
      id: "c1",
      type: "command_execution",
      status: "completed",
      input: 'echo "=== deploy-vps.sh ==="',
    },
    { id: "c2", type: "command_execution", status: "failed", input: "pnpm build" },
    { id: "c3", type: "command_execution", status: "running", input: "pnpm dev" },
    { id: "s1", type: "web_search", status: "completed", query: "watchdog" },
    { id: "s2", type: "file_search", status: "running", pattern: "*.ts" },
  ];

  it("keeps only running turn items as background tasks", () => {
    const tasks = collectRunningTurnItemTasks(turnItems);
    expect(tasks.map((t) => t.id)).toEqual(["turn-search-s2", "turn-cmd-c3"]);
    expect(tasks.every((t) => t.status === "running")).toBe(true);
    // The screenshot's finished commands must never show up here.
    expect(tasks.map((t) => t.title).join("\n")).not.toContain("deploy-vps.sh");
    expect(tasks.map((t) => t.title).join("\n")).not.toContain("pnpm build");
  });

  it("drops every non-running background service from the visible list", () => {
    const all: ReadonlyArray<UnifiedBackgroundTaskItem> = [
      { id: "a", title: "live terminal", kind: "command", status: "running" },
      { id: "b", title: "finished terminal", kind: "command", status: "completed" },
      { id: "c", title: "failed run", kind: "command", status: "failed" },
      { id: "d", title: "pending timer", kind: "timer", status: "pending" },
    ];
    expect(filterLiveBackgroundTasks(all).map((t) => t.id)).toEqual(["a"]);
  });

  it("returns an empty list when there are no turn items", () => {
    expect(collectRunningTurnItemTasks(undefined)).toEqual([]);
    expect(collectRunningTurnItemTasks([])).toEqual([]);
  });
});
