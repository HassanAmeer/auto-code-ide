import {
  ProviderDriverKind,
  ProviderInstanceId,
  type ServerProvider,
  type ServerProviderModel,
} from "@t3tools/contracts";

export interface CustomHeader {
  key: string;
  value: string;
}

export interface CustomProviderModel {
  id: string;
  name?: string | undefined;
}

export type ProviderFormat = "openai" | "anthropic" | "gemini";

export interface CustomProvider {
  id: string;
  name: string;
  baseUrl: string;
  format?: ProviderFormat | undefined;
  apiKey?: string | undefined;
  headers?: CustomHeader[] | undefined;
  models: CustomProviderModel[];
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export function normalizeCustomProvider(p: unknown): CustomProvider | null {
  if (!p || typeof p !== "object") return null;
  const anyP = p as Record<string, any>;
  const rawId = anyP.id ?? anyP.instanceId;
  const strId = rawId
    ? String(rawId)
    : `custom_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const cleanId = strId.startsWith("custom_") ? strId : `custom_${strId}`;
  const name = String(anyP.name ?? anyP.displayName ?? "Custom Provider");
  const baseUrl = String(anyP.baseUrl ?? anyP.base_url ?? "");
  const rawFormat = String(anyP.format || "openai").toLowerCase();
  const format: ProviderFormat =
    rawFormat === "anthropic" || rawFormat === "claude"
      ? "anthropic"
      : rawFormat === "gemini" || rawFormat === "google"
        ? "gemini"
        : "openai";
  const apiKey = anyP.apiKey ? String(anyP.apiKey) : undefined;
  const headers: CustomHeader[] = Array.isArray(anyP.headers)
    ? anyP.headers.filter((h: any) => h && typeof h === "object" && typeof h.key === "string")
    : [];
  const rawModels: CustomProviderModel[] = Array.isArray(anyP.models)
    ? anyP.models
        .filter((m: any) => m && (typeof m.id === "string" || typeof m.name === "string"))
        .map((m: any) => ({
          id: String(m.id || m.name).trim(),
          name: m.name ? String(m.name).trim() : undefined,
        }))
        .filter((m: CustomProviderModel) => m.id.length > 0)
    : [];

  const seenModelIds = new Set<string>();
  const models: CustomProviderModel[] = [];
  for (const m of rawModels) {
    if (!seenModelIds.has(m.id)) {
      seenModelIds.add(m.id);
      models.push(m);
    }
  }
  const enabled = anyP.enabled !== undefined ? Boolean(anyP.enabled) : true;
  const createdAt = anyP.createdAt ? String(anyP.createdAt) : new Date().toISOString();
  const updatedAt = anyP.updatedAt ? String(anyP.updatedAt) : new Date().toISOString();

  return {
    id: cleanId,
    name,
    baseUrl,
    format,
    apiKey,
    headers,
    models,
    enabled,
    createdAt,
    updatedAt,
  };
}

export function customProviderToServerProvider(cp: CustomProvider): ServerProvider {
  const norm = normalizeCustomProvider(cp);
  const cleanId = norm ? norm.id : `custom_${Date.now()}`;
  const instanceId = ProviderInstanceId.make(cleanId);
  const driver = ProviderDriverKind.make("custom");
  const name = norm ? norm.name : "Custom Provider";
  const enabled = norm ? norm.enabled : true;
  const models: ServerProviderModel[] =
    norm && norm.models.length > 0
      ? norm.models.map((m) => ({
          id: m.id,
          slug: m.id,
          name: m.name ?? m.id,
          displayName: m.name ?? m.id,
          isCustom: false,
          capabilities: null,
        }))
      : [
          {
            id: "default",
            slug: "default",
            name: `${name} (Default)`,
            displayName: `${name} (Default)`,
            isCustom: false,
            capabilities: null,
          },
        ];

  return {
    instanceId,
    driver,
    displayName: name,
    name,
    enabled,
    installed: true,
    version: null,
    status: enabled ? "ready" : "disabled",
    auth: { status: "authenticated" },
    checkedAt: new Date().toISOString(),
    availability: enabled ? "available" : "unavailable",
    models,
    slashCommands: [],
    skills: [],
  } as unknown as ServerProvider;
}

const STORAGE_KEY = "t3_custom_providers_v1";
const EVENT_KEY = "t3_custom_providers_updated";

export const DEFAULT_CUSTOM_PROVIDERS: CustomProvider[] = [
  {
    id: "custom_openrouter",
    name: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    apiKey: "",
    headers: [
      { key: "HTTP-Referer", value: "https://autojobs.tokendeal.cloud" },
      { key: "X-Title", value: "Jobi Code" },
    ],
    models: [
      { id: "openrouter/free", name: "Auto Free Router (OpenRouter)" },
      { id: "cohere/north-mini-code:free", name: "North Mini Code (Free)" },
      { id: "liquid/lfm-2.5-2.6b:free", name: "Liquid LFM 2.6B (Free)" },
      { id: "meta-llama/llama-3.3-70b-instruct:free", name: "Llama 3.3 70B (Free)" },
      { id: "deepseek/deepseek-r1:free", name: "DeepSeek R1 (Free)" },
      { id: "anthropic/claude-3.5-sonnet", name: "Claude 3.5 Sonnet" },
      { id: "openai/gpt-4o", name: "GPT-4o" },
      { id: "deepseek/deepseek-chat", name: "DeepSeek V3" },
    ],
    enabled: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
];

export function getCustomProviders(): CustomProvider[] {
  if (typeof window === "undefined") return [];
  try {
    let raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      raw =
        localStorage.getItem("t3code_custom_providers") ||
        localStorage.getItem("custom_providers") ||
        localStorage.getItem("t3_custom_providers");
    }
    if (!raw) {
      saveCustomProviders(DEFAULT_CUSTOM_PROVIDERS);
      return DEFAULT_CUSTOM_PROVIDERS;
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      saveCustomProviders(DEFAULT_CUSTOM_PROVIDERS);
      return DEFAULT_CUSTOM_PROVIDERS;
    }
    const normalized: CustomProvider[] = [];
    let needsRewrite = false;
    for (const item of parsed) {
      const norm = normalizeCustomProvider(item);
      if (norm) {
        normalized.push(norm);
        if (!item || typeof item !== "object" || item.id !== norm.id || item.name !== norm.name) {
          needsRewrite = true;
        }
      } else {
        needsRewrite = true;
      }
    }
    if (normalized.length === 0) {
      saveCustomProviders(DEFAULT_CUSTOM_PROVIDERS);
      return DEFAULT_CUSTOM_PROVIDERS;
    }
    if (needsRewrite) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
      } catch {}
    }
    return normalized;
  } catch (error) {
    console.error("Failed to load custom providers:", error);
    return DEFAULT_CUSTOM_PROVIDERS;
  }
}

export function saveCustomProviders(providers: CustomProvider[]): void {
  if (typeof window === "undefined") return;
  try {
    const normalized = (Array.isArray(providers) ? providers : [])
      .map(normalizeCustomProvider)
      .filter((p): p is CustomProvider => p !== null);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    window.dispatchEvent(new CustomEvent(EVENT_KEY, { detail: normalized }));
    // Synchronize with server database
    void fetch("/api/custom-provider/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ providers: normalized }),
    }).catch(() => {});
  } catch (error) {
    console.error("Failed to save custom providers:", error);
  }
}

export function saveCustomProvider(
  data: Omit<CustomProvider, "id" | "createdAt" | "updatedAt"> & { id?: string },
): CustomProvider {
  const providers = getCustomProviders();
  const now = new Date().toISOString();

  let updatedProvider: CustomProvider;
  if (data.id) {
    const rawId = String(data.id);
    const cleanId = rawId.startsWith("custom_") ? rawId : `custom_${rawId}`;
    const index = providers.findIndex((p) => p.id === cleanId || p.id === data.id);
    if (index !== -1) {
      const existing = providers[index]!;
      updatedProvider = {
        ...existing,
        ...data,
        id: existing.id,
        createdAt: existing.createdAt,
        updatedAt: now,
      };
      providers[index] = updatedProvider;
    } else {
      updatedProvider = {
        ...data,
        id: cleanId,
        createdAt: now,
        updatedAt: now,
      };
      providers.push(updatedProvider);
    }
  } else {
    updatedProvider = {
      ...data,
      id: `custom_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      createdAt: now,
      updatedAt: now,
    };
    providers.push(updatedProvider);
  }

  saveCustomProviders(providers);

  if (typeof window !== "undefined") {
    void fetch("/api/custom-provider/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updatedProvider),
    }).catch(() => {});
  }

  return updatedProvider;
}

