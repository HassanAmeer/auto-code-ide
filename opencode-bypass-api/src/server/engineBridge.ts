// @effect-diagnostics nodeBuiltinImport:off globalConsole:off
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import * as NodeOS from "node:os";
import * as NodeChildProcess from "node:child_process";

import {
  executeEngineTool,
  executeWriteTool,
  executeEditTool,
  executePatchTool,
  executeShellTool,
  executeReadTool,
  executeGrepTool,
  executeGlobTool,
  ATTACHED_TOOLS,
  ENGINE_NAME,
  ENGINE_VERSION,
} from "../../../engine/runtimes/opencode-full-engine/index.ts";

export interface ExtractedProjectFile {
  readonly path: string;
  readonly content: string;
}

export interface ScannedFileDetail {
  readonly relPath: string;
  readonly linesCount: number;
  readonly content?: string;
  readonly outline?: string;
  readonly isFull: boolean;
}

export interface WorkspaceContextResult {
  readonly hasFiles: boolean;
  readonly fileCount: number;
  readonly summary: string;
  readonly fileDetails: ReadonlyArray<ScannedFileDetail>;
}

/**
 * Thread conversation history store so follow-up prompts always have context.
 */
const GLOBAL_BYPASS_THREAD_HISTORIES = new Map<
  string,
  Array<{ role: "system" | "user" | "assistant"; content: string }>
>();

export function getBypassThreadHistory(
  threadKey: string,
  projectCwd?: string,
): Array<{ role: "system" | "user" | "assistant"; content: string }> {
  if (threadKey && GLOBAL_BYPASS_THREAD_HISTORIES.has(threadKey)) {
    const mem = GLOBAL_BYPASS_THREAD_HISTORIES.get(threadKey);
    if (mem && mem.length > 0) return mem;
  }

  if (projectCwd && threadKey) {
    const historyFile = NodePath.join(projectCwd, ".autocode", `bypass_thread_${threadKey}.json`);
    try {
      if (NodeFS.existsSync(historyFile)) {
        const raw = NodeFS.readFileSync(historyFile, "utf-8");
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          GLOBAL_BYPASS_THREAD_HISTORIES.set(threadKey, parsed);
          return parsed;
        }
      }
    } catch {
      // ignore
    }
  }

  return [];
}

export function saveBypassThreadHistory(
  threadKey: string,
  history: Array<{ role: "system" | "user" | "assistant"; content: string }>,
  projectCwd?: string,
): void {
  if (threadKey) {
    GLOBAL_BYPASS_THREAD_HISTORIES.set(threadKey, history);
  }
  if (projectCwd && history.length > 0 && threadKey) {
    try {
      const autoDir = NodePath.join(projectCwd, ".autocode");
      if (!NodeFS.existsSync(autoDir)) {
        NodeFS.mkdirSync(autoDir, { recursive: true });
      }
      const historyFile = NodePath.join(autoDir, `bypass_thread_${threadKey}.json`);
      NodeFS.writeFileSync(historyFile, JSON.stringify(history, null, 2), "utf-8");
    } catch {
      // ignore
    }
  }
}

/**
 * Reads the active execution engine settings persisted by the IDE UI.
 */
export function getActiveExecutionEngineMode(): {
  mode: "custom" | "codex";
  codexBinaryPath: string;
} {
  const candidateDirs = [
    NodePath.join(process.cwd(), "data", "userdata"),
    NodePath.join(process.cwd(), "userdata"),
    NodePath.join(NodeOS.homedir(), ".autocode", "userdata"),
    NodePath.join(NodeOS.homedir(), ".t3", "userdata"),
    "/root/autojobs/data/userdata",
  ];
  for (const dir of candidateDirs) {
    const jsonPath = NodePath.join(dir, "app-settings.json");
    if (NodeFS.existsSync(jsonPath)) {
      try {
        const raw = JSON.parse(NodeFS.readFileSync(jsonPath, "utf-8"));
        if (raw?.execution_engine) {
          const mode = raw.execution_engine.mode === "codex" ? "codex" : "custom";
          const codexBinaryPath = String(raw.execution_engine.codexBinaryPath || "codex");
          return { mode, codexBinaryPath };
        }
      } catch {}
    }
  }
  return { mode: "custom", codexBinaryPath: "codex" };
}

