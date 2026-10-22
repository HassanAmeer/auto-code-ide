import { describe, expect, it } from "vite-plus/test";

import { DEFAULT_SERVER_SETTINGS } from "@t3tools/contracts";

import {
  getBackgroundActivityPresetSettings,
  normalizeBackgroundActivitySettings,
  normalizeServerBackgroundActivitySettings,
  resolveBackgroundActivitySettings,
} from "./backgroundActivitySettings.ts";

describe("background activity settings", () => {
  it("keeps host background work off by default", () => {
    const resolved = resolveBackgroundActivitySettings({
      schemaVersion: 1,
      profile: "performance",
      overrides: {},
    });

    expect(resolved.runWithoutClient).toBe(false);
    expect(getBackgroundActivityPresetSettings("performance").runWithoutClient).toBe(false);
  });

  it("resolves the always-on override from the custom profile", () => {
    const resolved = resolveBackgroundActivitySettings({
      schemaVersion: 1,
      profile: "custom",
      baseProfile: "performance",
      overrides: { runWithoutClient: true },
    });

    expect(resolved.runWithoutClient).toBe(true);
    expect(resolved.profile).toBe("performance");
  });

  it("keeps the always-on override when settings are normalized", () => {
    const normalized = normalizeBackgroundActivitySettings({
      schemaVersion: 1,
      profile: "custom",
      baseProfile: "performance",
      overrides: { runWithoutClient: true },
    });

    expect(normalized.profile).toBe("custom");
    expect(normalized.baseProfile).toBe("performance");
    expect(normalized.overrides.runWithoutClient).toBe(true);
  });

  it("drops the override when it matches the preset", () => {
    const normalized = normalizeBackgroundActivitySettings({
      schemaVersion: 1,
      profile: "custom",
      baseProfile: "performance",
      overrides: { runWithoutClient: false },
    });

    expect(normalized.profile).toBe("performance");
    expect(normalized.overrides.runWithoutClient).toBeUndefined();
  });
});

describe("normalizeServerBackgroundActivitySettings", () => {
  it("keeps the always-on flag when other settings change", () => {
    const normalized = normalizeServerBackgroundActivitySettings({
      ...DEFAULT_SERVER_SETTINGS,
      backgroundActivity: {
        schemaVersion: 1,
        profile: "custom",
        baseProfile: "performance",
        overrides: { runWithoutClient: true },
      },
    } as typeof DEFAULT_SERVER_SETTINGS);

    expect(normalized.overrides.runWithoutClient).toBe(true);
  });
});
