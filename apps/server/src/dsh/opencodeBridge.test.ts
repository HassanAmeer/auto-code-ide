import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const stream = vi.hoisted(() => ({ replies: [] as string[], prompts: [] as string[] }));
vi.mock("../../../../opencode-bypass-api/src/server/bypass/client.ts", () => ({
  bypassChatStream: async (
    input: { messages: Array<{ content: string }> },
    onChunk: (text: string) => void,
  ) => {
    stream.prompts.push(input.messages.map((m) => m.content).join("\n"));
    onChunk(stream.replies.shift() ?? "PASS\nVerified");
  },
}));
vi.mock("@t3tools/shared/superpowerSkills", () => ({ getProjectChatEngineSkillPrompt: () => "" }));
import { executeOpenCodeTask } from "./opencodeBridge.ts";

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "bridge-test-"));
  vi.stubEnv("AUTOCODE_HOME", root);
  fs.writeFileSync(
    path.join(root, "app-settings.json"),
    JSON.stringify({ active_core_engine: "opencode-full-engine" }),
  );
  stream.replies = [];
  stream.prompts = [];
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  fs.rmSync(root, { recursive: true, force: true });
});
const run = (root: string, taskTitle = "Update feature") =>
  executeOpenCodeTask({
    worktreePath: root,
    projectName: "demo",
    taskTitle,
    prompt: "Update the feature",
    model: "test-model",
  });

it("returns the actual standalone verifier response without writing files", async () => {
  stream.replies = ["PASS\n```filepath:bad.ts\nwrong\n```"];
  const result = await run(root, "Verify requirements");
  expect(result.ok).toBe(true);
  expect(result.modelOutput).toContain("PASS");
  expect(fs.existsSync(path.join(root, "bad.ts"))).toBe(false);
});

it("reads existing code before applying a targeted edit and preserves surrounding code", async () => {
  fs.writeFileSync(
    path.join(root, "feature.ts"),
    "export const keep = 42;\nexport const value = 1;\n",
  );
  stream.replies = [
    '```tool:read\n{"path":"feature.ts"}\n```',
    '```tool:edit\n{"path":"feature.ts","oldString":"value = 1","newString":"value = 2"}\n```',
    "Done",
  ];
  const result = await run(root);
  expect(result.ok).toBe(true);
  expect(stream.prompts[1]).toContain("export const keep = 42;");
  expect(fs.readFileSync(path.join(root, "feature.ts"), "utf8")).toBe(
    "export const keep = 42;\nexport const value = 2;\n",
  );
});

it("rejects full-file replacement of existing code", async () => {
  fs.writeFileSync(path.join(root, "feature.ts"), "export const keep = 42;\n");
  stream.replies = ["```filepath:feature.ts\nexport const replacement = 1;\n```"];
  const result = await run(root);
  expect(result.ok).toBe(false);
  expect(fs.readFileSync(path.join(root, "feature.ts"), "utf8")).toBe("export const keep = 42;\n");
});

it.each([200, 500])("captures adapter response and rejects HTTP failure %s", async (status) => {
  fs.writeFileSync(
    path.join(root, "app-settings.json"),
    JSON.stringify({ active_core_engine: "opencode-adapter" }),
  );
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, opts?: RequestInit) => {
      if (url.endsWith("/prompt"))
        return new Response(JSON.stringify({ parts: [{ type: "text", text: "PASS\nVerified" }] }), {
          status,
        });
      if (opts?.method === "POST") return new Response(JSON.stringify({ id: "session-1" }));
      return new Response("[]");
    }),
  );
  const result = await run(root, "Verify requirements");
  expect(result.ok).toBe(status === 200);
  if (status === 200) expect(result.modelOutput).toBe("PASS\nVerified");
});
