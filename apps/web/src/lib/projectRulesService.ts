import { saveServerSetting } from "./serverSettingsSync";

export const DEFAULT_PROJECT_RULES = `# Project AI Rules (.autocode/rules.md)

## Language & Communication
- Speak and explain concepts in clear Roman Urdu.
- Keep responses direct, helpful, and concise.

## Code Standards
- Always write type-safe TypeScript with strict typing.
- Use modular, reusable components and keep existing architecture intact.
- Follow Tailwind CSS utility patterns for UI styling.

## Safety & Quality
- Never wipe or truncate existing code files.
- Ensure all imports, error handling, and tests are maintained.
`;

export interface RulePreset {
  id: string;
  label: string;
  icon: string;
  snippet: string;
}

export const RULE_PRESETS: RulePreset[] = [
  {
    id: "roman-urdu",
    label: "Roman Urdu",
    icon: "🗣️",
    snippet: "- Mujhse hamesha Roman Urdu mein baat karo aur simple alfaz mein samjhao.\n",
  },
  {
    id: "typescript",
    label: "Strict TypeScript",
    icon: "🛡️",
    snippet: "- Write strict TypeScript with explicit types; avoid `any` wherever possible.\n",
  },
  {
    id: "tailwind",
    label: "Tailwind CSS",
    icon: "🎨",
    snippet: "- Style all components using Tailwind CSS classes with full dark-mode support.\n",
  },
  {
    id: "clean-arch",
    label: "Clean Architecture",
    icon: "🧩",
    snippet:
      "- Follow clean code principles: separate UI, business logic, and API calls into modular layers.\n",
  },
  {
    id: "defensive",
    label: "Defensive Coding",
    icon: "⚡",
    snippet:
      "- Implement comprehensive error handling with try/catch, graceful fallbacks, and descriptive messages.\n",
  },
];

function getStorageKey(projectKey?: string): string {
  return projectKey ? `t3_project_rules_${projectKey}` : "t3_project_rules_global";
}

export function getProjectRules(projectKey?: string): string {
  if (typeof window === "undefined") return DEFAULT_PROJECT_RULES;
  try {
    const key = getStorageKey(projectKey);
    const saved = localStorage.getItem(key);
    if (saved !== null) return saved;
    // Fall back to global if project specific not found
    const globalSaved = localStorage.getItem("t3_project_rules_global");
    if (globalSaved !== null) return globalSaved;
    return DEFAULT_PROJECT_RULES;
  } catch {
    return DEFAULT_PROJECT_RULES;
  }
}

export async function saveProjectRules(
  projectKey: string | undefined,
  rules: string,
  workspaceRoot?: string,
): Promise<{ success: boolean; fileSaved: boolean; error?: string }> {
  const key = getStorageKey(projectKey);
  let fileSaved = false;

  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(key, rules);
      window.dispatchEvent(
        new CustomEvent("t3_project_rules_updated", { detail: { projectKey, rules } }),
      );
      void saveServerSetting(key, rules);
    } catch (err) {
      console.warn("Failed to save rules to localStorage:", err);
    }
  }

  // Also write to .autocode/rules.md on disk if workspaceRoot is available
  if (workspaceRoot && typeof window !== "undefined") {
    try {
      const normalizedRoot = workspaceRoot.replace(/\\/g, "/").replace(/\/+$/, "");
      const targetFilePath = `${normalizedRoot}/.autocode/rules.md`;
      const res = await fetch("/api/fs/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path: targetFilePath,
          content: rules,
        }),
      });
      if (res.ok) {
        fileSaved = true;
      }
    } catch (err) {
      console.warn("Could not write .autocode/rules.md to disk:", err);
    }
  }

  return { success: true, fileSaved };
}

export function subscribeProjectRules(
  projectKey: string | undefined,
  callback: (rules: string) => void,
): () => void {
  if (typeof window === "undefined") return () => {};

  const handleUpdate = (e: Event) => {
    const customEvent = e as CustomEvent<{ projectKey?: string; rules: string }>;
    if (customEvent.detail && (customEvent.detail.projectKey === projectKey || !projectKey)) {
      callback(customEvent.detail.rules);
    }
  };

  window.addEventListener("t3_project_rules_updated", handleUpdate);
  return () => {
    window.removeEventListener("t3_project_rules_updated", handleUpdate);
  };
}
