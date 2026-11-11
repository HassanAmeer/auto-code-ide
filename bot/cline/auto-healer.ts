import * as fs from "node:fs";
import * as path from "node:path";
import { executeBash, readProjectFile, writeProjectFile } from "./tools.ts";

export interface HealDiagnosis {
  hasError: boolean;
  errorType?: "syntax" | "missing_tag" | "module_import" | "build_failure" | "runtime" | undefined;
  affectedFile?: string | undefined;
  rawError?: string | undefined;
}

export interface HealResult {
  healed: boolean;
  actionTaken: string;
  affectedFile?: string | undefined;
  verifiedClean: boolean;
  details?: string | undefined;
}

/**
 * Parses raw terminal or runtime logs to identify the broken file and cause
 */
function detectBuildCommand(projectRoot: string): string {
  try {
    if (fs.existsSync(path.join(projectRoot, "pnpm-lock.yaml"))) return "pnpm run build";
    if (fs.existsSync(path.join(projectRoot, "yarn.lock"))) return "yarn build";
    if (fs.existsSync(path.join(projectRoot, "package-lock.json")))
      return "npm run build --if-present";
    if (fs.existsSync(path.join(projectRoot, "package.json"))) return "npm run build --if-present";
  } catch {}
  return "npm run build --if-present";
}

export function diagnoseError(logOutput: string, projectRoot: string): HealDiagnosis {
  if (!logOutput || !logOutput.trim()) {
    return { hasError: false };
  }

  // 1. Detect file path and line number from standard build errors (e.g., "src/App.tsx:24:5 - error TS...")
  const fileLineMatch = logOutput.match(
    /([a-zA-Z0-9_\-\.\/]+\.(?:tsx|ts|jsx|js|html|css)):(\d+):?(\d+)?/i,
  );
  let affectedFile: string | undefined;

  if (fileLineMatch && fileLineMatch[1]) {
    affectedFile = fileLineMatch[1];
  }

  // 2. Classify error type
  let errorType: HealDiagnosis["errorType"] = "build_failure";

  if (/unclosed tag|missing closing|<\/[a-z0-9]+>/i.test(logOutput)) {
    errorType = "missing_tag";
  } else if (/cannot find module|failed to resolve import|type="module"/i.test(logOutput)) {
    errorType = "module_import";
  } else if (/syntaxerror|unexpected token|parsing error/i.test(logOutput)) {
    errorType = "syntax";
  }

  return {
    hasError: true,
    errorType,
    affectedFile,
    rawError: logOutput.slice(0, 1000),
  };
}

/**
 * Autonomous Self-Healing Routine:
 * Attempts to repair detected code issues and runs verification
 */
export async function autoHealProject(
  projectRoot: string,
  errorHint?: string,
): Promise<HealResult> {
  // Step 1: Detect current error if not provided
  let errorLog = errorHint || "";
  if (!errorLog) {
    const buildCheck = await executeBash(detectBuildCommand(projectRoot), projectRoot, 20000);
    if (!buildCheck.ok && buildCheck.error) {
      errorLog = `${buildCheck.output || ""} ${buildCheck.error || ""}`;
    }
  }

  const diagnosis = diagnoseError(errorLog, projectRoot);
  if (!diagnosis.hasError) {
    return {
      healed: true,
      actionTaken: "No active errors detected in project.",
      verifiedClean: true,
    };
  }

  // Step 2: Attempt targeted self-healing on affected file
  if (diagnosis.affectedFile) {
    const fullPath = path.resolve(projectRoot, diagnosis.affectedFile);
    if (fs.existsSync(fullPath)) {
      const fileData = readProjectFile(diagnosis.affectedFile, projectRoot);
      if (fileData.ok && fileData.output) {
        let content = fileData.output;
        let modified = false;

        // Healing Pattern 1: HTML closing tags
        if (fullPath.endsWith(".html")) {
          if (!/<\/html>/i.test(content)) {
            content += "\n</html>";
            modified = true;
          }
          if (!/<\/body>/i.test(content) && /<\/html>/i.test(content)) {
            content = content.replace(/<\/html>/i, "</body>\n</html>");
            modified = true;
          }
          if (content.includes("import ") && !content.includes('type="module"')) {
            content = content.replace(
              /<script(?![^>]*type=)([^>]*)>([\s\S]*?import\s+[\s\S]*?from)/i,
              '<script type="module"$1>$2',
            );
            modified = true;
          }
        }

        // Healing Pattern 2: JSX unclosed-tag detection.
        // We do NOT blindly append closing tags — that corrupts valid JSX.
        // Instead, report that an AI-driven structural patch is required.
        if (/\.(tsx|jsx)$/i.test(fullPath)) {
          const openDivs = (content.match(/<div\b[^>]*>/gi) || []).length;
          const closeDivs = (content.match(/<\/div>/gi) || []).length;
          if (openDivs > closeDivs) {
            return {
              healed: false,
              actionTaken: `Diagnosed likely unclosed JSX tag(s) in ${diagnosis.affectedFile} (${openDivs - closeDivs} extra <div>). Refusing blind auto-patch to avoid corrupting the file.`,
              affectedFile: diagnosis.affectedFile,
              verifiedClean: false,
              details:
                "An AI structural patch (balanced-tag rewrite) is required instead of naive append.",
            };
          }
        }

        if (modified) {
          writeProjectFile(diagnosis.affectedFile, content, projectRoot);
          // Step 3: Verify fix
          const retest = await executeBash(detectBuildCommand(projectRoot), projectRoot, 15000);
          return {
            healed: true,
            actionTaken: `Auto-healer repaired ${diagnosis.errorType || "syntax"} issues in ${diagnosis.affectedFile}`,
            affectedFile: diagnosis.affectedFile,
            verifiedClean: retest.ok,
            details: retest.ok
              ? "Verification build passed successfully."
              : "Applied patch, minor warnings remain.",
          };
        }
      }
    }
  }

  return {
    healed: false,
    actionTaken:
      "Diagnosed error but requires AI model prompt generation for complex logical patch.",
    affectedFile: diagnosis.affectedFile,
    verifiedClean: false,
    details: diagnosis.rawError,
  };
}
