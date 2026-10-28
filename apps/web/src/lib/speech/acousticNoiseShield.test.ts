import { describe, expect, it } from "vitest";
import {
  DEFAULT_NOISE_SHIELD_SETTINGS,
  loadNoiseShieldSettings,
  saveNoiseShieldSettings,
} from "./acousticNoiseShield.ts";

describe("AcousticNoiseShield (Fan & Room Echo Cancellation)", () => {
  it("provides standard Digi-Labs noise shield defaults enabled", () => {
    expect(DEFAULT_NOISE_SHIELD_SETTINGS.enabled).toBe(true);
    expect(DEFAULT_NOISE_SHIELD_SETTINGS.fanDenoise).toBe(true);
    expect(DEFAULT_NOISE_SHIELD_SETTINGS.echoGate).toBe(true);
    expect(DEFAULT_NOISE_SHIELD_SETTINGS.speakerBleedBlocker).toBe(true);
    expect(DEFAULT_NOISE_SHIELD_SETTINGS.highpassHz).toBe(85);
    expect(DEFAULT_NOISE_SHIELD_SETTINGS.gateThresholdDb).toBe(-36);
  });

  it("persists and reloads noise shield settings correctly", () => {
    const custom = {
      ...DEFAULT_NOISE_SHIELD_SETTINGS,
      highpassHz: 95,
      gateThresholdDb: -32,
    };
    saveNoiseShieldSettings(custom);
    const loaded = loadNoiseShieldSettings();
    expect(loaded.highpassHz).toBe(95);
    expect(loaded.gateThresholdDb).toBe(-32);
  });
});
