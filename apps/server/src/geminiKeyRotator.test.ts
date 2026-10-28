import { describe, expect, it } from "vitest";
import { SmartGeminiKeyRotator } from "./geminiKeyRotator.ts";

describe("SmartGeminiKeyRotator (Digi-Labs Inspired)", () => {
  it("initializes with multiple API keys properly", () => {
    const rotator = new SmartGeminiKeyRotator(["key_11111111", "key_22222222", "key_33333333"]);
    expect(rotator.getKeysCount()).toBe(3);
    expect(rotator.getActiveKey()).toBe("key_11111111");

    const summary = rotator.getStatusSummary();
    expect(summary.total).toBe(3);
    expect(summary.activeIndex).toBe(1);
    expect(summary.keys[0]?.masked).toBe("key_...1111");
  });

  it("GOLDEN RULE: Rotates ONLY on 429 / RESOURCE_EXHAUSTED quota limits", async () => {
    const keys = ["key_alpha", "key_beta", "key_gamma"];
    const rotator = new SmartGeminiKeyRotator(keys);

    expect(rotator.getActiveKey()).toBe("key_alpha");

    // Simulate 429 rate limit
    const nextKey = rotator.markQuotaExhausted("key_alpha");
    expect(nextKey).toBe("key_beta");
    expect(rotator.getActiveKey()).toBe("key_beta");

    // Simulate second 429 rate limit
    const thirdKey = rotator.markQuotaExhausted("key_beta");
    expect(thirdKey).toBe("key_gamma");
    expect(rotator.getActiveKey()).toBe("key_gamma");
  });

  it("GOLDEN RULE: Does NOT rotate on 400 Bad Request or client errors", async () => {
    const keys = ["key_alpha", "key_beta"];
    const rotator = new SmartGeminiKeyRotator(keys);

    // Call executeWithRotation with 400 Bad Request
    const result = await rotator.executeWithRotation(async (key) => {
      return {
        status: 400,
        error: "Invalid argument: prompt exceeds context window",
      };
    });

    expect(result.ok).toBe(false);
    expect(result.status).toBe(400);
    // Only 1 key attempted because 400 should NOT burn the next healthy key!
    expect(result.keysAttempted).toBe(1);
    expect(rotator.getActiveKey()).toBe("key_alpha");
  });

  it("Automatically rotates through keys on 429 and succeeds on next available key", async () => {
    const keys = ["key_exhausted_1", "key_exhausted_2", "key_working_3"];
    const rotator = new SmartGeminiKeyRotator(keys);

    const result = await rotator.executeWithRotation(async (key) => {
      if (key === "key_exhausted_1" || key === "key_exhausted_2") {
        return {
          status: 429,
          error: "RESOURCE_EXHAUSTED: Rate limit exceeded",
        };
      }
      return {
        status: 200,
        data: { text: "Success reply from Gemini model!" },
      };
    });

    expect(result.ok).toBe(true);
    expect(result.status).toBe(200);
    expect(result.keysAttempted).toBe(3);
    expect(result.data?.text).toContain("Success reply");
    expect(rotator.getActiveKey()).toBe("key_working_3");
  });
});
