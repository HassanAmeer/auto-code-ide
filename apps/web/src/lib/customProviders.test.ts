import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import {
  customProviderToServerProvider,
  getCustomProviders,
  normalizeCustomProvider,
} from "./customProviders.ts";

function createLocalStorageStub(): Storage {
  const store = new Map<string, string>();
  return {
    clear: () => {
      store.clear();
    },
    getItem: (key) => store.get(key) ?? null,
    key: (index) => [...store.keys()][index] ?? null,
    get length() {
      return store.size;
    },
    removeItem: (key) => {
      store.delete(key);
    },
    setItem: (key, value) => {
      store.set(key, value);
    },
  };
}

describe("customProviders", () => {
  describe("normalizeCustomProvider", () => {
    it("handles null or non-object inputs safely", () => {
      expect(normalizeCustomProvider(null)).toBeNull();
      expect(normalizeCustomProvider(undefined)).toBeNull();
      expect(normalizeCustomProvider("invalid")).toBeNull();
      expect(normalizeCustomProvider(123)).toBeNull();
    });

    it("normalizes legacy provider format with instanceId and displayName without id", () => {
      const legacy = {
        instanceId: "custom_openrouter",
        displayName: "OpenRouter",
        baseUrl: "https://openrouter.ai/api/v1",
        apiKey: "sk-test",
        models: [{ id: "test-model" }],
      };

      const normalized = normalizeCustomProvider(legacy);
      expect(normalized).not.toBeNull();
      expect(normalized?.id).toBe("custom_openrouter");
      expect(normalized?.name).toBe("OpenRouter");
      expect(normalized?.baseUrl).toBe("https://openrouter.ai/api/v1");
      expect(normalized?.models).toEqual([{ id: "test-model", name: undefined }]);
      expect(normalized?.enabled).toBe(true);
    });

    it("ensures custom_ prefix is added if missing", () => {
      const withoutPrefix = {
        id: "my_endpoint",
        name: "My Endpoint",
        baseUrl: "http://localhost:8000/v1",
      };

      const normalized = normalizeCustomProvider(withoutPrefix);
      expect(normalized).not.toBeNull();
      expect(normalized?.id).toBe("custom_my_endpoint");
      expect(normalized?.name).toBe("My Endpoint");
    });

    it("generates a valid custom_ ID if both id and instanceId are missing", () => {
      const missingId = {
        name: "Mystery Provider",
        baseUrl: "http://localhost:11434/v1",
      };

      const normalized = normalizeCustomProvider(missingId);
      expect(normalized).not.toBeNull();
      expect(normalized?.id).toMatch(/^custom_/);
      expect(normalized?.name).toBe("Mystery Provider");
    });
  });

  describe("customProviderToServerProvider", () => {
    it("does not throw when cp.id is undefined (the exact reported bug)", () => {
      const brokenProvider = {
        name: "OpenRouter",
        baseUrl: "https://openrouter.ai/api/v1",
      } as any;

      expect(() => {
        const result = customProviderToServerProvider(brokenProvider);
        expect(result).toBeDefined();
        expect(result.instanceId).toMatch(/^custom_/);
        expect(result.displayName).toBe("OpenRouter");
      }).not.toThrow();
    });

    it("does not throw when cp is null or undefined", () => {
      expect(() => {
        const result = customProviderToServerProvider(null as any);
        expect(result).toBeDefined();
        expect(result.instanceId).toMatch(/^custom_/);
      }).not.toThrow();
    });

    it("correctly maps custom provider with models to ServerProvider format", () => {
      const valid = {
        id: "custom_groq",
        name: "Groq",
        baseUrl: "https://api.groq.com/openai/v1",
        apiKey: "gsk_test",
        models: [{ id: "llama-3.3-70b-versatile", name: "Llama 3.3 70B" }],
        enabled: true,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      };

      const serverProvider = customProviderToServerProvider(valid);
      expect(serverProvider.instanceId).toBe("custom_groq");
      expect(serverProvider.driver).toBe("custom");
      expect(serverProvider.displayName).toBe("Groq");
      expect(serverProvider.status).toBe("ready");
      expect(serverProvider.availability).toBe("available");
      expect(serverProvider.models).toHaveLength(1);
      expect(serverProvider.models[0]?.slug).toBe("llama-3.3-70b-versatile");
      expect(serverProvider.models[0]?.name).toBe("Llama 3.3 70B");
    });
  });

  describe("localStorage auto-healing in getCustomProviders", () => {
    let localStorageStub: Storage;

    beforeEach(() => {
      localStorageStub = createLocalStorageStub();
      vi.stubGlobal("window", { localStorage: localStorageStub, dispatchEvent: () => true });
      vi.stubGlobal("localStorage", localStorageStub);
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("auto-heals malformed providers missing id in localStorage", () => {
      const malformedData = [
        {
          instanceId: "custom_legacy",
          displayName: "Legacy Provider",
          baseUrl: "http://localhost:8000/v1",
        },
      ];
      localStorageStub.setItem("t3_custom_providers_v1", JSON.stringify(malformedData));

      const providers = getCustomProviders();
      expect(providers).toHaveLength(1);
      expect(providers[0]?.id).toBe("custom_legacy");
      expect(providers[0]?.name).toBe("Legacy Provider");

      // Verify that localStorage was rewritten with normalized data
      const stored = JSON.parse(localStorageStub.getItem("t3_custom_providers_v1") || "[]");
      expect(stored[0]?.id).toBe("custom_legacy");
      expect(stored[0]?.name).toBe("Legacy Provider");
    });
  });
});
