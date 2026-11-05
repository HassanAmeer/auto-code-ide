import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

export class TailscaleUnavailableError extends Schema.TaggedError<TailscaleUnavailableError>()(
  "TailscaleUnavailableError",
  {},
) {
  override get message(): string {
    return "Tailscale dev sharing is disabled (Tailscale package has been removed).";
  }
}

export class TailnetNameMissingError extends Schema.TaggedError<TailnetNameMissingError>()(
  "TailnetNameMissingError",
  {},
) {
  override get message(): string {
    return "Tailnet name is missing.";
  }
}

export class DevServeFailedError extends Schema.TaggedError<DevServeFailedError>()(
  "DevServeFailedError",
  { webPort: Schema.Number },
) {
  override get message(): string {
    return `Could not serve port ${this.webPort} on the tailnet.`;
  }
}

export type DevShareError =
  | TailscaleUnavailableError
  | TailnetNameMissingError
  | DevServeFailedError;

export const unshareDevServer = (_webPort: number) => Effect.succeed({ cleared: true } as const);

export interface DevShareResult {
  readonly url: string;
  readonly host: string;
}

export const shareDevServer = Effect.fn("devShare.shareDevServer")(function* (input: {
  readonly webPort: number;
}) {
  return yield* new TailscaleUnavailableError();
});
