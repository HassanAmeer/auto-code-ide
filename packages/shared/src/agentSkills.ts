// @effect-diagnostics nodeBuiltinImport:off -- The skill scanner reads the
// filesystem directly so every provider driver can use it without an Effect
// runtime, the same way the skills manager script does.
/**
 * Skill file helpers shared by every provider driver.
 *
 * A skill is one directory with a `SKILL.md` that carries YAML frontmatter.
 * The parser and the mention matcher live here so the Claude, Codex, OpenCode
 * and custom drivers all read the same keys the same way.
 *
 * @module shared/agentSkills
 */
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import type { ServerProviderSkill } from "@t3tools/contracts";
import { parse as parseYamlDocument } from "yaml";

const FRONTMATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;

export type SkillFrontmatter =
  | { readonly kind: "missing" }
  | { readonly kind: "malformed" }
  | {
      readonly kind: "parsed";
      readonly description?: string;
      readonly userInvocationOnly?: boolean;
      readonly userInvocable?: boolean;
    };

/**
 * Claude Code accepts the YAML 1.1 boolean spellings (`yes`/`no`, `on`/`off`,
 * `1`/`0`), which the 1.2 core schema this parser uses leaves as strings and
 * numbers. Verified against the CLI: a skill carrying `user-invocable: no` is
 * absent from its published slash commands, so a strict `=== false` here would
 * offer a command the CLI rejects.
 */
function parseFrontmatterBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") {
    return value === 1 ? true : value === 0 ? false : undefined;
  }
  if (typeof value !== "string") return undefined;
  switch (value.trim().toLowerCase()) {
    case "true":
    case "yes":
    case "on":
    case "y":
      return true;
    case "false":
    case "no":
    case "off":
    case "n":
      return false;
    default:
      return undefined;
  }
}

/**
 * The frontmatter of a `SKILL.md`, shared with the other skill scanners so
 * every engine reads the same keys the same way.
 */
