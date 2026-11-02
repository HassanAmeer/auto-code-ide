// @effect-diagnostics globalDateInEffect:off globalRandomInEffect:off nodeBuiltinImport:off globalTimers:off globalTimersInEffect:off preferSchemaOverJson:off globalDate:off globalFetchInEffect:off globalFetch:off globalConsoleInEffect:off
import type { SubtaskPlanItem } from "./types.ts";

/**
 * Evaluates whether a prompt or title represents a composite / multi-stage engineering task.
 */
export function isComplexTask(taskTitle: string, prompt: string): boolean {
  const text = `${taskTitle} ${prompt}`.toLowerCase();

  // Explicit itemized indicators
  if (/(?:^|\n)\s*(?:[1-9]\.|\*|-|•)\s+/m.test(prompt)) return true;
  if (prompt.split(/\n+/).filter((l) => l.trim().length > 10).length >= 3) return true;

  // Multi-concept keywords
  const complexKeywords = [
    "crm",
    "ecommerce",
    "e-commerce",
    "dashboard",
    "system",
    "platform",
    "full-stack",
    "fullstack",
    "portal",
    "management",
    "booking",
    "restaurant",
    "store",
    "application",
    "pura",
    "complete",
    "tamam",
    "features",
  ];
  if (complexKeywords.some((kw) => text.includes(kw))) return true;

  // Multiple domains in one prompt (e.g. database AND ui)
  const hasDb = /\b(db|database|schema|table|model|sqlite|sql)\b/i.test(text);
  const hasApi = /\b(api|backend|endpoint|service|route|logic)\b/i.test(text);
  const hasUi = /\b(ui|frontend|component|page|view|design|tailwind|css|screen)\b/i.test(text);
  const domainCount = (hasDb ? 1 : 0) + (hasApi ? 1 : 0) + (hasUi ? 1 : 0);
  if (domainCount >= 2) return true;

  return prompt.trim().length > 200;
}

/**
 * Decomposes a task prompt into clean, executable subtask units.
 */
export function decomposeTask(taskTitle: string, prompt: string): SubtaskPlanItem[] {
  // Check if explicit numbered or bullet items exist
  const explicitMatches = prompt
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => /^(?:[0-9]+[.)]|\*|-|•)\s+/.test(line))
    .map((line) => line.replace(/^(?:[0-9]+[.)]|\*|-|•)\s+/, "").trim())
    .filter((line) => line.length > 5);

  if (explicitMatches.length >= 2) {
    return explicitMatches.slice(0, 4).map((item, idx) => ({
      id: `subtask-${idx + 1}`,
      order: idx + 1,
      title: item.slice(0, 60),
      description: item,
      category: idx === 0 ? "architecture_schema" : idx === 1 ? "core_logic_api" : "frontend_ui",
      status: "pending",
    }));
  }

  if (!isComplexTask(taskTitle, prompt)) {
    // Single atomic task
    return [
      {
        id: "subtask-1",
        order: 1,
        title: taskTitle || "Execute requested feature",
        description: prompt || taskTitle,
        category: "frontend_ui",
        status: "pending",
      },
    ];
  }

  // Decompose standard complex full-stack / app task into 3 clean stages
  const cleanTitle =
    taskTitle.replace(/^(create|build|make|banao|add|develop)\s+/i, "").trim() || "Feature";

  return [
    {
      id: "subtask-1",
      order: 1,
      title: `Step 1: Data Structures, Schema & State Models`,
      description: `Define TypeScript types, data models, and initial state storage for ${cleanTitle}. Requirements: ${prompt}`,
      category: "architecture_schema",
      status: "pending",
    },
    {
      id: "subtask-2",
      order: 2,
      title: `Step 2: Core Logic, Handlers & Business Rules`,
      description: `Implement core computational logic, action handlers, data management, and validation for ${cleanTitle}.`,
      category: "core_logic_api",
      status: "pending",
    },
    {
      id: "subtask-3",
      order: 3,
      title: `Step 3: Responsive UI Components & Interactive Preview`,
      description: `Create modern responsive UI, Tailwind styling, views, and wire interactive controls for ${cleanTitle} so live preview displays cleanly.`,
      category: "frontend_ui",
      status: "pending",
    },
  ];
}
