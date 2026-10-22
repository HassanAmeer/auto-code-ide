// @effect-diagnostics nodeBuiltinImport:off -- The script runs on the
// environment host as a standalone CLI, outside an Effect runtime.
// @effect-diagnostics globalConsole:off
/**
 * skills-manager — manages the workspace skills in `.agents/skills/<name>/SKILL.md`.
 *
 * The Skills settings page runs this script on the environment host:
 *   list                  JSON { ok, skills }
 *   toggle <name> <0|1>   enable or disable a skill
 *   save <slug> <b64>     write a SKILL.md (base64 encoded contents)
 *   save-global <slug>    write a SKILL.md into the global skill store
 *   delete-global <name>  remove a skill from the global skill store
 *   delete <name>         remove a skill
 *   reset <name>          restore a built-in skill
 *   install <b64 command> run an install command (for example the skills CLI)
 *                        and report the skills it added
 *   list-global [cwd]    the skills installed once for every project
 *   install-global <b64> run an install command for the global skill store
 *   enable <name> [cwd]  copy a global skill into one project
 *   enabled-matrix <b64> the global skills every project uses
 *   disable <name> [cwd] remove a global skill from one project
 *
 * A skill is one directory with a `SKILL.md` that carries YAML frontmatter
 * (`name`, `description`). The directory name identifies the skill, matching
 * every engine that reads the same tree.
 */
import { spawnSync } from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

/**
 * The workspace root: the directory that owns `.agents/skills`. The server
 * runs from its own package directory, so the root is found by walking up to
 * the workspace manifest.
 */
function resolveWorkspaceRoot(): string {
  let directory = process.cwd();
  for (let depth = 0; depth < 8; depth += 1) {
    if (NodeFS.existsSync(NodePath.join(directory, "pnpm-workspace.yaml"))) {
      return directory;
    }
    const parent = NodePath.dirname(directory);
    if (parent === directory) break;
    directory = parent;
  }
  return process.cwd();
}

const SKILLS_DIR = NodePath.join(resolveWorkspaceRoot(), ".agents", "skills");
/**
 * The global skill store: one copy of every skill, downloaded once and shared
 * by every project. A project opts in by copying the skill into its own
 * `.agents/skills`, which is where both engines look.
 */
const GLOBAL_SKILLS_DIR = NodePath.join(NodeOS.homedir(), ".agents", "skills");
const FRONTMATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;

interface SkillRecord {
  dirName: string;
  name: string;
  description: string;
  path: string;
  fullPath: string;
  isBuiltin: boolean;
  isActive: boolean;
  content: string;
}

interface SkillStateEntry {
  enabled?: boolean;
  /** True when the project copy came from the global store. */
  fromGlobal?: boolean;
}

function readState(root: string = SKILLS_DIR): Record<string, SkillStateEntry> {
  try {
    const parsed = JSON.parse(
      NodeFS.readFileSync(NodePath.join(root, ".t3-skills-state.json"), "utf-8"),
    ) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, SkillStateEntry>;
    }
  } catch {
    // No state yet.
  }
  return {};
}

function writeState(state: Record<string, SkillStateEntry>, root: string = SKILLS_DIR): void {
  NodeFS.mkdirSync(root, { recursive: true });
  NodeFS.writeFileSync(
    NodePath.join(root, ".t3-skills-state.json"),
    `${JSON.stringify(state, null, 2)}\n`,
    "utf-8",
  );
}

