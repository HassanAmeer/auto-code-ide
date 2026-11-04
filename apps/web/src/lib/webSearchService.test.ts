import { describe, expect, it, beforeEach, vi } from "vite-plus/test";
import {
  DEFAULT_TINYFISH_CONFIG,
  getTinyFishConfig,
  saveTinyFishConfig,
  isComposerWebSearchEnabled,
  setComposerWebSearchEnabled,
} from "./webSearchService";

describe("webSearchService", () => {
  const store = new Map<string, string>();
  const mockLocalStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, val: string) => store.set(key, val),
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear(),
  };

  beforeEach(() => {
    store.clear();
    vi.stubGlobal("window", { localStorage: mockLocalStorage });
    vi.stubGlobal("localStorage", mockLocalStorage);
  });

  it("provides default TinyFish config with enabled=true and quotas", () => {
    const config = getTinyFishConfig();
    expect(config.enabled).toBe(true);
    expect(config.searchRpm).toBe(30);
    expect(config.searchRph).toBe(500);
    expect(config.fetchRpm).toBe(150);
    expect(config.fetchRpd).toBe(1000);
    expect(config.searchEndpoint).toBe("https://api.search.tinyfish.ai");
    expect(config.fetchEndpoint).toBe("https://api.fetch.tinyfish.ai");
  });

  it("persists and reads updated TinyFish config", () => {
    saveTinyFishConfig({
      ...DEFAULT_TINYFISH_CONFIG,
      enabled: false,
      apiKey: "tf_test_key_123",
    });

    const loaded = getTinyFishConfig();
    expect(loaded.enabled).toBe(false);
    expect(loaded.apiKey).toBe("tf_test_key_123");
  });

  it("defaults composer web search toggle to false and persists changes", () => {
    expect(isComposerWebSearchEnabled()).toBe(false);

    setComposerWebSearchEnabled(true);
    expect(isComposerWebSearchEnabled()).toBe(true);

    setComposerWebSearchEnabled(false);
    expect(isComposerWebSearchEnabled()).toBe(false);
  });
});
