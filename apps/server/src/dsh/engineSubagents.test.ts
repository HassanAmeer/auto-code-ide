import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => ({ prompts: [] as string[], replies: [] as string[] }));
vi.mock("../../../../opencode-bypass-api/src/server/bypass/client.ts", () => ({
  bypassChatStream: async (
    input: { messages: Array<{ content: string }> },
    onChunk: (text: string) => void,
  ) => {
    calls.prompts.push(input.messages.map((m) => m.content).join("\n"));
    onChunk(calls.replies.shift() ?? "done");
  },
}));

import {
  executeParallelSubagents,
  executeSubagentTool,
  getSubagentDepth,
  getSubagentSession,
  runEngineSelfTest,
} from "../../../../engine/runtimes/opencode-full-engine/index.ts";

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "subagent-test-"));
  calls.prompts = [];
  calls.replies = [];
});
afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

it("tracks parentID depth for native subagent sessions", async () => {
  const previous = process.env.OPENCODE_SUBAGENT_DEPTH;
  process.env.OPENCODE_SUBAGENT_DEPTH = "2";
  try {
    const parent = await executeSubagentTool({ prompt: "parent" }, root);
    calls.replies = ["child done"];
    const child = await executeSubagentTool({ prompt: "child", parentID: parent.sessionID }, root);
    expect(child.status).toBe("completed");
    expect(getSubagentDepth(child.sessionID)).toBe(2);
    expect(getSubagentSession(child.sessionID)?.parentID).toBe(parent.sessionID);
  } finally {
    if (previous === undefined) delete process.env.OPENCODE_SUBAGENT_DEPTH;
    else process.env.OPENCODE_SUBAGENT_DEPTH = previous;
  }
});

it("runs a real read -> edit tool loop through the engine", async () => {
  fs.writeFileSync(path.join(root, "app.ts"), "export const value = 1;\n");
  calls.replies = [
    '```tool:read\n{"path":"app.ts"}\n```',
    '```tool:edit\n{"path":"app.ts","oldString":"value = 1","newString":"value = 2"}\n```',
    "Done",
  ];
  const result = await executeSubagentTool({ prompt: "bump value" }, root);
  expect(result.status).toBe("completed");
  expect(result.filesModified).toContain("app.ts");
  expect(fs.readFileSync(path.join(root, "app.ts"), "utf8")).toContain("value = 2");
});

it("runs subagents in parallel with bounded concurrency", async () => {
  calls.replies = ["one", "two", "three"];
  const results = await executeParallelSubagents(
    [{ prompt: "a" }, { prompt: "b" }, { prompt: "c" }],
    root,
    2,
  );
  expect(results).toHaveLength(3);
  expect(results.every((r) => r.status === "completed")).toBe(true);
});

it("engine self-test verifies subagent orchestration", async () => {
  const report = await runEngineSelfTest();
  expect(report.ok).toBe(true);
  expect(report.checks.subagentOrchestration).toBe("pass");
});