export function toggleCustomProvider(id: string): boolean {
  if (!id) return false;
  const rawId = String(id);
  const cleanId = rawId.startsWith("custom_") ? rawId : `custom_${rawId}`;
  const providers = getCustomProviders();
  const provider = providers.find((p) => p.id === id || p.id === cleanId);
  if (!provider) return false;

  provider.enabled = !provider.enabled;
  provider.updatedAt = new Date().toISOString();
  saveCustomProviders(providers);
  return provider.enabled;
}

export function deleteCustomProvider(id: string): void {
  if (!id) return;
  const rawId = String(id);
  const cleanId = rawId.startsWith("custom_") ? rawId : `custom_${rawId}`;
  const providers = getCustomProviders();
  const filtered = providers.filter((p) => p.id !== id && p.id !== cleanId);
  saveCustomProviders(filtered);
  if (typeof window !== "undefined") {
    void fetch("/api/custom-provider/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: cleanId }),
    }).catch(() => {});
  }
}

// Fetch persisted custom providers from the server database on load
if (typeof window !== "undefined") {
  void (async () => {
    try {
      const res = await fetch("/api/custom-provider/list");
      if (res.ok) {
        const data = (await res.json()) as { ok?: boolean; providers?: CustomProvider[] };
        if (data.ok && Array.isArray(data.providers) && data.providers.length > 0) {
          const normalized = data.providers
            .map(normalizeCustomProvider)
            .filter((p): p is CustomProvider => p !== null);
          if (normalized.length > 0) {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
            window.dispatchEvent(new CustomEvent(EVENT_KEY, { detail: normalized }));
            return;
          }
        }
      }
    } catch {
      // server may be offline or connecting
    }

    // If server is empty, seed with current local non-empty providers
    const currentList = getCustomProviders();
    if (currentList.length > 0) {
      void fetch("/api/custom-provider/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providers: currentList }),
      }).catch(() => {});
    }
  })();
}

