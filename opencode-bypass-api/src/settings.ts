import { CustomModelSetting, makeProviderSettingsSchema, TrimmedString } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

export const OpenCodeBypassSetupSettings = makeProviderSettingsSchema(
  {
    enabled: Schema.Boolean.pipe(
      Schema.withDecodingDefault(Effect.succeed(false)),
      Schema.annotateKey({ providerSettingsForm: { hidden: true } }),
    ),
    baseUrl: TrimmedString.pipe(
      Schema.withDecodingDefault(Effect.succeed("https://opencode.ai/inference/v1")),
      Schema.annotateKey({
        title: "Base URL",
        providerSettingsForm: {
          placeholder: "https://opencode.ai/inference/v1",
          clearWhenEmpty: "persist",
        },
      }),
    ),
    customModels: Schema.Array(CustomModelSetting).pipe(
      Schema.withDecodingDefault(Effect.succeed([])),
      Schema.annotateKey({ providerSettingsForm: { hidden: true } }),
    ),
  },
  {
    order: ["baseUrl"],
  },
);

export type OpenCodeBypassSetupSettings = typeof OpenCodeBypassSetupSettings.Type;
