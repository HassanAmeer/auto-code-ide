/**
 * Supervisor-to-Worker Task Envelope
 *
 * Inspired by OpenBot's typed handoff protocol.
 * Enforces structured task delegation from the Supervisor (Super Bot / Tech Lead)
 * to the Hands-On Worker Agent with strict task objectives, explicit rules/bounds,
 * operational context, and expected completion criteria.
 *
 * Prevents worker drift, hallucinations, and placeholder code.
 */

export interface SupervisorWorkerTaskEnvelope {
  /** The clear, atomic task objective or title */
  task: string;
  /** Strict rules, bounds, and constraints the worker must adhere to */
  rules: string[];
  /** Expected concrete deliverables and completion verification criteria */
  expectedOutput: string;
  /** Operational context (project name, branch, target path, focus files) */
  context?: {
    projectName?: string;
    targetPath?: string;
    framework?: string;
    focusFiles?: string[];
  };
}

export const DEFAULT_WORKER_RULES: readonly string[] = [
  "Deliver 100% complete, working code — NO placeholders, TODOs, or simulated mocks.",
  "Preserve multi-session code integrity; edit ONLY the relevant functions/files for this feature.",
  "Ensure valid HTML closing tags, clean syntax, and verified imports to prevent runtime or preview crashes.",
  "Maintain project framework conventions (e.g. Tailwind CSS, modern TypeScript/ES modules).",
  "Report exact modified files and verification status upon completion.",
];

export interface CreateTaskEnvelopeOptions {
  task: string;
  requirements?: string | string[];
  constraints?: string | string[];
  expectedOutput?: string;
  projectName?: string;
  targetPath?: string;
  framework?: string;
  focusFiles?: string[];
}

/**
 * Creates a strongly-typed task envelope with sane defaults and merged rules.
 */
export function createSupervisorWorkerEnvelope(
  options: CreateTaskEnvelopeOptions,
): SupervisorWorkerTaskEnvelope {
  const {
    task,
    requirements,
    constraints,
    expectedOutput,
    projectName,
    targetPath,
    framework,
    focusFiles,
  } = options;

  const userRules: string[] = [];

  if (requirements) {
    const reqList = Array.isArray(requirements) ? requirements : [requirements];
    for (const r of reqList) {
      const trimmed = r.trim();
      if (trimmed) userRules.push(trimmed);
    }
  }

  if (constraints) {
    const constList = Array.isArray(constraints) ? constraints : [constraints];
    for (const c of constList) {
      const trimmed = c.trim();
      if (trimmed) userRules.push(`Constraint: ${trimmed}`);
    }
  }

  const mergedRules = [
    ...DEFAULT_WORKER_RULES,
    ...userRules.filter(
      (ur) => !DEFAULT_WORKER_RULES.some((dr) => dr.toLowerCase() === ur.toLowerCase()),
    ),
  ];

  const defaultExpectedOutput =
    "Complete, functional code implemented in workspace files, syntax cleanly verified, and live preview rendering without runtime errors.";

  return {
    task: task.trim() || "Autonomous feature implementation",
    rules: mergedRules,
    expectedOutput: expectedOutput?.trim() || defaultExpectedOutput,
    context: {
      ...(projectName ? { projectName } : {}),
      ...(targetPath ? { targetPath } : {}),
      ...(framework ? { framework } : {}),
      ...(focusFiles && focusFiles.length > 0 ? { focusFiles } : {}),
    },
  };
}

/**
 * Formats a SupervisorWorkerTaskEnvelope into a standardized, high-authority prompt
 * that coder models (Worker Agent) will strictly follow without drifting.
 */
export function formatSupervisorWorkerPrompt(envelope: SupervisorWorkerTaskEnvelope): string {
  const rulesFormatted =
    envelope.rules.length > 0
      ? envelope.rules.map((r, i) => `${i + 1}. ${r}`).join("\n")
      : DEFAULT_WORKER_RULES.map((r, i) => `${i + 1}. ${r}`).join("\n");

  const contextLines: string[] = [];
  if (envelope.context?.projectName) {
    contextLines.push(`• Target Project: ${envelope.context.projectName}`);
  }
  if (envelope.context?.targetPath) {
    contextLines.push(`• Workspace Root: ${envelope.context.targetPath}`);
  }
  if (envelope.context?.framework) {
    contextLines.push(`• Detected Framework: ${envelope.context.framework}`);
  }
  if (envelope.context?.focusFiles && envelope.context.focusFiles.length > 0) {
    contextLines.push(`• Focus Files: ${envelope.context.focusFiles.join(", ")}`);
  }

  return `
==================================================
📋 SUPERVISOR-TO-WORKER TASK ENVELOPE
==================================================

[TASK OBJECTIVE]:
${envelope.task.trim()}

${contextLines.length > 0 ? `[OPERATIONAL CONTEXT]:\n${contextLines.join("\n")}\n` : ""}[STRICT RULES & BOUNDS]:
${rulesFormatted}

[EXPECTED DELIVERABLES & VERIFICATION CRITERIA]:
${envelope.expectedOutput.trim()}

==================================================
CRITICAL DIRECTIVE FOR WORKER AGENT:
You are the Hands-On Worker Coder. Execute this task strictly within the bounds specified above.
Deliver 100% complete, working code. Do NOT add dummy placeholders or stop halfway.
==================================================
`.trim();
}
