// @effect-diagnostics nodeBuiltinImport:off -- The test builds real skill
// folders on disk, outside an Effect runtime.
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { assert, describe, it } from "vite-plus/test";

import { ProviderInstanceId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import {
  buildCustomSkillInstructions,
  buildInvokedSkillInstructions,
  discoverCustomSkills,
  readCustomSkillBody,
  selectInvokedCustomSkills,
} from "./agentSkills.ts";

function writeSkill(root: string, name: string, contents: string): void {
  const directory = NodePath.join(root, name);
  NodeFS.mkdirSync(directory, { recursive: true });
  NodeFS.writeFileSync(NodePath.join(directory, "SKILL.md"), contents, "utf-8");
}

function makeWorkspace(): string {
  return NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3-custom-skills-"));
}

describe("discoverCustomSkills", () => {
  it("discovers project .agents skills and project .claude skills", () => {
    const workspace = makeWorkspace();
    writeSkill(
      NodePath.join(workspace, ".agents", "skills"),
      "agents-skill",
      "---\nname: agents-skill\ndescription: Runs from the agents tree.\n---\n\nBody A\n",
    );
    writeSkill(
      NodePath.join(workspace, ".claude", "skills"),
      "claude-skill",
      "---\nname: claude-skill\ndescription: Runs from the claude tree.\n---\n\nBody B\n",
    );

    const skills = discoverCustomSkills(workspace);
    const byName = new Map(skills.map((skill) => [skill.name, skill]));

    assert.equal(skills.length, 2);
    assert.equal(byName.get("agents-skill")?.scope, "project");
    assert.equal(byName.get("agents-skill")?.description, "Runs from the agents tree.");
    assert.equal(byName.get("claude-skill")?.scope, "project");
    assert.isTrue(byName.get("agents-skill")?.path.endsWith("SKILL.md") ?? false);
  });

  it("marks a skill switched off by the skills manager as disabled", () => {
    const workspace = makeWorkspace();
    const root = NodePath.join(workspace, ".agents", "skills");
    writeSkill(root, "off-skill", "---\nname: off-skill\n---\n\nBody\n");
    NodeFS.writeFileSync(
      NodePath.join(root, ".t3-skills-state.json"),
      JSON.stringify({ "off-skill": { enabled: false } }),
      "utf-8",
    );

    const skills = discoverCustomSkills(workspace);
    assert.equal(skills.length, 1);
    assert.equal(skills[0]?.enabled, false);
  });

  it("skips a skill with malformed frontmatter", () => {
    const workspace = makeWorkspace();
    writeSkill(
      NodePath.join(workspace, ".agents", "skills"),
      "broken",
      "---\nname: [unclosed\n---\n\nBody\n",
    );

    assert.equal(discoverCustomSkills(workspace).length, 0);
  });
});

describe("selectInvokedCustomSkills", () => {
  it("selects the mentioned skill and ignores prose mentions", () => {
    const workspace = makeWorkspace();
    writeSkill(
      NodePath.join(workspace, ".agents", "skills"),
      "demo",
      "---\nname: demo\ndescription: A demo skill.\n---\n\nBody\n",
    );
    const skills = discoverCustomSkills(workspace);

    const selected = selectInvokedCustomSkills("please run $demo now", skills);
    assert.equal(selected.length, 1);
    assert.equal(selected[0]?.name, "demo");

    assert.equal(selectInvokedCustomSkills("the $HOME dir is $PATH", skills).length, 0);
  });
});

describe("readCustomSkillBody", () => {
  it("drops the frontmatter and keeps the body", () => {
    const body = readCustomSkillBody("---\nname: x\n---\n\n# Heading\n\nText\n");
    assert.equal(body, "# Heading\n\nText");
  });
});

describe("buildCustomSkillInstructions", () => {
  it("wraps the skill body with its name and summary", () => {
    const instructions = buildCustomSkillInstructions(
      {
        name: "demo",
        description: "A demo skill.",
        path: "/tmp/demo/SKILL.md",
        enabled: true,
      },
      "Do the thing.",
    );

    assert.isTrue(instructions.includes('<skill name="demo">'));
    assert.isTrue(instructions.includes("Summary: A demo skill."));
    assert.isTrue(instructions.includes("Do the thing."));
    assert.isTrue(instructions.includes("</skill>"));
  });
});

describe("buildInvokedSkillInstructions", () => {
  it("injects the invoked skill body for a project skill", () => {
    const workspace = makeWorkspace();
    writeSkill(
      NodePath.join(workspace, ".agents", "skills"),
      "demo",
      "---\nname: demo\ndescription: A demo skill.\n---\n\n# Workflow\n\nDo the thing.\n",
    );

    const instructions = buildInvokedSkillInstructions("please use $demo here", workspace);
    assert.isTrue(instructions?.includes("The user invoked the following skill(s)"));
    assert.isTrue(instructions?.includes('<skill name="demo">'));
    assert.isTrue(instructions?.includes("Do the thing."));
  });

  it("stays out of the way when no skill is mentioned", () => {
    const workspace = makeWorkspace();
    writeSkill(
      NodePath.join(workspace, ".agents", "skills"),
      "demo",
      "---\nname: demo\n---\n\nBody\n",
    );

    assert.equal(buildInvokedSkillInstructions("just a normal question", workspace), undefined);
    assert.equal(buildInvokedSkillInstructions("the $HOME dir", workspace), undefined);
  });
});
