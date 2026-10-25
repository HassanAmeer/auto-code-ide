// @effect-diagnostics nodeBuiltinImport:off globalConsole:off globalConsoleInEffect:off globalDate:off globalDateInEffect:off globalRandomInEffect:off globalErrorInEffectFailure:off preferSchemaOverJson:off
import {
  MessageId,
  NonNegativeInt,
  OrchestrationV2ProviderCapabilities,
  OrchestrationV2ProviderSession,
  OrchestrationV2ProviderThread,
  PositiveInt,
  ProviderDriverKind,
  ProviderInstanceId,
  ProviderSessionId,
  ProviderThreadId,
  ProviderTurnId,
  ServerProvider,
  ServerProviderModel,
  ThreadId,
  TurnItemId,
  TextGenerationError,
} from "@t3tools/contracts";
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import {
  executeEngineTool,
  executeWriteTool,
  executeEditTool,
  executePatchTool,
  executeShellTool,
} from "../../../../../engine/runtimes/opencode-full-engine/index.ts";
import * as Cause from "effect/Cause";
import * as Clock from "effect/Clock";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Option from "effect/Option";
import * as Queue from "effect/Queue";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import { FetchHttpClient, HttpClient, HttpClientRequest, HttpClientResponse } from "effect/http";

import {
  clearAiModelLogs,
  GLOBAL_AI_MODEL_LOGS,
  recordAiModelLog,
  updateAiModelLog,
  registerCustomProviderLogMetadata,
  type AiModelLogEntry,
} from "@t3tools/provider-core/server/aiModelLog";
import { makeProviderFailure } from "@t3tools/provider-core/server/failure";
import { turnScopedSelectionTransition } from "@t3tools/provider-core/server/selectionTransition";
import type {
  ProviderAdapterV2Event,
  ProviderAdapterV2EnsureThreadInput,
  ProviderAdapterV2OpenSessionInput,
  ProviderAdapterV2SessionRuntime,
  ProviderAdapterV2Shape,
  ProviderAdapterV2TurnInput,
} from "@t3tools/provider-core/server/ProviderAdapter";
import {
  defaultProviderContinuationIdentity,
  type ProviderDriver,
  type ProviderDriverCreateInput,
  type ProviderInstance,
} from "@t3tools/provider-core/server/driver";
import type { ServerProviderShape } from "@t3tools/provider-core/server/snapshot";
import type { ProviderTextGeneration } from "@t3tools/provider-core/server/textGeneration";
import { AcpProviderCapabilitiesV2 } from "@t3tools/provider-acp/server/adapter";
import { getThreadPreviewErrors } from "../../preview/ServerBrowser.ts";
import { buildInvokedSkillInstructions, discoverCustomSkills } from "@t3tools/shared/agentSkills";
import {
  OpenCodeDriver,
  type OpenCodeDriverEnv,
  OpenCode2AdapterV2,
  OpenCode2Server,
  OpenCode2Client,
  OpenCodeRuntime,
} from "@t3tools/provider-opencode/server";
import * as ProviderHost from "@t3tools/provider-core/server/ProviderHost";
import { mergeProviderInstanceEnvironment } from "@t3tools/provider-core/server/instanceEnvironment";
import type { AnyProviderDriver } from "@t3tools/provider-core/server/driver";

// Allow HTTPS requests with IP addresses and self-signed certificates for custom providers
if (typeof process !== "undefined" && process.env) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

const DRIVER = ProviderDriverKind.make("custom");

export interface CustomHeaderConfig {
  readonly key: string;
  readonly value: string;
}

export interface CustomModelConfig {
  readonly id: string;
  readonly name?: string | undefined;
}

export {
  clearAiModelLogs,
  GLOBAL_AI_MODEL_LOGS,
  recordAiModelLog,
  updateAiModelLog,
  type AiModelLogEntry,
};

export const CustomDriverSettingsSchema = Schema.Struct({
  baseUrl: Schema.String.pipe(Schema.withDecodingDefault(Effect.succeed(""))),
  apiKey: Schema.String.pipe(Schema.withDecodingDefault(Effect.succeed(""))),
  headers: Schema.Array(
    Schema.Struct({
      key: Schema.String,
      value: Schema.String,
    }),
  ).pipe(Schema.withDecodingDefault(Effect.succeed([]))),
  models: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      name: Schema.optional(Schema.String),
    }),
  ).pipe(Schema.withDecodingDefault(Effect.succeed([]))),
});

export type CustomDriverConfig = typeof CustomDriverSettingsSchema.Type;
const decodeCustomSettings = Schema.decodeSync(CustomDriverSettingsSchema);

const UnknownFromJsonString = Schema.fromJsonString(Schema.Unknown);
const decodeJson = Schema.decodeUnknownOption(UnknownFromJsonString);

export const CustomProviderCapabilitiesV2: OrchestrationV2ProviderCapabilities = {
  ...AcpProviderCapabilitiesV2,
  sessions: {
    ...AcpProviderCapabilitiesV2.sessions,
    supportsModelSwitchInSession: true,
  },
};

function formatCustomModels(
  models?: ReadonlyArray<{ readonly id: string; readonly name?: string | undefined }>,
  defaultName = "Custom Provider",
): ServerProviderModel[] {
  if (models && models.length > 0) {
    return models.map((m) => ({
      slug: m.id,
      name: m.name ?? m.id,
      isCustom: false,
      capabilities: null,
    }));
  }
  return [
    {
      slug: "default",
      name: `${defaultName} (Default)`,
      isCustom: false,
      capabilities: null,
    },
  ];
}

export function makeCustomSnapshot(
  instanceId: ProviderInstanceId,
  displayName: string,
  config: CustomDriverConfig,
  enabled = true,
): ServerProvider {
  const models = formatCustomModels(config.models, displayName);

  return {
    instanceId,
    driver: DRIVER,
    displayName,
    name: displayName,
    enabled,
    installed: true,
    version: null,
    status: enabled ? "ready" : "disabled",
    auth: { status: "authenticated" },
    checkedAt: "2026-01-01T00:00:00.000Z",
    availability: enabled ? "available" : "unavailable",
    models,
    slashCommands: [],
    skills: [],
  } as unknown as ServerProvider;
}

export function makeCustomServerProviderShape(rawSnapshot: ServerProvider): ServerProviderShape {
  return {
    getSnapshot: Effect.succeed(rawSnapshot),
    refresh: Effect.succeed(rawSnapshot),
    streamChanges: Stream.empty,
    resolveMaintenance: () =>
      Effect.succeed({
        provider: DRIVER,
        packageName: null,
        update: null,
      }),
    applyUsageLimits: () => Effect.void,
  };
}

export function makeUnsupportedTextGeneration(): ProviderTextGeneration {
  const fail = (operation: string) =>
    Effect.fail(
      new TextGenerationError({
        operation,
        detail: "Custom provider does not support standalone text generation.",
      }),
    );
  return {
    generateCommitMessage: () => fail("commit-message"),
    generatePrContent: () => fail("pr-content"),
    generateBranchName: () => fail("branch-name"),
    generateThreadTitle: () => fail("thread-title"),
    polishPrompt: () => fail("prompt-polish"),
  };
}

export interface ExtractedProjectFile {
  readonly path: string;
  readonly content: string;
}

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

    // 3. Check preceding text or user prompt for explicit filename (e.g. `in jet.html`, `Save this as jet.html`)
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
      // ONLY default to it if the content is actually compatible and substantial!
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
              // HTML files can ONLY be targeted if content actually contains HTML tags!
              if (
                trimmed.toLowerCase().includes("<html") ||
                trimmed.toLowerCase().startsWith("<!doctype") ||
                trimmed.toLowerCase().includes("<!doctype") ||
                (trimmed.includes("<head") && trimmed.includes("<body"))
              ) {
                detectedPath = candidateFile;
              }
            } else if (candidateExt === "js" || candidateExt === "ts" || candidateExt === "py") {
              // Only associate if the block is substantial (e.g. 10+ lines or has full structure)
              // and NOT a 1-to-3 line conversational snippet!
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

// --- Universal Multi-Language In-Place Patching & Diff Engine ---

export function findPythonBlockRange(
  code: string,
  blockName: string,
): {
  startLine: number;
  endLine: number;
  content: string;
  startChar: number;
  endChar: number;
} | null {
  const lines = code.split("\n");
  const regex = new RegExp(`^(\\s*)(?:async\\s+)?(?:def|class)\\s+${blockName}\\b`);

  let startLine = -1;
  let baseIndent = 0;

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i]?.match(regex);
    if (match && match[1] !== undefined) {
      startLine = i;
      baseIndent = match[1].length;
      break;
    }
  }

  if (startLine === -1) return null;

  let endLine = lines.length;
  for (let i = startLine + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined || line.trim().length === 0) continue;
    const indentMatch = line.match(/^(\s*)/);
    const lineIndent = indentMatch && indentMatch[1] ? indentMatch[1].length : 0;
    if (lineIndent <= baseIndent) {
      endLine = i;
      break;
    }
  }

  return {
    startLine,
    endLine,
    content: lines.slice(startLine, endLine).join("\n"),
    startChar: lines.slice(0, startLine).join("\n").length + (startLine > 0 ? 1 : 0),
    endChar: lines.slice(0, endLine).join("\n").length,
  };
}

export function findBraceBlockRange(
  code: string,
  identifier: string,
): { start: number; end: number } | null {
  const pattern = new RegExp(
    `(?:(?:async\\s+)?(?:function|class|interface|type)\\s+${identifier}\\b|(?:const|let|var|public|private|protected|static|fn|def)\\s+${identifier}\\b|(?:^|\\s)${identifier}\\s*[:=]\\s*(?:async\\s+)?(?:function|\\([^)]*\\)\\s*=>)|(?:^|\\s)${identifier}\\s*\\([^)]*\\)\\s*\\{)`,
    "m",
  );
  const match = pattern.exec(code);
  if (!match) return null;

  const startIdx = match.index;
  const braceStart = code.indexOf("{", startIdx);
  if (braceStart === -1) return null;

  let depth = 0;
  let inString: string | null = null;
  let inComment = false;

  for (let i = braceStart; i < code.length; i++) {
    const char = code[i];
    const prev = code[i - 1];

    if (!inString && !inComment) {
      if (char === '"' || char === "'" || char === "`") {
        inString = char;
      } else if (char === "/" && code[i + 1] === "/") {
        inComment = true;
        i++;
      } else if (char === "/" && code[i + 1] === "*") {
        inComment = true;
        i++;
      } else if (char === "{") {
        depth++;
      } else if (char === "}") {
        depth--;
        if (depth === 0) {
          let endIdx = i + 1;
          if (code[endIdx] === ";") endIdx++;
          return { start: startIdx, end: endIdx };
        }
      }
    } else if (inString) {
      if (char === inString && prev !== "\\") {
        inString = null;
      }
    } else if (inComment) {
      if (char === "\n" || (prev === "*" && char === "/")) {
        inComment = false;
      }
    }
  }

  return null;
}

