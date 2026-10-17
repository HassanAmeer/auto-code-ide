import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

export interface FileChangeResult {
  readonly path: string;
  readonly action: "created" | "modified" | "patched";
  readonly details?: string;
}

export interface PatchEngineResult {
  readonly changes: FileChangeResult[];
  readonly summaryMarkdown: string;
}

/**
 * Searches for a target snippet in an existing file's text and replaces it.
 * Uses exact match first, then whitespace-trimmed line-by-line match if needed.
 */
function applySearchReplace(
  originalContent: string,
  searchBlock: string,
  replaceBlock: string,
): { success: boolean; newContent: string; reason?: string } {
  // 1. Exact match
  if (originalContent.includes(searchBlock)) {
    return {
      success: true,
      newContent: originalContent.replace(searchBlock, replaceBlock),
    };
  }

  // 2. Line-by-line whitespace-tolerant match
  const origLines = originalContent.split("\n");
  const searchLines = searchBlock
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (searchLines.length === 0) {
    return { success: false, newContent: originalContent, reason: "Empty search block" };
  }

  // Find sequence of lines matching searchLines
  let matchStartIndex = -1;
  let matchEndIndex = -1;

  for (let i = 0; i <= origLines.length - searchLines.length; i++) {
    let allMatch = true;
    for (let j = 0; j < searchLines.length; j++) {
      if (origLines[i + j]?.trim() !== searchLines[j]) {
        allMatch = false;
        break;
      }
    }
    if (allMatch) {
      matchStartIndex = i;
      matchEndIndex = i + searchLines.length;
      break;
    }
  }

  if (matchStartIndex !== -1) {
    const before = origLines.slice(0, matchStartIndex).join("\n");
    const after = origLines.slice(matchEndIndex).join("\n");
    const prefix = before.length > 0 ? `${before}\n` : "";
    const suffix = after.length > 0 ? `\n${after}` : "";
    return {
      success: true,
      newContent: `${prefix}${replaceBlock}${suffix}`,
    };
  }

  return {
    success: false,
    newContent: originalContent,
    reason: "Search block could not be located in file",
  };
}

/**
 * Extracts and applies both targeted SEARCH/REPLACE diff blocks
 * and full file creations from the model's markdown response.
 */
