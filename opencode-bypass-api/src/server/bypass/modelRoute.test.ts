import { describe, expect, it, vi } from "vitest";

// Point the resolver at the autojobs app catalog.
vi.stubEnv("T3CODE_HOME", "/root/autojobs/data");

import { resolveCustomRoute } from "./modelRoute.ts";

describe("resolveCustomRoute", () => {
  it("routes a wusrouter model to its configured upstream", () => {
    const route = resolveCustomRoute("ws/gpt-5.6-luna:free");
    expect(route).not.toBeNull();
    expect(route?.baseUrl).toBe("https://wusrouter.com/v1");
    expect(route?.apiKey.length).toBeGreaterThan(0);
  });

  it("routes a tokendeal 'auto' model to its configured upstream", () => {
    const route = resolveCustomRoute("auto");
    expect(route).not.toBeNull();
    expect(route?.baseUrl).toBe("https://api.tokendeal.cloud/api/v1");
  });

  it("leaves opencode.ai free-lane models on the free lane", () => {
    expect(resolveCustomRoute("beam-free")).toBeNull();
    expect(resolveCustomRoute("big-pickle")).toBeNull();
  });
});
