// @effect-diagnostics globalDateInEffect:off globalRandomInEffect:off nodeBuiltinImport:off globalTimers:off globalTimersInEffect:off preferSchemaOverJson:off globalDate:off globalFetchInEffect:off globalFetch:off globalConsoleInEffect:off
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import * as NodeOS from "node:os";
import { executeSubagentTool } from "../../../../engine/runtimes/opencode-full-engine/index.ts";
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
    onLog?.(`⚡ OpenCode Full Engine (native subagents) active. Running in worktree (${model})...`);

    // Native engine subagent replaces the old DeepSeek-specific worker harness.
    // The engine owns session tracking, parentID depth, tool execution and
    // model override; this bridge only maps the result to the watchdog contract.
    const modelToUse =
      model && model !== "default"
        ? model
        : process.env.SUPER_AGENT_WORKER_MODEL || "opencode/beam-free";
    const result = await executeSubagentTool(
      {
        agent: "build",
        description: taskTitle,
        prompt,
        model: modelToUse,
        readOnly,
        abortCheck: opts.abortCheck,
        onLog,
      },
      worktreePath,
    );

    if (result.status === "aborted") {
      return {
        ok: false,
        filesModified: [],
        outputSummary: "Task aborted by user — execution stopped before completion.",
        error: "Aborted by user",
      };
    }

    return {
      ok: result.status === "completed",
      filesModified: result.filesModified,
      outputSummary:
        result.status === "completed"
          ? `OpenCode Full Engine native subagent ${result.sessionID} executed task across ${result.filesModified.length} files.`
          : `OpenCode Full Engine subagent ${result.status}: ${result.error || result.output}`,
      modelOutput: result.output,
      ...(result.error ? { error: result.error } : {}),
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
