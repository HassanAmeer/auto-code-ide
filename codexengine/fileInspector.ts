import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

export interface InspectedFile {
  readonly path: string;
  readonly content: string;
  readonly lineCount: number;
  readonly isTruncated: boolean;
}

export interface FileInspectionResult {
  readonly files: InspectedFile[];
  readonly contextText: string;
}

/**
 * Finds files relevant to the user's prompt and reads their content
 * so the model has the exact code to inspect, preventing hallucinations.
 */
export function inspectRelevantFiles(
  workspaceRoot: string,
  userPrompt: string,
  availableFiles: string[],
  options: {
    maxFilesToRead?: number;
    maxLinesPerFile?: number;
    maxTotalChars?: number;
  } = {},
): FileInspectionResult {
  const maxFilesToRead = options.maxFilesToRead ?? 4;
  const maxLinesPerFile = options.maxLinesPerFile ?? 250;
  const maxTotalChars = options.maxTotalChars ?? 30000;

  if (!workspaceRoot || availableFiles.length === 0) {
    return { files: [], contextText: "" };
  }

  const promptLower = userPrompt.toLowerCase();
  const matchedFilePaths = new Set<string>();

  // 1. Check for exact relative path or filename in prompt
  for (const relPath of availableFiles) {
    const filename = NodePath.basename(relPath).toLowerCase();
    const relLower = relPath.toLowerCase();

    // Check if relative path or filename is mentioned in prompt
    if (promptLower.includes(relLower) || promptLower.includes(filename)) {
      matchedFilePaths.add(relPath);
    }
  }

  // 2. If project is small (<= 4 files) and no explicit match, include all small files
  if (matchedFilePaths.size === 0 && availableFiles.length <= 4) {
    for (const relPath of availableFiles) {
      matchedFilePaths.add(relPath);
    }
  }

  // 3. Fallback: Check for common keywords matching basenames (e.g., 'header' -> 'Header.tsx')
  if (matchedFilePaths.size === 0) {
    const words = promptLower.split(/[^a-zA-Z0-9_-]+/).filter((w) => w.length >= 4);
    for (const word of words) {
      if (matchedFilePaths.size >= maxFilesToRead) break;
      for (const relPath of availableFiles) {
        const base = NodePath.basename(relPath, NodePath.extname(relPath)).toLowerCase();
        if (base === word || base.includes(word)) {
          matchedFilePaths.add(relPath);
          if (matchedFilePaths.size >= maxFilesToRead) break;
        }
      }
    }
  }

  // Read the matched files
  const inspectedFiles: InspectedFile[] = [];
  let currentTotalChars = 0;

  for (const relPath of matchedFilePaths) {
    if (inspectedFiles.length >= maxFilesToRead) break;

    const fullPath = NodePath.join(workspaceRoot, relPath);
    if (!NodeFS.existsSync(fullPath)) continue;

    try {
      const stats = NodeFS.statSync(fullPath);
      // Skip files larger than 500KB
      if (stats.size > 500 * 1024) continue;

      const raw = NodeFS.readFileSync(fullPath, "utf-8");
      const lines = raw.split("\n");
      const lineCount = lines.length;

      let content = raw;
      let isTruncated = false;

      if (lines.length > maxLinesPerFile) {
        const head = lines.slice(0, 150).join("\n");
        const tail = lines.slice(-80).join("\n");
        content = `${head}\n\n// ... [${lines.length - 230} lines omitted for context brevity] ...\n\n${tail}`;
        isTruncated = true;
      }

      if (currentTotalChars + content.length > maxTotalChars) {
        // Can't fit more content
        break;
      }

      currentTotalChars += content.length;
      inspectedFiles.push({
        path: relPath,
        content,
        lineCount,
        isTruncated,
      });
    } catch {
      // Ignore read errors
    }
  }

  if (inspectedFiles.length === 0) {
    return { files: [], contextText: "" };
  }

  const sections: string[] = [];
  sections.push("### EXISTING WORKSPACE FILES (Read directly from disk):");
  for (const file of inspectedFiles) {
    const ext = NodePath.extname(file.path).slice(1) || "text";
    sections.push(
      `File: \`${file.path}\` (${file.lineCount} lines${file.isTruncated ? ", truncated" : ""}):\n\`\`\`${ext}\n${file.content}\n\`\`\``,
    );
  }

  return {
    files: inspectedFiles,
    contextText: sections.join("\n\n"),
  };
}