/**
 * Scans workspace filesystem so model is 100% aware of existing files and never stops to "read directory".
 */
export function scanWorkspaceContext(
  projectCwd: string,
  maxTotalBytes = 40000,
): WorkspaceContextResult {
  if (!projectCwd || !NodeFS.existsSync(projectCwd)) {
    return { hasFiles: false, fileCount: 0, summary: "Workspace is fresh/empty.", fileDetails: [] };
  }

  const ignoreDirs = new Set([
    ".git",
    "node_modules",
    "dist",
    "build",
    ".next",
    "__pycache__",
    ".venv",
    ".autocode",
    ".cache",
    ".turbo",
  ]);
  const files: Array<{ relPath: string; fullPath: string; size: number }> = [];

  function walk(dir: string, depth = 0) {
    if (depth > 4 || files.length >= 60) return;
    try {
      const entries = NodeFS.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.startsWith(".") && entry.name !== ".env.example") continue;
        if (ignoreDirs.has(entry.name)) continue;

        const full = NodePath.join(dir, entry.name);
        const rel = NodePath.relative(projectCwd, full);

        if (entry.isDirectory()) {
          walk(full, depth + 1);
        } else if (entry.isFile()) {
          try {
            const stat = NodeFS.statSync(full);
            files.push({ relPath: rel, fullPath: full, size: stat.size });
          } catch {
            // ignore
          }
        }
      }
    } catch {
      // ignore
    }
  }

  walk(projectCwd);

  if (files.length === 0) {
    return { hasFiles: false, fileCount: 0, summary: "Workspace is empty.", fileDetails: [] };
  }

  files.sort((a, b) => {
    const extOrder: Record<string, number> = {
      html: 1,
      js: 2,
      ts: 3,
      css: 4,
      py: 5,
      json: 6,
    };
    const extA = a.relPath.split(".").pop()?.toLowerCase() || "";
    const extB = b.relPath.split(".").pop()?.toLowerCase() || "";
    const rankA = extOrder[extA] ?? 99;
    const rankB = extOrder[extB] ?? 99;
    return rankA - rankB;
  });

  let currentBytes = 0;
  const fileDetails: ScannedFileDetail[] = [];
  const summaryLines = [
    `Existing Workspace Files (${files.length} file${files.length > 1 ? "s" : ""}):`,
  ];

  for (const f of files) {
    try {
      const content = NodeFS.readFileSync(f.fullPath, "utf-8");
      const lines = content.split("\n");
      summaryLines.push(
        `- ${f.relPath} (${lines.length} lines, ${Math.round((f.size / 1024) * 10) / 10} KB)`,
      );

      if (currentBytes + f.size <= maxTotalBytes) {
        currentBytes += f.size;
        fileDetails.push({
          relPath: f.relPath,
          linesCount: lines.length,
          content,
          isFull: true,
        });
      } else {
        fileDetails.push({
          relPath: f.relPath,
          linesCount: lines.length,
          outline: `First 10 lines:\n${lines.slice(0, 10).join("\n")}`,
          isFull: false,
        });
      }
    } catch {
      // ignore
    }
  }

  return {
    hasFiles: true,
    fileCount: files.length,
    summary: summaryLines.join("\n"),
    fileDetails,
  };
}

/**
 * Extracts generated project files from LLM responses (both thinking and text blocks).
 */
