import { useCallback, useEffect, useState } from "react";
import {
  CheckIcon,
  CopyIcon,
  Edit3Icon,
  EyeIcon,
  EyeOffIcon,
  GlobeIcon,
  KeyIcon,
  LayersIcon,
  PauseIcon,
  PlayIcon,
  PlusIcon,
  RefreshCwIcon,
  ServerIcon,
  SlidersIcon,
  SparklesIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";

import {
  type CustomHeader,
  type CustomProvider,
  type CustomProviderModel,
  deleteCustomProvider,
  fetchModelsFromProvider,
  getCustomProviders,
  saveCustomProvider,
  subscribeCustomProviders,
  toggleCustomProvider,
} from "../../lib/customProviders";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { Switch } from "../ui/switch";
import { toastManager } from "../ui/toast";
import { SettingsPageContainer, SettingsRow, SettingsSection } from "./settingsLayout";

interface ProviderPreset {
  name: string;
  baseUrl: string;
  defaultHeaders?: CustomHeader[];
  hint: string;
}

const PRESETS: ProviderPreset[] = [
  {
    name: "Ollama (Local)",
    baseUrl: "http://127.0.0.1:11434/v1",
    hint: "No API key needed by default",
  },
  {
    name: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    defaultHeaders: [
      { key: "HTTP-Referer", value: "https://t3.codes" },
      { key: "X-Title", value: "T3 Code" },
    ],
    hint: "Requires OpenRouter API key",
  },
  {
    name: "LM Studio",
    baseUrl: "http://127.0.0.1:1234/v1",
    hint: "Local OpenAI-compatible endpoint",
  },
  {
    name: "vLLM Local",
    baseUrl: "http://127.0.0.1:8000/v1",
    hint: "High-throughput local LLM server",
  },
  {
    name: "Groq",
    baseUrl: "https://api.groq.com/openai/v1",
    hint: "Ultra-fast Llama & DeepSeek inference",
  },
];

export function CustomProvidersSettingsPanel() {
  const [providers, setProviders] = useState<CustomProvider[]>(() => getCustomProviders());
  const [editingProviderId, setEditingProviderId] = useState<string | null>(null);

  // Form State
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [headers, setHeaders] = useState<CustomHeader[]>([]);
  const [modelIdsInput, setModelIdsInput] = useState("");
  const [loadedModels, setLoadedModels] = useState<CustomProviderModel[]>([]);
  const [isFetchingModels, setIsFetchingModels] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    return subscribeCustomProviders((updated) => {
      setProviders(updated);
    });
  }, []);

  const resetForm = useCallback(() => {
    setEditingProviderId(null);
    setName("");
    setBaseUrl("");
    setApiKey("");
    setShowApiKey(false);
    setHeaders([]);
    setModelIdsInput("");
    setLoadedModels([]);
    setFetchError(null);
  }, []);

  const handleApplyPreset = (preset: ProviderPreset) => {
    setName(preset.name);
    setBaseUrl(preset.baseUrl);
    if (preset.defaultHeaders) {
      setHeaders(preset.defaultHeaders);
    }
    setFetchError(null);
  };

  const handleStartEdit = (provider: CustomProvider) => {
    setEditingProviderId(provider.id);
    setName(provider.name);
    setBaseUrl(provider.baseUrl);
    setApiKey(provider.apiKey ?? "");
    setHeaders(provider.headers ?? []);
    setLoadedModels(provider.models ?? []);
    setModelIdsInput(provider.models.map((m) => m.id).join(", "));
    setFetchError(null);

    // Scroll to form
    const formElement = document.getElementById("custom-provider-form");
    if (formElement) {
      formElement.scrollIntoView({ behavior: "smooth" });
    }
  };

  const handleFetchModels = async () => {
    if (!baseUrl.trim()) {
      setFetchError("Please enter a valid Base URL first.");
      return;
    }

    setIsFetchingModels(true);
    setFetchError(null);

    const result = await fetchModelsFromProvider(baseUrl, apiKey, headers);
    setIsFetchingModels(false);

    if (result.success && result.models.length > 0) {
      setLoadedModels(result.models);
      setModelIdsInput(result.models.map((m) => m.id).join(", "));
      toastManager.add({
        type: "success",
        title: "Models loaded successfully",
        description: `Discovered ${result.models.length} model(s) from ${baseUrl}`,
      });
    } else {
      setFetchError(result.error ?? "Failed to load models. Check URL and credentials.");
      toastManager.add({
        type: "error",
        title: "Could not load models",
        description: result.error ?? "Please ensure the endpoint is running and supports /models.",
      });
    }
  };

  const handleAddHeader = () => {
    setHeaders((prev) => [...prev, { key: "", value: "" }]);
  };

  const handleUpdateHeader = (index: number, key: string, value: string) => {
    setHeaders((prev) => {
      const copy = [...prev];
      copy[index] = { key, value };
      return copy;
    });
  };

  const handleRemoveHeader = (index: number) => {
    setHeaders((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      toastManager.add({ type: "error", title: "Provider Name is required" });
      return;
    }
    if (!baseUrl.trim()) {
      toastManager.add({ type: "error", title: "API Base URL is required" });
      return;
    }

    // Parse models from modelIdsInput
    const parsedModelIds = modelIdsInput
      .split(/[,\n]/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    const finalModels: CustomProviderModel[] = parsedModelIds.map((id) => {
      const existing = loadedModels.find((m) => m.id === id);
      return existing ?? { id };
    });

    // Clean headers
    const cleanHeaders = headers.filter((h) => h.key.trim().length > 0);

    saveCustomProvider({
      ...(editingProviderId ? { id: editingProviderId } : {}),
      name: name.trim(),
      baseUrl: baseUrl.trim(),
      ...(apiKey.trim().length > 0 ? { apiKey: apiKey.trim() } : {}),
      ...(cleanHeaders.length > 0 ? { headers: cleanHeaders } : {}),
      models: finalModels,
      enabled: true,
    });

    toastManager.add({
      type: "success",
      title: editingProviderId ? "Custom provider updated" : "Custom provider added",
      description: `"${name.trim()}" is now ready and available across projects.`,
    });

    resetForm();
  };

  const handleCopyUrl = (id: string, url: string) => {
    void navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const handleDelete = (provider: CustomProvider) => {
    deleteCustomProvider(provider.id);
    if (editingProviderId === provider.id) {
      resetForm();
    }
    toastManager.add({
      type: "neutral",
      title: "Provider removed",
      description: `Removed "${provider.name}".`,
    });
  };

  const activeCount = providers.filter((p) => p.enabled).length;

  return (
    <SettingsPageContainer>
      {/* Header section */}
      <div className="flex flex-col gap-2 border-b border-border/40 pb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg border border-border/80 bg-muted/40 shadow-xs">
              <ServerIcon className="size-5 text-foreground/80" />
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-foreground">
                Custom Providers
              </h1>
              <p className="text-sm text-muted-foreground">
                Connect OpenAI-compatible APIs, local Ollama, OpenRouter, vLLM, or LM Studio with
                custom headers.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-card px-2.5 py-1 text-xs font-medium text-foreground">
              <span className="size-2 rounded-full bg-emerald-500" />
              {activeCount} of {providers.length} Active
            </span>
          </div>
        </div>
      </div>

      {/* TOP SECTION: Configured Custom Providers (List Style) */}
      <SettingsSection title="Configured Providers">
        <p className="px-3 pb-2 text-xs text-muted-foreground sm:px-4">
          All added custom endpoints. You can toggle active/paused status, refresh models, edit
          settings, or delete providers.
        </p>
        {providers.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/80 bg-card/40 p-8 text-center">
            <SlidersIcon className="mb-3 size-8 text-muted-foreground/60" />
            <h3 className="text-sm font-medium text-foreground">
              No custom providers configured yet
            </h3>
            <p className="mt-1 max-w-sm text-xs text-muted-foreground">
              Add your local Ollama instance or third-party OpenAI-compatible APIs using the form
              below.
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <Button size="xs" variant="outline" onClick={() => handleApplyPreset(PRESETS[0]!)}>
                + Quick Add Ollama (Local)
              </Button>
              <Button size="xs" variant="outline" onClick={() => handleApplyPreset(PRESETS[1]!)}>
                + Quick Add OpenRouter
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {providers.map((p) => {
              const isEditing = editingProviderId === p.id;
              return (
                <div
                  key={p.id}
                  className={cn(
                    "flex flex-col rounded-xl border bg-card p-4 shadow-2xs transition-colors",
                    isEditing
                      ? "border-foreground/40 ring-1 ring-foreground/20"
                      : "border-border/80 hover:border-border",
                    !p.enabled && "opacity-75 bg-muted/20",
                  )}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="flex size-9 items-center justify-center rounded-md border border-border/70 bg-muted/30">
                        <GlobeIcon className="size-4 text-foreground/70" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-semibold text-foreground">{p.name}</h4>
                          <span
                            className={cn(
                              "inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium border",
                              p.enabled
                                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                                : "border-amber-500/30 bg-amber-500/10 text-amber-400",
                            )}
                          >
                            {p.enabled ? "Active" : "Paused"}
                          </span>
                          {p.apiKey && (
                            <span className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-muted/40 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                              <KeyIcon className="size-2.5" /> API Key
                            </span>
                          )}
                          {p.headers && p.headers.length > 0 && (
                            <span className="rounded-md border border-border/60 bg-muted/40 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                              {p.headers.length} header(s)
                            </span>
                          )}
                        </div>
                        <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground font-mono">
                          <span className="truncate max-w-sm">{p.baseUrl}</span>
                          <button
                            type="button"
                            onClick={() => handleCopyUrl(p.id, p.baseUrl)}
                            className="text-muted-foreground hover:text-foreground"
                            title="Copy Base URL"
                          >
                            {copiedId === p.id ? (
                              <CheckIcon className="size-3 text-emerald-400" />
                            ) : (
                              <CopyIcon className="size-3" />
                            )}
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Actions: Pause, Edit, Delete */}
                    <div className="flex items-center gap-2">
                      <Button
                        size="xs"
                        variant="outline"
                        onClick={() => toggleCustomProvider(p.id)}
                        title={p.enabled ? "Pause Provider" : "Resume Provider"}
                      >
                        {p.enabled ? (
                          <>
                            <PauseIcon className="size-3 text-amber-400" />
                            Pause
                          </>
                        ) : (
                          <>
                            <PlayIcon className="size-3 text-emerald-400" />
                            Resume
                          </>
                        )}
                      </Button>
                      <Button
                        size="xs"
                        variant="outline"
                        onClick={() => handleStartEdit(p)}
                        title="Edit Provider"
                      >
                        <Edit3Icon className="size-3" />
                        Edit
                      </Button>
                      <Button
                        size="xs"
                        variant="destructive"
                        onClick={() => handleDelete(p)}
                        title="Delete Provider"
                      >
                        <Trash2Icon className="size-3" />
                      </Button>
                    </div>
                  </div>

                  {/* Loaded Models pills */}
                  <div className="mt-3 border-t border-border/40 pt-3">
                    <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                      <LayersIcon className="size-3" />
                      <span>Loaded Models ({p.models.length}):</span>
                    </div>
                    {p.models.length === 0 ? (
                      <p className="mt-1 text-xs italic text-muted-foreground">
                        No models added yet. Click &quot;Edit&quot; to fetch or specify models.
                      </p>
                    ) : (
                      <div className="mt-2 flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pr-1">
                        {p.models.map((m) => (
                          <span
                            key={m.id}
                            className="inline-flex items-center rounded-md border border-border/80 bg-muted/40 px-2 py-0.5 font-mono text-[11px] text-foreground"
                          >
                            {m.id}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </SettingsSection>

      {/* BOTTOM SECTION: Add / Edit Custom Provider Form */}
      <div id="custom-provider-form">
        <SettingsSection title={editingProviderId ? "Edit Custom Provider" : "Add Custom Provider"}>
          <p className="px-3 pb-2 text-xs text-muted-foreground sm:px-4">
            Configure an endpoint with its base URL, optional API key, custom headers, and models.
          </p>
          <form
            onSubmit={handleSave}
            className="flex flex-col gap-5 rounded-xl border border-border/80 bg-card p-5 shadow-2xs"
          >
            {/* Presets Row (only when creating new) */}
            {!editingProviderId && (
              <div>
                <label className="text-xs font-medium text-muted-foreground">Quick Presets:</label>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {PRESETS.map((preset) => (
                    <button
                      key={preset.name}
                      type="button"
                      onClick={() => handleApplyPreset(preset)}
                      className="rounded-md border border-border/80 bg-muted/30 px-2.5 py-1 text-xs font-medium text-foreground/90 transition-colors hover:bg-muted/70 hover:border-foreground/30"
                    >
                      {preset.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Provider Name & Base URL */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-foreground">
                  Provider Name <span className="text-destructive">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. My Local Ollama, OpenRouter"
                  required
                  className="h-9 w-full rounded-md border border-border/80 bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-foreground/50 focus:outline-hidden"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-foreground">
                  API Base URL <span className="text-destructive">*</span>
                </label>
                <input
                  type="url"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="e.g. http://127.0.0.1:11434/v1"
                  required
                  className="h-9 w-full rounded-md border border-border/80 bg-background px-3 font-mono text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-foreground/50 focus:outline-hidden"
                />
              </div>
            </div>

            {/* API Key (Optional) */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-foreground">
                  API Key{" "}
                  <span className="text-xs font-normal text-muted-foreground">(Optional)</span>
                </label>
                <span className="text-[11px] text-muted-foreground">
                  Leave empty for local Ollama / unauthenticated servers
                </span>
              </div>
              <div className="relative flex items-center">
                <input
                  type={showApiKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-... (optional)"
                  className="h-9 w-full rounded-md border border-border/80 bg-background pr-10 pl-3 font-mono text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-foreground/50 focus:outline-hidden"
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey((v) => !v)}
                  className="absolute right-2.5 text-muted-foreground hover:text-foreground"
                  title={showApiKey ? "Hide key" : "Show key"}
                >
                  {showApiKey ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
                </button>
              </div>
            </div>

            {/* Custom Headers (Optional) */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-foreground">
                  Custom HTTP Headers{" "}
                  <span className="text-xs font-normal text-muted-foreground">(Optional)</span>
                </label>
                <Button type="button" size="xs" variant="outline" onClick={handleAddHeader}>
                  <PlusIcon className="size-3" /> Add Header
                </Button>
              </div>

              {headers.length > 0 && (
                <div className="flex flex-col gap-2 rounded-lg border border-border/60 bg-muted/20 p-3">
                  {headers.map((h, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <input
                        type="text"
                        value={h.key}
                        onChange={(e) => handleUpdateHeader(index, e.target.value, h.value)}
                        placeholder="Header Name (e.g. HTTP-Referer)"
                        className="h-8 flex-1 rounded-md border border-border/80 bg-background px-2.5 font-mono text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-hidden"
                      />
                      <input
                        type="text"
                        value={h.value}
                        onChange={(e) => handleUpdateHeader(index, h.key, e.target.value)}
                        placeholder="Header Value"
                        className="h-8 flex-1 rounded-md border border-border/80 bg-background px-2.5 font-mono text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-hidden"
                      />
                      <button
                        type="button"
                        onClick={() => handleRemoveHeader(index)}
                        className="p-1 text-muted-foreground hover:text-destructive"
                        title="Remove header"
                      >
                        <Trash2Icon className="size-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Models Configuration & Live Fetch */}
            <div className="flex flex-col gap-2.5 border-t border-border/40 pt-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <label className="text-xs font-semibold text-foreground">
                    Model IDs &amp; Discovery
                  </label>
                  <p className="text-[11px] text-muted-foreground">
                    Click &quot;Fetch / Load Models&quot; to auto-discover models from the endpoint,
                    or enter them manually.
                  </p>
                </div>
                <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  disabled={isFetchingModels || !baseUrl.trim()}
                  onClick={handleFetchModels}
                  className="font-medium"
                >
                  <RefreshCwIcon className={cn("size-3.5", isFetchingModels && "animate-spin")} />
                  {isFetchingModels ? "Fetching Models..." : "Fetch / Load Models"}
                </Button>
              </div>

              {fetchError && (
                <div className="rounded-md border border-destructive/30 bg-destructive/10 p-2.5 text-xs text-destructive">
                  {fetchError}
                </div>
              )}

              <div className="flex flex-col gap-1.5">
                <textarea
                  value={modelIdsInput}
                  onChange={(e) => setModelIdsInput(e.target.value)}
                  placeholder="Enter model IDs separated by commas or newlines (e.g. qwen2.5-coder:7b, llama3.2, mistral)"
                  rows={3}
                  className="w-full rounded-md border border-border/80 bg-background p-2.5 font-mono text-xs text-foreground placeholder:text-muted-foreground/60 focus:border-foreground/50 focus:outline-hidden"
                />
              </div>

              {loadedModels.length > 0 && (
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] font-medium text-muted-foreground">
                    Discovered ({loadedModels.length}):
                  </span>
                  {loadedModels.slice(0, 10).map((m) => (
                    <span
                      key={m.id}
                      className="rounded-md border border-border/80 bg-muted/40 px-2 py-0.5 font-mono text-[10px] text-foreground"
                    >
                      {m.id}
                    </span>
                  ))}
                  {loadedModels.length > 10 && (
                    <span className="text-[10px] text-muted-foreground">
                      +{loadedModels.length - 10} more
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Form Actions */}
            <div className="flex items-center justify-end gap-2 border-t border-border/40 pt-4">
              {editingProviderId && (
                <Button type="button" size="sm" variant="outline" onClick={resetForm}>
                  Cancel
                </Button>
              )}
              <Button type="submit" size="sm">
                <SparklesIcon className="size-3.5" />
                {editingProviderId ? "Update Custom Provider" : "Save Custom Provider"}
              </Button>
            </div>
          </form>
        </SettingsSection>
      </div>
    </SettingsPageContainer>
  );
}