function parseFrontmatter(content: string): { name: string; description: string } {
  const match = FRONTMATTER_PATTERN.exec(content);
  if (!match) return { name: "", description: "" };
  const body = match[1] ?? "";
  const read = (key: string): string => {
    const line = body.split(/\r?\n/).find((entry) => entry.trim().startsWith(`${key}:`));
    if (!line) return "";
    return line
      .slice(line.indexOf(":") + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
  };
  return { name: read("name"), description: read("description") };
}

function listSkillDirectories(directory: string): ReadonlyArray<string> {
  try {
    return NodeFS.readdirSync(directory, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
}

function listSkillsIn(root: string): SkillRecord[] {
  const state = readState(root);
  let entries: string[] = [];
  try {
    entries = NodeFS.readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }

  const skills: SkillRecord[] = [];
  for (const dirName of entries) {
    const fullPath = NodePath.join(root, dirName, "SKILL.md");
    let content: string;
    try {
      content = NodeFS.readFileSync(fullPath, "utf-8");
    } catch {
      continue;
    }
    const frontmatter = parseFrontmatter(content);
    skills.push({
      dirName,
      name: frontmatter.name || dirName,
      description: frontmatter.description,
      path: NodePath.join(".agents", "skills", dirName, "SKILL.md"),
      fullPath,
      isBuiltin: false,
      isActive: state[dirName]?.enabled !== false,
      content,
    });
  }
  return skills;
}

function listSkills(): SkillRecord[] {
  return listSkillsIn(SKILLS_DIR);
}

/** The global skills, plus whether the given project already uses each one. */
function projectStatePath(projectRoot: string): string {
  return NodePath.join(projectRoot, ".agents", "skills", ".t3-skills-state.json");
}

/** The skills a project copied from the global store. */
function enabledGlobalSkillsForProject(projectRoot: string): string[] {
  const state = readState(NodePath.join(projectRoot, ".agents", "skills"));
  return Object.entries(state)
    .filter(([, entry]) => entry.fromGlobal === true)
    .map(([dirName]) => dirName)
    .sort();
}

function listGlobalSkills(projectRoot: string): Array<SkillRecord & { enabledInProject: boolean }> {
  const projectState = readState(NodePath.join(projectRoot, ".agents", "skills"));
  return listSkillsIn(GLOBAL_SKILLS_DIR).map((skill) => ({
    ...skill,
    enabledInProject: projectState[skill.dirName]?.fromGlobal === true,
  }));
}

/**
 * The project folders every engine reads skills from: the universal
 * `.agents/skills`, Claude's `.claude/skills`, and OpenCode's `.opencode/skills`.
 * A skill enabled for a project is copied into all of them, so the same skill
 * works whichever engine the project runs.
 */
const PROJECT_SKILL_ROOTS = [".agents/skills", ".claude/skills", ".opencode/skills"] as const;

function projectSkillCopies(dirName: string, projectRoot: string): ReadonlyArray<string> {
  return PROJECT_SKILL_ROOTS.map((root) => NodePath.join(projectRoot, root, dirName));
}

function resolveProjectRoot(encoded: string | undefined): string {
  if (!encoded) return resolveWorkspaceRoot();
  const decoded = Buffer.from(encoded, "base64").toString("utf-8").trim();
  return decoded || resolveWorkspaceRoot();
}

/**
 * Every engine reads skills from its own tree, so the project's universal
 * `.agents/skills` is mirrored into the Claude and OpenCode trees. A skill the
 * project already keeps there is never overwritten.
 */
function mirrorProjectSkills(projectRoot: string): void {
  const source = NodePath.join(projectRoot, ".agents", "skills");
  for (const entry of listSkillDirectories(source)) {
    for (const root of PROJECT_SKILL_ROOTS) {
      if (root === ".agents/skills") continue;
      const target = NodePath.join(projectRoot, root, entry);
      if (NodeFS.existsSync(target)) continue;
      const skillFile = NodePath.join(source, entry, "SKILL.md");
      if (!NodeFS.existsSync(skillFile)) continue;
      copyDirectory(NodePath.join(source, entry), target);
    }
  }
}

function copyDirectory(from: string, to: string): void {
  NodeFS.mkdirSync(to, { recursive: true });
  for (const entry of NodeFS.readdirSync(from, { withFileTypes: true })) {
    const source = NodePath.join(from, entry.name);
    const target = NodePath.join(to, entry.name);
    if (entry.isDirectory()) {
      copyDirectory(source, target);
    } else if (entry.isFile()) {
      NodeFS.copyFileSync(source, target);
    }
  }
}

function fail(message: string): never {
  process.stdout.write(`${JSON.stringify({ ok: false, error: message })}\n`);
  process.exit(1);
}

function main(argv: ReadonlyArray<string>): void {
  const [command, ...args] = argv;

  switch (command) {
    case "list": {
      mirrorProjectSkills(resolveWorkspaceRoot());
      process.stdout.write(`${JSON.stringify({ ok: true, skills: listSkills() })}\n`);
      return;
    }
    case "toggle": {
      const [dirName, flag] = args;
      if (!dirName) fail("toggle needs a skill name");
      const state = readState();
      state[dirName] = { enabled: flag !== "0" };
      writeState(state);
      process.stdout.write(`${JSON.stringify({ ok: true })}\n`);
      return;
    }
    case "save": {
      const [slug, encoded] = args;
      if (!slug || !encoded) fail("save needs a slug and base64 contents");
      const contents = Buffer.from(encoded, "base64").toString("utf-8");
      const directory = NodePath.join(SKILLS_DIR, slug);
      NodeFS.mkdirSync(directory, { recursive: true });
      NodeFS.writeFileSync(NodePath.join(directory, "SKILL.md"), contents, "utf-8");
      process.stdout.write(`${JSON.stringify({ ok: true })}\n`);
      return;
    }
    case "save-global": {
      const [slug, encoded] = args;
      if (!slug || !encoded) fail("save-global needs a slug and base64 contents");
      const contents = Buffer.from(encoded, "base64").toString("utf-8");
      const directory = NodePath.join(GLOBAL_SKILLS_DIR, slug);
      NodeFS.mkdirSync(directory, { recursive: true });
      NodeFS.writeFileSync(NodePath.join(directory, "SKILL.md"), contents, "utf-8");
      process.stdout.write(`${JSON.stringify({ ok: true, dirName: slug })}\n`);
      return;
    }
    case "delete-global": {
      const [dirName] = args;
      if (!dirName) fail("delete-global needs a skill name");
      NodeFS.rmSync(NodePath.join(GLOBAL_SKILLS_DIR, dirName), { recursive: true, force: true });
      process.stdout.write(`${JSON.stringify({ ok: true, dirName })}\n`);
      return;
    }
    case "delete": {
      const [dirName] = args;
      if (!dirName) fail("delete needs a skill name");
      NodeFS.rmSync(NodePath.join(SKILLS_DIR, dirName), { recursive: true, force: true });
      for (const root of PROJECT_SKILL_ROOTS) {
        NodeFS.rmSync(NodePath.join(resolveWorkspaceRoot(), root, dirName), {
          recursive: true,
          force: true,
        });
      }
      const state = readState();
      delete state[dirName];
      writeState(state);
      process.stdout.write(`${JSON.stringify({ ok: true })}\n`);
      return;
    }
    case "enabled-matrix": {
      const [encoded] = args;
      if (!encoded) fail("enabled-matrix needs the project list");
      const projects = JSON.parse(Buffer.from(encoded, "base64").toString("utf-8")) as Array<{
        id: string;
        title: string;
        workspaceRoot: string;
      }>;
      process.stdout.write(
        `${JSON.stringify({
          ok: true,
          projects: projects.map((project) => ({
            id: project.id,
            title: project.title,
            workspaceRoot: project.workspaceRoot,
            enabled: enabledGlobalSkillsForProject(project.workspaceRoot),
          })),
        })}\n`,
      );
      return;
    }
    case "list-global": {
      const [encodedCwd] = args;
      process.stdout.write(
        `${JSON.stringify({
          ok: true,
          skills: listGlobalSkills(resolveProjectRoot(encodedCwd)),
        })}\n`,
      );
      return;
    }
    case "enable": {
      const [dirName, encodedCwd] = args;
      if (!dirName) fail("enable needs a skill name");
      const projectRoot = resolveProjectRoot(encodedCwd);
      const source = NodePath.join(GLOBAL_SKILLS_DIR, dirName);
      if (!NodeFS.existsSync(source)) {
        fail(`global skill not found: ${dirName}`);
      }
      for (const target of projectSkillCopies(dirName, projectRoot)) {
        NodeFS.rmSync(target, { recursive: true, force: true });
        copyDirectory(source, target);
      }
      const state = readState(NodePath.join(projectRoot, ".agents", "skills"));
      state[dirName] = { enabled: true, fromGlobal: true };
      writeState(state, NodePath.join(projectRoot, ".agents", "skills"));
      process.stdout.write(`${JSON.stringify({ ok: true, enabled: dirName })}\n`);
      return;
    }
    case "disable": {
      const [dirName, encodedCwd] = args;
      if (!dirName) fail("disable needs a skill name");
      const projectRoot = resolveProjectRoot(encodedCwd);
      const state = readState(NodePath.join(projectRoot, ".agents", "skills"));
      const entry = state[dirName];
      // Only a copy this manager made is removed; a skill the project owns
      // stays untouched.
      if (entry?.fromGlobal === true) {
        for (const target of projectSkillCopies(dirName, projectRoot)) {
          NodeFS.rmSync(target, { recursive: true, force: true });
        }
        delete state[dirName];
        writeState(state, NodePath.join(projectRoot, ".agents", "skills"));
      }
      process.stdout.write(`${JSON.stringify({ ok: true, disabled: dirName })}\n`);
      return;
    }
    case "install-global": {
      const [encoded] = args;
      if (!encoded) fail("install-global needs a command");
      const command = Buffer.from(encoded, "base64").toString("utf-8").trim();
      if (!command) fail("install-global needs a command");
      const tokens = command.split(/\s+/);
      const addIndex = tokens.findIndex((token) => token === "add");
      const afterSubcommand = tokens.slice(addIndex + 1);
      const hasFlag = (flag: string): boolean =>
        afterSubcommand.some((token) => token === flag || token.startsWith(`${flag}=`));
      let runCommand = command;
      if (!hasFlag("-y") && !hasFlag("--yes")) {
        runCommand = `${runCommand} -y`;
      }
      if (!hasFlag("-g") && !hasFlag("--global")) {
        runCommand = `${runCommand} -g`;
      }
      if (!hasFlag("-a") && !hasFlag("--agent")) {
        runCommand = `${runCommand} --agent codex`;
      }
      const result = spawnSync(runCommand, {
        cwd: resolveWorkspaceRoot(),
        shell: true,
        encoding: "utf-8",
        timeout: 240_000,
        env: { ...process.env, DISABLE_TELEMETRY: "1" },
      });
      const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
      if (result.error) {
        fail(result.error.message);
      }
      process.stdout.write(
        `${JSON.stringify({
          ok: result.status === 0,
          command: runCommand,
          status: result.status,
          output: output.slice(-4_000),
          skills: listGlobalSkills(resolveWorkspaceRoot()),
        })}\n`,
      );
      if (result.status !== 0) {
        process.exit(1);
      }
      return;
    }
    case "install": {
      const [encoded] = args;
      if (!encoded) fail("install needs a command");
      const command = Buffer.from(encoded, "base64").toString("utf-8").trim();
      if (!command) fail("install needs a command");

      // The skills CLI prompts for the target agents and the install scope
      // when it runs interactively. `.agents/skills` is the universal location
      // that Codex and the custom engine both read, so that is the default
      // target, and the scope prompt is skipped with `-y`.
      const tokens = command.split(/\s+/);
      const addIndex = tokens.findIndex((token) => token === "add");
      const afterSubcommand = tokens.slice(addIndex + 1);
      const hasFlag = (flag: string): boolean =>
        afterSubcommand.some((token) => token === flag || token.startsWith(`${flag}=`));
      let runCommand = command;
      if (!hasFlag("-y") && !hasFlag("--yes")) {
        runCommand = `${runCommand} -y`;
      }
      if (!hasFlag("-a") && !hasFlag("--agent")) {
        runCommand = `${runCommand} --agent codex`;
      }
      const result = spawnSync(runCommand, {
        cwd: resolveWorkspaceRoot(),
        shell: true,
        encoding: "utf-8",
        timeout: 240_000,
        env: { ...process.env, DISABLE_TELEMETRY: "1" },
      });
      const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
      if (result.error) {
        fail(result.error.message);
      }
      process.stdout.write(
        `${JSON.stringify({
          ok: result.status === 0,
          command: runCommand,
          status: result.status,
          output: output.slice(-4_000),
          skills: listSkills(),
        })}\n`,
      );
      if (result.status !== 0) {
        process.exit(1);
      }
      return;
    }
    case "reset": {
      fail("no built-in skills are bundled with this installation");
    }
    default:
      fail(`unknown command: ${command ?? "(none)"}`);
  }
}

main(process.argv.slice(2));