export function applyModelOutput(
  markdown: string,
  workspaceRoot: string,
  defaultTargetFile?: string | undefined,
): PatchEngineResult {
  if (!workspaceRoot) {
    return { changes: [], summaryMarkdown: "" };
  }

  const changes: FileChangeResult[] = [];
  const processedFiles = new Set<string>();

  // ── 1. PARSE SEARCH/REPLACE BLOCKS (DIFF PATCHES) ──
  // Matches:
  // <<<<<<< SEARCH [filepath]
  // ...old code...
  // =======
  // ...new code...
  // >>>>>>> REPLACE
  const diffRegex =
    /<<<<<<< SEARCH(?:\s+\[?([a-zA-Z0-9_\-./]+\.[a-zA-Z0-9]+)\]?)?\s*\n([\s\S]*?)\n=======\s*\n([\s\S]*?)\n>>>>>>> REPLACE/g;

  let diffMatch: RegExpExecArray | null;
  while ((diffMatch = diffRegex.exec(markdown)) !== null) {
    let filePath = diffMatch[1]?.trim() || "";
    let searchContent = diffMatch[2] ?? "";
    const replaceContent = diffMatch[3] ?? "";

    // If filepath wasn't in the header, check if it was on the first line of searchContent
    if (!filePath) {
      const firstLine = searchContent.split("\n")[0]?.trim() || "";
      const pathMatch = firstLine.match(
        /^(?:\/\/|#|\/\*|<!--)\s*(?:file|filepath|path)\s*[:=]?\s*([a-zA-Z0-9_\-./]+\.[a-zA-Z0-9]+)/i,
      );
      if (pathMatch && pathMatch[1]) {
        filePath = pathMatch[1].trim();
        // Remove the path header line from search block
        searchContent = searchContent.split("\n").slice(1).join("\n");
      } else if (defaultTargetFile) {
        filePath = defaultTargetFile;
      }
    }

    if (!filePath) continue;

    filePath = filePath.replace(/^[/\\]+/, "").replace(/\.\./g, "");
    const fullPath = NodePath.resolve(workspaceRoot, filePath);

    if (!NodeFS.existsSync(fullPath)) {
      // If file doesn't exist, create it with the replace content
      try {
        const dir = NodePath.dirname(fullPath);
        if (!NodeFS.existsSync(dir)) NodeFS.mkdirSync(dir, { recursive: true });
        NodeFS.writeFileSync(fullPath, replaceContent, "utf-8");
        changes.push({
          path: filePath,
          action: "created",
          details: "Created file from patch",
        });
        processedFiles.add(filePath);
      } catch {}
      continue;
    }

    try {
      const original = NodeFS.readFileSync(fullPath, "utf-8");
      const patchResult = applySearchReplace(original, searchContent, replaceContent);
      if (patchResult.success) {
        NodeFS.writeFileSync(fullPath, patchResult.newContent, "utf-8");
        changes.push({
          path: filePath,
          action: "patched",
          details: "Applied targeted diff",
        });
        processedFiles.add(filePath);
      } else {
        // Log reason but continue
        console.warn(`PatchEngine: could not match diff for ${filePath}: ${patchResult.reason}`);
      }
    } catch (err) {
      console.error(`PatchEngine: error applying patch to ${filePath}`, err);
    }
  }

  // ── 2. PARSE FULL FILE CODE BLOCKS ──
  const codeBlockRegex = /```([^\n]*)\n([\s\S]*?)```/g;
  let blockMatch: RegExpExecArray | null;

  while ((blockMatch = codeBlockRegex.exec(markdown)) !== null) {
    const header = blockMatch[1]?.trim() || "";
    let content = blockMatch[2] || "";
    let detectedPath: string | null = null;

    // Check header for filepath=... or path=... or direct path
    const headerMatch =
      header.match(/(?:file|filepath|path)\s*=\s*["']?([^\s"']+)["']?/i) ||
      header.match(/^[a-zA-Z0-9_-]+[:\s]+([a-zA-Z0-9_\-./]+\.[a-zA-Z0-9]+)$/) ||
      header.match(/^([a-zA-Z0-9_\-./]+\.[a-zA-Z0-9]+)$/);

    if (headerMatch && headerMatch[1]) {
      detectedPath = headerMatch[1].trim();
    }

    // Check first 3 lines of block for comment filename
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

    // Check line right before the code block in markdown
    if (!detectedPath) {
      const blockIndex = blockMatch.index;
      const textBefore = markdown.slice(Math.max(0, blockIndex - 120), blockIndex);
      const beforeMatch = textBefore.match(
        /(?:File|Filename|Path):\s*[`\*]*([a-zA-Z0-9_\-./]+\.[a-zA-Z0-9]+)[`\*]*/i,
      );
      if (beforeMatch && beforeMatch[1]) {
        detectedPath = beforeMatch[1].trim();
      }
    }

    // Fallback: If no path detected and user had a single default target file
    if (!detectedPath && defaultTargetFile && !processedFiles.has(defaultTargetFile)) {
      detectedPath = defaultTargetFile;
    }

    if (!detectedPath) {
      // We DO NOT force everything to be 'game.js' or 'index.html'!
      // If no valid path was designated, skip writing a random file.
      continue;
    }

    const cleanPath = detectedPath.replace(/^[/\\]+/, "").replace(/\.\./g, "");
    if (!cleanPath) continue;

    // Avoid overwriting a file that was already patched in this turn
    if (processedFiles.has(cleanPath)) continue;

    try {
      const fullPath = NodePath.resolve(workspaceRoot, cleanPath);
      const rel = NodePath.relative(workspaceRoot, fullPath);

      if (!rel.startsWith("..") && !NodePath.isAbsolute(rel)) {
        const dir = NodePath.dirname(fullPath);
        if (!NodeFS.existsSync(dir)) {
          NodeFS.mkdirSync(dir, { recursive: true });
        }

        const isNew = !NodeFS.existsSync(fullPath);
        NodeFS.writeFileSync(fullPath, content, "utf-8");

        changes.push({
          path: cleanPath,
          action: isNew ? "created" : "modified",
        });
        processedFiles.add(cleanPath);
      }
    } catch (saveErr) {
      console.error(`PatchEngine: Failed saving file ${cleanPath}:`, saveErr);
    }
  }

  // Format summary
  if (changes.length === 0) {
    return { changes: [], summaryMarkdown: "" };
  }

  const lines: string[] = [
    `\n\n---\n📁 **CodexEngine Workspace Updates (\`${NodePath.basename(workspaceRoot)}\`):**`,
  ];
  for (const c of changes) {
    const badge =
      c.action === "patched" ? "⚡ Patched" : c.action === "created" ? "✨ Created" : "📝 Updated";
    lines.push(`- ${badge}: \`${c.path}\`${c.details ? ` *(${c.details})*` : ""}`);
  }

  return {
    changes,
    summaryMarkdown: lines.join("\n"),
  };
}
