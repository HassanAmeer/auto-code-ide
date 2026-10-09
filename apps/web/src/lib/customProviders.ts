/**
 * Custom Providers storage and API client for OpenAI-compatible, Ollama,
 * OpenRouter, and other third-party LLM endpoints.
 */

export interface CustomHeader {
  key: string;
  value: string;
}

export interface CustomProviderModel {
  id: string;
  name?: string;
}

export interface CustomProvider {
  id: string;
  name: string;
  baseUrl: string;
  apiKey?: string;
  headers?: CustomHeader[];
  models: CustomProviderModel[];
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

const STORAGE_KEY = "t3_custom_providers_v1";
const EVENT_KEY = "t3_custom_providers_updated";

export function getCustomProviders(): CustomProvider[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error("Failed to load custom providers:", error);
    return [];
  }
}

export function saveCustomProviders(providers: CustomProvider[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(providers));
    window.dispatchEvent(new CustomEvent(EVENT_KEY, { detail: providers }));
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
          .filter((item: unknown) => typeof item === "object" && item !== null && "id" in item)
          .map((item: { id: string; name?: string }) => ({
            id: String(item.id),
            name: typeof item.name === "string" ? item.name : undefined,
          }));

        if (models.length > 0) {
          return { success: true, models };
        }
      }

      // Format 2: Ollama /api/tags: { models: [{ name: "model-name" }] }
      if (data && Array.isArray(data.models)) {
        const models: CustomProviderModel[] = data.models
          .filter(
            (item: unknown) =>
              typeof item === "object" && item !== null && ("name" in item || "id" in item),
          )
          .map((item: { id?: string; name?: string }) => ({
            id: String(item.id || item.name),
            name: typeof item.name === "string" ? item.name : undefined,
          }));

        if (models.length > 0) {
          return { success: true, models };
        }
      }

      // Format 3: Direct array: [{ id: "model-name" }]
      if (Array.isArray(data)) {
        const models: CustomProviderModel[] = data
          .filter(
            (item: unknown) =>
              typeof item === "object" && item !== null && ("id" in item || "name" in item),
          )
          .map((item: { id?: string; name?: string }) => ({
            id: String(item.id || item.name),
            name: typeof item.name === "string" ? item.name : undefined,
          }));

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
