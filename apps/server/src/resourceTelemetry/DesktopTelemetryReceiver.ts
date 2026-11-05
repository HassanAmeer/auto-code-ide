import type {
  DesktopHostTelemetryMessage as DesktopHostTelemetryMessageValue,
  DesktopHostTelemetrySnapshot,
  DesktopTelemetryControlMessage,
  DesktopUpdateStatusReport,
  ResourceTelemetrySourceStatus,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import type * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import type * as Scope from "effect/Scope";
import * as Stream from "effect/Stream";

export class DesktopTelemetryDescriptorUnavailable {
  readonly _tag = "DesktopTelemetryDescriptorUnavailable";
}

export type DesktopTelemetryControlError = never;

export interface DesktopTelemetryReceiverHealth {
  readonly status: ResourceTelemetrySourceStatus;
  readonly lastSampleAt: Option.Option<DateTime.Utc>;
  readonly lastError: Option.Option<string>;
}

const defaultHealth: DesktopTelemetryReceiverHealth = {
  status: "unavailable",
  lastSampleAt: Option.none(),
  lastError: Option.none(),
};

export class DesktopTelemetryReceiver extends Context.Service<
  DesktopTelemetryReceiver,
  {
    readonly latest: Effect.Effect<Option.Option<DesktopHostTelemetrySnapshot>>;
    readonly changes: Stream.Stream<DesktopHostTelemetrySnapshot>;
    readonly subscribe: Effect.Effect<
      {
        readonly latest: Option.Option<DesktopHostTelemetrySnapshot>;
        readonly changes: Stream.Stream<DesktopHostTelemetrySnapshot>;
      },
      never,
      Scope.Scope
    >;
    readonly health: Effect.Effect<DesktopTelemetryReceiverHealth>;
    readonly subscribeHealth: Effect.Effect<
      {
        readonly latest: DesktopTelemetryReceiverHealth;
        readonly changes: Stream.Stream<DesktopTelemetryReceiverHealth>;
      },
      never,
      Scope.Scope
    >;
    readonly setDiagnosticsDemand: (
      enabled: boolean,
    ) => Effect.Effect<void, DesktopTelemetryControlError>;
    readonly desktopUpdates: Effect.Effect<{
      readonly latest: Option.Option<DesktopUpdateStatusReport>;
      readonly changes: Stream.Stream<DesktopUpdateStatusReport>;
    }>;
  }
>()("t3/resourceTelemetry/DesktopTelemetryReceiver") {}

const serviceInstance = DesktopTelemetryReceiver.of({
  latest: Effect.succeed(Option.none()),
  changes: Stream.empty,
  subscribe: Effect.succeed({ latest: Option.none(), changes: Stream.empty }),
  health: Effect.succeed(defaultHealth),
  subscribeHealth: Effect.succeed({ latest: defaultHealth, changes: Stream.empty }),
  setDiagnosticsDemand: () => Effect.void,
  desktopUpdates: Effect.succeed({ latest: Option.none(), changes: Stream.empty }),
});

export const layer = Layer.succeed(DesktopTelemetryReceiver, serviceInstance);

export const layerTest = (
  overrides: Partial<DesktopTelemetryReceiver["Service"]> = {},
): Layer.Layer<DesktopTelemetryReceiver> =>
  Layer.succeed(
    DesktopTelemetryReceiver,
    DesktopTelemetryReceiver.of({ ...serviceInstance, ...overrides }),
  );

export const writeAllToFileDescriptor = (
  _fd: number,
  _buffer: Uint8Array,
): Effect.Effect<void, never> => Effect.void;
