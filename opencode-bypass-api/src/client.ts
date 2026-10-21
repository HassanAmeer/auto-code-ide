/**
 * OpenCode Bypass Setup — client definition.
 *
 * Yeh file browser aur React Native safe hai — sirf presentation layer.
 * Provider list me "OpenCode Bypass Setup" ke naam se dikhega with
 * OpenCode ka icon lekin alag driverKind.
 *
 * @module provider-opencodebypasssetup/client
 */
import { ProviderDriverKind } from "@t3tools/contracts";
import { defineProviderClient } from "@t3tools/provider-core/client";

import { OpenCodeBypassSetupSettings } from "./settings.ts";

export const openCodeBypassSetupClient = defineProviderClient({
  driverKind: ProviderDriverKind.make("opencodebypasssetup"),
  label: "OpenCode Bypass Setup",
  settingsSchema: OpenCodeBypassSetupSettings,
  icon: {
    // Free-lane icon: circuit / bypass theme (lightning bolt path)
    viewBox: "0 0 32 32",
    fill: { light: "#1a6b3c", dark: "#4ade80" },
    paths: [
      // Lightning bolt — "bypass / free power"
      {
        d: "M18 2L4 18h10l-2 12 16-18H18L20 2z",
      },
    ],
  },
});
