// @effect-diagnostics nodeBuiltinImport:off
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { assert, describe, it } from "vite-plus/test";

import {
  SUPERPOWER_SKILLS,
  SUPERPOWER_SKILL_SET,
  getDshWorkerSkillPrompt,
  getIntakeBotSkillPrompt,
  getProjectChatEngineSkillPrompt,
  isSkillEnabled,
  isSuperpowerSkill,
  loadSkillContentIfEnabled,
} from "./superpowerSkills.ts";

function makeWorkspace(): string {
  return NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3-superpower-skills-"));
}

function writeSkill(root: string, name: string, contents: string): void {
  const directory = NodePath.join(root, ".agents", "skills", name);
  NodeFS.mkdirSync(directory, { recursive: true });
  NodeFS.writeFileSync(NodePath.join(directory, "SKILL.md"), contents, "utf-8");
}

function writeState(root: string, state: Record<string, { enabled?: boolean }>): void {
  const directory = NodePath.join(root, ".agents", "skills");
  NodeFS.mkdirSync(directory, { recursive: true });
  NodeFS.writeFileSync(
    NodePath.join(directory, ".ac-skills-state.json"),
    JSON.stringify(state, null, 2),
    "utf-8",
  );
}

function writeT3LegacyState(root: string, state: Record<string, { enabled?: boolean }>): void {
  const directory = NodePath.join(root, ".agents", "skills");
  NodeFS.mkdirSync(directory, { recursive: true });
  NodeFS.writeFileSync(
    NodePath.join(directory, ".t3-skills-state.json"),
    JSON.stringify(state, null, 2),
    "utf-8",
  );
}

