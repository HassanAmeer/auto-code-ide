import { OpenCodeDriver, type OpenCodeDriverEnv } from "@t3tools/provider-opencode/server";
import { ProviderDriverKind } from "@t3tools/contracts";
import type { AnyProviderDriver } from "@t3tools/provider-core/server/driver";

export const OpenCodeBypassSetupDriver: AnyProviderDriver<OpenCodeDriverEnv> = {
  ...(OpenCodeDriver as any),
  driverKind: ProviderDriverKind.make("opencodebypasssetup"),
};
export type OpenCodeBypassSetupDriverEnv = OpenCodeDriverEnv;
