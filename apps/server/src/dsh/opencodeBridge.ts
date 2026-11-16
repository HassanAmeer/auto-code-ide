// @effect-diagnostics globalDateInEffect:off globalRandomInEffect:off nodeBuiltinImport:off globalTimers:off globalTimersInEffect:off preferSchemaOverJson:off globalDate:off globalFetchInEffect:off globalFetch:off globalConsoleInEffect:off
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import * as NodeOS from "node:os";
import {
  executeWriteTool,
  executeEditTool,
  executePatchTool,
  executeShellTool,
  executeReadTool,
  executeGlobTool,
} from "../../../../engine/runtimes/opencode-full-engine/index.ts";
import { getProjectChatEngineSkillPrompt } from "@t3tools/shared/superpowerSkills";

export interface OpenCodeExecutionResult {
  ok: boolean;
  sessionId?: string | undefined;
  filesModified: string[];
  outputSummary: string;
  /** Full model response when available (used by strict semantic verification). */
  modelOutput?: string | undefined;
  error?: string | undefined;
}

/**
 * Resolves the active engine setting persisted in App Settings (app-settings.json or SQLite).
 */
export function getActiveCoreEngine(): string {
  try {
    const autocodeHome = process.env.AUTOCODE_HOME?.trim();
    const t3Home = process.env.T3CODE_BASE_DIR?.trim();
    const candidateDirs = [
      ...(autocodeHome ? [NodePath.join(autocodeHome, "userdata"), autocodeHome] : []),
      ...(t3Home ? [NodePath.join(t3Home, "userdata"), t3Home] : []),
      "/root/autojobs/data/userdata",
      "/root/autojobs/data",
      NodePath.join(NodeOS.homedir(), ".autocode", "userdata"),
      NodePath.join(NodeOS.homedir(), ".autocode"),
      NodePath.join(process.cwd(), "data/userdata"),
      NodePath.join(process.cwd(), "data"),
    ];
    for (const dir of candidateDirs) {
      const jsonPath = NodePath.join(dir, "app-settings.json");
      if (NodeFS.existsSync(jsonPath)) {
        const raw = NodeFS.readFileSync(jsonPath, "utf8");
        const json = JSON.parse(raw);
        if (json?.active_core_engine) {
          return String(json.active_core_engine);
        }
      }
    }
  } catch (engineReadError) {
    console.warn(
      "[dsh] Failed to read active_core_engine from app-settings.json, defaulting to opencode-full-engine:",
      engineReadError,
    );
  }
  return "opencode-full-engine";
}

/**
 * Dispatches a coding task to either the internal standalone runtime or the external CLI adapter based on active settings.
 */
