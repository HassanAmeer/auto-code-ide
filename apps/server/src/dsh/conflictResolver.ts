// @effect-diagnostics globalDateInEffect:off globalRandomInEffect:off nodeBuiltinImport:off globalTimers:off globalTimersInEffect:off preferSchemaOverJson:off globalDate:off globalFetchInEffect:off globalFetch:off globalConsoleInEffect:off
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import * as NodeChildProcess from "node:child_process";

export interface ConflictResolutionResult {
  ok: boolean;
  autoHealed: boolean;
  resolvedFiles: string[];
  error?: string;
}

/**
 * Parses conflict markers inside a string:
 * <<<<<<< HEAD
 * (our changes)
 * =======
 * (their changes)
 * >>>>>>> branch
 */
export function resolveConflictMarkers(
  content: string,
  filePath: string,
): { resolved: string; success: boolean } {
  // If no conflict markers exist, return as is
  if (
    !content.includes("<<<<<<<") ||
    !content.includes("=======") ||
    !content.includes(">>>>>>>")
  ) {
    return { resolved: content, success: true };
  }

  const ext = NodePath.extname(filePath).toLowerCase();

  // Handle JSON files (e.g. package.json, config.json)
  if (ext === ".json") {
    try {
      const headOnly = content.replace(
        /<<<<<<< HEAD[\r\n]+([\s\S]*?)=======[\r\n]+([\s\S]*?)>>>>>>>[^\r\n]*/g,
        "$1",
      );
      const theirsOnly = content.replace(
        /<<<<<<< HEAD[\r\n]+([\s\S]*?)=======[\r\n]+([\s\S]*?)>>>>>>>[^\r\n]*/g,
        "$2",
      );

      const headObj = JSON.parse(headOnly);
      const theirsObj = JSON.parse(theirsOnly);

      const merged = deepMergeJson(headObj, theirsObj);
      return { resolved: JSON.stringify(merged, null, 2) + "\n", success: true };
    } catch {
      // Fallback to text reconciliation below
    }
  }

  // Handle Code / Text files (.ts, .tsx, .js, .jsx, .css, .html, .md, etc.)
  const conflictRegex = /<<<<<<< HEAD[\r\n]+([\s\S]*?)=======[\r\n]+([\s\S]*?)>>>>>>>[^\r\n]*/g;
  let hasFailure = false;

  const resolved = content.replace(
    conflictRegex,
    (_match, headBlock: string, theirsBlock: string) => {
      // Trim blocks
      const headLines = headBlock.split(/\r?\n/);
      const theirsLines = theirsBlock.split(/\r?\n/);

      // Case 1: Empty on one side (one worker added new code)
      if (headBlock.trim() === "" && theirsBlock.trim() !== "") {
        return theirsBlock;
      }
      if (theirsBlock.trim() === "" && headBlock.trim() !== "") {
        return headBlock;
      }

      // Case 2: Both added imports or exports
      const isImportExportBlock =
        headLines.every(
          (l) =>
            l.trim() === "" || l.trim().startsWith("import ") || l.trim().startsWith("export "),
        ) &&
        theirsLines.every(
          (l) =>
            l.trim() === "" || l.trim().startsWith("import ") || l.trim().startsWith("export "),
        );

      if (isImportExportBlock) {
        const combined = Array.from(new Set([...headLines, ...theirsLines])).filter(
          (l) => l.trim().length > 0,
        );
        return combined.join("\n") + "\n";
      }

      // Case 3: Distinct non-colliding declarations (different function/const/class names)
      const headIdents = extractDeclaredIdentifiers(headBlock);
      const theirsIdents = extractDeclaredIdentifiers(theirsBlock);
      const overlap = headIdents.filter((id) => theirsIdents.includes(id));

      if (overlap.length === 0) {
        // Disjoint additions from both workers -> combine both cleanly!
        return `${headBlock.trimEnd()}\n\n${theirsBlock.trimStart()}`;
      }

      // Case 4: Overlapping definitions - keep HEAD base and merge novel declarations from theirs
      const novelTheirsLines = theirsLines.filter((tl) => {
        const trimmed = tl.trim();
        if (!trimmed) return false;
        return !headLines.some((hl) => hl.trim() === trimmed);
      });

      if (novelTheirsLines.length > 0) {
        return `${headBlock.trimEnd()}\n\n// [Auto-Healed Worker Additions]\n${novelTheirsLines.join("\n")}\n`;
      }

      return headBlock;
    },
  );

  // Verify that all markers were cleanly eliminated
  if (
    resolved.includes("<<<<<<<") ||
    resolved.includes("=======") ||
    resolved.includes(">>>>>>>")
  ) {
    hasFailure = true;
  }

  // Syntax check for balanced braces
  if (!hasFailure && (ext === ".ts" || ext === ".tsx" || ext === ".js" || ext === ".jsx")) {
    if (!hasBalancedBraces(resolved)) {
      hasFailure = true;
    }
  }

  return { resolved, success: !hasFailure };
}