describe("superpowerSkills", () => {
  it("defines the 6 core superpower skills", () => {
    const expected = [
      "brainstorming",
      "dispatching-parallel-agents",
      "systematic-debugging",
      "test-driven-development",
      "verification-before-completion",
      "writing-plans",
    ];

    assert.equal(SUPERPOWER_SKILLS.length, 6);
    for (const skill of expected) {
      assert.isTrue(SUPERPOWER_SKILL_SET.has(skill));
      assert.isTrue(isSuperpowerSkill(skill));
    }
    assert.isFalse(isSuperpowerSkill("custom-skill"));
    assert.isFalse(isSuperpowerSkill("git-workflow"));
  });

  describe("isSkillEnabled", () => {
    it("defaults to true when no state file exists", () => {
      const workspace = makeWorkspace();
      assert.isTrue(isSkillEnabled("brainstorming", workspace));
      assert.isTrue(isSkillEnabled("systematic-debugging", workspace));
    });

    it("respects enabled: false in .ac-skills-state.json", () => {
      const workspace = makeWorkspace();
      writeState(workspace, {
        brainstorming: { enabled: false },
        "systematic-debugging": { enabled: true },
      });

      assert.isFalse(isSkillEnabled("brainstorming", workspace));
      assert.isTrue(isSkillEnabled("systematic-debugging", workspace));
      // Missing from state defaults to true
      assert.isTrue(isSkillEnabled("writing-plans", workspace));
    });

    it("falls back to .t3-skills-state.json when .ac-skills-state.json does not exist", () => {
      const workspace = makeWorkspace();
      writeT3LegacyState(workspace, {
        brainstorming: { enabled: false },
        "systematic-debugging": { enabled: true },
      });

      assert.isFalse(isSkillEnabled("brainstorming", workspace));
      assert.isTrue(isSkillEnabled("systematic-debugging", workspace));
      assert.isTrue(isSkillEnabled("writing-plans", workspace));
    });

    it("prioritizes .ac-skills-state.json over .t3-skills-state.json", () => {
      const workspace = makeWorkspace();
      writeT3LegacyState(workspace, {
        brainstorming: { enabled: true },
      });
      writeState(workspace, {
        brainstorming: { enabled: false },
      });

      assert.isFalse(isSkillEnabled("brainstorming", workspace));
    });
  });

  describe("loadSkillContentIfEnabled", () => {
    it("returns null if the skill is disabled in state", () => {
      const workspace = makeWorkspace();
      writeSkill(
        workspace,
        "brainstorming",
        "---\nname: brainstorming\n---\n\n# Clarify before code\n",
      );
      writeState(workspace, { brainstorming: { enabled: false } });

      const content = loadSkillContentIfEnabled("brainstorming", workspace);
      assert.isNull(content);
    });

    it("returns null if the skill is disabled in legacy t3 state fallback", () => {
      const workspace = makeWorkspace();
      writeSkill(
        workspace,
        "brainstorming",
        "---\nname: brainstorming\n---\n\n# Clarify before code\n",
      );
      writeT3LegacyState(workspace, { brainstorming: { enabled: false } });

      const content = loadSkillContentIfEnabled("brainstorming", workspace);
      assert.isNull(content);
    });

    it("loads raw markdown body when the skill is enabled", () => {
      const workspace = makeWorkspace();
      writeSkill(
        workspace,
        "brainstorming",
        "---\nname: brainstorming\n---\n\n# Clarify before code\n",
      );
      writeState(workspace, { brainstorming: { enabled: true } });

      const content = loadSkillContentIfEnabled("brainstorming", workspace);
      assert.equal(content, "# Clarify before code");
    });

    it("returns null if the skill file does not exist", () => {
      const workspace = makeWorkspace();
      const content = loadSkillContentIfEnabled("non-existent", workspace);
      assert.isNull(content);
    });
  });

  describe("context injection prompts", () => {
    it("getIntakeBotSkillPrompt injects brainstorming prompt when enabled", () => {
      const workspace = makeWorkspace();
      writeSkill(
        workspace,
        "brainstorming",
        "---\nname: brainstorming\n---\n\nBrainstorm instructions\n",
      );

      const prompt = getIntakeBotSkillPrompt(workspace);
      assert.isTrue(prompt.includes("BRAINSTORMING"));
      assert.isTrue(prompt.includes("Brainstorm instructions"));
    });

    it("getIntakeBotSkillPrompt returns empty string when brainstorming is disabled", () => {
      const workspace = makeWorkspace();
      writeSkill(
        workspace,
        "brainstorming",
        "---\nname: brainstorming\n---\n\nBrainstorm instructions\n",
      );
      writeState(workspace, { brainstorming: { enabled: false } });

      assert.equal(getIntakeBotSkillPrompt(workspace), "");
    });

    it("getDshWorkerSkillPrompt injects dispatching-parallel-agents when enabled", () => {
      const workspace = makeWorkspace();
      writeSkill(
        workspace,
        "dispatching-parallel-agents",
        "---\nname: dispatching-parallel-agents\n---\n\nParallel agents instructions\n",
      );

      const prompt = getDshWorkerSkillPrompt(workspace);
      assert.isTrue(prompt.includes("DISPATCHING PARALLEL AGENTS"));
      assert.isTrue(prompt.includes("Parallel agents instructions"));
    });

    it("getProjectChatEngineSkillPrompt injects active skills and omits disabled ones", () => {
      const workspace = makeWorkspace();
      writeSkill(
        workspace,
        "systematic-debugging",
        "---\nname: systematic-debugging\n---\n\nDebug instructions\n",
      );
      writeSkill(
        workspace,
        "test-driven-development",
        "---\nname: test-driven-development\n---\n\nTDD instructions\n",
      );
      writeSkill(
        workspace,
        "verification-before-completion",
        "---\nname: verification-before-completion\n---\n\nVerification instructions\n",
      );

      writeState(workspace, {
        "systematic-debugging": { enabled: true },
        "test-driven-development": { enabled: false },
        "verification-before-completion": { enabled: true },
      });

      const prompt = getProjectChatEngineSkillPrompt(workspace);
      assert.isTrue(prompt.includes("SYSTEMATIC DEBUGGING"));
      assert.isTrue(prompt.includes("Debug instructions"));
      assert.isFalse(prompt.includes("TEST-DRIVEN DEVELOPMENT"));
      assert.isFalse(prompt.includes("TDD instructions"));
      assert.isTrue(prompt.includes("VERIFICATION BEFORE COMPLETION"));
      assert.isTrue(prompt.includes("Verification instructions"));
    });
  });
});
