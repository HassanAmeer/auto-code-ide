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
  taskTitle: string;
  prompt: string;
  model: string;
  onLog?: (msg: string) => void;
  /** Cooperative abort — when it starts returning true, unfinished writes/steps are skipped. */
  abortCheck?: (() => boolean) | undefined;
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
    let llmErrorMessage: string | null = null;
    try {
      const bypassMod = await import(
        "../../../../opencode-bypass-api/src/server/bypass/client.ts" as string
      );
      const bypassChat = bypassMod.bypassChat;

      const codingSkillsPrompt = getProjectChatEngineSkillPrompt(worktreePath);
      const systemMsg = [
        "You are an autonomous AI coding subagent within an isolated Git worktree.",
        "Your task is to write real, production-ready, clean code without placeholder comments.",
        codingSkillsPrompt || "",
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

      const response = await bypassChat({
        model: modelToUse,
        messages: [
          { role: "system", content: systemMsg },
          {
            role: "user",
            content: `[PROJECT: ${projectName} in ${worktreePath}]\nTask: ${taskTitle}\n\nRequirements:\n${prompt}\n\nPlease generate full implementation files.`,
          },
        ],
        maxTokens: 4096,
      });

      if (opts.abortCheck?.()) {
        onLog?.("⛔ Aborted by user — response discarded, no files written.");
        return abortedResult();
      }

      if (response && response.content) {
        onLog?.(
          `✓ DeepSeek response received (${response.content.length} chars). Parsing files...`,
        );

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
              executeWriteTool({ path: rawRelPath, content: fileContent }, worktreePath);
              filesWrittenCount++;
              onLog?.(`   📝 Generated: ${rawRelPath}`);
            } catch (wErr: any) {
              onLog?.(`   ⚠️ Write error for ${rawRelPath}: ${wErr?.message}`);
            }
          }
        }

        // If no file blocks matched but raw HTML is present
        if (filesWrittenCount === 0 && /<!DOCTYPE\s+html>/i.test(response.content)) {
          const htmlMatch = response.content.match(/<!DOCTYPE html>[\s\S]*?<\/html>/i);
          if (htmlMatch) {
            executeWriteTool({ path: "index.html", content: htmlMatch[0] }, worktreePath);
            filesWrittenCount++;
            onLog?.(`   📝 Generated: index.html (from full HTML document)`);
          }
        }
      }
    } catch (llmErr: any) {
      llmErrorMessage = llmErr?.message || String(llmErr);
      onLog?.(`⚠️ Model execution failed: ${llmErrorMessage || "unknown error"}.`);
    }

    const indexPath = NodePath.join(worktreePath, "index.html");
    if (opts.abortCheck?.()) {
      onLog?.("⛔ Aborted by user — execution stopped.");
      return abortedResult();
    }
    if (filesWrittenCount === 0 && llmErrorMessage) {
      // The model failed and produced nothing — never fabricate a starter file.
      return {
        ok: false,
        filesModified: [],
        outputSummary: `Model execution failed: ${llmErrorMessage}`,
        error: llmErrorMessage,
      };
    }

    const finalFiles = executeGlobTool({ pattern: "**/*" }, worktreePath);
    return {
      ok: true,
      filesModified: finalFiles,
      outputSummary: `OpenCode Full Engine (Standalone) executed task across ${finalFiles.length} files.`,
    };
  }

  // 2. EXTERNAL CLI ADAPTER (opencode-adapter)
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
        await fetch(`${activeBase}/session/${sessionId}/prompt`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: activeAuth },
          body: JSON.stringify({
            text: fullPromptText,
          }),
          signal: AbortSignal.timeout(45000),
        }).catch(() => null);

        const files = NodeFS.existsSync(worktreePath) ? NodeFS.readdirSync(worktreePath) : [];
        return {
          ok: true,
          sessionId,
          filesModified: files,
          outputSummary: `OpenCode CLI Adapter executed task in worktree across ${files.length} files.`,
        };
      }
    } catch (err: any) {
      onLog?.(`ℹ️ OpenCode CLI daemon notice: ${err?.message || "fallback to local generator"}.`);
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