export function parseSkillFrontmatter(contents: string): SkillFrontmatter {
  const match = FRONTMATTER_PATTERN.exec(contents);
  if (!match) {
    return { kind: "missing" };
  }

  const frontmatter = match[1] ?? "";
  let parsed: unknown;
  try {
    parsed = parseYamlDocument(frontmatter);
  } catch {
    // Claude Code accepts plain scalars containing `: `. Repair only those,
    // leaving comments and YAML structure for the full-document parser.
    const repaired = frontmatter.replace(
      /^([\w-]+:[ \t]*)([^\r\n]*)/gm,
      (line, prefix: string, value: string) => {
        const scalar = value.split(/[ \t]+#/)[0] ?? "";
        if (!/:[ \t]/.test(scalar) || /^(?:["'[\]{}|>&*!#%@`]|[-?:](?:[ \t]|$))/.test(scalar)) {
          return line;
        }
        return `${prefix}${JSON.stringify(scalar)}${value.slice(scalar.length)}`;
      },
    );
    try {
      parsed = parseYamlDocument(repaired);
    } catch {
      return { kind: "malformed" };
    }
  }
  if (typeof parsed !== "object" || parsed === null) {
    return { kind: "malformed" };
  }

  const record = parsed as Record<string, unknown>;
  const description = typeof record.description === "string" ? record.description.trim() : "";
  return {
    kind: "parsed",
    ...(description ? { description } : {}),
    ...(parseFrontmatterBoolean(record["disable-model-invocation"]) === true
      ? { userInvocationOnly: true }
      : {}),
    ...(parseFrontmatterBoolean(record["user-invocable"]) === false
      ? { userInvocable: false }
      : {}),
  };
}

/**
 * Same token shape the composer and timeline chips recognise
 * (`packages/shared/src/composerInlineTokens.ts`), so a rendered chip and a
 * dispatched skill are always the same set.
 */
export const SKILL_MENTION_PATTERN =
  /(^|\s)\p{Sc}(?![0-9][0-9_]*(?:[kKmMbBtT]|[eE][0-9]+)?(?:\s|$))(?=[a-zA-Z0-9:_-]*[a-zA-Z])([a-zA-Z0-9][a-zA-Z0-9:_-]*)(?=\s|$)/gu;

export interface ClaudeSkillDispatch {
  /** Text before the dispatched mention, or `undefined` when it opens the prompt. */
  readonly leadingText: string | undefined;
  /** `/name` plus the trailing text, ready to be the message's last text block. */
  readonly commandText: string;
  readonly skillName: string;
}

/**
 * Every `$skill` mention in the prompt, in the order they appear. The names
 * are not filtered against a skill list, so a caller matches them itself.
 */
export function listSkillMentions(prompt: string): ReadonlyArray<string> {
  return [...prompt.matchAll(SKILL_MENTION_PATTERN)]
    .map((match) => match[2] ?? "")
    .filter((name) => name.length > 0);
}

type CustomSkillScope = "user" | "project";

/**
 * The skill trees that apply to a working directory: the directory itself and
 * the ancestors that hold a skills tree, nearest first. A thread often runs in
 * a subdirectory of the project, and the project's skills live at its root.
 */
function skillRoots(cwd: string | undefined): ReadonlyArray<{
  readonly directory: string;
  readonly scope: CustomSkillScope;
}> {
  const roots: Array<{ directory: string; scope: CustomSkillScope }> = [];
  let directory = cwd;
  for (let depth = 0; depth < 8 && directory; depth += 1) {
    for (const tree of [".agents/skills", ".claude/skills", ".opencode/skills"]) {
      const candidate = NodePath.join(directory, tree);
      if (!NodeFS.existsSync(candidate)) continue;
      if (roots.some((root) => root.directory === candidate)) continue;
      roots.push({ directory: candidate, scope: "project" });
    }
    const parent = NodePath.dirname(directory);
    if (parent === directory) break;
    directory = parent;
  }
  roots.push({
    directory: NodePath.join(NodeOS.homedir(), ".claude", "skills"),
    scope: "user",
  });
  return roots;
}

function readSkillFile(skillPath: string): string | undefined {
  try {
    return NodeFS.readFileSync(skillPath, "utf-8");
  } catch {
    return undefined;
  }
}

/**
 * Per-skill enable state, written by the skills manager. A skill switched off
 * stays listed but cannot be invoked, exactly like Claude's skill overrides.
 */
function readSkillState(root: string): Record<string, { enabled?: boolean }> {
  try {
    const parsed = JSON.parse(
      NodeFS.readFileSync(NodePath.join(root, ".t3-skills-state.json"), "utf-8"),
    ) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, { enabled?: boolean }>;
    }
  } catch {
    // No state yet: every skill is active.
  }
  return {};
}

function listSkillDirectories(directory: string): ReadonlyArray<string> {
  try {
    return NodeFS.readdirSync(directory, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() || entry.isSymbolicLink())
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
}

/**
 * Enumerate the skills the custom engine can run. Discovery is best-effort:
 * unreadable roots and malformed entries are skipped so one broken skill never
 * degrades the provider snapshot. The first root wins on a name collision,
 * matching every other engine.
 */
export function discoverCustomSkills(cwd?: string): ReadonlyArray<ServerProviderSkill> {
  const skillsByName = new Map<string, ServerProviderSkill>();

  for (const root of skillRoots(cwd)) {
    const state = readSkillState(root.directory);
    for (const entry of listSkillDirectories(root.directory)) {
      const name = entry.trim();
      if (!name || skillsByName.has(name)) continue;
      const skillPath = NodePath.join(root.directory, entry, "SKILL.md");
      const contents = readSkillFile(skillPath);
      if (contents === undefined) continue;

      const frontmatter = parseSkillFrontmatter(contents);
      if (frontmatter.kind === "malformed") continue;

      const userInvocationOnly =
        frontmatter.kind === "parsed" && frontmatter.userInvocationOnly === true;
      skillsByName.set(name, {
        name,
        path: skillPath,
        enabled: state[name]?.enabled !== false,
        scope: root.scope,
        ...(frontmatter.kind === "parsed" && frontmatter.description
          ? { description: frontmatter.description }
          : {}),
        ...(userInvocationOnly ? { userInvocationOnly: true } : {}),
        ...(frontmatter.kind === "parsed" && frontmatter.userInvocable === false
          ? { userInvocable: false }
          : {}),
      });
    }
  }

  return [...skillsByName.values()].sort((left, right) => left.name.localeCompare(right.name));
}

/**
 * The skill body without its frontmatter, which is what an engine loads when
 * the skill runs.
 */
export function readCustomSkillBody(contents: string): string {
  const match = FRONTMATTER_PATTERN.exec(contents);
  if (!match) return contents.trim();
  return contents.slice(match[0].length).trim();
}

/**
 * The skills a prompt invokes, in the order the mentions appear. A mention
 * that names no discovered skill stays literal, so a `$HOME` in prose never
 * pulls a skill into the request.
 */
export function selectInvokedCustomSkills(
  prompt: string,
  skills: ReadonlyArray<ServerProviderSkill>,
): ReadonlyArray<ServerProviderSkill> {
  const byName = new Map(skills.map((skill) => [skill.name, skill]));
  const selected: ServerProviderSkill[] = [];
  const seen = new Set<string>();
  for (const name of listSkillMentions(prompt)) {
    const skill = byName.get(name);
    if (!skill || seen.has(name)) continue;
    seen.add(name);
    selected.push(skill);
  }
  return selected;
}

/**
 * The block the custom engine receives in place of the native skill runtime.
 * The instructions keep the agent's behaviour identical to the native engines:
 * the skill body is the workflow to follow, and the user's own words stay the
 * request.
 */
export function buildCustomSkillInstructions(skill: ServerProviderSkill, body: string): string {
  return [
    `<skill name="${skill.name}">`,
    ...(skill.description ? [`Summary: ${skill.description}`] : []),
    "",
    body,
    "</skill>",
  ].join("\n");
}

/**
 * The instruction block for the skills a prompt invokes, or `undefined` when it
 * invokes none. The custom endpoint has no native skill runtime, so this is
 * what makes `$name` behave like it does on the native engines.
 */
export function buildInvokedSkillInstructions(
  prompt: string,
  cwd: string | undefined,
): string | undefined {
  const skills = discoverCustomSkills(cwd);
  if (skills.length === 0) return undefined;
  const invoked = selectInvokedCustomSkills(prompt, skills);
  if (invoked.length === 0) return undefined;

  const blocks: string[] = [];
  for (const skill of invoked) {
    let contents: string;
    try {
      contents = NodeFS.readFileSync(skill.path, "utf-8");
    } catch {
      continue;
    }
    const body = readCustomSkillBody(contents);
    if (!body) continue;
    blocks.push(buildCustomSkillInstructions(skill, body));
  }
  if (blocks.length === 0) return undefined;
  return [
    "The user invoked the following skill(s). Follow their instructions for this request.",
    "",
    ...blocks,
  ].join("\n");
}
