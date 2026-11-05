import { assert, describe, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import { TailscaleUnavailableError, shareDevServer, unshareDevServer } from "./dev-share.ts";

describe("unshareDevServer", () => {
  it.effect("reports cleared true when unsharing", () =>
    Effect.gen(function* () {
      const result = yield* unshareDevServer(5788);
      assert.strictEqual(result.cleared, true);
    }),
  );
});

describe("shareDevServer", () => {
  it.effect("returns TailscaleUnavailableError as tailscale is removed", () =>
    Effect.gen(function* () {
      const exit = yield* Effect.exit(shareDevServer({ webPort: 5788 }));
      assert.isTrue(exit._tag === "Failure");
      if (exit._tag === "Failure") {
        const error = exit.cause;
        assert.include(String(error), "TailscaleUnavailableError");
      }
    }),
  );
});
