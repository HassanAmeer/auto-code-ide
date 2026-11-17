import { executeBash, readProjectFile, writeProjectFile, inspectPreviewEndpoint } from "./tools.ts";

export interface ClineStep {
  stepNumber: number;
  thought: string;
  toolCall?:
    | {
        name: "bash" | "readFile" | "writeFile" | "checkPreview";
        args: Record<string, any>;
      }
    | undefined;
  toolResult?: string | undefined;
  isComplete: boolean;
}

export interface ClineTaskRunOptions {
  taskPrompt: string;
  projectRoot: string;
  projectName: string;
  model: string;
  fallbackModels?: string[];
  maxSteps?: number;
  onStepUpdate?: (step: ClineStep) => void;
}

export interface ClineTaskResult {
  ok: boolean;
  steps: ClineStep[];
  summary: string;
  error?: string;
  modelUsed: string;
}

export const RECOMMENDED_FALLBACK_MODELS = [
  "gemini-2.5-flash",
  "beam-free",
  "deepseek-v4.1-flash-free",
  "glm-5.3-flash-free",
  "chat-free",
];

/**
 * Cline Autonomous Execution Loop:
 * 1. Takes a high-level goal from Supervisor
 * 2. Runs tool actions (terminal, write files, inspect)
 * 3. Checks if build or preview works
 * 4. Self-corrects any errors automatically
 *
 * The actual code-writing step is delegated to the active core engine
 * (in-process `opencode-full-engine` or the external adapter), which is the
 * only component that owns a real model + tool loop. Everything here is
 * orchestration: pre-flight checks, the engine call, and post-flight verify.
 */
export async function runClineAutonomousTask(
  options: ClineTaskRunOptions,
): Promise<ClineTaskResult> {
  const {
    taskPrompt,
    projectRoot,
    projectName,
    model: initialModel,
    fallbackModels = RECOMMENDED_FALLBACK_MODELS,
    maxSteps = 6,
    onStepUpdate,
  } = options;

  const currentModel = initialModel;
  const steps: ClineStep[] = [];

  // Step 1: Health check & directory scan
  const initialCheck = await executeBash("git status --short", projectRoot, 10000);
  const step1: ClineStep = {
    stepNumber: 1,
    thought: `Inspecting project "${projectName}" workspace before starting work on: "${taskPrompt}"`,
    toolCall: { name: "bash", args: { command: "git status --short" } },
    toolResult: initialCheck.ok ? initialCheck.output : initialCheck.error,
    isComplete: false,
  };
  steps.push(step1);
  onStepUpdate?.(step1);

  if (!taskPrompt || !taskPrompt.trim()) {
    return {
      ok: false,
      steps,
      summary: "No task prompt was provided, so nothing was executed.",
      error: "taskPrompt is required",
      modelUsed: currentModel,
    };
  }

  // Step 2: Execute the task through the active core engine (real model + tools).
  let engineResult: Awaited<ReturnType<typeof runEngineTask>> | null = null;
  try {
    engineResult = await runEngineTask({
      projectRoot,
      projectName,
      taskTitle: taskPrompt.slice(0, 80),
      prompt: taskPrompt,
      model: currentModel,
      onLog: (msg) => {
        const step: ClineStep = {
          stepNumber: steps.length + 1,
          thought: msg,
          toolCall: { name: "bash", args: { command: "" } },
          toolResult: msg,
          isComplete: false,
        };
        steps.push(step);
        onStepUpdate?.(step);
      },
    });
  } catch (engineErr: any) {
    const errStep: ClineStep = {
      stepNumber: steps.length + 1,
      thought: `Core engine execution failed: ${engineErr?.message || String(engineErr)}`,
      isComplete: true,
    };
    steps.push(errStep);
    onStepUpdate?.(errStep);
    return {
      ok: false,
      steps,
      summary: `Task could not be executed: ${engineErr?.message || String(engineErr)}`,
      error: engineErr?.message || String(engineErr),
      modelUsed: currentModel,
    };
  }

  const toolCall = engineResult;

  // Step 3: Verify the workspace actually changed / builds.
  const buildCheck = await executeBash("npm run build --if-present", projectRoot, 20000);
  const verifyStep: ClineStep = {
    stepNumber: steps.length + 1,
    thought: "Verifying workspace state after engine execution",
    toolCall: { name: "bash", args: { command: "npm run build --if-present" } },
    toolResult: buildCheck.ok
      ? "Build passed clean"
      : `Build issue detected: ${buildCheck.output || buildCheck.error}`,
    isComplete: true,
  };
  steps.push(verifyStep);
  onStepUpdate?.(verifyStep);

  const filesModified = toolCall?.filesModified ?? [];
  const summaryParts = [
    toolCall?.ok ? "✅ Engine executed the task." : "⚠️ Engine did not complete the task.",
    `• Task: "${taskPrompt}"`,
    `• Project: ${projectName}`,
    filesModified.length > 0
      ? `• Files modified: ${filesModified.join(", ")}`
      : "• Files modified: none reported",
    buildCheck.ok ? "• Post-run build: passed" : "• Post-run build: failed",
    toolCall?.error ? `• Error: ${toolCall.error}` : "",
    toolCall?.outputSummary ? `\n${toolCall.outputSummary.slice(0, 1500)}` : "",
  ].filter(Boolean);

  const result: ClineTaskResult = {
    ok: Boolean(toolCall?.ok),
    steps,
    summary: summaryParts.join("\n"),
    modelUsed: currentModel,
  };
  if (toolCall?.error) result.error = toolCall.error;
  return result;
}

interface EngineTaskResult {
  ok: boolean;
  filesModified: string[];
  outputSummary: string;
  error?: string | undefined;
}

/**
 * Calls the active core engine without hardcoding any port or daemon. The engine
 * setting (opencode-full-engine vs opencode-adapter) decides the transport.
 */
async function runEngineTask(args: {
  projectRoot: string;
  projectName: string;
  taskTitle: string;
  prompt: string;
  model: string;
  onLog?: (msg: string) => void;
}): Promise<EngineTaskResult> {
  // Native OpenCode engine subagent — no DeepSeek worker harness, no worktree.
  const { executeSubagentTool } = (await import(
    "../../engine/runtimes/opencode-full-engine/index.ts" as string
  )) as {
    executeSubagentTool: (
      input: any,
      cwd: string,
    ) => Promise<{
      status: string;
      filesModified: string[];
      output: string;
      error?: string;
    }>;
  };

  const result = await executeSubagentTool(
    {
      agent: "build",
      description: args.taskTitle,
      prompt: args.prompt,
      model: args.model,
      onLog: args.onLog,
    },
    args.projectRoot,
  );
  return {
    ok: result.status === "completed",
    filesModified: result.filesModified,
    outputSummary: result.output,
    ...(result.error ? { error: result.error } : {}),
  };
}
