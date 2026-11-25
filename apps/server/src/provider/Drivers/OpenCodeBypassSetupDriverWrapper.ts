import { ProviderDriverKind } from "@t3tools/contracts";
import { OpenCodeDriver, type OpenCodeDriverEnv } from "@t3tools/provider-opencode/server";

export type OpenCodeBypassSetupDriverEnv = OpenCodeDriverEnv;

export const OpenCodeBypassSetupDriver = {
  ...OpenCodeDriver,
  driverKind: ProviderDriverKind.make("opencodebypasssetup"),
};
