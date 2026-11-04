// @effect-diagnostics nodeBuiltinImport:off globalConsole:off
/**
 * Superpower Skills Integration Helper
 *
 * Official obra/superpowers skills integration for AutoCode:
 *  - brainstorming: For WhatsApp/Intake Bot (clarifying questions before writing code)
 *  - dispatching-parallel-agents: For DeepSeek DSH (decomposing tasks across isolated workers)
 *  - systematic-debugging: For Bug Hunting (root-cause investigation & 3-strike rule)
 *  - test-driven-development: For Safe Coding (failing test first, zero regression)
 *  - verification-before-completion: For Verification & Completion (actual evidence before saying fixed)
 *  - writing-plans: For Step-by-step roadmaps before editing
 *
 * @module shared/superpowerSkills
 */

import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { readCustomSkillBody } from "./agentSkills.ts";

export const SUPERPOWER_SKILLS = [
  "brainstorming",
  "dispatching-parallel-agents",
  "systematic-debugging",
  "test-driven-development",
  "verification-before-completion",
  "writing-plans",
] as const;

export type SuperpowerSkillName = (typeof SUPERPOWER_SKILLS)[number];

export const SUPERPOWER_SKILL_SET = new Set<string>(SUPERPOWER_SKILLS);

export function isSuperpowerSkill(name: string): boolean {
  return SUPERPOWER_SKILL_SET.has(name);
}

/**
 * Checks if a specific skill is enabled in .ac-skills-state.json (with fallback to .t3-skills-state.json).
 * Superpower core skills are enabled (true) by default unless explicitly disabled.
 */
export function isSkillEnabled(skillName: string, rootDir?: string): boolean {
  try {
    const candidateRoots = [
      rootDir,
      process.cwd(),
      NodePath.join(process.cwd(), "..", ".."),
      "/root/autojobs",
      NodeOS.homedir(),
    ].filter(Boolean) as string[];

    for (const root of candidateRoots) {
      const acStateFile = NodePath.join(root, ".agents", "skills", ".ac-skills-state.json");
      const t3StateFile = NodePath.join(root, ".agents", "skills", ".t3-skills-state.json");
      for (const stateFile of [acStateFile, t3StateFile]) {
        if (NodeFS.existsSync(stateFile)) {
          try {
            const raw = NodeFS.readFileSync(stateFile, "utf-8");
            const state = JSON.parse(raw) as Record<string, { enabled?: boolean }>;
            if (state && typeof state === "object" && state[skillName] !== undefined) {
              return state[skillName].enabled !== false;
            }
          } catch {}
        }
      }
    }
  } catch {}

  // Default to enabled (true) for core superpower skills
  return true;
}

/**
 * Loads the raw Markdown instruction body of a skill if it is enabled.
 * Returns null if the skill is toggled off or cannot be found.
 */
export function loadSkillContentIfEnabled(skillName: string, rootDir?: string): string | null {
  if (!isSkillEnabled(skillName, rootDir)) {
    return null;
  }

  const candidateRoots = [
    rootDir,
    process.cwd(),
    NodePath.join(process.cwd(), "..", ".."),
    "/root/autojobs",
    NodeOS.homedir(),
  ].filter(Boolean) as string[];

  for (const root of candidateRoots) {
    const skillPath = NodePath.join(root, ".agents", "skills", skillName, "SKILL.md");
    if (NodeFS.existsSync(skillPath)) {
      try {
        const raw = NodeFS.readFileSync(skillPath, "utf-8");
        return readCustomSkillBody(raw);
      } catch {}
    }
  }

  return null;
}

/**
 * WhatsApp / Intake Bot Context Injection:
 * Loads "brainstorming" instructions if toggled ON.
 */
export function getIntakeBotSkillPrompt(rootDir?: string): string {
  const content = loadSkillContentIfEnabled("brainstorming", rootDir);
  if (!content) return "";

  return [
    "==================================================",
    "⚡ ACTIVE SUPERPOWER SKILL: BRAINSTORMING (Clarifying Before Code)",
    "==================================================",
    "You are using the official 'brainstorming' superpower workflow.",
    "Guidelines:",
    "- When requirements are ambiguous or multiple technical approaches exist, ask clarifying questions before jumping to implementation.",
    "- Distill the user's intent, explore 2-3 distinct approaches with tradeoffs, and recommend a clear path.",
    "- Once confirmed, proceed with precision.",
    "",
    content,
    "==================================================",
  ].join("\n");
}

/**
 * DeepSeek DSH Workers Context Injection:
 * Loads "dispatching-parallel-agents" instructions if toggled ON.
 */
export function getDshWorkerSkillPrompt(rootDir?: string): string {
  const content = loadSkillContentIfEnabled("dispatching-parallel-agents", rootDir);
  if (!content) return "";

  return [
    "==================================================",
    "⚡ ACTIVE SUPERPOWER SKILL: DISPATCHING PARALLEL AGENTS",
    "==================================================",
    "You are using the official 'dispatching-parallel-agents' superpower workflow.",
    "Guidelines:",
    "- Isolate worker context and assign dedicated problem domains to independent worktrees.",
    "- Parallelize atomic tasks that do not share sequential state dependencies.",
    "- Each worker gets focused context, a specific goal, clear constraints, and expected output summary.",
    "",
    content,
    "==================================================",
  ].join("\n");
}

/**
 * OpenCode & Project Chat Engine Context Injection:
 * Loads "systematic-debugging" and "test-driven-development" instructions if toggled ON.
 */
export function getProjectChatEngineSkillPrompt(rootDir?: string): string {
  const sysDebug = loadSkillContentIfEnabled("systematic-debugging", rootDir);
  const tdd = loadSkillContentIfEnabled("test-driven-development", rootDir);
  const verify = loadSkillContentIfEnabled("verification-before-completion", rootDir);

  const sections: string[] = [];

  if (sysDebug) {
    sections.push(
      "--- [SUPERPOWER: SYSTEMATIC DEBUGGING (Root-Cause Investigation & 3-Strike Rule)] ---",
      "Always investigate root causes with evidence before proposing fixes. Do not make random changes. Follow the 3-strike rule: if 3 attempts fail, stop and re-diagnose architecture.",
      "",
      sysDebug,
    );
  }

  if (tdd) {
    sections.push(
      "--- [SUPERPOWER: TEST-DRIVEN DEVELOPMENT (Safe Coding & Zero Regression)] ---",
      "Write a failing test first to prove the bug or requirement, then implement minimal clean code to pass it, ensuring zero regression across existing suites.",
      "",
      tdd,
    );
  }

  if (verify) {
    sections.push(
      "--- [SUPERPOWER: VERIFICATION BEFORE COMPLETION] ---",
      "Never claim a task is fixed or complete without actual evidence (real build/test logs, verified HTTP status, or passing diffs). Evidence before assertions always.",
      "",
      verify,
    );
  }

  if (sections.length === 0) return "";

  return [
    "==================================================",
    "⚡ ACTIVE SUPERPOWER SKILLS FOR PROJECT CODING & DEBUGGING",
    "==================================================",
    ...sections,
    "==================================================",
  ].join("\n");
}
