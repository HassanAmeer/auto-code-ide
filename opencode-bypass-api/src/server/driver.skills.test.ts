// @effect-diagnostics nodeBuiltinImport:off -- The test builds a real skill
// folder on disk, outside an Effect runtime.
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { ProviderInstanceId } from "@t3tools/contracts";
import { assert, describe, it } from "vite-plus/test";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { layerTestProviderHost } from "@t3tools/provider-testing/host";

import { OpenCodeBypassSetupDriver } from "./driver.ts";

function makeWorkspace(): string {
  return NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3-bypass-skills-"));
}

function writeSkill(root: string, name: string, contents: string): void {
  const directory = NodePath.join(root, name);
  NodeFS.mkdirSync(directory, { recursive: true });
  NodeFS.writeFileSync(NodePath.join(directory, "SKILL.md"), contents, "utf-8");
}

const layerTest = layerTestProviderHost({ runBackgroundWork: false }).pipe(
  Layer.provideMerge(NodeServices.layer),
);

describe("opencode bypass skills", () => {
  it("publishes the project skills in its workspace snapshot", async () => {
    const workspace = makeWorkspace();
    writeSkill(
      NodePath.join(workspace, ".agents", "skills"),
      "demo-skill",
      "---\nname: demo-skill\ndescription: A demo skill.\n---\n\nBody\n",
    );

    const testProgram = Effect.gen(function* () {
      const instance = yield* OpenCodeBypassSetupDriver.create({
        instanceId: ProviderInstanceId.make("opencodebypasssetup"),
        displayName: "OpenCode Bypass Setup",
        accentColor: undefined,
        enabled: true,
        environment: [],
        config: { baseUrl: "http://127.0.0.1:1/inference/v1", enabled: true, customModels: [] },
      });

      const snapshot = yield* instance.snapshotForCwd?.(workspace) ?? Effect.succeed(undefined);
      return snapshot?.skills ?? [];
    });

    const skills = await Effect.runPromise(
      testProgram.pipe(Effect.provide(layerTest), Effect.scoped),
    );

    assert.equal(skills.length, 1);
    assert.equal(skills[0]?.name, "demo-skill");
    assert.equal(skills[0]?.description, "A demo skill.");
  });
});