export function applySearchReplace(
  code: string,
  searchBlock: string,
  replaceBlock: string,
): string | null {
  const normCode = code.replace(/\r\n/g, "\n");
  const normSearch = searchBlock.replace(/\r\n/g, "\n");
  const normReplace = replaceBlock.replace(/\r\n/g, "\n");

  // 1. Direct substring match
  if (normCode.includes(normSearch)) {
    return normCode.replace(normSearch, normReplace);
  }

  // 2. Trim only leading/trailing blank newlines from searchBlock
  const cleanSearch = normSearch.replace(/^\n+|\n+$/g, "");
  if (cleanSearch && normCode.includes(cleanSearch)) {
    return normCode.replace(cleanSearch, normReplace);
  }

  const codeLines = normCode.split("\n");
  const searchLines = cleanSearch.split("\n").map((l) => l.trimEnd());

  if (searchLines.length === 0 || !cleanSearch.trim()) return null;

  // 3. Exact trimmed-end match (preserves leading indentation)
  for (let i = 0; i <= codeLines.length - searchLines.length; i++) {
    let matches = true;
    for (let j = 0; j < searchLines.length; j++) {
      if (codeLines[i + j]?.trimEnd() !== searchLines[j]) {
        matches = false;
        break;
      }
    }
    if (matches) {
      const before = codeLines.slice(0, i).join("\n");
      const after = codeLines.slice(i + searchLines.length).join("\n");
      return (before ? before + "\n" : "") + normReplace + (after ? "\n" + after : "");
    }
  }

  // 4. Fuzzy match: trim leading & trailing whitespace on each line
  // and re-indent replaceBlock to match original indentation
  const fullyTrimmedSearch = searchLines.map((l) => l.trim()).filter((l) => l.length > 0);
  if (fullyTrimmedSearch.length > 0) {
    for (let i = 0; i <= codeLines.length - fullyTrimmedSearch.length; i++) {
      let matches = true;
      for (let j = 0; j < fullyTrimmedSearch.length; j++) {
        if (codeLines[i + j]?.trim() !== fullyTrimmedSearch[j]) {
          matches = false;
          break;
        }
      }
      if (matches) {
        const origIndent = (codeLines[i]?.match(/^\s*/) || [""])[0];
        const searchIndent = (searchLines[0]?.match(/^\s*/) || [""])[0];

        let finalReplace = normReplace;
        if (origIndent !== searchIndent) {
          const replaceLines = normReplace.split("\n");
          finalReplace = replaceLines
            .map((line) => {
              if (!line.trim()) return line;
              const lineIndent = (line.match(/^\s*/) || [""])[0];
              const relativeIndent = lineIndent.startsWith(searchIndent)
                ? lineIndent.slice(searchIndent.length)
                : "";
              return origIndent + relativeIndent + line.trimStart();
            })
            .join("\n");
        }

        const before = codeLines.slice(0, i).join("\n");
        const after = codeLines.slice(i + fullyTrimmedSearch.length).join("\n");
        return (before ? before + "\n" : "") + finalReplace + (after ? "\n" + after : "");
      }
    }
  }

  return null;
}

export function universalPatchFile(
  existingCode: string,
  patchSnippet: string,
  filePath: string,
): { success: boolean; content: string; method?: string } {
  // A. Search / Replace blocks (<<<< SEARCH ... ==== ... >>>>)
  const searchReplaceRegex = /<{3,7}\s*SEARCH\s*\n([\s\S]*?)\n[=]{3,7}\s*\n([\s\S]*?)\n[>]{3,7}/g;
  let srMatch: RegExpExecArray | null;
  let patched = existingCode;
  let srApplied = false;

  while ((srMatch = searchReplaceRegex.exec(patchSnippet)) !== null) {
    const s = srMatch[1];
    const r = srMatch[2];
    if (s !== undefined && r !== undefined) {
      const res = applySearchReplace(patched, s, r);
      if (res !== null) {
        patched = res;
        srApplied = true;
      }
    }
  }
  if (srApplied) {
    return { success: true, content: patched, method: "search_replace" };
  }

  const ext = filePath.split(".").pop()?.toLowerCase() || "";

  // B. Python files (.py)
  if (ext === "py") {
    const pyDefRegex = /(?:^|\n)(\s*)(?:async\s+)?(?:def|class)\s+([a-zA-Z0-9_]+)\b/g;
    let pyMatch: RegExpExecArray | null;
    let pyApplied = false;

    while ((pyMatch = pyDefRegex.exec(patchSnippet)) !== null) {
      const blockName = pyMatch[2];
      if (!blockName) continue;
      const patchRange = findPythonBlockRange(patchSnippet, blockName);
      if (!patchRange) continue;
      const newBlockCode = patchRange.content;

      const existingRange = findPythonBlockRange(patched, blockName);
      if (existingRange) {
        patched =
          patched.slice(0, existingRange.startChar) +
          newBlockCode +
          patched.slice(existingRange.endChar);
        pyApplied = true;
      }
    }
    if (pyApplied) {
      return { success: true, content: patched, method: "python_block_patch" };
    }
  }

  // C. C-style brace languages (JS, TS, TSX, JSX, PHP, C, CPP, Java, Rust, Go, C#, HTML script)
  const braceLangs = [
    "js",
    "ts",
    "tsx",
    "jsx",
    "php",
    "c",
    "cpp",
    "cc",
    "h",
    "hpp",
    "java",
    "rs",
    "go",
    "cs",
    "html",
  ];
  if (braceLangs.includes(ext)) {
    const blockRegex =
      /(?:(?:async\\s+)?function\s+([a-zA-Z0-9_$]+)|class\s+([a-zA-Z0-9_$]+)|(?:const|let|var)\s+([a-zA-Z0-9_$]+)\s*=\s*(?:async\s+)?(?:function|\([^)]*\)\s*=>)|(?:public|private|protected|static|fn|def)\s+([a-zA-Z0-9_$]+)\b)/g;
    let match: RegExpExecArray | null;
    let braceApplied = false;

    while ((match = blockRegex.exec(patchSnippet)) !== null) {
      const identifier = match[1] || match[2] || match[3] || match[4];
      if (
        !identifier ||
        identifier === "if" ||
        identifier === "for" ||
        identifier === "while" ||
        identifier === "switch"
      ) {
        continue;
      }

      const patchRange = findBraceBlockRange(patchSnippet, identifier);
      if (!patchRange) continue;
      const newCode = patchSnippet.slice(patchRange.start, patchRange.end).trim();

      const existingRange = findBraceBlockRange(patched, identifier);
      if (existingRange) {
        patched =
          patched.slice(0, existingRange.start) + newCode + patched.slice(existingRange.end);
        braceApplied = true;
      }
    }
    if (braceApplied) {
      return { success: true, content: patched, method: "brace_block_patch" };
    }
  }

  return { success: false, content: existingCode };
}

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

  // 1. Check if new content has explicit SEARCH/REPLACE diff markers using OpenCode Full Engine
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
  // 3. Placeholder protection check
  if (hasPlaceholder && existingContent !== null) {
    const patchResult = universalPatchFile(existingContent, file.content, file.path);
    if (patchResult.success && patchResult.content !== existingContent) {
      executeWriteTool({ path: file.path, content: patchResult.content }, projectCwd);
      return { saved: true, method: "patched", path: file.path };
    }
    console.warn(
      `[AutoCode Protect] Prevented destructive overwrite of ${file.path} with placeholder snippet.`,
    );
    return { saved: false, method: "skipped_protected", path: file.path };
  }

  // 4. Safety Guard: Prevent wiping a large HTML file with a non-HTML snippet
  if (
    ext === "html" &&
    existingContent !== null &&
    existingContent.toLowerCase().includes("<html") &&
    !trimmedNew.toLowerCase().includes("<html") &&
    !trimmedNew.toLowerCase().includes("<!doctype")
  ) {
    console.warn(
      `[AutoCode Protect] Blocked destructive overwrite: Refusing to replace HTML file ${file.path} with non-HTML snippet.`,
    );
    return { saved: false, method: "skipped_protected", path: file.path };
  }

  // 5. Genuine complete file write via OpenCode Full Engine executeWriteTool
  try {
    const writeResult = executeWriteTool({ path: file.path, content: file.content }, projectCwd);
    return {
      saved: true,
      method: writeResult.created ? "created" : "overwritten",
      path: file.path,
    };
  } catch (writeErr) {
    console.error("[OpenCodeEngine] executeWriteTool failed:", file.path, writeErr);
    return { saved: false, method: "skipped_protected", path: file.path };
  }
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
  readonly fileDetails: ScannedFileDetail[];
}

