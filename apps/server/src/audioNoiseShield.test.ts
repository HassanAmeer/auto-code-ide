import { describe, expect, it } from "vitest";
import { buildFfmpegNoiseShieldFilter } from "./audioNoiseShield.ts";

describe("AudioNoiseShield Server (FFmpeg afftdn & agate)", () => {
  it("builds the exact Digi-Labs filter chain with afftdn and agate", () => {
    const filter = buildFfmpegNoiseShieldFilter();
    expect(filter).toContain("highpass=f=80");
    expect(filter).toContain("afftdn=nr=20:nf=-50:tn=1");
    expect(filter).toContain("agate=threshold=0.03:range=0.01:ratio=2:attack=20:release=250");
    expect(filter).toContain("volume=1.2");
  });

  it("customizes filter parameters correctly", () => {
    const custom = buildFfmpegNoiseShieldFilter({
      highpassHz: 100,
      denoiseNr: 25,
      gateThreshold: 0.04,
    });
    expect(custom).toContain("highpass=f=100");
    expect(custom).toContain("afftdn=nr=25");
    expect(custom).toContain("agate=threshold=0.04");
  });
});