export async function executeOpenCodeTask(opts: {
  worktreePath: string;
  projectName: string;
  /** Project root — used to keep the system prompt identical across workers. */
  projectRoot?: string | undefined;
  taskTitle: string;
  prompt: string;
  model: string;
  onLog?: (msg: string) => void;
  /** Cooperative abort — when it starts returning true, unfinished writes/steps are skipped. */
  abortCheck?: (() => boolean) | undefined;
  readOnly?: boolean | undefined;
}): Promise<OpenCodeExecutionResult> {
  const { worktreePath, projectName, taskTitle, prompt, model, onLog } = opts;
  const abortedResult = (): OpenCodeExecutionResult => ({
    ok: false,
    filesModified: [],
    outputSummary: "Task aborted by user — execution stopped before completion.",
    error: "Aborted by user",
  });
  if (opts.abortCheck?.()) {
    onLog?.("⛔ Aborted by user before execution — nothing written.");
    return abortedResult();
  }
  const activeEngine = getActiveCoreEngine();
  const readOnly = opts.readOnly ?? taskTitle === "Verify requirements";

  // 1. STANDALONE EMBEDDED ENGINE (opencode-full-engine)
  // Zero external port dependencies, zero background daemons, 100% internal tool execution
  if (activeEngine === "opencode-full-engine") {
    onLog?.(
      `⚡ OpenCode Full Engine (Standalone Embedded) active. Running internal tools in worktree (${model})...`,
    );

    const existingFiles = executeGlobTool({ pattern: "**/*" }, worktreePath);
    onLog?.(`📂 Scanned ${existingFiles.length} files in worktree.`);

    // Honor the caller's explicit model; the DeepSeek gateway model is only a
    // fallback when nothing is configured (or a custom SUPER_AGENT_WORKER_MODEL
    // is set). Never silently swap a configured model.
    const modelToUse =
      model && model !== "default"
        ? model
        : process.env.SUPER_AGENT_WORKER_MODEL || "deepseek-v4.1-flash-free";
    onLog?.(
      `⚡ Standalone Engine: Invoking DeepSeek Harness model (${modelToUse}) for real code synthesis...`,
    );

    let filesWrittenCount = 0;
    let streamedContent = "";
    const modifiedFiles = new Set<string>();
    const readFiles = new Set<string>();
    const resolveFile = (path: string) => {
      const full = NodePath.resolve(worktreePath, path);
      const relative = NodePath.relative(worktreePath, full);
      if (
        relative.startsWith("..") ||
        NodePath.isAbsolute(relative) ||
        relative.split(NodePath.sep).includes(".git")
      ) {
        throw new Error("Tool path must stay inside the worktree");
      }
      let ancestor = full;
      while (!NodeFS.existsSync(ancestor)) ancestor = NodePath.dirname(ancestor);
      const realRelative = NodePath.relative(
        NodeFS.realpathSync(worktreePath),
        NodeFS.realpathSync(ancestor),
      );
      if (realRelative.startsWith("..") || NodePath.isAbsolute(realRelative))
        throw new Error("Tool path escapes worktree through symlink");
      return full;
    };
    let llmErrorMessage: string | null = null;
    // Bridge the watchdog's cooperative `abortCheck` to a real AbortSignal so
    // the upstream stream is cancelled at the socket, not just flagged after it
    // finishes. The poll interval keeps the contract identical for callers that
    // only know about `abortCheck`.
    const abortController = new AbortController();
    const abortPoll = setInterval(() => {
      if (opts.abortCheck?.()) abortController.abort(new Error("Stopped by user"));
    }, 250);
    try {
      // Skills come from the PROJECT root (not the worktree) so the system
      // prompt is identical for every worker — that is what lets the provider
      // cache the prefix instead of re-processing it per worker.
      const codingSkillsPrompt = getProjectChatEngineSkillPrompt(opts.projectRoot ?? worktreePath);
      const systemMsg = [
        "You are an autonomous AI coding subagent within an isolated Git worktree.",
        "Your task is to write real, production-ready, clean code without placeholder comments.",
        codingSkillsPrompt || "",
        "Inspect existing files before editing. Preserve surrounding code. Never replace an existing file with a generated full-file block.",
        'To read or edit, emit a JSON block: ```tool:read {"path":"src/app.ts"} ``` or ```tool:edit {"path":"src/app.ts","oldString":"exact old text","newString":"replacement"} ``` (put JSON on the next line). Tool results arrive in the next message.',
        readOnly
          ? "Read-only verification: do not write code or call edit. Return PASS or FAIL on the first line when finished."
          : "Use filepath blocks only to create NEW files; use tool:edit for existing files.",
        "When outputting code, enclose each file inside a markdown block with the relative file path like:",
        "```filepath:src/index.ts",
        "// file contents here",
        "```",
        "Or for web apps with single page, provide full HTML in:",
        "```filepath:index.html",
        "<!DOCTYPE html>...",
        "```",
      ]
        .filter(Boolean)
        .join("\n\n");

      // Stream the model output so the watchdog card shows live progress
      // instead of a frozen spinner. The system prompt stays byte-identical
      // across workers so the gateway can serve it from its prompt cache.
      const messages = [
        { role: "system" as const, content: systemMsg },
        {
          role: "user" as const,
          content: `[PROJECT: ${projectName} in ${worktreePath}]\nTask: ${taskTitle}\n\nRequirements:\n${prompt}\n\nFiles:\n${existingFiles.slice(0, 500).join("\n")}\n\n${readOnly ? "Verify only; do not modify files." : "Read existing files and apply targeted edits; create new files only where needed."}`,
        },
      ];

      let streamedChars = 0;
      let lastReport = 0;
      const bypassStreamMod = await import(
        "../../../../opencode-bypass-api/src/server/bypass/client.ts" as string
      );
      for (let step = 0; step < 12; step++) {
        if (opts.abortCheck?.()) return abortedResult();
        streamedContent = "";
        await bypassStreamMod.bypassChatStream(
          {
            model: modelToUse,
            messages,
            maxTokens: Number(process.env.SUPER_AGENT_MAX_TOKENS || 16384),
            signal: abortController.signal,
          },
          (chunk: string) => {
            streamedContent += chunk;
            streamedChars += chunk.length;
            if (streamedChars - lastReport >= 400) {
              lastReport = streamedChars;
              onLog?.(`   ⏳ streaming… ${streamedChars} chars`);
            }
          },
        );
        const calls = [...streamedContent.matchAll(/```tool:(read|edit)\s*\n([\s\S]*?)```/g)];
        if (calls.length === 0) break;
        const results: string[] = [];
        for (const call of calls) {
          if (opts.abortCheck?.()) return abortedResult();
          const input = JSON.parse(call[2]!) as {
            path: string;
            oldString: string;
            newString: string;
          };
          const full = resolveFile(input.path);
          if (call[1] === "read") {
            const result = executeReadTool({ path: input.path, limit: 2000 }, worktreePath);
            if (!result.truncated) readFiles.add(full);
            results.push(`${input.path}:\n${result.content}`);
          } else {
            if (readOnly) throw new Error("Verifier cannot modify files");
            if (!readFiles.has(full)) throw new Error("Read the complete file before editing it");
            executeEditTool(input, worktreePath);
            modifiedFiles.add(input.path);
            filesWrittenCount++;
            results.push(`Edited ${input.path}`);
          }
        }
        messages.push({
          role: "user",
          content: `Previous tool requests:\n${streamedContent}\n\nTool results:\n${results.join("\n")}\nContinue or give your final response.`,
        });
        if (step === 11) throw new Error("Worker tool step limit reached");
      }

      if (opts.abortCheck?.()) {
        onLog?.("⛔ Aborted by user — response discarded, no files written.");
        return abortedResult();
      }

      const response = { content: streamedContent };

      if (!readOnly && response && response.content) {
        onLog?.(`✓ Response received (${response.content.length} chars). Parsing files...`);

        // Match ```filepath:relative/path/file.ext or ```path/to/file.ext
        const fileBlockRegex =
          /```(?:filepath:)?([a-zA-Z0-9_\-./\\]+\.[a-zA-Z0-9]+)\n([\s\S]*?)```/g;
        let match;
        while ((match = fileBlockRegex.exec(response.content)) !== null) {
          if (opts.abortCheck?.()) {
            onLog?.("⛔ Aborted by user — stopping file writes.");
            return abortedResult();
          }
          const rawRelPath = match[1]?.trim();
          const fileContent = match[2];
          if (
            rawRelPath &&
            fileContent &&
            !rawRelPath.startsWith("http") &&
            !["json", "js", "ts", "tsx", "html", "css", "bash", "sh"].includes(
              rawRelPath.toLowerCase(),
            )
          ) {
            try {
              const full = resolveFile(rawRelPath);
              if (NodeFS.existsSync(full))
                throw new Error("Use a targeted edit for existing files");
              executeWriteTool({ path: rawRelPath, content: fileContent }, worktreePath);
              modifiedFiles.add(rawRelPath);
              filesWrittenCount++;
              onLog?.(`   📝 Generated: ${rawRelPath}`);
            } catch (wErr: any) {
              throw new Error(`Write error for ${rawRelPath}: ${wErr?.message}`);
            }
          }
        }

        // If no file blocks matched but raw HTML is present
        if (filesWrittenCount === 0 && /<!DOCTYPE\s+html>/i.test(response.content)) {
          const htmlMatch = response.content.match(/<!DOCTYPE html>[\s\S]*?<\/html>/i);
          if (htmlMatch) {
            if (NodeFS.existsSync(resolveFile("index.html")))
              throw new Error("Use a targeted edit for existing index.html");
            executeWriteTool({ path: "index.html", content: htmlMatch[0] }, worktreePath);
            modifiedFiles.add("index.html");
            filesWrittenCount++;
            onLog?.(`   📝 Generated: index.html (from full HTML document)`);
          }
        }
      }
    } catch (llmErr: any) {
      llmErrorMessage = llmErr?.message || String(llmErr);
      onLog?.(`⚠️ Model execution failed: ${llmErrorMessage || "unknown error"}.`);
    } finally {
      clearInterval(abortPoll);
    }

    if (opts.abortCheck?.()) {
      onLog?.("⛔ Aborted by user — execution stopped.");
      return abortedResult();
    }
    if (llmErrorMessage) {
      // A failed tool/model step must not turn partial output into success.
      return {
        ok: false,
        filesModified: [],
        outputSummary: `Model execution failed: ${llmErrorMessage}`,
        error: llmErrorMessage,
      };
    }

    const finalFiles = [...modifiedFiles];
    return {
      ok: true,
      filesModified: finalFiles,
      outputSummary: `OpenCode Full Engine (Standalone) executed task across ${finalFiles.length} files.`,
      modelOutput: streamedContent,
    };
  }

  // 2. EXTERNAL CLI ADAPTER (opencode-adapter)
  if (activeEngine !== "opencode-adapter")
    return {
      ok: false,
      filesModified: [],
      outputSummary: "Unsupported core engine",
      error: `Unsupported core engine: ${activeEngine}`,
    };
  // Only runs when explicitly enabled in settings. Detects port and uses standard /prompt endpoint.
  onLog?.(`🚀 OpenCode External CLI Adapter active. Discovering running daemon port...`);

  if (opts.abortCheck?.()) {
    onLog?.("⛔ Aborted by user — CLI adapter not started.");
    return abortedResult();
  }

  let detectedPort = 4099;
  let detectedPassword =
    process.env.OPENCODE_SERVER_PASSWORD || process.env.OPENCODE_PASSWORD || "autocode123";

  try {
    const serversDir = NodeFS.existsSync("/root/autojobs/data/userdata/opencode-servers")
      ? "/root/autojobs/data/userdata/opencode-servers"
      : NodeFS.existsSync("/root/autojobs/data/opencode-servers")
        ? "/root/autojobs/data/opencode-servers"
        : null;

    if (serversDir && NodeFS.existsSync(serversDir)) {
      const files = NodeFS.readdirSync(serversDir).filter((f) => f.endsWith(".json"));
      files.sort((a, b) => {
        try {
          return (
            NodeFS.statSync(NodePath.join(serversDir, b)).mtimeMs -
            NodeFS.statSync(NodePath.join(serversDir, a)).mtimeMs
          );
        } catch {
          return 0;
        }
      });
      const firstFile = files[0];
      if (firstFile) {
        const sInfo = JSON.parse(NodeFS.readFileSync(NodePath.join(serversDir, firstFile), "utf8"));
        if (sInfo.port) detectedPort = Number(sInfo.port);
        if (sInfo.pid && NodeFS.existsSync(`/proc/${sInfo.pid}/environ`)) {
          try {
            const envStr = NodeFS.readFileSync(`/proc/${sInfo.pid}/environ`, "utf8");
            const m = envStr.match(/OPENCODE_PASSWORD=([^\0]+)/);
            if (m && m[1]) detectedPassword = m[1];
          } catch {}
        }
      }
    }
  } catch {}

  const candidatePorts = [detectedPort, 4099, 45991].filter((p, i, a) => a.indexOf(p) === i);
  let activeBase = "";
  let activeAuth = "Basic " + Buffer.from(`opencode:${detectedPassword}`).toString("base64");

  for (const cp of candidatePorts) {
    try {
      const checkRes = await fetch(`http://127.0.0.1:${cp}/api/session`, {
        headers: { Authorization: activeAuth },
        signal: AbortSignal.timeout(2000),
      });
      if (checkRes.status === 200 || checkRes.status === 401) {
        activeBase = `http://127.0.0.1:${cp}/api`;
        break;
      }
    } catch {}
  }

  if (activeBase) {
    try {
      onLog?.(`⚡ OpenCode daemon connected on ${activeBase}. Creating session...`);
      const sRes = await fetch(`${activeBase}/session`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: activeAuth },
        body: JSON.stringify({
          title: `Harness Worker: ${taskTitle.slice(0, 40)}`,
        }),
        signal: AbortSignal.timeout(10000),
      });
      const sData = (await sRes.json().catch(() => null)) as any;
      const sessionId = sData?.data?.id || sData?.id;

      if (sessionId) {
        onLog?.(`💻 OpenCode Session [${sessionId}] active. Prompting task...`);
        const codingSkillsPrompt = getProjectChatEngineSkillPrompt(worktreePath);
        const fullPromptText = prompt.includes("SUPERVISOR-TO-WORKER TASK ENVELOPE")
          ? [...(codingSkillsPrompt ? [codingSkillsPrompt, ""] : []), prompt].join("\n")
          : [
              `[PROJECT: ${projectName} in ${worktreePath}]`,
              `Task: ${taskTitle}`,
              ...(codingSkillsPrompt ? ["", codingSkillsPrompt] : []),
              "",
              `Requirements:`,
              prompt,
              "",
              `Please generate complete working code without placeholders.`,
            ].join("\n");

        // Standard endpoint: /prompt (replacing non-standard /turn)
        const promptResponse = await fetch(`${activeBase}/session/${sessionId}/prompt`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: activeAuth },
          body: JSON.stringify({
            text: readOnly
              ? `${fullPromptText}\nRead-only verification. Do not modify files.`
              : fullPromptText,
          }),
          signal: AbortSignal.timeout(45000),
        });
        if (!promptResponse.ok)
          throw new Error(`Adapter prompt failed: HTTP ${promptResponse.status}`);
        const reply = (await promptResponse.json()) as {
          data?: { parts?: Array<{ type: string; text?: string }> };
          parts?: Array<{ type: string; text?: string }>;
        };
        const modelOutput = (reply.data?.parts ?? reply.parts ?? [])
          .filter((part) => part.type === "text")
          .map((part) => part.text ?? "")
          .join("\n");
        if (opts.abortCheck?.()) return abortedResult();

        const files = NodeFS.existsSync(worktreePath) ? NodeFS.readdirSync(worktreePath) : [];
        return {
          ok: true,
          sessionId,
          filesModified: files,
          outputSummary: `OpenCode CLI Adapter executed task in worktree across ${files.length} files.`,
          modelOutput,
        };
      }
    } catch (err: any) {
      return {
        ok: false,
        filesModified: [],
        outputSummary: "OpenCode adapter task failed",
        error: err?.message ?? String(err),
      };
    }
  }

  // Daemon was not reachable — report an honest error, never fabricate files.
  return {
    ok: false,
    filesModified: [],
    outputSummary: "OpenCode daemon unreachable — task not executed.",
    error: "OpenCode external CLI adapter: no reachable daemon (ports 4099/45991).",
  };
}