export function extractFilesFromMarkdown(
  markdown: string,
  projectCwd?: string,
  userPrompt?: string,
): Array<ExtractedProjectFile> {
  const files: Array<ExtractedProjectFile> = [];
  const seenPaths = new Set<string>();
  const codeBlockRegex = /```([^\n]*)\n([\s\S]*?)(?:```|$)/g;
  let match: RegExpExecArray | null;

  let htmlCount = 0;
  let cssCount = 0;
  let jsCount = 0;
  let pyCount = 0;

  while ((match = codeBlockRegex.exec(markdown)) !== null) {
    const header = match[1]?.trim() || "";
    let content = match[2] || "";
    let detectedPath: string | null = null;

    // 1. Check header for filepath=... or path=... or filename
    const headerMatch =
      header.match(/(?:file|filepath|path)\s*=\s*["']?([^\s"']+)["']?/i) ||
      header.match(/^[a-zA-Z0-9_-]+[:\s]+([a-zA-Z0-9_\-./]+\.[a-zA-Z0-9]+)$/) ||
      header.match(/^([a-zA-Z0-9_\-./]+\.[a-zA-Z0-9]+)$/);

    if (headerMatch && headerMatch[1]) {
      detectedPath = headerMatch[1].trim();
    }

    // 2. Check first 3 lines of block for comment filename
    if (!detectedPath) {
      const lines = content.split("\n");
      for (let i = 0; i < Math.min(3, lines.length); i++) {
        const line = lines[i]?.trim() || "";
        const commentMatch =
          line.match(
            /^(?:\/\/|#|\/\*|<!--)\s*(?:file|filepath|filename|path)\s*[:=]\s*([a-zA-Z0-9_\-./]+\.[a-zA-Z0-9]+)/i,
          ) || line.match(/^(?:\/\/|#)\s*([a-zA-Z0-9_\-./]+\.[a-zA-Z0-9]+)$/);
        if (commentMatch && commentMatch[1]) {
          detectedPath = commentMatch[1].trim();
          lines.splice(i, 1);
          content = lines.join("\n");
          break;
        }
      }
    }

    // 3. Check preceding text OR user prompt for explicit filename (e.g. `in jet.html`, `file: car.html`)
    if (!detectedPath && match.index > 0) {
      const precedingText = markdown.slice(Math.max(0, match.index - 300), match.index);
      const preMatch = precedingText.match(
        /(?:file(?:path)?|in|to|update|edit|modify|create|new|for|add|save\s+(?:this\s+)?as)\s+[`'"]?([a-zA-Z0-9_\-./]+\.[a-zA-Z0-9]+)[`'"]?/i,
      );
      if (preMatch && preMatch[1]) {
        detectedPath = preMatch[1].trim();
      }
    }

    if (!detectedPath && userPrompt) {
      const promptMatch = userPrompt.match(
        /(?:in|to|named|file|create)\s+[`'"]?([a-zA-Z0-9_\-./]+\.(?:html|js|css|py|ts|json|txt))[`'"]?/i,
      );
      if (promptMatch && promptMatch[1]) {
        detectedPath = promptMatch[1].trim();
      }
    }

    // 4. Fallback heuristics for common templates (like 2D game or website)
    if (!detectedPath) {
      const lowerHeader = header.toLowerCase();
      const trimmed = content.trim();
      if (
        (lowerHeader.includes("html") ||
          trimmed.startsWith("<!DOCTYPE html") ||
          trimmed.startsWith("<html")) &&
        htmlCount === 0
      ) {
        detectedPath = "index.html";
        htmlCount++;
      } else if (lowerHeader.includes("css") && cssCount === 0) {
        detectedPath = "style.css";
        cssCount++;
      } else if (
        (lowerHeader.includes("javascript") || lowerHeader.includes("js")) &&
        (trimmed.includes("requestAnimationFrame") ||
          trimmed.includes("canvas") ||
          trimmed.includes("addEventListener")) &&
        jsCount === 0
      ) {
        detectedPath = "game.js";
        jsCount++;
      } else if (lowerHeader.includes("python") && pyCount === 0) {
        detectedPath = "main.py";
        pyCount++;
      }
    }

    // 5. Intelligent diff target resolver: If this is a SEARCH/REPLACE diff without path,
    // match the search target against existing files in projectCwd!
    if (!detectedPath && projectCwd && NodeFS.existsSync(projectCwd)) {
      const srMatch = content.match(/<{3,7}\s*SEARCH\s*\n([\s\S]*?)\n[=]{3,7}/);
      if (srMatch && srMatch[1]) {
        const searchTarget = srMatch[1].trim();
        if (searchTarget.length > 3) {
          try {
            const diskEntries = NodeFS.readdirSync(projectCwd, { recursive: true });
            for (const rel of diskEntries) {
              const relStr = String(rel);
              if (
                !relStr.startsWith(".") &&
                !relStr.startsWith("node_modules") &&
                !relStr.includes("/node_modules") &&
                !relStr.includes("/.autocode")
              ) {
                const fullEntryPath = NodePath.join(projectCwd, relStr);
                if (NodeFS.statSync(fullEntryPath).isFile()) {
                  const diskCode = NodeFS.readFileSync(fullEntryPath, "utf-8");
                  if (
                    diskCode.includes(searchTarget) ||
                    diskCode.replace(/\r\n/g, "\n").includes(searchTarget.replace(/\r\n/g, "\n"))
                  ) {
                    detectedPath = relStr;
                    break;
                  }
                }
              }
            }
          } catch {
            // ignore
          }
        }
      }

      // If still not detected and workspace has only 1 source file:
      if (!detectedPath) {
        try {
          const filesInRoot = NodeFS.readdirSync(projectCwd).filter(
            (f) =>
              !f.startsWith(".") &&
              (f.endsWith(".html") || f.endsWith(".js") || f.endsWith(".ts") || f.endsWith(".py")),
          );
          if (filesInRoot.length === 1 && filesInRoot[0]) {
            const candidateFile = filesInRoot[0];
            const candidateExt = candidateFile.split(".").pop()?.toLowerCase();
            const trimmed = content.trim();

            if (candidateExt === "html") {
              if (
                trimmed.toLowerCase().includes("<html") ||
                trimmed.toLowerCase().startsWith("<!doctype") ||
                trimmed.toLowerCase().includes("<!doctype") ||
                (trimmed.includes("<head") && trimmed.includes("<body"))
              ) {
                detectedPath = candidateFile;
              }
            } else if (candidateExt === "js" || candidateExt === "ts" || candidateExt === "py") {
              const lineCount = trimmed.split("\n").length;
              if (
                lineCount >= 10 ||
                trimmed.includes("<<<< SEARCH") ||
                trimmed.includes("class ") ||
                trimmed.includes("function init") ||
                trimmed.includes("function start")
              ) {
                detectedPath = candidateFile;
              }
            }
          }
        } catch {
          // ignore
        }
      }
    }

    if (detectedPath) {
      const cleanPath = detectedPath.replace(/^[/\\]+/, "").replace(/\.\./g, "");
      if (cleanPath && !seenPaths.has(cleanPath)) {
        seenPaths.add(cleanPath);
        files.push({ path: cleanPath, content });
      }
    }
  }

  return files;
}

/**
 * Universal diff/patch helper for SEARCH/REPLACE blocks.
 */
function universalPatchFile(
  existingContent: string,
  patchBlock: string,
  _filePath: string,
): { success: boolean; content: string } {
  const regex = /<{3,7}\s*SEARCH\s*\n([\s\S]*?)\n[=]{3,7}\s*\n([\s\S]*?)\n[>]{3,7}/g;
  let match: RegExpExecArray | null;
  let current = existingContent;
  let replacedCount = 0;

  while ((match = regex.exec(patchBlock)) !== null) {
    const searchTarget = match[1] || "";
    const replacement = match[2] || "";

    if (current.includes(searchTarget)) {
      current = current.replace(searchTarget, replacement);
      replacedCount++;
      continue;
    }

    // Try whitespace-normalized match
    const normCurrent = current.replace(/\r\n/g, "\n");
    const normSearch = searchTarget.replace(/\r\n/g, "\n");
    if (normCurrent.includes(normSearch)) {
      current = normCurrent.replace(normSearch, replacement.replace(/\r\n/g, "\n"));
      replacedCount++;
    }
  }

  return { success: replacedCount > 0, content: current };
}

/**
 * Writes or patches the file to the project filesystem using OpenCode Full Engine tools.
 */
export function applyFileContentOrPatch(
  projectCwd: string,
  file: { path: string; content: string },
): {
  saved: boolean;
  method: "created" | "patched" | "overwritten" | "skipped_protected";
  path: string;
} {
  const fullPath = NodePath.resolve(projectCwd, file.path);
  const rel = NodePath.relative(projectCwd, fullPath);
  if (rel.startsWith("..") || NodePath.isAbsolute(rel)) {
    return { saved: false, method: "skipped_protected", path: file.path };
  }

  const existingContent = NodeFS.existsSync(fullPath)
    ? NodeFS.readFileSync(fullPath, "utf-8")
    : null;

  const trimmedNew = file.content.trim();
  const ext = file.path.split(".").pop()?.toLowerCase() || "";

  // 1. SEARCH/REPLACE diff check - use OpenCode Full Engine executePatchTool
  const hasSearchReplace = /<{3,7}\s*SEARCH\s*\n[\s\S]*?\n[=]{3,7}\s*\n[\s\S]*?\n[>]{3,7}/.test(
    file.content,
  );

  if (hasSearchReplace && existingContent !== null) {
    try {
      const patchResult = executePatchTool(
        { patchText: file.content, path: file.path },
        projectCwd,
      );
      if (patchResult.totalHunks > 0) {
        return { saved: true, method: "patched", path: file.path };
      }
    } catch {
      // Fallback to legacy parser below
    }

    const legacyPatch = universalPatchFile(existingContent, file.content, file.path);
    if (legacyPatch.success && legacyPatch.content !== existingContent) {
      executeWriteTool({ path: file.path, content: legacyPatch.content }, projectCwd);
      return { saved: true, method: "patched", path: file.path };
    }
  }

  // 2. Direct write using OpenCode Full Engine executeWriteTool
  try {
    const writeResult = executeWriteTool({ path: file.path, content: file.content }, projectCwd);
    return {
      saved: true,
      method: writeResult.created ? "created" : "overwritten",
      path: file.path,
    };
  } catch (writeErr) {
    console.error("[OpenCodeEngine] executeWriteTool error for file:", file.path, writeErr);
    return { saved: false, method: "skipped_protected", path: file.path };
  }
}

/**
 * System prompt instructions ensuring any model (including free lane / bypass)
 * structures its output for the active execution engine.
 */
export function getActiveEngineSystemPrompt(projectCwd: string): string {
  const engine = getActiveExecutionEngineMode();
  const workspace = scanWorkspaceContext(projectCwd);

  let filesContext = "";
  if (workspace.hasFiles && workspace.fileCount > 0) {
    for (const f of workspace.fileDetails) {
      if (f.isFull && f.content) {
        filesContext += `\n--- EXISTING FILE ON DISK: ${f.relPath} (${f.linesCount} lines) ---\n\`\`\`\n${f.content}\n\`\`\`\n`;
      } else if (f.outline) {
        filesContext += `\n--- EXISTING FILE STRUCTURE: ${f.relPath} (${f.linesCount} lines) ---\n${f.outline}\n`;
      }
    }
  }

  return `You are an elite, production-grade AI Software Engineer powered by OpenCode Full Engine (${ENGINE_VERSION}).
Current Project Directory: ${projectCwd}
Active Execution Engine: OpenCode Full Engine (14 Embedded Standalone Tools)
Available Embedded Tools: ${ATTACHED_TOOLS.join(", ")}

================================================================================
WORKSPACE FILE SYSTEM CONTEXT (ALREADY SCANNED - DO NOT ASK TO READ DIRECTORY):
${workspace.summary}
${filesContext || "(Workspace is currently fresh/empty)"}

================================================================================
CRITICAL MANDATORY RULES FOR CODE GENERATION (100% RELIABILITY):
1. NEVER ASK OR THINK TO "READ THE DIRECTORY" OR "LIST FILES":
   • The workspace files are ALREADY fully provided above!
   • Start implementing the requested files immediately!

2. DO NOT HIDE CODE IN THINKING PROCESS:
   • You MUST output the FULL, COMPLETE, PRODUCTION-READY code in the FINAL message response.
   • NEVER output 5-10 lines of partial snippets or cut code off with "for(let i=0; i<r".
   • If creating a game or website, ALWAYS write the ENTIRE working index.html (or game.js / style.css) with all logic, canvas sizing, collision detection, and controls.

3. ALWAYS OUTPUT CODE IN EXPLICIT CODE BLOCKS WITH FILEPATHS:
   \`\`\`<language> filepath=<relative/path>
   // complete file content or diff
   \`\`\`
   Example:
   \`\`\`html filepath=index.html
   <!DOCTYPE html>
   ...
   </html>
   \`\`\`

4. ZERO BROKEN ASSETS:
   • Draw game sprites procedurally on HTML5 Canvas or use emojis ("🚀", "👾", "🪙", "💥").
   • Never reference external images or sounds that do not exist locally on disk.

5. AUTOMATIC DISK PERSISTENCE:
   • The host OpenCode Full Engine automatically intercepts code blocks, executes them via executeEngineTool (write/edit/patch), saves files to ${projectCwd}, and stages them to Git.
================================================================================`;
}

/**
 * Executes the engine pipeline on the completed model response.
 * Inspects BOTH assistant text AND reasoning/thinking text so no code is lost!
 */
export function executeActiveEnginePipeline(
  responseMarkdown: string,
  reasoningMarkdown: string | undefined,
  projectCwd: string,
): {
  finalText: string;
  savedFiles: string[];
} {
  if (!projectCwd || !NodeFS.existsSync(projectCwd)) {
    return { finalText: responseMarkdown, savedFiles: [] };
  }

  // 1. First extract files from response markdown
  let extractedFiles = extractFilesFromMarkdown(responseMarkdown, projectCwd);

  // 2. If response markdown had incomplete or zero files, inspect reasoning/thinking!
  // Often reasoning models write the complete 300+ line code in thinking and leave final message brief!
  if (reasoningMarkdown && reasoningMarkdown.length > 50) {
    const thinkingFiles = extractFilesFromMarkdown(reasoningMarkdown, projectCwd);
    for (const tf of thinkingFiles) {
      const existing = extractedFiles.find((ef) => ef.path === tf.path);
      if (!existing) {
        extractedFiles.push(tf);
      } else if (tf.content.length > existing.content.length + 100) {
        // Thinking version has much more complete code!
        extractedFiles = extractedFiles.filter((ef) => ef.path !== tf.path);
        extractedFiles.push(tf);
      }
    }
  }

  const savedFiles: string[] = [];

  for (const file of extractedFiles) {
    try {
      const result = applyFileContentOrPatch(projectCwd, file);
      if (result.saved) {
        savedFiles.push(file.path);
      }
    } catch (saveErr) {
      console.error("[ActiveEngine] Failed saving/patching generated file:", file.path, saveErr);
    }
  }

  let finalText = responseMarkdown;
  if (savedFiles.length > 0) {
    try {
      const gitDir = NodePath.join(projectCwd, ".git");
      if (!NodeFS.existsSync(gitDir)) {
        NodeChildProcess.execSync("git init", { cwd: projectCwd, stdio: "ignore" });
      }
      NodeChildProcess.execSync("git add -A", { cwd: projectCwd, stdio: "ignore" });
      const commitMsg = `AI generation: ${savedFiles.slice(0, 3).join(", ")}${savedFiles.length > 3 ? "..." : ""}`;
      NodeChildProcess.execSync(
        `git -c user.name="AutoCode AI" -c user.email="hasanameer386@gmail.com" commit -m "${commitMsg.replace(/"/g, '\\"')}" --allow-empty`,
        { cwd: projectCwd, stdio: "ignore" },
      );
    } catch {
      // Git tracking best-effort
    }

    finalText +=
      `\n\n---\n📁 **Saved ${savedFiles.length} file${savedFiles.length > 1 ? "s" : ""} to project (\`${NodePath.basename(projectCwd)}\`):**\n` +
      savedFiles.map((f) => `- \`${f}\``).join("\n");

    const hasHtml = savedFiles.some((f) => f.toLowerCase().endsWith(".html"));
    if (hasHtml) {
      finalText += `\n\n🎮 **Live Preview Ready**: \`index.html\` is available. Open in Preview to play and test!`;
    }
  }

  return { finalText, savedFiles };
}
