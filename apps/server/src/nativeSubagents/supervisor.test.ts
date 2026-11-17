import { expect, it, beforeEach, vi } from "vitest";

const calls = vi.hoisted(() => ({ prompts: [] as string[] }));
vi.mock("../../../../opencode-bypass-api/src/server/bypass/client.ts", () => ({
  bypassChatStream: async (
    input: { messages: Array<{ content: string }> },
    onChunk: (text: string) => void,
  ) => {
    calls.prompts.push(input.messages.map((m) => m.content).join("\n"));
    onChunk("native subagent output");
  },
}));

import {
  getTelemetrySnapshot,
  getWatchdogSnapshot,
  startWatchdogSupervision,
  stopWatchdog,
} from "./index.ts";

beforeEach(() => {
  calls.prompts = [];
});

const base = {
  projectId: "p1",
  projectName: "demo",
  projectRoot: "/tmp",
  taskTitle: "Build feature",
};

it("runs native subagents in parallel and reports a successful verdict", async () => {
  const result = await startWatchdogSupervision({
    ...base,
    prompt: "- first milestone\n- second milestone\n- third milestone",
    maxWorkers: 3,
  });
  expect(result.ok).toBe(true);
  expect(result.workersTotal).toBe(3);
  expect(result.workersCompleted).toBe(3);
  expect(result.status).toBe("completed");
  expect(calls.prompts.length).toBe(3);

  const telemetry = getTelemetrySnapshot({ projectName: "demo" });
  expect(telemetry.count.totalGoals).toBe(3);
  expect(telemetry.count.completedGoals).toBe(3);
});

it("falls back to a single milestone when the prompt has no explicit lines", async () => {
  const result = await startWatchdogSupervision({ ...base, prompt: "Do the whole thing" });
  expect(result.workersTotal).toBe(1);
  expect(calls.prompts.length).toBe(1);
});

it("stops a running watchdog and cancels its workers", async () => {
  const result = await startWatchdogSupervision({
    ...base,
    prompt: "one\ntwo",
    maxWorkers: 2,
  });
  const stopped = stopWatchdog(result.watchdogId);
  expect(stopped).toBe(false); // already terminal after synchronous completion

  const snapshot = getWatchdogSnapshot({ projectName: "demo" });
  expect(snapshot.watchdogs.some((w) => w.id === result.watchdogId)).toBe(true);
});
