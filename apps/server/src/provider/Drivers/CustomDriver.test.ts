import { describe, expect, it } from "vite-plus/test";
import { ProviderInstanceId, ProviderSessionId, ProviderThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Scope from "effect/Scope";
import {
  CustomDriver,
  getFallbackCustomInstance,
  listFallbackCustomInstanceIds,
  makeCustomAdapterV2,
  makeCustomSnapshot,
  registerFallbackCustomProvider,
  unregisterFallbackCustomProvider,
} from "./CustomDriver.ts";

describe("CustomDriver", () => {
  it("formats snapshot models correctly", () => {
    const testId = ProviderInstanceId.make("custom_test1");
    const snapshot = makeCustomSnapshot(
      testId,
      "My Local Model",
      {
        baseUrl: "http://localhost:8377/v1",
        apiKey: "sk-test",
        models: [
          { id: "model-a", name: "Model Alpha" },
          { id: "model-b", name: "Model Beta" },
        ],
        headers: [{ key: "X-Custom", value: "test" }],
      },
      true,
    );

    expect(snapshot.instanceId).toBe(testId);
    expect(snapshot.displayName).toBe("My Local Model");
    expect(snapshot.driver).toBe("custom");
    expect(snapshot.enabled).toBe(true);
    expect(snapshot.models).toHaveLength(2);
    expect(snapshot.models[0]).toEqual({
      slug: "model-a",
      name: "Model Alpha",
      isCustom: false,
      capabilities: null,
    });
  });

  it("handles fallback in-memory registry lifecycle", () => {
    const rawId = "custom_test_reg";
    const testId = ProviderInstanceId.make(rawId);

    registerFallbackCustomProvider({
      instanceId: rawId,
      displayName: "In Memory Provider",
      baseUrl: "http://127.0.0.1:8377/v1",
      models: [{ id: "test-model", name: "Test Model" }],
    });

    const instance = getFallbackCustomInstance(testId);
    expect(instance).toBeDefined();
    if (instance) {
      expect(instance.snapshot.name).toBe("In Memory Provider");
      expect(instance.snapshot.models[0]?.slug).toBe("test-model");
      expect(instance.driverKind).toBe("custom");
    }

    const ids = listFallbackCustomInstanceIds();
    expect(ids).toContain(rawId);

    unregisterFallbackCustomProvider(testId);
    expect(getFallbackCustomInstance(testId)).toBeUndefined();
  });

  it("exposes CustomDriver driver definition with driverKind custom", () => {
    expect(CustomDriver.driverKind).toBe("custom");
  });

  it("creates adapter v2 with functional session runtime", async () => {
    const testId = ProviderInstanceId.make("custom_test_adapter");
    const adapter = makeCustomAdapterV2(testId, {
      baseUrl: "http://127.0.0.1:8377/v1",
      apiKey: "",
      models: [],
      headers: [],
    });

    expect(adapter.driver).toBe("custom");

    const program = Effect.gen(function* () {
      const scope = yield* Scope.make();
      const session = yield* adapter
        .openSession({
          providerSessionId: ProviderSessionId.make("session-1"),
          cwd: "/test",
          mode: "full-access",
        })
        .pipe(Scope.provide(scope));

      expect(session.driver).toBe("custom");
      expect(session.providerSessionId).toBe("session-1");
      const snapshot = yield* session.readThreadSnapshot({
        providerThread: {
          id: ProviderThreadId.make("th-1"),
        } as any,
      });
      expect(snapshot.messages).toEqual([]);
      yield* Scope.close(scope, Exit.void);
    });

    await Effect.runPromise(program);
  });
});
