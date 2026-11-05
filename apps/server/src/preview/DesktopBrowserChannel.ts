import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Stream from "effect/Stream";

export interface DesktopTabKey {
  readonly threadId: string;
  readonly tabId: string;
}

export class DesktopBrowserChannel extends Context.Service<
  DesktopBrowserChannel,
  {
    readonly available: boolean;
    readonly awaitAttached: (key: DesktopTabKey, timeoutMs: number) => Effect.Effect<boolean>;
    readonly detached: Stream.Stream<DesktopTabKey>;
    readonly attached: Stream.Stream<DesktopTabKey>;
    readonly isAttached: (key: DesktopTabKey) => Effect.Effect<boolean>;
    readonly endpoint: (key: DesktopTabKey) => Effect.Effect<{
      readonly outgoing: (frame: string) => Effect.Effect<void>;
      readonly incoming: Stream.Stream<string>;
    }>;
    readonly pointer: (
      key: DesktopTabKey,
      pointer: { readonly phase: "move" | "click"; readonly x: number; readonly y: number },
    ) => Effect.Effect<void>;
  }
>()("t3/preview/DesktopBrowserChannel") {}

export const layer = Layer.succeed(
  DesktopBrowserChannel,
  DesktopBrowserChannel.of({
    available: false,
    awaitAttached: () => Effect.succeed(false),
    detached: Stream.empty,
    attached: Stream.empty,
    isAttached: () => Effect.succeed(false),
    endpoint: () => Effect.die("Desktop browser is unavailable in web mode."),
    pointer: () => Effect.void,
  }),
);
