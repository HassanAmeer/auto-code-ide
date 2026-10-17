/**
 * CodexEngine — Lightweight, zero-login Autonomous Coding Engine for AutoCode (T3 Web).
 *
 * Provides:
 * 1. Automatic project tree discovery (prevents hallucinating missing files).
 * 2. On-demand inspection of existing code (so models know what to edit).
 * 3. Targeted SEARCH/REPLACE diff patching + full file write handling.
 * 4. Persistent token-pruned conversation memory (prevents context overflow & forgetting).
 * 5. 100% compatible with any model (OpenRouter, DeepSeek, Llama, GLM, OpenAI, custom keys).
 *
 * @module codexengine
 */

import { scanWorkspace, type WorkspaceScanResult } from "./workspaceScanner.ts";
import { inspectRelevantFiles, type FileInspectionResult } from "./fileInspector.ts";
import { applyModelOutput, type PatchEngineResult } from "./patchEngine.ts";
import {
  getThreadHistory,
  appendTurnToHistory,
  injectHistoricalMessages,
  type ChatMessage,
} from "./contextMemory.ts";
import { buildTurnContext, type PreparedTurnContext } from "./promptBuilder.ts";

export class CodexEngine {
  /**
   * Prepares the full prompt payload for an LLM turn:
   * - Scans the project workspace directory
   * - Reads existing files relevant to the user request
   * - Pulls pruned, persistent history so the model remembers past turns without token explosion
   */
  static prepareTurn(params: {
    workspaceRoot: string;
    userPrompt: string;
    threadKey: string;
  }): PreparedTurnContext {
    return buildTurnContext(params);
  }

  /**
   * Processes the model's raw streaming/accumulated output:
   * - Extracts & applies SEARCH/REPLACE diff patches to existing files
   * - Extracts & saves full new files to the workspace
   * - Updates persistent pruned conversation memory
   * - Returns summary markdown and file change details
   */
  static processTurnOutput(params: {
    markdown: string;
    workspaceRoot: string;
    userPrompt: string;
    threadKey: string;
    defaultTargetFile?: string | undefined;
  }): {
    readonly changes: PatchEngineResult["changes"];
    readonly finalText: string;
    readonly summaryMarkdown: string;
  } {
    const { markdown, workspaceRoot, userPrompt, threadKey, defaultTargetFile } = params;

    // 1. Apply file diffs & writes
    const patchResult = applyModelOutput(markdown, workspaceRoot, defaultTargetFile);

    // 2. Prepare final text with clean workspace updates summary
    let finalText = markdown;
    if (patchResult.summaryMarkdown) {
      finalText += patchResult.summaryMarkdown;
    }

    // 3. Persist turn to thread memory
    appendTurnToHistory(threadKey, userPrompt, finalText);

    return {
      changes: patchResult.changes,
      finalText,
      summaryMarkdown: patchResult.summaryMarkdown,
    };
  }

  /**
   * Injects historical messages (e.g. from T3 orchestration handoffs) into persistent memory.
   */
  static injectHistory(
    threadKey: string,
    messages: Array<{ role: string; content?: string; text?: string }>,
    systemContext?: string,
  ): void {
    injectHistoricalMessages(threadKey, messages, systemContext);
  }

  /**
   * Directly scans the project workspace tree.
   */
  static scan(workspaceRoot: string): WorkspaceScanResult {
    return scanWorkspace(workspaceRoot);
  }

  /**
   * Directly inspects project files relevant to a prompt.
   */
  static inspect(
    workspaceRoot: string,
    userPrompt: string,
    availableFiles: string[],
  ): FileInspectionResult {
    return inspectRelevantFiles(workspaceRoot, userPrompt, availableFiles);
  }
}

export * from "./workspaceScanner.ts";
export * from "./fileInspector.ts";
export * from "./patchEngine.ts";
export * from "./contextMemory.ts";
export * from "./promptBuilder.ts";