export function subscribeCustomProviders(
  callback: (providers: CustomProvider[]) => void,
): () => void {
  if (typeof window === "undefined") return () => {};

  const handler = (event: Event) => {
    const customEvent = event as CustomEvent<CustomProvider[]>;
    const detail = customEvent.detail;
    if (Array.isArray(detail)) {
      const normalized = detail
        .map(normalizeCustomProvider)
        .filter((p): p is CustomProvider => p !== null);
      callback(normalized);
    } else {
      callback(getCustomProviders());
    }
  };

  window.addEventListener(EVENT_KEY, handler);
  window.addEventListener("storage", (e) => {
    if (e.key === STORAGE_KEY) {
      callback(getCustomProviders());
    }
  });

  return () => {
    window.removeEventListener(EVENT_KEY, handler);
  };
}

/**
 * Normalizes a base URL by stripping trailing slashes.
 */
export function normalizeBaseUrl(url: string): string {
  let trimmed = url.trim().replace(/\/+$/, "");
  if (trimmed && !/^https?:\/\//i.test(trimmed)) {
    trimmed = `http://${trimmed}`;
  }
  return trimmed;
}

/**
 * Fetches available models from an OpenAI-compatible or Ollama endpoint.
 */
export async function fetchModelsFromProvider(
  baseUrl: string,
  apiKey?: string,
  headers?: CustomHeader[],
): Promise<{ success: boolean; models: CustomProviderModel[]; error?: string }> {
  const cleanBase = normalizeBaseUrl(baseUrl);
  if (!cleanBase) {
    return { success: false, models: [], error: "Base URL is required." };
  }

  // 1. First attempt via local server-side proxy to completely bypass browser CORS limitations
  try {
    const proxyResp = await fetch("/api/custom-provider/fetch-models", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ baseUrl: cleanBase, apiKey, headers }),
      signal: AbortSignal.timeout(12000),
    });

    if (proxyResp.ok) {
      const proxyResult = (await proxyResp.json()) as {
        ok: boolean;
        models?: CustomProviderModel[];
        error?: string;
      };
      if (proxyResult.ok && Array.isArray(proxyResult.models) && proxyResult.models.length > 0) {
        return { success: true, models: proxyResult.models };
      }
      if (proxyResult.error) {
        return { success: false, models: [], error: proxyResult.error };
      }
    }
  } catch {
    // If backend proxy endpoint is unavailable, fallback to direct browser fetch
  }

  // 2. Fallback to direct client-side fetch
  const requestHeaders: Record<string, string> = {
    Accept: "application/json",
  };

  if (apiKey && apiKey.trim().length > 0) {
    requestHeaders["Authorization"] = `Bearer ${apiKey.trim()}`;
  }

  if (headers && headers.length > 0) {
    for (const h of headers) {
      if (h.key && h.key.trim().length > 0) {
        requestHeaders[h.key.trim()] = h.value.trim();
      }
    }
  }

  // Attempt standard OpenAI endpoint: /models
  const modelsUrl = cleanBase.endsWith("/v1")
    ? `${cleanBase}/models`
    : cleanBase.includes("/v1/")
      ? `${cleanBase}/models`
      : `${cleanBase}/v1/models`;

  const directUrl = `${cleanBase}/models`;

  const urlsToTry = [modelsUrl];
  if (modelsUrl !== directUrl) {
    urlsToTry.push(directUrl);
  }

  // Also include Ollama /api/tags if host resembles ollama or localhost:11434
  if (cleanBase.includes("11434") || cleanBase.toLowerCase().includes("ollama")) {
    const rootUrl = cleanBase.replace(/\/v1$/, "");
    urlsToTry.push(`${rootUrl}/api/tags`);
  }

  let lastError = "Could not connect to provider";

  for (const url of urlsToTry) {
    try {
      const response = await fetch(url, {
        method: "GET",
        headers: requestHeaders,
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        lastError = `Server responded with ${response.status} ${response.statusText}`;
        continue;
      }

      const data = await response.json();

      // Format 1: OpenAI standard: { data: [{ id: "model-name" }] }
      if (data && Array.isArray(data.data)) {
        const models: CustomProviderModel[] = data.data
          .filter(
            (item: unknown) =>
              typeof item === "object" &&
              item !== null &&
              ("id" in item || "serviceId" in item || "name" in item),
          )
          .map(
            (item: { id?: string; serviceId?: string; name?: string; displayName?: string }) => ({
              id: String(item.id || item.serviceId || item.name),
              name: typeof item.name === "string" ? item.name : item.displayName || undefined,
            }),
          );

        if (models.length > 0) {
          return { success: true, models };
        }
      }

      // Format 2: Ollama /api/tags: { models: [{ name: "model-name" }] }
      if (data && Array.isArray(data.models)) {
        const models: CustomProviderModel[] = data.models
          .filter(
            (item: unknown) =>
              typeof item === "object" &&
              item !== null &&
              ("name" in item || "id" in item || "serviceId" in item),
          )
          .map((item: { id?: string; name?: string; serviceId?: string }) => ({
            id: String(item.id || item.name || item.serviceId),
            name: typeof item.name === "string" ? item.name : undefined,
          }));

        if (models.length > 0) {
          return { success: true, models };
        }
      }

      // Format 3: Direct array: [{ id: "model-name" }]
      if (Array.isArray(data)) {
        const models: CustomProviderModel[] = (data as Array<Record<string, unknown>>)
          .filter(
            (item): item is Record<string, unknown> =>
              typeof item === "object" &&
              item !== null &&
              ("id" in item || "serviceId" in item || "name" in item),
          )
          .map((item) => ({
            id: String(item.id ?? item.serviceId ?? item.name ?? ""),
            name: typeof item.name === "string" ? item.name : undefined,
          }))
          .filter((m) => m.id.length > 0);

        if (models.length > 0) {
          return { success: true, models };
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        lastError = err.message;
      }
    }
  }

  return {
    success: false,
    models: [],
    error: `${lastError}. Verify that the server is running and accessible.`,
  };
}
