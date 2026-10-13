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

export interface CustomProvider {
  id: string;
  name: string;
  baseUrl: string;
  apiKey?: string | undefined;
  headers?: CustomHeader[] | undefined;
  models: CustomProviderModel[];
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export function customProviderToServerProvider(cp: CustomProvider): ServerProvider {
  const cleanId = cp.id.startsWith("custom_") ? cp.id : `custom_${cp.id}`;
  const instanceId = ProviderInstanceId.make(cleanId);
  const driver = ProviderDriverKind.make("custom");
  const models: ServerProviderModel[] =
    cp.models && cp.models.length > 0
      ? cp.models.map((m) => ({
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
            name: `${cp.name} (Default)`,
            displayName: `${cp.name} (Default)`,
            isCustom: false,
            capabilities: null,
          },
        ];

  return {
    instanceId,
    driver,
    displayName: cp.name,
    name: cp.name,
    enabled: cp.enabled,
    installed: true,
    version: null,
    status: cp.enabled ? "ready" : "disabled",
    auth: { status: "authenticated" },
    checkedAt: new Date().toISOString(),
    availability: cp.enabled ? "available" : "unavailable",
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
      { id: "meta-llama/llama-3.3-70b-instruct:free", name: "Llama 3.3 70B (Free)" },
      { id: "google/gemini-2.0-flash-exp:free", name: "Gemini 2.0 Flash Exp (Free)" },
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
    return parsed;
  } catch (error) {
    console.error("Failed to load custom providers:", error);
    return DEFAULT_CUSTOM_PROVIDERS;
  }
}

export function saveCustomProviders(providers: CustomProvider[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(providers));
    window.dispatchEvent(new CustomEvent(EVENT_KEY, { detail: providers }));
    // Synchronize with server in the background
    void fetch("/api/custom-provider/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ providers }),
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

  if (data.id) {
    const index = providers.findIndex((p) => p.id === data.id);
    if (index !== -1) {
      const existing = providers[index]!;
      const updated: CustomProvider = {
        ...existing,
        ...data,
        id: existing.id,
        createdAt: existing.createdAt,
        updatedAt: now,
      };
      providers[index] = updated;
      saveCustomProviders(providers);
      return updated;
    }
  }

  const newProvider: CustomProvider = {
    ...data,
    id: data.id || `custom_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    createdAt: now,
    updatedAt: now,
  };
  providers.push(newProvider);
  saveCustomProviders(providers);
  return newProvider;
}

export function toggleCustomProvider(id: string): boolean {
  const providers = getCustomProviders();
  const provider = providers.find((p) => p.id === id);
  if (!provider) return false;

  provider.enabled = !provider.enabled;
  provider.updatedAt = new Date().toISOString();
  saveCustomProviders(providers);
  return provider.enabled;
}

export function deleteCustomProvider(id: string): void {
  const providers = getCustomProviders();
  const filtered = providers.filter((p) => p.id !== id);
  saveCustomProviders(filtered);
  if (typeof window !== "undefined") {
    void fetch("/api/custom-provider/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    }).catch(() => {});
  }
}

// Auto-sync existing custom providers to the server on module load
if (typeof window !== "undefined") {
  setTimeout(() => {
    const list = getCustomProviders();
    if (list.length > 0) {
      void fetch("/api/custom-provider/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providers: list }),
      }).catch(() => {});
    }
  }, 200);
}

export function subscribeCustomProviders(
  callback: (providers: CustomProvider[]) => void,
): () => void {
  if (typeof window === "undefined") return () => {};

  const handler = (event: Event) => {
    const customEvent = event as CustomEvent<CustomProvider[]>;
    callback(customEvent.detail ?? getCustomProviders());
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
  return url.trim().replace(/\/+$/, "");
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
