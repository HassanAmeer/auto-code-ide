import { ProviderInstanceId } from "@t3tools/contracts";
import { layerTestProviderHost } from "@t3tools/provider-testing/host";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { expect, it } from "vite-plus/test";
import { OpenCodeBypassSetupDriver } from "./OpenCodeBypassSetupDriverWrapper.ts";

it("opens the registered bypass provider without an external OpenCode runtime", async () => {
  const result = await Effect.runPromise(
    Effect.gen(function* () {
      const instance = yield* OpenCodeBypassSetupDriver.create({
        instanceId: ProviderInstanceId.make("opencodebypasssetup"),
        displayName: "OpenCode Bypass Setup",
        accentColor: undefined,
        enabled: true,
        environment: [],
        config: OpenCodeBypassSetupDriver.defaultConfig(),
      });
      return { driver: instance.driverKind, identity: instance.continuationIdentity };
    }).pipe(
      Effect.provide(
        layerTestProviderHost({ runBackgroundWork: false }).pipe(
          Layer.provideMerge(NodeServices.layer),
        ),
      ),
      Effect.scoped,
    ),
  );
  expect(result.driver).toBe("opencodebypasssetup");
});
