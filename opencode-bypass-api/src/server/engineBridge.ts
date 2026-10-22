// @effect-diagnostics nodeBuiltinImport:off globalConsole:off
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import * as NodeOS from "node:os";
import * as NodeChildProcess from "node:child_process";

export interface ExtractedProjectFile {
  readonly path: string;
  readonly content: string;
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
 * Extracts generated project files from LLM Markdown responses.
 */
export function extractFilesFromMarkdown(
  markdown: string,
  projectCwd?: string,
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

    // 3. Fallback heuristics for common templates (like 2D game or website)
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

    // 4. Preceding context check (e.g. `In index.html:` or `create new file audio.js`)
    if (!detectedPath && match.index > 0) {
      const precedingText = markdown.slice(Math.max(0, match.index - 200), match.index);
      const preMatch = precedingText.match(
        /(?:file(?:path)?|in|to|update|edit|modify|create|new|for|add)\s+[`'"]?([a-zA-Z0-9_\-./]+\.[a-zA-Z0-9]+)[`'"]?/i,
      );
      if (preMatch && preMatch[1]) {
        detectedPath = preMatch[1].trim();
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
 * Writes or patches the file to the project filesystem.
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

  const dir = NodePath.dirname(fullPath);
  if (!NodeFS.existsSync(dir)) {
    NodeFS.mkdirSync(dir, { recursive: true });
  }

  if (!NodeFS.existsSync(fullPath)) {
    NodeFS.writeFileSync(fullPath, file.content, "utf-8");
    return { saved: true, method: "created", path: file.path };
  }

  const existingContent = NodeFS.readFileSync(fullPath, "utf-8");
  const trimmedNew = file.content.trim();
  const ext = file.path.split(".").pop()?.toLowerCase() || "";

  // 1. Complete HTML document check
  const isCompleteHtml =
    ext === "html" &&
    (trimmedNew.toLowerCase().startsWith("<!doctype") ||
      trimmedNew.toLowerCase().startsWith("<html") ||
      (trimmedNew.toLowerCase().includes("<html") && trimmedNew.toLowerCase().includes("</html>")));

  if (isCompleteHtml) {
    NodeFS.writeFileSync(fullPath, file.content, "utf-8");
    return { saved: true, method: "overwritten", path: file.path };
  }

  // 2. SEARCH/REPLACE diff check
  const hasSearchReplace = /<{3,7}\s*SEARCH\s*\n[\s\S]*?\n[=]{3,7}\s*\n[\s\S]*?\n[>]{3,7}/.test(
    file.content,
  );

  if (hasSearchReplace) {
    const patchResult = universalPatchFile(existingContent, file.content, file.path);
    if (patchResult.success && patchResult.content !== existingContent) {
      NodeFS.writeFileSync(fullPath, patchResult.content, "utf-8");
      return { saved: true, method: "patched", path: file.path };
    }
  }

  // Fallback: If substantial file, overwrite cleanly
  if (trimmedNew.length > 50) {
    NodeFS.writeFileSync(fullPath, file.content, "utf-8");
    return { saved: true, method: "overwritten", path: file.path };
  }

  return { saved: false, method: "skipped_protected", path: file.path };
}

/**
 * System prompt instructions ensuring any model (including free lane / bypass)
 * structures its output for the active execution engine.
 */
export function getActiveEngineSystemPrompt(projectCwd: string): string {
  const engine = getActiveExecutionEngineMode();
  return `You are an elite, production-grade AI Software Engineer operating directly inside the user's workspace.
Current Project Directory: ${projectCwd}
Active Execution Engine: ${engine.mode === "codex" ? "OpenAI Codex CLI Engine" : "Custom AI Engine"}

================================================================================
CRITICAL FILE CREATION & EDITING RULES:
1. ALWAYS OUTPUT CODE IN EXPLICIT CODE BLOCKS WITH FILEPATHS:
   \`\`\`<language> filepath=<relative/path>
   // complete file content or diff
   \`\`\`
   Example:
   \`\`\`html filepath=index.html
   <!DOCTYPE html>
   ...
   </html>
   \`\`\`
   or for diffs:
   \`\`\`javascript filepath=game.js
   <<<< SEARCH
   // exact lines to replace
   ====
   // new replacement lines
   >>>>
   \`\`\`

2. COMPLETE WORKING FILES:
   • For new files, websites, or games: ALWAYS provide the FULL, 100% complete, working code.
   • NEVER use placeholders like "// ... rest of code unchanged ...".
   • If building a web app or game, ensure index.html contains everything needed so it runs immediately in Live Preview!

3. AUTOMATIC DISK PERSISTENCE:
   • The host IDE automatically saves files to ${projectCwd} and stages them to Git when you output code blocks with filepaths.
================================================================================`;
}

/**
 * Executes the engine pipeline on the completed model response:
 * - Extracts files
 * - Writes/patches files to disk
 * - Auto-commits to git
 * - Generates formatted status message
 */
export function executeActiveEnginePipeline(
  responseMarkdown: string,
  projectCwd: string,
): {
  finalText: string;
  savedFiles: string[];
} {
  if (!projectCwd || !NodeFS.existsSync(projectCwd)) {
    return { finalText: responseMarkdown, savedFiles: [] };
  }

  const extractedFiles = extractFilesFromMarkdown(responseMarkdown, projectCwd);
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
        `git -c user.name="AutoCode AI" -c user.email="autocode@t3.tools" commit -m "${commitMsg.replace(/"/g, '\\"')}" --allow-empty`,
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
