// @effect-diagnostics nodeBuiltinImport:off globalConsole:off globalDate:off
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { assert, describe, expect, it } from "vite-plus/test";

import {
  deleteCustomProvider,
  getAllAppSettings,
  listCustomProviders,
  saveCustomProvider,
  setAppSetting,
  syncCustomProviders,
} from "./AppSettingsStore.ts";

describe("AppSettingsStore", () => {
  it("persists and retrieves app settings", () => {
    const tempDir = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3-settings-test-"));
    const dbPath = NodePath.join(tempDir, "statev2.sqlite");

    try {
      setAppSetting(dbPath, "test_api_key", "sk-12345");
      setAppSetting(dbPath, "test_obj", { enabled: true, count: 42 });

      const settings = getAllAppSettings(dbPath);
      assert.equal(settings.test_api_key, "sk-12345");
      assert.deepEqual(settings.test_obj, { enabled: true, count: 42 });
    } finally {
      NodeFS.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("persists, updates, and deletes custom providers", () => {
    const tempDir = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3-providers-test-"));
    const dbPath = NodePath.join(tempDir, "statev2.sqlite");

    try {
      const provider1 = {
        id: "custom_openrouter",
        name: "OpenRouter",
        baseUrl: "https://openrouter.ai/api/v1",
        apiKey: "sk-or-v1-secret",
        headers: [{ key: "HTTP-Referer", value: "https://app.t3.codes" }],
        models: [{ id: "anthropic/claude-3.5-sonnet", name: "Claude 3.5 Sonnet" }],
        enabled: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      saveCustomProvider(dbPath, provider1);
      let list = listCustomProviders(dbPath);
      assert.equal(list.length, 1);
      assert.equal(list[0]?.id, "custom_openrouter");
      assert.equal(list[0]?.apiKey, "sk-or-v1-secret");
      assert.deepEqual(list[0]?.headers, [{ key: "HTTP-Referer", value: "https://app.t3.codes" }]);

      // Update provider
      saveCustomProvider(dbPath, {
        ...provider1,
        apiKey: "sk-or-v1-updated",
      });
      list = listCustomProviders(dbPath);
      assert.equal(list.length, 1);
      assert.equal(list[0]?.apiKey, "sk-or-v1-updated");

      // Sync bulk
      const provider2 = {
        id: "custom_local_ollama",
        name: "Ollama Local",
        baseUrl: "http://localhost:11434/v1",
        apiKey: "",
        models: [{ id: "llama3:latest", name: "Llama 3" }],
        enabled: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      syncCustomProviders(dbPath, [provider1, provider2]);
      list = listCustomProviders(dbPath);
      assert.equal(list.length, 2);

      // Delete provider
      deleteCustomProvider(dbPath, "custom_local_ollama");
      list = listCustomProviders(dbPath);
      expect(list.length).toBe(1);
      expect(list[0]?.id).toBe("custom_openrouter");
    } finally {
      NodeFS.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("handles legacy provider format with instanceId and displayName safely", () => {
    const tempDir = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3-legacy-providers-test-"));
    const dbPath = NodePath.join(tempDir, "statev2.sqlite");

    try {
      const legacyProvider = {
        instanceId: "custom_legacy_api",
        displayName: "Legacy Custom API",
        baseUrl: "https://api.legacy.com/v1",
        apiKey: "sk-legacy",
        models: [{ id: "model-1" }],
      } as any;

      saveCustomProvider(dbPath, legacyProvider);
      const list = listCustomProviders(dbPath);
      expect(list.length).toBe(1);
      expect(list[0]?.id).toBe("custom_legacy_api");
      expect(list[0]?.name).toBe("Legacy Custom API");
      expect(list[0]?.baseUrl).toBe("https://api.legacy.com/v1");
    } finally {
      NodeFS.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
