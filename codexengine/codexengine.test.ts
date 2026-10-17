import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { describe, expect, it } from "vitest";
import { CodexEngine } from "./index.ts";
import { scanWorkspace } from "./workspaceScanner.ts";
import { inspectRelevantFiles } from "./fileInspector.ts";
import { applyModelOutput } from "./patchEngine.ts";
import { getThreadHistory, appendTurnToHistory } from "./contextMemory.ts";

describe("CodexEngine", () => {
  it("scans workspace directory and builds file tree", () => {
    const tmpDir = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "codex-test-scan-"));
    try {
      NodeFS.mkdirSync(NodePath.join(tmpDir, "src", "components"), { recursive: true });
      NodeFS.mkdirSync(NodePath.join(tmpDir, "node_modules", "pkg"), { recursive: true });
      NodeFS.writeFileSync(NodePath.join(tmpDir, "package.json"), "{}");
      NodeFS.writeFileSync(NodePath.join(tmpDir, "src", "index.ts"), "console.log('hi');");
      NodeFS.writeFileSync(
        NodePath.join(tmpDir, "src", "components", "Button.tsx"),
        "export const Button = () => null;",
      );
      NodeFS.writeFileSync(NodePath.join(tmpDir, "node_modules", "pkg", "ignore.js"), "ignored");

      const result = scanWorkspace(tmpDir);
      expect(result.fileList).toContain("package.json");
      expect(result.fileList).toContain("src/index.ts");
      expect(result.fileList).toContain("src/components/Button.tsx");
      expect(result.fileList).not.toContain("node_modules/pkg/ignore.js");
      expect(result.treeText).toContain("Button.tsx");
      expect(result.projectType).toBe("node/javascript");
    } finally {
      NodeFS.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("inspects relevant files mentioned in user prompt", () => {
    const tmpDir = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "codex-test-inspect-"));
    try {
      NodeFS.writeFileSync(
        NodePath.join(tmpDir, "game.js"),
        "let score = 0;\nfunction update() {}",
      );
      NodeFS.writeFileSync(NodePath.join(tmpDir, "style.css"), "body { margin: 0; }");

      const availableFiles = ["game.js", "style.css"];
      const inspection = inspectRelevantFiles(
        tmpDir,
        "can you add sound effects to game.js?",
        availableFiles,
      );

      expect(inspection.files.length).toBe(1);
      expect(inspection.files[0]?.path).toBe("game.js");
      expect(inspection.contextText).toContain("let score = 0;");
    } finally {
      NodeFS.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("applies full file generation from code blocks", () => {
    const tmpDir = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "codex-test-patch-"));
    try {
      const markdown = `
Here is the code:

\`\`\`javascript filepath=src/utils.js
export function add(a, b) {
  return a + b;
}
\`\`\`
`;
      const result = applyModelOutput(markdown, tmpDir);
      expect(result.changes.length).toBe(1);
      expect(result.changes[0]?.path).toBe("src/utils.js");
      expect(result.changes[0]?.action).toBe("created");

      const savedContent = NodeFS.readFileSync(NodePath.join(tmpDir, "src", "utils.js"), "utf-8");
      expect(savedContent).toContain("return a + b;");
    } finally {
      NodeFS.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("applies targeted SEARCH/REPLACE diff patch to existing files", () => {
    const tmpDir = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "codex-test-diff-"));
    try {
      const originalCode = `import React from 'react';

export function Header() {
  return (
    <header>
      <h1>Old Title</h1>
    </header>
  );
}
`;
      NodeFS.mkdirSync(NodePath.join(tmpDir, "src"), { recursive: true });
      NodeFS.writeFileSync(NodePath.join(tmpDir, "src", "Header.tsx"), originalCode);

      const markdown = `
I updated the title for you:

<<<<<<< SEARCH src/Header.tsx
      <h1>Old Title</h1>
=======
      <h1>New Awesome Title</h1>
      <button>Login</button>
>>>>>>> REPLACE
`;
      const result = applyModelOutput(markdown, tmpDir);
      expect(result.changes.length).toBe(1);
      expect(result.changes[0]?.path).toBe("src/Header.tsx");
      expect(result.changes[0]?.action).toBe("patched");

      const patched = NodeFS.readFileSync(NodePath.join(tmpDir, "src", "Header.tsx"), "utf-8");
      expect(patched).toContain("<h1>New Awesome Title</h1>");
      expect(patched).toContain("<button>Login</button>");
      expect(patched).toContain("export function Header()");
    } finally {
      NodeFS.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("prunes older assistant turns to prevent token explosion", () => {
    const testThreadKey = `test-thread-${Date.now()}`;
    const longCodeBlock =
      "```typescript filepath=index.ts\n" + "console.log('line');\n".repeat(20) + "```";

    appendTurnToHistory(
      testThreadKey,
      "Build feature 1",
      `Sure, here is the code:\n${longCodeBlock}`,
    );
    appendTurnToHistory(
      testThreadKey,
      "Build feature 2",
      `Sure, here is feature 2:\n${longCodeBlock}`,
    );

    const history = getThreadHistory(testThreadKey);
    expect(history.length).toBe(4);
    // The older turn (index 1) should be pruned
    expect(history[1]?.content).toContain("[Code block for `index.ts`");
    // User prompts are intact
    expect(history[0]?.content).toBe("Build feature 1");
    expect(history[2]?.content).toBe("Build feature 2");
  });

  it("executes CodexEngine.prepareTurn and processTurnOutput end-to-end", () => {
    const tmpDir = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "codex-test-e2e-"));
    const threadKey = `e2e-thread-${Date.now()}`;
    try {
      NodeFS.writeFileSync(
        NodePath.join(tmpDir, "index.html"),
        "<!DOCTYPE html><html><body><h1>Hello</h1></body></html>",
      );

      const turn = CodexEngine.prepareTurn({
        workspaceRoot: tmpDir,
        userPrompt: "Change the h1 in index.html to Welcome",
        threadKey,
      });

      expect(turn.scannedFiles).toContain("index.html");
      expect(turn.defaultTargetFile).toBe("index.html");
      expect(turn.fullUserPrompt).toContain("[CURRENT PROJECT WORKSPACE TREE]");
      expect(turn.fullUserPrompt).toContain("index.html");

      const modelResponse = `
I updated index.html for you:

<<<<<<< SEARCH index.html
<h1>Hello</h1>
=======
<h1>Welcome</h1>
>>>>>>> REPLACE
`;

      const processResult = CodexEngine.processTurnOutput({
        markdown: modelResponse,
        workspaceRoot: tmpDir,
        userPrompt: "Change the h1 in index.html to Welcome",
        threadKey,
        defaultTargetFile: turn.defaultTargetFile,
      });

      expect(processResult.changes.length).toBe(1);
      expect(processResult.changes[0]?.action).toBe("patched");
      const updated = NodeFS.readFileSync(NodePath.join(tmpDir, "index.html"), "utf-8");
      expect(updated).toContain("<h1>Welcome</h1>");
    } finally {
      NodeFS.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