export function scanWorkspaceContext(
  projectCwd: string,
  maxTotalBytes = 40000,
): WorkspaceContextResult {
  if (!NodeFS.existsSync(projectCwd)) {
    return { hasFiles: false, fileCount: 0, summary: "", fileDetails: [] };
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
      tsx: 4,
      jsx: 5,
      py: 6,
      php: 7,
      css: 8,
      json: 9,
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
      const ext = f.relPath.split(".").pop()?.toLowerCase() || "";
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
        const outlineLines: string[] = [];
        for (let i = 0; i < lines.length; i++) {
          const l = lines[i]?.trim() || "";
          if (ext === "py") {
            if (/^(?:async\s+)?(?:def|class)\s+([a-zA-Z0-9_]+)\b/.test(l)) {
              outlineLines.push(`Line ${i + 1}: ${l}`);
            }
          } else {
            if (
              /^(?:export\s+)?(?:async\s+)?(?:function|class|interface|type)\s+([a-zA-Z0-9_$]+)\b/.test(
                l,
              ) ||
              /^(?:export\s+)?(?:const|let|var)\s+([a-zA-Z0-9_$]+)\s*=\s*(?:async\s+)?(?:function|\([^)]*\)\s*=>)/.test(
                l,
              ) ||
              /^(?:public|private|protected|static)\s+(?:async\s+)?function\s+([a-zA-Z0-9_$]+)\b/.test(
                l,
              )
            ) {
              const signature = l.split("{")[0]?.trim() || l;
              outlineLines.push(`Line ${i + 1}: ${signature}`);
            }
          }
        }
        fileDetails.push({
          relPath: f.relPath,
          linesCount: lines.length,
          outline: outlineLines.join("\n"),
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

export function getThreadHistory(
  threadKeys: Array<string | null | undefined>,
  projectCwd?: string,
): Array<{ role: "system" | "user" | "assistant"; content: string }> {
  for (const k of threadKeys) {
    if (k && GLOBAL_CUSTOM_THREAD_HISTORIES.has(String(k))) {
      const mem = GLOBAL_CUSTOM_THREAD_HISTORIES.get(String(k));
      if (mem && mem.length > 0) return mem;
    }
  }

  if (projectCwd) {
    for (const k of threadKeys) {
      if (!k) continue;
      const historyFile = NodePath.join(projectCwd, ".autocode", `thread_${String(k)}.json`);
      try {
        if (NodeFS.existsSync(historyFile)) {
          const raw = NodeFS.readFileSync(historyFile, "utf-8");
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length > 0) {
            for (const key of threadKeys) {
              if (key) GLOBAL_CUSTOM_THREAD_HISTORIES.set(String(key), parsed);
            }
            return parsed;
          }
        }
      } catch {
        // ignore
      }
    }
  }

  return [];
}

export function saveThreadHistory(
  threadKeys: Array<string | null | undefined>,
  history: Array<{ role: "system" | "user" | "assistant"; content: string }>,
  projectCwd?: string,
): void {
  for (const k of threadKeys) {
    if (k) {
      GLOBAL_CUSTOM_THREAD_HISTORIES.set(String(k), history);
    }
  }

  if (projectCwd && history.length > 0) {
    try {
      const autoDir = NodePath.join(projectCwd, ".autocode");
      if (!NodeFS.existsSync(autoDir)) {
        NodeFS.mkdirSync(autoDir, { recursive: true });
      }
      for (const k of threadKeys) {
        if (!k) continue;
        const historyFile = NodePath.join(autoDir, `thread_${String(k)}.json`);
        NodeFS.writeFileSync(historyFile, JSON.stringify(history, null, 2), "utf-8");
      }
      const gitIgnorePath = NodePath.join(projectCwd, ".gitignore");
      if (!NodeFS.existsSync(gitIgnorePath)) {
        NodeFS.writeFileSync(gitIgnorePath, ".autocode/\nnode_modules/\n", "utf-8");
      } else {
        const cur = NodeFS.readFileSync(gitIgnorePath, "utf-8");
        if (!cur.includes(".autocode")) {
          NodeFS.writeFileSync(gitIgnorePath, `${cur.trim()}\n.autocode/\n`, "utf-8");
        }
      }
    } catch {
      // ignore
    }
  }
}

export const GLOBAL_CUSTOM_THREAD_HISTORIES = new Map<
  string,
  Array<{ role: "system" | "user" | "assistant"; content: string }>
>();

export interface InterruptedThreadInfo {
  readonly lastInterruptedText: string;
  readonly model: string;
  readonly timestamp: number;
}
export const GLOBAL_THREAD_INTERRUPTED_STATE = new Map<string, InterruptedThreadInfo>();

export function makeCustomAdapterV2(
  instanceId: ProviderInstanceId,
  config: CustomDriverConfig,
): ProviderAdapterV2Shape {
  return {
    instanceId,
    driver: DRIVER,
    getCapabilities: () => Effect.succeed(CustomProviderCapabilitiesV2),
    planSelectionTransition: () => Effect.succeed(turnScopedSelectionTransition()),
    openSession: (openInput: ProviderAdapterV2OpenSessionInput) =>
      Effect.gen(function* () {
        const sessionId = openInput.providerSessionId;
        const createdAt = yield* DateTime.now;
        const providerSession: OrchestrationV2ProviderSession = {
          id: sessionId,
          driver: DRIVER,
          providerInstanceId: instanceId,
          status: "ready",
          cwd: openInput.runtimePolicy?.cwd ?? "/",
          model: null,
          capabilities: CustomProviderCapabilitiesV2,
          createdAt,
          updatedAt: createdAt,
          lastError: null,
        };

        const eventsQueue = yield* Queue.unbounded<ProviderAdapterV2Event>();
        let currentThread: OrchestrationV2ProviderThread | null = null;
        let currentTurnFiber: Fiber.Fiber<void, unknown> | null = null;

        const runtime: ProviderAdapterV2SessionRuntime = {
          instanceId,
          driver: DRIVER,
          providerSessionId: sessionId,
          providerSession,
          events: Stream.fromEffectRepeat(Queue.take(eventsQueue)),
          ensureThread: (input: ProviderAdapterV2EnsureThreadInput) =>
            Effect.gen(function* () {
              const now = yield* DateTime.now;
              const thId =
                input.existingProviderThread?.id ?? ProviderThreadId.make(`th_${input.threadId}`);
              const nativeId = `native_${input.threadId}`;
              currentThread = {
                id: thId,
                driver: DRIVER,
                providerInstanceId: instanceId,
                providerSessionId: sessionId,
                appThreadId: input.threadId,
                ownerNodeId: null,
                nativeThreadRef: {
                  driver: DRIVER,
                  nativeId,
                  strength: "strong",
                },
                nativeConversationHeadRef: null,
                status: "idle",
                firstRunOrdinal: null,
                lastRunOrdinal: null,
                handoffIds: [],
                forkedFrom: null,
                createdAt: input.existingProviderThread?.createdAt ?? now,
                updatedAt: now,
              };
              return currentThread;
            }),
          resumeThread: (input) =>
            Effect.gen(function* () {
              currentThread = {
                ...input.providerThread,
                nativeThreadRef: input.providerThread.nativeThreadRef ?? {
                  driver: DRIVER,
                  nativeId: `native_${input.threadId}`,
                  strength: "strong",
                },
                status: "idle",
              };
              return currentThread;
            }),
          injectHistory: (args) =>
            Effect.sync(() => {
              const threadKeys = [args.providerThread.appThreadId, args.providerThread.id];
              const msgs: Array<{ role: "system" | "user" | "assistant"; content: string }> = [];
              if (args.context && args.context.trim()) {
                msgs.push({ role: "system", content: args.context.trim() });
              }
              for (const msg of args.messages) {
                const text = msg.text?.trim();
                if (!text) continue;
                msgs.push({
                  role: msg.role === "assistant" ? "assistant" : "user",
                  content: text,
                });
              }
              if (msgs.length > 0) {
                saveThreadHistory(threadKeys, msgs, openInput.runtimePolicy?.cwd ?? undefined);
              }
              return true;
            }),
          startTurn: (turnInput: ProviderAdapterV2TurnInput) =>
            Effect.gen(function* () {
              const turnStartedAt = yield* DateTime.now;
              const providerTurnId = ProviderTurnId.make(`turn_${turnInput.runId}`);
              const assistantTurnItemId = TurnItemId.make(`item_assist_${turnInput.runId}`);
              const reasoningTurnItemId = TurnItemId.make(`item_reason_${turnInput.runId}`);
              const assistantMessageId = MessageId.make(`msg_assist_${turnInput.runId}`);
              const turnOrdinal = PositiveInt.make(
                Math.max(1, turnInput.providerTurnOrdinal ?? turnInput.runOrdinal ?? 1),
              );
              const reasoningOrdinal = NonNegativeInt.make(turnOrdinal * 100);
              const itemOrdinal = NonNegativeInt.make(turnOrdinal * 100 + 1);

              let accumulatedText = "";
              let accumulatedReasoning = "";
              let reasoningActive = false;
              let reasoningCompleted = false;
              let inThinkTag = false;
              let selectedModel =
                turnInput.modelSelection?.model && turnInput.modelSelection.model !== "default"
                  ? turnInput.modelSelection.model
                  : (config.models?.[0]?.id ?? "default");
              let chatUrl = "";
              let cleanBase = "";
              let currentAiLogId: string | null = null;
              let currentStartMs = Date.now();
              let threadKey = "";
              let threadKeys: Array<string | null | undefined> = [];
              let history: Array<{ role: "system" | "user" | "assistant"; content: string }> = [];
              let projectCwd = "";
              let userPrompt = "";

              const runTurn = Effect.gen(function* () {
                yield* Queue.offer(eventsQueue, {
                  type: "provider_turn.updated",
                  driver: DRIVER,
                  providerTurn: {
                    id: providerTurnId,
                    providerThreadId: turnInput.providerThread.id,
                    nodeId: turnInput.rootNodeId,
                    runAttemptId: turnInput.attemptId,
                    nativeTurnRef: null,
                    ordinal: turnOrdinal,
                    status: "running",
                    startedAt: turnStartedAt,
                    completedAt: null,
                  },
                });

                yield* Queue.offer(eventsQueue, {
                  type: "turn_item.updated",
                  driver: DRIVER,
                  turnItem: {
                    id: assistantTurnItemId,
                    threadId: turnInput.threadId,
                    runId: turnInput.runId,
                    nodeId: turnInput.rootNodeId,
                    providerThreadId: turnInput.providerThread.id,
                    providerTurnId,
                    nativeItemRef: null,
                    parentItemId: null,
                    ordinal: itemOrdinal,
                    status: "running",
                    title: null,
                    startedAt: turnStartedAt,
                    completedAt: null,
                    updatedAt: turnStartedAt,
                    type: "assistant_message",
                    messageId: assistantMessageId,
                    text: "",
                    streaming: true,
                  },
                });

                const rawBase = (config.baseUrl ?? "").trim().replace(/\/+$/, "");
                if (!rawBase) {
                  return yield* Effect.fail(
                    "Custom provider base URL is missing or not configured.",
                  );
                }

                cleanBase = rawBase.replace(/\/chat\/completions\/?$/i, "").replace(/\/+$/, "");
                if (cleanBase.includes("openrouter.ai")) {
                  cleanBase = "https://openrouter.ai/api/v1";
                }

                if (cleanBase.endsWith("/chat/completions")) {
                  chatUrl = cleanBase;
                } else if (cleanBase.endsWith("/v1")) {
                  chatUrl = `${cleanBase}/chat/completions`;
                } else if (cleanBase.includes("/v1/")) {
                  chatUrl = `${cleanBase}/chat/completions`;
                } else {
                  chatUrl = `${cleanBase}/v1/chat/completions`;
                }

                threadKeys = [
                  turnInput.providerThread.appThreadId,
                  turnInput.threadId,
                  turnInput.providerThread.id,
                ];
                threadKey = String(
                  turnInput.providerThread.appThreadId ??
                    turnInput.threadId ??
                    turnInput.providerThread.id,
                );

                const procEnv = (
                  globalThis as { process?: { env?: Record<string, string | undefined> } }
                ).process?.env;
                const userHomeDir = procEnv?.HOME || procEnv?.USERPROFILE || "/root";
                const storageFolderName = "autocode-storage";
                const defaultAutocodeStorageDir = NodePath.resolve(userHomeDir, storageFolderName);

                projectCwd = turnInput.runtimePolicy?.cwd?.trim() || "";
                if (!projectCwd || projectCwd === "/" || projectCwd === ".") {
                  projectCwd = defaultAutocodeStorageDir;
                }

                try {
                  if (!NodeFS.existsSync(projectCwd)) {
                    NodeFS.mkdirSync(projectCwd, { recursive: true });
                  }
                } catch {
                  // ignore
                }

                history = getThreadHistory(threadKeys, projectCwd);

                userPrompt = (turnInput.message.text || "Hello").trim();
                if (userPrompt.includes("User message:\n")) {
                  const parts = userPrompt.split("User message:\n");
                  userPrompt = (parts[parts.length - 1] || userPrompt).trim();
                }

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

                // Extract live preview errors from server preview tabs and .autocode/preview_logs.json
                let capturedPreviewErrors: Array<{ level?: string; text: string }> = [];
                for (const tk of threadKeys) {
                  if (tk) {
                    const errs = getThreadPreviewErrors(String(tk));
                    if (errs && errs.length > 0) {
                      capturedPreviewErrors = errs;
                      break;
                    }
                  }
                }

                let diskPreviewLogs: Array<{ level?: string; text: string }> = [];
                try {
                  const diskLogsPath = NodePath.join(projectCwd, ".autocode", "preview_logs.json");
                  if (NodeFS.existsSync(diskLogsPath)) {
                    const raw = JSON.parse(NodeFS.readFileSync(diskLogsPath, "utf-8"));
                    if (Array.isArray(raw)) {
                      diskPreviewLogs = raw;
                    }
                  }
                } catch {
                  // ignore
                }

                const allPreviewErrors: string[] = [];
                for (const err of [...capturedPreviewErrors, ...diskPreviewLogs]) {
                  if (err && err.text) {
                    const line = `- [${(err.level || "ERROR").toUpperCase()}]: ${err.text}`;
                    if (!allPreviewErrors.includes(line)) {
                      allPreviewErrors.push(line);
                    }
                  }
                }

                let previewErrorBanner = "";
                const isExplicitErrorFixPrompt =
                  /\b(error|errors|bug|bugs|fix|fixed|broken|fail|failed|fails|crash|crashes|crashed|issue|issues|debug|not working|theek karo|masla|kharaab|sahi karo)\b/i.test(
                    userPrompt,
                  );
                if (allPreviewErrors.length > 0 && isExplicitErrorFixPrompt) {
                  previewErrorBanner = `\n================================================================================
CRITICAL LIVE PREVIEW DEBUG CONSOLE - RUNTIME ERRORS DETECTED:
The live preview environment reported the following runtime errors:
${allPreviewErrors.slice(-12).join("\n")}

MANDATORY ERROR DIAGNOSIS & FIXING INSTRUCTIONS:
1. You have direct awareness and visibility into the Live Preview Debug Console above.
2. Diagnose why these errors occurred (e.g. missing elements, null canvas context, missing 404 images/audio files, syntax errors, duplicate declarations, undefined variables).
3. If building or fixing games/HTML apps, output the COMPLETE updated file (e.g. index.html) with all fixes applied.
4. Ensure all assets are 100% self-contained (zero missing local files).
================================================================================\n`;
                }

                const systemPrompt = `You are an expert AI software engineer and game architect assisting a developer in an automated web IDE.
The host IDE automatically extracts code blocks from your response, writes the files directly to the project directory on disk, and renders them in the IDE's built-in Live Web Preview.

Project Workspace Directory: ${projectCwd}
${workspace.hasFiles && workspace.fileCount > 0 ? `${workspace.summary}\n${filesContext}` : "Workspace Status: Fresh / Empty Project Workspace"}
${previewErrorBanner}
================================================================================
HOST IDE WORKSPACE & FILE MANAGEMENT:
• The host IDE handles all file saving and live previewing automatically whenever you output code blocks.
• When the user asks you to create a game, web app, or feature, simply provide the complete, functional code inside markdown code blocks with the relative filepath, for example:
  \`\`\`html filepath=index.html
  <!DOCTYPE html>
  ...
  \`\`\`
• If the user asks where files are saved or how to preview, inform them that the host IDE automatically saves files to their project directory (${projectCwd}) and displays them in the Live Preview panel.
• You do not need to execute shell commands or manipulate disk files yourself—the host IDE automatically saves and commits files to Git when it detects your code blocks.

================================================================================
MANDATORY GAME & WEB ENGINEERING STANDARDS (100% RELIABILITY):
1. 100% SELF-CONTAINED ASSETS - ZERO BROKEN 404s:
   • NEVER reference external image files (e.g. "car.png", "jet.png") or audio files ("sound.mp3") that do not exist locally on disk.
   • ALWAYS draw game entities procedurally on HTML5 Canvas using vector paths (arc, rect, beginPath, fill, stroke) or emojis ("🏎️", "✈️", "👾", "🪙").
   • For sound effects, synthesize retro sound effects directly using Web Audio API (AudioContext, OscillatorNode, GainNode) triggered strictly on user click/interaction to comply with browser autoplay policies.
2. CANVAS PIXEL SIZING & COORDINATES:
   • Always set explicit canvas pixel width and height attributes in HTML or JS (e.g. canvas.width = 800; canvas.height = 600;), not just CSS styles, so collision detection coordinates are pixel-accurate.
   • Support both keyboard controls (Arrow keys, WASD, Space) AND on-screen touch/mouse control buttons for instant playability in both desktop and mobile preview.
3. DOM LIFECYCLE & EXECUTION SAFETY:
   • Place all scripts at the bottom of <body> or wrap startup in window.addEventListener('DOMContentLoaded', ...) so <canvas> and DOM elements exist before code executes.
4. COMPLETE WORKING CODE FOR BUG FIXES & GAMES:
   • When fixing bugs or when building games, ALWAYS output the COMPLETE file (e.g. index.html) rather than small fragments or partial snippets. This guarantees that file syntax remains 100% valid, prevents mismatched braces, and ensures immediate playability in the Live Preview.

================================================================================
CRITICAL MANDATORY RULE: NEVER OUTPUT ISOLATED SNIPPETS WHEN FIXING ERRORS:
• When the user asks to fix an error, or when debugging runtime issues:
  - NEVER output small partial code snippets, 1-line JS examples (e.g. \`const best = Number(window.localStorage...)\`), or conversational code blocks.
  - The host IDE automatically saves files to disk. If you only output a 1-line snippet, it cannot run in the Live Preview!
  - You MUST output the FULL, COMPLETE updated file (e.g. \`\`\`html filepath=index.html ... entire 350+ lines of HTML/CSS/JS ...) with the fix integrated directly into the code.
  - The file MUST start with <!DOCTYPE html> and end with </html>.
  - Do NOT tell the user "replace this line with that line" or "if that still errors, use this". Simply integrate the robust, defensive fix directly into the complete working file so it saves and runs immediately!

================================================================================
INTELLIGENT AUTONOMOUS ACTION SELECTION:
You must dynamically choose the exact right action based on what the user wants to accomplish:

1. ACTION A: NEW GAME, NEW WEB APP, NEW PROJECT, OR COMPLETE OVERHAUL
   • Trigger:
     - User asks to build a game or web app (e.g. "make a 2D racing game", "build a plane shooter", "create a snake game", "build a website/app").
     - User wants to start a fresh project, restart, or rebuild from scratch.
     - User explicitly asks to rewrite, overhaul, or replace a file.
   • What to generate:
     - Provide the FULL, COMPLETE, PRODUCTION-READY code for each required file (e.g. index.html, style.css, game.js).
     - Always create a complete, self-contained index.html as the primary entry point so it immediately runs in the built-in Live Preview!
     - Implement complete, interactive controls (arrow keys, WASD, touch/mouse buttons on canvas, restart/pause buttons, score tracking).
     - Ensure canvas sizing and game loop (requestAnimationFrame) work smoothly with complete physics, obstacles, player movement, and collision detection.
     - NEVER use placeholder comments like "// ... rest of code unchanged ..." when writing new files or full overhauls.

2. ACTION B: CREATING A NEW FILE OR SIBLING COMPONENT
   • Trigger:
     - The user asks to create a new file or feature that does not exist on disk yet (e.g., adding audio.js, car.js, leaderboard.html, utils.ts).
   • What to generate:
     - Output the FULL, COMPLETE code for the new file using:
       \`\`\`<language> filepath=<relative/path>
       // full complete implementation
       \`\`\`
     - If an existing file needs to import or link this new file (e.g. adding <script src="car.js"></script> to index.html), include a SEARCH/REPLACE diff for that existing file in the same turn.

3. ACTION C: TARGETED EDITS, FIXES & TWEAKS ON EXISTING FILES
   • Trigger:
     - User asks to tweak, adjust, fix a bug, or change settings/features in existing code (e.g. "change car/jet color to yellow", "increase bullet speed", "fix score counter", "add turbo boost").
   • What to generate:
     - For single-file HTML or games under 600 lines: ALWAYS output the FULL, COMPLETE updated file (e.g. index.html) with the fix applied so the file is rewritten cleanly without syntax or patch corruption.
     - For large multi-file codebases, use targeted SEARCH/REPLACE diff blocks:
       \`\`\`<language> filepath=<relative/path>
       <<<< SEARCH
       // exact lines from the existing file above to be replaced
       ====
       // new replacement lines
       >>>>
       \`\`\`
     - NEVER output floating partial snippets or lone functions without SEARCH/REPLACE blocks.

FILE SPECIFICATION INSTRUCTIONS:
Always clearly specify the relative file path for each file at the top of each code block using:
\`\`\`<language> filepath=<relative/path>
...content or diff...
\`\`\`
or for HTML/web:
\`\`\`html
<!-- filepath: index.html -->
...content...
\`\`\`

The host IDE will automatically write all generated files and patches to disk in ${projectCwd} and commit them to Git.`;

                // Check if previous turn was interrupted or user is requesting continuation
                const interruptedInfo = GLOBAL_THREAD_INTERRUPTED_STATE.get(threadKey);
                const isContinuationKeyword =
                  /^(continue|carry on|resume|proceed|agay|agay se|keep going|continue generation)\b/i.test(
                    userPrompt.trim(),
                  );
                const isResumeRequest =
                  Boolean(interruptedInfo) &&
                  (isContinuationKeyword ||
                    !userPrompt.trim() ||
                    userPrompt.trim() === "Hello" ||
                    userPrompt.toLowerCase().includes("continue"));

                let effectiveUserPrompt = userPrompt || "Hello";
                if (isResumeRequest && history.length > 0) {
                  const lastAssistantMsg = [...history]
                    .reverse()
                    .find((m) => m.role === "assistant");
                  if (lastAssistantMsg?.content) {
                    const rawLines = lastAssistantMsg.content.trim().split("\n");
                    const tailLines = rawLines.slice(-10).join("\n");
                    effectiveUserPrompt = `[CONTINUATION / RESUME GENERATION REQUEST]:
The previous response was interrupted / cut off mid-stream due to a timeout or token limit.
The previous output ended abruptly with:
"""
${tailLines}
"""

CRITICAL INSTRUCTIONS FOR RESUMING:
1. DO NOT restart the implementation or file from line 1.
2. DO NOT rewrite what you already provided above.
3. Resume immediately from the exact character/point where you stopped.
4. If you were inside a code block or writing a file (e.g. index.html), continue and complete the code block, OR output the complete updated file with its filepath so it can be saved properly.

User prompt:
${userPrompt || "Continue generating from where you were interrupted"}`;
                  }
                }

                // Clean history: remove stuck refusal loop messages where Claude got stuck
                const cleanHistory = history.filter((m) => {
                  if (m.role === "assistant") {
                    const text = m.content.toLowerCase();
                    if (
                      text.includes("i can't adopt alternative personas") ||
                      text.includes("i cannot and will not claim capabilities") ||
                      text.includes("i genuinely cannot") ||
                      text.includes("capabilities i don't possess") ||
                      (text.includes("i'm claude") && text.includes("cannot"))
                    ) {
                      return false;
                    }
                  }
                  return true;
                });

                // Skills: the custom endpoint has no skill runtime, so an
                // invoked skill's body rides along as an instruction block
                // right before the user's message.
                const skillInstructions = buildInvokedSkillInstructions(
                  effectiveUserPrompt,
                  projectCwd,
                );

                const candidateMessages: Array<{
                  role: "system" | "user" | "assistant";
                  content: string;
                }> = [
                  { role: "system" as const, content: systemPrompt },
                  ...cleanHistory,
                  ...(skillInstructions
                    ? [{ role: "system" as const, content: skillInstructions }]
                    : []),
                  { role: "user" as const, content: effectiveUserPrompt },
                ];

                // Sanitize messages for OpenAI API compatibility:
                // 1. Filter out empty contents
                // 2. Collapse contiguous same-role messages
                const conversationMessages: Array<{
                  role: "system" | "user" | "assistant";
                  content: string;
                }> = [];
                for (const msg of candidateMessages) {
                  const content = msg.content?.trim();
                  if (!content) continue;
                  const prev = conversationMessages[conversationMessages.length - 1];
                  if (prev && prev.role === msg.role) {
                    prev.content += `\n\n${content}`;
                  } else {
                    conversationMessages.push({ role: msg.role, content });
                  }
                }

                if (
                  conversationMessages.length === 0 ||
                  conversationMessages[0]!.role === "assistant"
                ) {
                  conversationMessages.unshift({ role: "user", content: "Hello" });
                }

                selectedModel =
                  turnInput.modelSelection?.model && turnInput.modelSelection.model !== "default"
                    ? turnInput.modelSelection.model
                    : (config.models?.[0]?.id ?? "default");

                if (
                  (selectedModel === "default" || !selectedModel) &&
                  (rawBase.includes("8377") ||
                    rawBase.includes("antseed") ||
                    rawBase.includes("cheaprouter"))
                ) {
                  selectedModel = "glm-4.5-flash";
                } else if (
                  (selectedModel === "default" || !selectedModel) &&
                  (rawBase.includes("openrouter.ai") || chatUrl.includes("openrouter.ai"))
                ) {
                  selectedModel = "meta-llama/llama-3.3-70b-instruct:free";
                } else if (
                  selectedModel === "default" &&
                  config.models &&
                  config.models.length > 0
                ) {
                  selectedModel = config.models[0]!.id;
                }

                let request = HttpClientRequest.post(chatUrl).pipe(
                  HttpClientRequest.setHeader("Content-Type", "application/json"),
                  HttpClientRequest.setHeader("Accept", "text/event-stream, application/json"),
                  HttpClientRequest.bodyJsonUnsafe({
                    model: selectedModel,
                    messages: conversationMessages,
                    stream: true,
                  }),
                );

                let cleanApiKey = (config.apiKey ?? "").trim();
                if (cleanApiKey.startsWith("Bearer ")) {
                  cleanApiKey = cleanApiKey.slice(7).trim();
                }
                cleanApiKey = cleanApiKey.replace(/^["']|["']$/g, "").trim();

                if (cleanApiKey.length > 0) {
                  request = HttpClientRequest.setHeader(
                    request,
                    "Authorization",
                    `Bearer ${cleanApiKey}`,
                  );
                  if (chatUrl.includes("anthropic.com")) {
                    request = HttpClientRequest.setHeader(request, "x-api-key", cleanApiKey);
                    request = HttpClientRequest.setHeader(
                      request,
                      "anthropic-version",
                      "2023-06-01",
                    );
                  }
                  if (chatUrl.includes("googleapis.com")) {
                    request = HttpClientRequest.setHeader(request, "x-goog-api-key", cleanApiKey);
                  }
                }

                if (config.headers && Array.isArray(config.headers)) {
                  for (const h of config.headers) {
                    if (h.key && h.key.trim().length > 0) {
                      request = HttpClientRequest.setHeader(request, h.key.trim(), h.value.trim());
                    }
                  }
                }

                // If targeting OpenRouter, guarantee required/recommended headers
                if (chatUrl.includes("openrouter.ai")) {
                  const hasReferer = config.headers?.some(
                    (h) => h.key.toLowerCase() === "http-referer",
                  );
                  const hasTitle = config.headers?.some((h) => h.key.toLowerCase() === "x-title");
                  if (!hasReferer) {
                    request = HttpClientRequest.setHeader(
                      request,
                      "HTTP-Referer",
                      "https://autojobs.tokendeal.cloud",
                    );
                  }
                  if (!hasTitle) {
                    request = HttpClientRequest.setHeader(request, "X-Title", "Jobi Code");
                  }
                }

                currentAiLogId = null;
                currentStartMs = Date.now();
                const timeFormatted = new Date().toLocaleTimeString();

                const reqHeadersRecord: Record<string, string> = {
                  "Content-Type": "application/json",
                  Accept: "text/event-stream, application/json",
                };
                if (cleanApiKey) {
                  reqHeadersRecord["Authorization"] =
                    `Bearer ${cleanApiKey.slice(0, 8)}...${cleanApiKey.slice(-4)}`;
                }
                if (config.headers && Array.isArray(config.headers)) {
                  for (const h of config.headers) {
                    if (h.key) reqHeadersRecord[h.key] = h.value;
                  }
                }
                if (chatUrl.includes("openrouter.ai")) {
                  reqHeadersRecord["HTTP-Referer"] = "https://autojobs.tokendeal.cloud";
                  reqHeadersRecord["X-Title"] = "Jobi Code";
                }

                const maskedKey = cleanApiKey
                  ? `${cleanApiKey.slice(0, 7)}...${cleanApiKey.slice(-4)}`
                  : "(No API key)";

                currentAiLogId = `ai-log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
                recordAiModelLog({
                  id: currentAiLogId,
                  timestamp: currentStartMs,
                  timeFormatted,
                  threadId: turnInput.threadId,
                  runId: turnInput.runId,
                  provider: "Custom Provider",
                  providerInstanceId: String(instanceId),
                  model: selectedModel,
                  baseUrl: cleanBase,
                  endpoint: chatUrl,
                  requestHeaders: reqHeadersRecord,
                  apiKeyMasked: maskedKey,
                  userPrompt: userPrompt || "(Empty message)",
                  messages: conversationMessages,
                  state: "pending",
                });

                const client = yield* HttpClient.HttpClient;
                const rawResponse = yield* client.execute(request).pipe(
                  Effect.timeoutOrElse({
                    duration: "35 seconds",
                    orElse: () =>
                      Effect.fail(
                        new Error(
                          `Connection timed out after 35 seconds while waiting for response from model "${selectedModel}". The upstream model server (${cleanBase}) is unresponsive or taking too long.`,
                        ),
                      ),
                  }),
                );

                if (rawResponse.status < 200 || rawResponse.status >= 300) {
                  const errorBody = yield* rawResponse.text.pipe(Effect.orElseSucceed(() => ""));
                  let detail = "";
                  try {
                    const parsed = JSON.parse(errorBody);
                    detail =
                      parsed?.error?.message ??
                      parsed?.message ??
                      (typeof parsed?.error === "string" ? parsed.error : "") ??
                      (typeof parsed === "string" ? parsed : "");
                  } catch {
                    detail = errorBody.trim();
                  }
                  let statusMsg = `HTTP ${rawResponse.status}${detail ? `: ${detail}` : ""}`;
                  if (
                    rawResponse.status === 401 &&
                    detail.toLowerCase().includes("user not found")
                  ) {
                    statusMsg +=
                      "\n[OpenRouter Explanation]: OpenRouter rejected the API Key: 'User not found.' Please verify that your OpenRouter API Key is correct and active at https://openrouter.ai/settings/keys.";
                  }
                  if (currentAiLogId) {
                    updateAiModelLog(currentAiLogId, {
                      status: rawResponse.status,
                      statusText: String(rawResponse.status),
                      durationMs: Date.now() - currentStartMs,
                      state: "error",
                      error: statusMsg,
                      errorType: `HTTP_${rawResponse.status}`,
                      responseBody: errorBody || statusMsg,
                    });
                  }
                  return yield* Effect.fail(new Error(statusMsg));
                }

                const response = rawResponse;

                accumulatedText = "";
                let lastEmitted = yield* Clock.currentTimeMillis;

                const linesStream = response.stream.pipe(Stream.decodeText(), Stream.splitLines);

                yield* Stream.runForEach(linesStream, (line) =>
                  Effect.gen(function* () {
                    const trimmed = line.trim();
                    if (!trimmed || trimmed.startsWith(":") || trimmed.startsWith("event:")) return;
                    let jsonPayload: string | null = null;
                    if (trimmed.startsWith("data:")) {
                      const dataStr = trimmed.slice(5).trim();
                      if (dataStr === "[DONE]") return;
                      jsonPayload = dataStr;
                    } else if (trimmed.startsWith("{")) {
                      jsonPayload = trimmed;
                    }

                    if (jsonPayload) {
                      const maybeJson = decodeJson(jsonPayload);
                      if (Option.isSome(maybeJson)) {
                        const parsed = maybeJson.value as any;
                        if (parsed.error) {
                          const errorMsg =
                            typeof parsed.error === "object" && parsed.error !== null
                              ? parsed.error.message || JSON.stringify(parsed.error)
                              : String(parsed.error);
                          return yield* Effect.fail(new Error(errorMsg));
                        }
                        const rawDeltaReasoning =
                          parsed.choices?.[0]?.delta?.reasoning_content ??
                          parsed.choices?.[0]?.delta?.reasoning ??
                          parsed.choices?.[0]?.delta?.thought ??
                          "";

                        const rawDeltaContent =
                          parsed.choices?.[0]?.delta?.content ??
                          parsed.choices?.[0]?.message?.content ??
                          parsed.choices?.[0]?.text ??
                          parsed.response ??
                          parsed.message?.content ??
                          "";

                        let hadDelta = false;
                        if (rawDeltaReasoning) {
                          accumulatedReasoning += rawDeltaReasoning;
                          reasoningActive = true;
                          hadDelta = true;
                        }

                        let textPiece = rawDeltaContent;
                        if (textPiece) {
                          if (inThinkTag) {
                            const closeIdx = textPiece.indexOf("</think>");
                            if (closeIdx !== -1) {
                              accumulatedReasoning += textPiece.slice(0, closeIdx);
                              inThinkTag = false;
                              reasoningCompleted = true;
                              reasoningActive = true;
                              hadDelta = true;
                              textPiece = textPiece.slice(closeIdx + 8);
                            } else {
                              accumulatedReasoning += textPiece;
                              reasoningActive = true;
                              hadDelta = true;
                              textPiece = "";
                            }
                          } else {
                            const openIdx = textPiece.indexOf("<think>");
                            if (openIdx !== -1) {
                              const before = textPiece.slice(0, openIdx);
                              if (before) accumulatedText += before;
                              const afterOpen = textPiece.slice(openIdx + 7);
                              const closeIdx = afterOpen.indexOf("</think>");
                              if (closeIdx !== -1) {
                                accumulatedReasoning += afterOpen.slice(0, closeIdx);
                                reasoningActive = true;
                                reasoningCompleted = true;
                                hadDelta = true;
                                textPiece = afterOpen.slice(closeIdx + 8);
                              } else {
                                accumulatedReasoning += afterOpen;
                                inThinkTag = true;
                                reasoningActive = true;
                                hadDelta = true;
                                textPiece = "";
                              }
                            }
                          }

                          if (textPiece) {
                            if (reasoningActive && !reasoningCompleted) {
                              reasoningCompleted = true;
                            }
                            accumulatedText += textPiece;
                            hadDelta = true;
                          }
                        }

                        if (hadDelta) {
                          const nowMs = yield* Clock.currentTimeMillis;
                          if (nowMs - lastEmitted > 40) {
                            lastEmitted = nowMs;
                            if (currentAiLogId) {
                              updateAiModelLog(currentAiLogId, {
                                state: "streaming",
                                responseBody: accumulatedReasoning
                                  ? `[Thinking]\n${accumulatedReasoning}\n\n[Response]\n${accumulatedText}`
                                  : accumulatedText,
                              });
                            }

                            if (reasoningActive) {
                              yield* Queue.offer(eventsQueue, {
                                type: "turn_item.updated",
                                driver: DRIVER,
                                turnItem: {
                                  id: reasoningTurnItemId,
                                  threadId: turnInput.threadId,
                                  runId: turnInput.runId,
                                  nodeId: turnInput.rootNodeId,
                                  providerThreadId: turnInput.providerThread.id,
                                  providerTurnId,
                                  nativeItemRef: null,
                                  parentItemId: null,
                                  ordinal: reasoningOrdinal,
                                  status: reasoningCompleted ? "completed" : "running",
                                  title: "Thinking",
                                  startedAt: turnStartedAt,
                                  completedAt: reasoningCompleted
                                    ? DateTime.makeUnsafe(nowMs)
                                    : null,
                                  updatedAt: DateTime.makeUnsafe(nowMs),
                                  type: "reasoning",
                                  text: accumulatedReasoning,
                                  streaming: !reasoningCompleted,
                                },
                              });
                            }

                            if (accumulatedText) {
                              yield* Queue.offer(eventsQueue, {
                                type: "turn_item.updated",
                                driver: DRIVER,
                                turnItem: {
                                  id: assistantTurnItemId,
                                  threadId: turnInput.threadId,
                                  runId: turnInput.runId,
                                  nodeId: turnInput.rootNodeId,
                                  providerThreadId: turnInput.providerThread.id,
                                  providerTurnId,
                                  nativeItemRef: null,
                                  parentItemId: null,
                                  ordinal: itemOrdinal,
                                  status: "running",
                                  title: null,
                                  startedAt: turnStartedAt,
                                  completedAt: null,
                                  updatedAt: DateTime.makeUnsafe(nowMs),
                                  type: "assistant_message",
                                  messageId: assistantMessageId,
                                  text: accumulatedText,
                                  streaming: true,
                                },
                              });

                              yield* Queue.offer(eventsQueue, {
                                type: "message.updated",
                                driver: DRIVER,
                                message: {
                                  id: assistantMessageId,
                                  threadId: turnInput.threadId,
                                  runId: turnInput.runId,
                                  nodeId: turnInput.rootNodeId,
                                  role: "assistant",
                                  text: accumulatedText,
                                  attachments: [],
                                  streaming: true,
                                  createdBy: "agent",
                                  creationSource: "provider",
                                  createdAt: turnStartedAt,
                                  updatedAt: DateTime.makeUnsafe(nowMs),
                                },
                              });
                            }
                          }
                        }
                      }
                    }
                  }),
                ).pipe(
                  Effect.timeoutOrElse({
                    duration: "240 seconds",
                    orElse: () =>
                      Effect.fail(
                        new Error(
                          `Model "${selectedModel}" streaming timed out after 240 seconds. The connection stalled or upstream provider stopped sending tokens.`,
                        ),
                      ),
                  }),
                );

                if (!accumulatedText.trim() && !accumulatedReasoning.trim()) {
                  return yield* Effect.fail(
                    new Error(
                      `Model "${selectedModel}" returned an empty response. The model may be offline, rate-limited, or overloaded on ${cleanBase}.`,
                    ),
                  );
                }

                const finishedTime = yield* DateTime.now;

                // Automatically extract and save generated project files to disk in projectCwd
                const extractedFiles = extractFilesFromMarkdown(
                  accumulatedText,
                  projectCwd,
                  userPrompt,
                );
                const savedFiles: string[] = [];

                for (const file of extractedFiles) {
                  try {
                    const result = applyFileContentOrPatch(projectCwd, file);
                    if (result.saved) {
                      savedFiles.push(file.path);
                    }
                  } catch (saveErr) {
                    console.error(
                      "Failed saving/patching generated file to project:",
                      file.path,
                      saveErr,
                    );
                  }
                }

                let finalText = accumulatedText;
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
                  } catch (_gitErr) {
                    // Git tracking best-effort, safe to ignore
                  }

                  finalText +=
                    `\n\n---\n📁 **Saved ${savedFiles.length} file${savedFiles.length > 1 ? "s" : ""} to project (\`${NodePath.basename(projectCwd)}\`):**\n` +
                    savedFiles.map((f) => `- \`${f}\``).join("\n");

                  const hasHtml = savedFiles.some((f) => f.toLowerCase().endsWith(".html"));
                  if (hasHtml) {
                    finalText += `\n\n🎮 **Live Preview Ready**: \`index.html\` is available. Open in Preview to play and test!`;
                  }
                }

                if (reasoningActive && accumulatedReasoning) {
                  yield* Queue.offer(eventsQueue, {
                    type: "turn_item.updated",
                    driver: DRIVER,
                    turnItem: {
                      id: reasoningTurnItemId,
                      threadId: turnInput.threadId,
                      runId: turnInput.runId,
                      nodeId: turnInput.rootNodeId,
                      providerThreadId: turnInput.providerThread.id,
                      providerTurnId,
                      nativeItemRef: null,
                      parentItemId: null,
                      ordinal: reasoningOrdinal,
                      status: "completed",
                      title: "Thinking",
                      startedAt: turnStartedAt,
                      completedAt: finishedTime,
                      updatedAt: finishedTime,
                      type: "reasoning",
                      text: accumulatedReasoning,
                      streaming: false,
                    },
                  });
                }

                yield* Queue.offer(eventsQueue, {
                  type: "message.updated",
                  driver: DRIVER,
                  message: {
                    id: assistantMessageId,
                    threadId: turnInput.threadId,
                    runId: turnInput.runId,
                    nodeId: turnInput.rootNodeId,
                    role: "assistant",
                    text: finalText,
                    attachments: [],
                    streaming: false,
                    createdBy: "agent",
                    creationSource: "provider",
                    createdAt: turnStartedAt,
                    updatedAt: finishedTime,
                  },
                });

                yield* Queue.offer(eventsQueue, {
                  type: "turn_item.updated",
                  driver: DRIVER,
                  turnItem: {
                    id: assistantTurnItemId,
                    threadId: turnInput.threadId,
                    runId: turnInput.runId,
                    nodeId: turnInput.rootNodeId,
                    providerThreadId: turnInput.providerThread.id,
                    providerTurnId,
                    nativeItemRef: null,
                    parentItemId: null,
                    ordinal: itemOrdinal,
                    status: "completed",
                    title: null,
                    startedAt: turnStartedAt,
                    completedAt: finishedTime,
                    updatedAt: finishedTime,
                    type: "assistant_message",
                    messageId: assistantMessageId,
                    text: finalText,
                    streaming: false,
                  },
                });

                yield* Queue.offer(eventsQueue, {
                  type: "provider_turn.updated",
                  driver: DRIVER,
                  providerTurn: {
                    id: providerTurnId,
                    providerThreadId: turnInput.providerThread.id,
                    nodeId: turnInput.rootNodeId,
                    runAttemptId: turnInput.attemptId,
                    nativeTurnRef: null,
                    ordinal: turnOrdinal,
                    status: "completed",
                    startedAt: turnStartedAt,
                    completedAt: finishedTime,
                  },
                });

                yield* Queue.offer(eventsQueue, {
                  type: "turn.terminal",
                  driver: DRIVER,
                  providerThreadId: turnInput.providerThread.id,
                  providerTurnId,
                  runOrdinal: PositiveInt.make(turnInput.runOrdinal),
                  status: "completed",
                  failure: null,
                  threadDisposition: "reusable",
                });

                if (currentAiLogId) {
                  updateAiModelLog(currentAiLogId, {
                    status: rawResponse.status,
                    statusText: "OK",
                    durationMs: Date.now() - currentStartMs,
                    state: "completed",
                    responseBody: finalText,
                  });
                }

                // Save turn to thread history on successful completion
                const updatedHistory: Array<{
                  role: "system" | "user" | "assistant";
                  content: string;
                }> = [
                  ...history,
                  { role: "user" as const, content: userPrompt || "Hello" },
                  {
                    role: "assistant" as const,
                    content: finalText.trim() || "(Response received)",
                  },
                ];
                saveThreadHistory(threadKeys, updatedHistory, projectCwd);
                GLOBAL_THREAD_INTERRUPTED_STATE.delete(threadKey);
              }).pipe(
                Effect.provide(FetchHttpClient.layer),
                Effect.catchCause((cause: unknown) =>
                  Effect.gen(function* () {
                    const squashed = Cause.isCause(cause) ? Cause.squash(cause) : cause;
                    console.error("CUSTOM DRIVER RUN TURN ERROR:", squashed);
                    const message =
                      squashed instanceof Error
                        ? squashed.message
                        : typeof squashed === "object" && squashed !== null && "message" in squashed
                          ? String((squashed as any).message)
                          : String(squashed);
                    const failTime = yield* DateTime.now;

                    if (currentAiLogId) {
                      updateAiModelLog(currentAiLogId, {
                        status: 500,
                        statusText: "Error",
                        durationMs: Date.now() - currentStartMs,
                        state: "error",
                        error: message,
                        errorType: "TurnFailedError",
                        responseBody: message,
                      });
                    }

                    // Preserve partial generated code cleanly without error markdown pollution
                    const cleanPartialText = accumulatedText.trim();
                    if (cleanPartialText) {
                      const updatedHistory: Array<{
                        role: "system" | "user" | "assistant";
                        content: string;
                      }> = [
                        ...history,
                        { role: "user" as const, content: userPrompt || "Hello" },
                        { role: "assistant" as const, content: cleanPartialText },
                      ];
                      saveThreadHistory(threadKeys, updatedHistory, projectCwd);
                      GLOBAL_THREAD_INTERRUPTED_STATE.set(threadKey, {
                        lastInterruptedText: cleanPartialText,
                        model: selectedModel,
                        timestamp: Date.now(),
                      });

                      // Also best-effort extract and save any project files generated so far
                      if (projectCwd) {
                        try {
                          const partialFiles = extractFilesFromMarkdown(
                            cleanPartialText,
                            projectCwd,
                          );
                          for (const file of partialFiles) {
                            applyFileContentOrPatch(projectCwd, file);
                          }
                        } catch {
                          // ignore
                        }
                      }
                    }

                    yield* Queue.offer(eventsQueue, {
                      type: "message.updated",
                      driver: DRIVER,
                      message: {
                        id: assistantMessageId,
                        threadId: turnInput.threadId,
                        runId: turnInput.runId,
                        nodeId: turnInput.rootNodeId,
                        role: "assistant",
                        text: cleanPartialText,
                        attachments: [],
                        streaming: false,
                        createdBy: "agent",
                        creationSource: "provider",
                        createdAt: turnStartedAt,
                        updatedAt: failTime,
                      },
                    });

                    yield* Queue.offer(eventsQueue, {
                      type: "turn_item.updated",
                      driver: DRIVER,
                      turnItem: {
                        id: assistantTurnItemId,
                        threadId: turnInput.threadId,
                        runId: turnInput.runId,
                        nodeId: turnInput.rootNodeId,
                        providerThreadId: turnInput.providerThread.id,
                        providerTurnId,
                        nativeItemRef: null,
                        parentItemId: null,
                        ordinal: itemOrdinal,
                        status: "completed",
                        title: null,
                        startedAt: turnStartedAt,
                        completedAt: failTime,
                        updatedAt: failTime,
                        type: "assistant_message",
                        messageId: assistantMessageId,
                        text: cleanPartialText,
                        streaming: false,
                      },
                    });

                    yield* Queue.offer(eventsQueue, {
                      type: "provider_turn.updated",
                      driver: DRIVER,
                      providerTurn: {
                        id: providerTurnId,
                        providerThreadId: turnInput.providerThread.id,
                        nodeId: turnInput.rootNodeId,
                        runAttemptId: turnInput.attemptId,
                        nativeTurnRef: null,
                        ordinal: turnOrdinal,
                        status: "failed",
                        startedAt: turnStartedAt,
                        completedAt: failTime,
                      },
                    });

                    yield* Queue.offer(eventsQueue, {
                      type: "turn.terminal",
                      driver: DRIVER,
                      providerThreadId: turnInput.providerThread.id,
                      providerTurnId,
                      runOrdinal: PositiveInt.make(turnInput.runOrdinal),
                      failureItemOrdinal: PositiveInt.make(itemOrdinal + 1),
                      status: "failed",
                      failure: makeProviderFailure({
                        message,
                        class: "provider_error",
                      }),
                      threadDisposition: "reusable",
                    });
                  }),
                ),
              );

              currentTurnFiber = yield* Effect.forkDetach(runTurn);
            }),
          steerTurn: () => Effect.void,
          interruptTurn: () =>
            Effect.gen(function* () {
              if (currentTurnFiber) {
                yield* Fiber.interrupt(currentTurnFiber);
                currentTurnFiber = null;
              }
            }),
          respondToRuntimeRequest: () => Effect.void,
          readThreadSnapshot: (args) =>
            Effect.succeed({
              providerThread: args.providerThread,
              providerTurns: [],
              messages: [],
              runtimeRequests: [],
            }),
          rollbackThread: (args) =>
            Effect.succeed({
              providerThread: args.providerThread,
              providerTurns: [],
              messages: [],
              runtimeRequests: [],
            }),
          forkThread: (args) => Effect.succeed(args.sourceProviderThread),
        };

        return runtime;
      }),
  };
}

export function syncCustomProviderToOpenCode(
  instanceId: string,
  displayName: string,
  config: CustomDriverConfig,
): void {
  try {
    const cleanId = String(instanceId).trim();
    if (!cleanId) return;

    let baseUrl = (config.baseUrl ?? "").trim().replace(/\/+$/, "");
    if (!baseUrl) return;
    baseUrl = baseUrl.replace(/\/chat\/completions\/?$/i, "").replace(/\/+$/, "");
    if (baseUrl.includes("openrouter.ai")) {
      baseUrl = "https://openrouter.ai/api/v1";
    }

    const apiKey = (config.apiKey ?? "").trim() || "no-key";
    const modelsObj: Record<string, { name: string }> = {};

    if (config.models && Array.isArray(config.models)) {
      for (const m of config.models) {
        if (m.id) {
          const rawId = m.id.trim();
          const name = m.name?.trim() || rawId;
          modelsObj[rawId] = { name };

          // Aliases:
          // 1. Lowercase slug (spaces/underscores to dashes)
          const slug1 = rawId.toLowerCase().replace(/[\s_]+/g, "-");
          modelsObj[slug1] = { name };

          // 2. Dots to dashes: e.g. claude-sonnet-4.6 -> claude-sonnet-4-6
          const slug2 = slug1.replace(/\./g, "-");
          modelsObj[slug2] = { name };

          // 3. Dashes to dots: e.g. 4-6 -> 4.6
          const slug3 = slug1.replace(/-(\d+)-(\d+)/g, "-$1.$2");
          modelsObj[slug3] = { name };

          // 4. Strip prefix if present: e.g. "oc/claude-sonnet-4-6" -> "claude-sonnet-4-6"
          if (rawId.includes("/")) {
            const stripped = rawId.split("/").pop()!;
            modelsObj[stripped] = { name };
            const strippedSlug = stripped.toLowerCase().replace(/[\s_]+/g, "-");
            modelsObj[strippedSlug] = { name };
            modelsObj[strippedSlug.replace(/\./g, "-")] = { name };
          }

          // 5. If name is different from rawId, register name slugs too
          if (name !== rawId) {
            const nameSlug = name.toLowerCase().replace(/[\s_]+/g, "-");
            modelsObj[nameSlug] = { name };
            modelsObj[nameSlug.replace(/\./g, "-")] = { name };
          }
        }
      }
    }

    const headersObj: Record<string, string> = {};
    if (config.headers && Array.isArray(config.headers)) {
      for (const h of config.headers) {
        if (h && h.key && h.value) {
          headersObj[h.key] = h.value;
        }
      }
    }

    const providerEntry = {
      npm: "@ai-sdk/openai-compatible",
      name: displayName || cleanId,
      options: {
        baseURL: baseUrl,
        apiKey: apiKey,
        ...(Object.keys(headersObj).length > 0 ? { headers: headersObj } : {}),
      },
      models: Object.keys(modelsObj).length > 0 ? modelsObj : { default: { name: cleanId } },
    };

    const cleanName = displayName
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, "");

    const maskedKey =
      apiKey && apiKey !== "no-key"
        ? `${apiKey.slice(0, 7)}...${apiKey.slice(-4)}`
        : "(No API key)";

    registerCustomProviderLogMetadata(cleanId, {
      displayName: displayName || cleanId,
      baseUrl,
      apiKeyMasked: maskedKey,
    });
    if (cleanName && cleanName !== cleanId) {
      registerCustomProviderLogMetadata(cleanName, {
        displayName: displayName || cleanName,
        baseUrl,
        apiKeyMasked: maskedKey,
      });
    }

    const targetPaths = [
      "/root/all-ai-clis/third-party-provider/opencode.json",
      NodePath.join(NodeOS.homedir(), ".config/opencode/opencode.json"),
      NodePath.join(process.cwd(), "opencode.json"),
    ];

    for (const p of targetPaths) {
      try {
        const dir = NodePath.dirname(p);
        if (!NodeFS.existsSync(dir)) {
          NodeFS.mkdirSync(dir, { recursive: true });
        }
        let json: any = {
          $schema: "https://opencode.ai/config.json",
          permission: { "*": "allow" },
          provider: {},
        };
        if (NodeFS.existsSync(p)) {
          try {
            json = JSON.parse(NodeFS.readFileSync(p, "utf-8")) || json;
          } catch {}
        }
        if (!json.permission) {
          json.permission = { "*": "allow" };
        }
        if (!json.provider) json.provider = {};
        json.provider[cleanId] = providerEntry;
        if (cleanName && cleanName !== cleanId) {
          json.provider[cleanName] = providerEntry;
        }
        NodeFS.writeFileSync(p, JSON.stringify(json, null, 2), "utf-8");
      } catch {
        // ignore
      }
    }
  } catch (err) {
    console.error("Failed to sync custom provider to opencode.json:", err);
  }
}

export function createCustomProviderInstance(
  input: ProviderDriverCreateInput<CustomDriverConfig>,
): ProviderInstance {
  const continuationIdentity = defaultProviderContinuationIdentity({
    driverKind: DRIVER,
    instanceId: input.instanceId,
  });
  const displayName = input.displayName ?? "Custom Provider";
  syncCustomProviderToOpenCode(String(input.instanceId), displayName, input.config);
  const rawSnapshot = makeCustomSnapshot(
    input.instanceId,
    displayName,
    input.config,
    input.enabled,
  );
  const snapshot = makeCustomServerProviderShape(rawSnapshot);
  const orchestrationAdapter = makeCustomAdapterV2(input.instanceId, input.config);
  const textGeneration = makeUnsupportedTextGeneration();

  return {
    instanceId: input.instanceId,
    driverKind: DRIVER,
    continuationIdentity,
    displayName,
    accentColor: input.accentColor,
    enabled: input.enabled,
    snapshot,
    // The custom endpoint has no skill runtime, so the workspace snapshot
    // carries the skills T3 discovered on disk. The composer lists them and
    // `$name` mentions dispatch through the request builder.
    snapshotForCwd: (cwd: string) =>
      Effect.sync(() => ({
        ...rawSnapshot,
        skills: discoverCustomSkills(cwd),
      })),
    orchestrationAdapter,
    textGeneration,
  } satisfies ProviderInstance;
}

// In-memory fallback registry for custom provider instances
const fallbackInstances = new Map<string, ProviderInstance>();
const fallbackParams = new Map<string, any>();

function getCustomProvidersFilePath(): string {
  const procEnv = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
    ?.env;
  let baseDir = procEnv?.T3CODE_HOME;
  if (!baseDir) {
    try {
      if (NodeFS.existsSync("/root/autojobs/data")) {
        NodeFS.accessSync("/root/autojobs/data", NodeFS.constants.W_OK);
        baseDir = "/root/autojobs/data";
      }
    } catch {}
  }
  if (!baseDir) {
    baseDir = NodePath.join(NodeOS.homedir(), ".autojobs/data");
  }
  const userDir = NodePath.resolve(baseDir, "userdata");
  try {
    if (!NodeFS.existsSync(userDir)) {
      NodeFS.mkdirSync(userDir, { recursive: true });
    }
  } catch {}
  return NodePath.resolve(userDir, "custom-providers-cache.json");
}

function saveCustomProvidersToDisk(): void {
  try {
    const filePath = getCustomProvidersFilePath();
    const list = Array.from(fallbackParams.values()).map((p) => {
      const rawId = p.instanceId || p.id || `custom_${Date.now()}`;
      const strId = String(rawId);
      const cleanId = strId.startsWith("custom_") ? strId : `custom_${strId}`;
      const name = p.name || p.displayName || "Custom Provider";
      return {
        ...p,
        instanceId: cleanId,
        id: cleanId,
        displayName: name,
        name,
      };
    });
    NodeFS.writeFileSync(filePath, JSON.stringify(list, null, 2), "utf-8");
  } catch (err) {
    console.error("Failed saving custom providers to disk:", err);
  }
}

function loadPersistedCustomProviders(): void {
  try {
    const filePath = getCustomProvidersFilePath();
    if (NodeFS.existsSync(filePath)) {
      const content = NodeFS.readFileSync(filePath, "utf-8");
      const list = JSON.parse(content);
      if (Array.isArray(list)) {
        for (const p of list) {
          if (p && (p.instanceId || p.id)) {
            registerFallbackCustomProvider(
              {
                instanceId: p.instanceId || p.id,
                displayName: p.displayName || p.name,
                baseUrl: p.baseUrl || "",
                apiKey: p.apiKey,
                headers: p.headers,
                models: p.models,
                enabled: p.enabled,
              },
              false,
            );
          }
        }
      }
    }
  } catch (err) {
    console.error("Failed loading persisted custom providers:", err);
  }
}

export function registerFallbackCustomProvider(
  params: {
    instanceId: string;
    displayName?: string | undefined;
    baseUrl: string;
    apiKey?: string | undefined;
    headers?: Array<CustomHeaderConfig> | undefined;
    models?: Array<CustomModelConfig> | undefined;
    enabled?: boolean | undefined;
  },
  shouldPersist = true,
): ProviderInstance {
  const rawId = params.instanceId || (params as any).id || `custom_${Date.now()}`;
  const strId = String(rawId);
  const cleanId = strId.startsWith("custom_") ? strId : `custom_${strId}`;
  const displayName = params.displayName ?? (params as any).name ?? "Custom Provider";
  const instanceId = ProviderInstanceId.make(cleanId);
  const instance = createCustomProviderInstance({
    instanceId,
    displayName,
    enabled: params.enabled ?? true,
    environment: [],
    config: {
      baseUrl: params.baseUrl,
      apiKey: params.apiKey ?? "",
      headers: params.headers ?? [],
      models: params.models ?? [],
    },
  });
  fallbackInstances.set(cleanId, instance);
  fallbackInstances.set(strId, instance);
  fallbackParams.set(cleanId, {
    ...params,
    instanceId: cleanId,
    id: cleanId,
    displayName,
    name: displayName,
  });

  if (shouldPersist) {
    saveCustomProvidersToDisk();
  }

  return instance;
}

export function unregisterFallbackCustomProvider(id: string): void {
  if (!id) return;
  const strId = String(id);
  const cleanId = strId.startsWith("custom_") ? strId : `custom_${strId}`;
  fallbackInstances.delete(cleanId);
  fallbackInstances.delete(strId);
  fallbackParams.delete(cleanId);
  fallbackParams.delete(strId);
  saveCustomProvidersToDisk();
}

export function getFallbackCustomInstance(
  instanceId: ProviderInstanceId | string,
): ProviderInstance | undefined {
  return fallbackInstances.get(String(instanceId));
}

export function listFallbackCustomInstanceIds(): string[] {
  return Array.from(fallbackInstances.keys()).filter((k) => k.startsWith("custom_"));
}

// Load persisted custom providers on startup
loadPersistedCustomProviders();

export const CustomDriver: AnyProviderDriver<OpenCodeDriverEnv> = {
  driverKind: DRIVER,
  metadata: { displayName: "Custom Provider", supportsMultipleInstances: true },
  configSchema: CustomDriverSettingsSchema,
  defaultConfig: () => decodeCustomSettings({}),
  create: (input) =>
    Effect.gen(function* () {
      const openCodeRuntime = yield* OpenCodeRuntime.OpenCodeRuntime;
      const httpClient = yield* HttpClient.HttpClient;
      const host = yield* ProviderHost.ProviderHost;
      const processEnv = mergeProviderInstanceEnvironment(input.environment);

      const displayName = input.displayName ?? "Custom Provider";
      syncCustomProviderToOpenCode(String(input.instanceId), displayName, input.config);

      const continuationIdentity = defaultProviderContinuationIdentity({
        driverKind: DRIVER,
        instanceId: input.instanceId,
      });

      const rawSnapshot = makeCustomSnapshot(
        input.instanceId,
        displayName,
        input.config,
        input.enabled,
      );
      const snapshot = makeCustomServerProviderShape(rawSnapshot);
      const textGeneration = makeUnsupportedTextGeneration();

      let orchestrationAdapter: ProviderAdapterV2Shape;
      try {
        const openCode2Server = yield* OpenCode2Server.make({
          binaryPath: "",
          serverUrl: "http://127.0.0.1:4099",
          serverPassword: "",
          directory: host.paths.cwd,
          environment: processEnv,
        }).pipe(
          Effect.provideService(OpenCodeRuntime.OpenCodeRuntime, openCodeRuntime),
          Effect.provideService(
            OpenCode2Client.OpenCode2Client,
            yield* OpenCode2Client.make.pipe(
              Effect.provideService(HttpClient.HttpClient, httpClient),
            ),
          ),
        );

        orchestrationAdapter = yield* OpenCode2AdapterV2.make(input.instanceId, DRIVER).pipe(
          Effect.provideService(OpenCode2Server.OpenCode2Server, openCode2Server),
        );
      } catch (adapterErr) {
        orchestrationAdapter = makeCustomAdapterV2(input.instanceId, input.config);
      }

      const instance: ProviderInstance = {
        instanceId: input.instanceId,
        driverKind: DRIVER,
        continuationIdentity,
        displayName,
        accentColor: input.accentColor,
        enabled: input.enabled,
        snapshot,
        snapshotForCwd: (cwd: string) =>
          Effect.sync(() => ({
            ...rawSnapshot,
            skills: discoverCustomSkills(cwd),
          })),
        orchestrationAdapter,
        textGeneration,
      };

      fallbackInstances.set(String(input.instanceId), instance);
      fallbackInstances.set(String(input.instanceId).replace(/^custom_/, ""), instance);
      return instance;
    }),
};