function extractDeclaredIdentifiers(code: string): string[] {
  const matches = code.matchAll(
    /\b(?:const|let|var|function|class|interface|type)\s+([a-zA-Z0-9_$]+)/g,
  );
  const ids: string[] = [];
  for (const m of matches) {
    if (m[1]) ids.push(m[1]);
  }
  return ids;
}

function hasBalancedBraces(code: string): boolean {
  let curly = 0;
  let paren = 0;
  let square = 0;

  for (let i = 0; i < code.length; i++) {
    const ch = code[i];
    if (ch === "{") curly++;
    else if (ch === "}") curly--;
    else if (ch === "(") paren++;
    else if (ch === ")") paren--;
    else if (ch === "[") square++;
    else if (ch === "]") square--;

    if (curly < 0 || paren < 0 || square < 0) return false;
  }
  return curly === 0 && paren === 0 && square === 0;
}

function deepMergeJson(target: any, source: any): any {
  if (typeof target !== "object" || target === null) return source;
  if (typeof source !== "object" || source === null) return target;

  const result = Array.isArray(target) ? [...target] : { ...target };

  for (const key of Object.keys(source)) {
    if (key in target && typeof target[key] === "object" && typeof source[key] === "object") {
      result[key] = deepMergeJson(target[key], source[key]);
    } else {
      result[key] = source[key];
    }
  }

  return result;
}

/**
 * Automatically inspects and resolves git merge conflicts in a project.
 */
export function autoResolveMergeConflicts(
  projectRoot: string,
  branchName: string,
  taskTitle: string,
): ConflictResolutionResult {
  try {
    // 1. Find all unmerged files
    let unmergedFiles: string[] = [];
    try {
      const output = NodeChildProcess.execSync("git diff --name-only --diff-filter=U", {
        cwd: projectRoot,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      });
      unmergedFiles = output
        .split(/\r?\n/)
        .map((f) => f.trim())
        .filter((f) => f.length > 0);
    } catch {
      // If git diff fails, try porcelain
      try {
        const statusOutput = NodeChildProcess.execSync("git status --porcelain", {
          cwd: projectRoot,
          encoding: "utf8",
          stdio: ["ignore", "pipe", "ignore"],
        });
        unmergedFiles = statusOutput
          .split(/\r?\n/)
          .filter(
            (line) =>
              /^[UADRM ]{2}\s+/.test(line) &&
              (line.startsWith("UU") ||
                line.startsWith("AA") ||
                line.startsWith("UD") ||
                line.startsWith("DU")),
          )
          .map((line) => line.slice(3).trim())
          .filter((f) => f.length > 0);
      } catch {}
    }

    if (unmergedFiles.length === 0) {
      // No unmerged files found
      return { ok: true, autoHealed: false, resolvedFiles: [] };
    }

    const successfullyHealed: string[] = [];

    // 2. Resolve each conflicting file
    for (const relativePath of unmergedFiles) {
      const absolutePath = NodePath.join(projectRoot, relativePath);
      if (!NodeFS.existsSync(absolutePath)) continue;

      const rawContent = NodeFS.readFileSync(absolutePath, "utf8");
      const { resolved, success } = resolveConflictMarkers(rawContent, absolutePath);

      if (!success) {
        // Auto-heal could not guarantee syntax integrity. Abort merge to avoid repository corruption.
        try {
          NodeChildProcess.execSync("git merge --abort", { cwd: projectRoot, stdio: "ignore" });
        } catch {}
        return {
          ok: false,
          autoHealed: false,
          resolvedFiles: successfullyHealed,
          error: `Auto-resolver could not safely reconcile syntax in conflicting file: ${relativePath}`,
        };
      }

      NodeFS.writeFileSync(absolutePath, resolved, "utf8");
      NodeChildProcess.execSync(`git add "${relativePath}"`, { cwd: projectRoot, stdio: "ignore" });
      successfullyHealed.push(relativePath);
    }

    // 3. Complete the merge commit
    NodeChildProcess.execSync(
      `git commit -m "merge(auto-heal): resolved conflicts between main and ${branchName} [${taskTitle.slice(0, 40).replace(/"/g, "")}]"`,
      { cwd: projectRoot, stdio: "ignore" },
    );

    return {
      ok: true,
      autoHealed: true,
      resolvedFiles: successfullyHealed,
    };
  } catch (err: any) {
    try {
      NodeChildProcess.execSync("git merge --abort", { cwd: projectRoot, stdio: "ignore" });
    } catch {}
    return {
      ok: false,
      autoHealed: false,
      resolvedFiles: [],
      error: err?.message || String(err),
    };
  }
}
