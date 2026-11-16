import { describe, expect, it } from "vitest";
import { normalizeBypassModel } from "./client.ts";

describe("normalizeBypassModel", () => {
  it("strips the opencode/ provider prefix so the upstream accepts the model", () => {
    expect(normalizeBypassModel("opencode/deepseek-v4.1-flash-free")).toBe(
      "deepseek-v4.1-flash-free",
    );
    expect(normalizeBypassModel("opencode/beam-free")).toBe("beam-free");
  });

  it("keeps bare upstream model ids unchanged", () => {
    expect(normalizeBypassModel("beam-free")).toBe("beam-free");
    expect(normalizeBypassModel("  glm-5.3-flash-free  ")).toBe("glm-5.3-flash-free");
  });

  it("strips any single leading provider segment", () => {
    expect(normalizeBypassModel("opencodebypasssetup/kimi-k3")).toBe("kimi-k3");
  });
});
