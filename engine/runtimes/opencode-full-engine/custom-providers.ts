export * as CustomProviders from "./custom-providers.js";

import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { Effect, Scope } from "effect";
import { Model } from "./model.js";
import { Provider } from "./provider.js";

/**
 * The app stores custom (user-added OpenAI-compatible) providers in its own storage
 * (`custom-providers-cache.json`), outside the engine's `opencode.json` config sources.
 * The engine builds its provider/model catalog once at layer startup, so a provider
 * saved while the server is running would only become usable after a restart.
 *
 * `ensure` closes that gap: when a requested custom provider/model is missing from
 * the runtime catalog, it is upserted from the app's storage on the fly — making new
 * and edited custom providers usable immediately, without a restart.
 */

interface StoredCustomProvider {
  instanceId?: string;
  id?: string;
  name?: string;
  displayName?: string;
  baseUrl?: string;
  apiKey?: string;
  headers?: Array<{ key?: string; value?: string }>;
  models?: Array<{ id?: string; name?: string }>;
  enabled?: boolean;
}

const cachePaths = () => {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
    ?.env;
  const baseDir =
    env?.T3CODE_HOME || env?.AUTOJOBS_DATA_DIR || NodePath.join(NodeOS.homedir(), ".autojobs/data");
  return [
    NodePath.resolve(baseDir, "userdata", "custom-providers-cache.json"),
    "/root/autojobs/data/userdata/custom-providers-cache.json",
    "/root/.autojobs/data/userdata/custom-providers-cache.json",
  ];
};

const norm = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");

const readRecord = (providerID: string): StoredCustomProvider | undefined => {
  const target = norm(providerID);
  for (const path of cachePaths()) {
    try {
      if (!NodeFS.existsSync(path)) continue;
      const list: unknown = JSON.parse(NodeFS.readFileSync(path, "utf-8"));
      if (!Array.isArray(list)) continue;
      for (const record of list as StoredCustomProvider[]) {
        const ids = [record?.instanceId, record?.id, record?.name, record?.displayName]
          .filter((value): value is string => typeof value === "string" && value !== "")
          .map(norm);
        if (ids.includes(target)) return record;
      }
    } catch {}
  }
  return undefined;
};

// providerID -> fingerprint of what was registered, so repeats stay cheap and edited
// providers (changed models/key) get re-registered instead of being skipped.
const ensured = new Map<string, string>();

/**
 * Lazily upsert a custom provider (and all of its models) from the app's provider
 * storage into the runtime catalog. `scope` must be a long-lived scope (the engine
 * layer's build scope), so the registration survives past the current request.
 * Returns `false` when the id is not a known custom provider, letting the caller
 * surface its original error untouched.
 */
export const ensure = Effect.fn("CustomProviders.ensure")(function* (
  providerID: string,
  providers: Provider.Interface,
  models: Model.Interface,
  scope: Scope.Scope,
) {
  const record = readRecord(providerID);
  if (!record || record.enabled === false) return false;
  const definitions = (record.models ?? []).filter(
    (model): model is { id: string; name?: string } =>
      typeof model?.id === "string" && model.id !== "",
  );
  const fingerprint = JSON.stringify([
    definitions.map((model) => [model.id, model.name ?? null]),
    record.baseUrl ?? null,
    record.apiKey ? "key" : "no-key",
  ]);
  if (ensured.get(providerID) === fingerprint) {
    // The memo survives layer restarts, so verify the catalog actually still has it.
    const existing = yield* providers.get(Provider.ID.make(providerID));
    if (existing) return true;
    ensured.delete(providerID);
  }

  const baseURL = (record.baseUrl ?? "").trim().replace(/\/+$/, "");
  const headers: Record<string, string> = {};
  for (const header of record.headers ?? []) {
    if (header?.key && header?.value) headers[header.key] = header.value;
  }

  yield* providers
    .transform((catalog) => {
      catalog.update(Provider.ID.make(providerID), (provider) => {
        provider.activation = "enabled";
        provider.name = record.displayName || record.name || providerID;
        provider.package = "@ai-sdk/openai-compatible";
        provider.settings = Provider.mergeOverlay(provider.settings, {
          ...(baseURL ? { baseURL } : {}),
          ...(record.apiKey ? { apiKey: record.apiKey } : {}),
        });
        if (Object.keys(headers).length > 0) {
          provider.headers = Provider.mergeHeaders(provider.headers, headers);
        }
      });
      for (const definition of definitions) {
        catalog.models.update(
          Provider.ID.make(providerID),
          Model.ID.make(definition.id),
          (model) => {
            model.package = "@ai-sdk/openai-compatible";
            if (definition.name) model.name = definition.name;
            model.enabled = true;
          },
        );
      }
    })
    .pipe(Scope.provide(scope));

  // Model.Service rebuilds from Provider.Service's snapshot on the next read, so a
  // single touch is enough to publish the new provider into the model catalog.
  yield* models.available();

  ensured.set(providerID, fingerprint);
  return true;
});
