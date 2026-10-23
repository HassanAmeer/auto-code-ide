import { useCallback, useEffect, useState } from "react";
import {
  CheckIcon,
  ChevronDownIcon,
  CopyIcon,
  Edit3Icon,
  EyeIcon,
  EyeOffIcon,
  GlobeIcon,
  KeyIcon,
  LayersIcon,
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
  type ProviderFormat,
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
import { SettingsPageContainer, SettingsSection } from "./settingsLayout";

export function CustomProvidersSettingsPanel() {
  const [providers, setProviders] = useState<CustomProvider[]>(() => getCustomProviders());
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingProviderId, setEditingProviderId] = useState<string | null>(null);
  const [expandedTileIds, setExpandedTileIds] = useState<Set<string>>(() => new Set());

  // Form State
  const [name, setName] = useState("");
  const [format, setFormat] = useState<ProviderFormat>("openai");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [headers, setHeaders] = useState<CustomHeader[]>([]);
  const [modelIdsInput, setModelIdsInput] = useState("");
  const [loadedModels, setLoadedModels] = useState<CustomProviderModel[]>([]);
  const [isFetchingModels, setIsFetchingModels] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Quick Action State
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [refreshingTileId, setRefreshingTileId] = useState<string | null>(null);

  useEffect(() => {
    return subscribeCustomProviders((updated) => {
      setProviders(updated);
    });
  }, []);

  const resetForm = useCallback(() => {
    setEditingProviderId(null);
    setName("");
    setFormat("openai");
    setBaseUrl("");
    setApiKey("");
    setShowApiKey(false);
    setHeaders([]);
    setModelIdsInput("");
    setLoadedModels([]);
    setFetchError(null);
    setIsFormOpen(false);
  }, []);

  const handleOpenAddForm = () => {
    resetForm();
    setIsFormOpen(true);
    setTimeout(() => {
      document.getElementById("custom-provider-form-card")?.scrollIntoView({ behavior: "smooth" });
    }, 50);
  };

  const handleStartEdit = (provider: CustomProvider) => {
    setEditingProviderId(provider.id);
    setName(provider.name);
    setFormat(provider.format || "openai");
    setBaseUrl(provider.baseUrl);
    setApiKey(provider.apiKey ?? "");
    setHeaders(provider.headers ?? []);
    setLoadedModels(provider.models ?? []);
    setModelIdsInput(provider.models.map((m) => m.id).join(", "));
    setFetchError(null);
    setIsFormOpen(true);

    setTimeout(() => {
      document.getElementById("custom-provider-form-card")?.scrollIntoView({ behavior: "smooth" });
    }, 50);
  };

  const toggleTileExpand = (id: string) => {
    setExpandedTileIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
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
        description: `Discovered ${result.models.length} model(s) from endpoint.`,
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

  const handleTileRefreshModels = async (p: CustomProvider) => {
    setRefreshingTileId(p.id);
    try {
      const result = await fetchModelsFromProvider(p.baseUrl, p.apiKey, p.headers);
      if (result.success && result.models.length > 0) {
        saveCustomProvider({
          ...p,
          models: result.models,
        });
        setProviders(getCustomProviders());
        if (editingProviderId === p.id) {
          setLoadedModels(result.models);
          setModelIdsInput(result.models.map((m) => m.id).join(", "));
        }
        toastManager.add({
          type: "success",
          title: "Models updated",
          description: `Discovered and saved ${result.models.length} model(s) for "${p.name}".`,
        });
      } else {
        toastManager.add({
          type: "error",
          title: "Could not load models",
          description: result.error ?? "Failed to fetch models from endpoint.",
        });
      }
    } catch (err: unknown) {
      toastManager.add({
        type: "error",
        title: "Fetch error",
        description: err instanceof Error ? err.message : "Network error",
      });
    } finally {
      setRefreshingTileId(null);
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
      format,
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

  const handleCopyText = (id: string, text: string) => {
    void navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const handleDelete = (provider: CustomProvider) => {
    if (!window.confirm(`Are you sure you want to remove "${provider.name}"?`)) {
      return;
    }
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
      <div className="flex flex-col gap-2 border-b border-border/40 pb-5">
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
                Connect OpenAI, Claude/Anthropic, or Gemini compatible endpoints with custom models
                and headers.
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

      {/* TOP SECTION: Single Collapsible Form Card ("+ Add Custom Provider") */}
      <div id="custom-provider-form-card" className="flex flex-col gap-3">
        <div className="rounded-xl border border-border/80 bg-card overflow-hidden shadow-2xs transition-all">
          {/* Collapsible Card Header */}
          <div
            className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors select-none"
            onClick={() => {
              if (isFormOpen && editingProviderId) {
                resetForm();
              } else {
                setIsFormOpen((v) => !v);
              }
            }}
          >
            <div className="flex items-center gap-2.5">
              <div className="flex size-7 items-center justify-center rounded-md border border-border/60 bg-muted/40 text-foreground">
                {editingProviderId ? (
                  <Edit3Icon className="size-3.5 text-primary" />
                ) : (
                  <PlusIcon className="size-3.5" />
                )}
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground">
                  {editingProviderId
                    ? `Edit Provider: ${name || "Untitled"}`
                    : "Add Custom Provider"}
                </h3>
                <p className="text-[11px] text-muted-foreground">
                  {isFormOpen
                    ? "Fill in endpoint details, credentials, and models below"
                    : "Click to expand provider configuration form"}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {!isFormOpen && (
                <Button
                  size="xs"
                  variant="outline"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleOpenAddForm();
                  }}
                  className="gap-1 font-medium"
                >
                  <PlusIcon className="size-3" />
                  Add Provider
                </Button>
              )}
              <ChevronDownIcon
                className={cn(
                  "size-4 text-muted-foreground transition-transform duration-200",
                  isFormOpen && "rotate-180",
                )}
              />
            </div>
          </div>

          {/* Form Content (when expanded) */}
          {isFormOpen && (
            <form
              onSubmit={handleSave}
              className="border-t border-border/60 p-4 sm:p-5 flex flex-col gap-4 bg-muted/[0.02]"
            >
              {/* Row 1: Name and Format */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-foreground">
                    Provider Name <span className="text-destructive">*</span>
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. My Local Ollama, OpenRouter, Self-Hosted LLM"
                    required
                    className="h-9 w-full rounded-md border border-border/80 bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-foreground/50 focus:outline-hidden"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-foreground">
                    Provider Format Type <span className="text-destructive">*</span>
                  </label>
                  <select
                    value={format}
                    onChange={(e) => setFormat(e.target.value as ProviderFormat)}
                    className="h-9 w-full rounded-md border border-border/80 bg-background px-3 text-sm text-foreground focus:border-foreground/50 focus:outline-hidden cursor-pointer"
                  >
                    <option value="openai">
                      OpenAI Compatible (Ollama, vLLM, OpenRouter, LM Studio)
                    </option>
                    <option value="anthropic">Anthropic / Claude Compatible</option>
                    <option value="gemini">Google Gemini Compatible</option>
                  </select>
                </div>
              </div>

              {/* Row 2: Base URL */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-foreground">
                  API Base URL <span className="text-destructive">*</span>
                </label>
                <input
                  type="url"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder={
                    format === "anthropic"
                      ? "https://api.anthropic.com/v1"
                      : format === "gemini"
                        ? "https://generativelanguage.googleapis.com/v1beta"
                        : "http://127.0.0.1:11434/v1 or https://openrouter.ai/api/v1"
                  }
                  required
                  className="h-9 w-full rounded-md border border-border/80 bg-background px-3 font-mono text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-foreground/50 focus:outline-hidden"
                />
                <p className="text-[11px] text-muted-foreground">
                  Standard endpoint URL without endpoints like /chat/completions (e.g.
                  http://127.0.0.1:11434/v1).
                </p>
              </div>

              {/* Row 3: API Key (Optional) */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-foreground">
                    API Key{" "}
                    <span className="text-xs font-normal text-muted-foreground">(Optional)</span>
                  </label>
                  <span className="text-[11px] text-muted-foreground">
                    Leave empty for local servers or unauthenticated gateways
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
                    className="absolute right-2.5 text-muted-foreground hover:text-foreground cursor-pointer"
                    title={showApiKey ? "Hide key" : "Show key"}
                  >
                    {showApiKey ? (
                      <EyeOffIcon className="size-4" />
                    ) : (
                      <EyeIcon className="size-4" />
                    )}
                  </button>
                </div>
              </div>

              {/* Row 4: Custom HTTP Headers (Optional) */}
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
                  <div className="flex flex-col gap-2 rounded-lg border border-border/60 bg-muted/20 p-2.5">
                    {headers.map((h, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <input
                          type="text"
                          value={h.key}
                          onChange={(e) => handleUpdateHeader(index, e.target.value, h.value)}
                          placeholder="Header Name (e.g. HTTP-Referer, anthropic-version)"
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
                          className="p-1 text-muted-foreground hover:text-destructive cursor-pointer"
                          title="Remove header"
                        >
                          <Trash2Icon className="size-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Row 5: Model IDs & Discovery */}
              <div className="flex flex-col gap-2 border-t border-border/40 pt-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <label className="text-xs font-semibold text-foreground">
                      Model IDs &amp; Discovery
                    </label>
                    <p className="text-[11px] text-muted-foreground">
                      Click &quot;Load Models&quot; to auto-discover models or type model slugs
                      manually.
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="xs"
                    variant="outline"
                    disabled={isFetchingModels || !baseUrl.trim()}
                    onClick={handleFetchModels}
                    className="font-medium gap-1.5"
                  >
                    <RefreshCwIcon className={cn("size-3.5", isFetchingModels && "animate-spin")} />
                    {isFetchingModels ? "Loading Models..." : "Load Models"}
                  </Button>
                </div>

                {fetchError && (
                  <div className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">
                    {fetchError}
                  </div>
                )}

                <textarea
                  value={modelIdsInput}
                  onChange={(e) => setModelIdsInput(e.target.value)}
                  placeholder="Enter model IDs separated by commas or newlines (e.g. qwen2.5-coder:7b, llama3.3, claude-3-5-sonnet)"
                  rows={2}
                  className="w-full rounded-md border border-border/80 bg-background p-2.5 font-mono text-xs text-foreground placeholder:text-muted-foreground/60 focus:border-foreground/50 focus:outline-hidden"
                />

                {loadedModels.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] font-medium text-muted-foreground">
                      Discovered ({loadedModels.length}):
                    </span>
                    {loadedModels.slice(0, 8).map((m) => (
                      <span
                        key={m.id}
                        className="rounded-md border border-border/80 bg-muted/40 px-2 py-0.5 font-mono text-[10px] text-foreground"
                      >
                        {m.id}
                      </span>
                    ))}
                    {loadedModels.length > 8 && (
                      <span className="text-[10px] text-muted-foreground">
                        +{loadedModels.length - 8} more
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Form Buttons */}
              <div className="flex items-center justify-end gap-2 border-t border-border/40 pt-3">
                <Button type="button" size="sm" variant="outline" onClick={resetForm}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" className="gap-1.5">
                  <SparklesIcon className="size-3.5" />
                  {editingProviderId ? "Update Provider" : "Save Provider"}
                </Button>
              </div>
            </form>
          )}
        </div>
      </div>

      {/* BOTTOM SECTION: Configured Providers as Collapsible Accordion List Tiles */}
      <SettingsSection title="Configured Providers">
        <p className="px-3 pb-2 text-xs text-muted-foreground sm:px-4">
          All configured custom providers. Click any provider tile to expand its details, models,
          and controls.
        </p>

        {providers.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/80 bg-card/40 p-8 text-center">
            <SlidersIcon className="mb-3 size-8 text-muted-foreground/50" />
            <h3 className="text-sm font-medium text-foreground">
              No custom providers configured yet
            </h3>
            <p className="mt-1 max-w-sm text-xs text-muted-foreground">
              Click &quot;+ Add Custom Provider&quot; above to connect an endpoint.
            </p>
            <Button
              size="xs"
              variant="outline"
              onClick={handleOpenAddForm}
              className="mt-4 gap-1.5"
            >
              <PlusIcon className="size-3" />
              Add Provider
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {providers.map((p) => {
              const isEditing = editingProviderId === p.id;
              const isExpanded = expandedTileIds.has(p.id);
              const formatLabel =
                p.format === "anthropic"
                  ? "Anthropic"
                  : p.format === "gemini"
                    ? "Gemini"
                    : "OpenAI";

              return (
                <div
                  key={p.id}
                  className={cn(
                    "flex flex-col rounded-xl border bg-card overflow-hidden transition-all duration-150 shadow-2xs",
                    isEditing
                      ? "border-primary/60 ring-1 ring-primary/30"
                      : "border-border/80 hover:border-border",
                    !p.enabled && "opacity-75 bg-muted/15",
                  )}
                >
                  {/* Collapsible Tile Header Bar */}
                  <div
                    className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 cursor-pointer hover:bg-muted/20 transition-colors select-none"
                    onClick={() => toggleTileExpand(p.id)}
                  >
                    {/* Left: Icon, Name, Format Badge, Status Badge, Model count */}
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border/70 bg-muted/30">
                        <GlobeIcon className="size-4 text-foreground/70" />
                      </div>
                      <div className="flex min-w-0 flex-col">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-sm font-semibold text-foreground truncate">
                            {p.name}
                          </span>

                          {/* Format Badge */}
                          <span className="inline-flex items-center rounded-md border border-border/80 bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground font-medium">
                            {formatLabel}
                          </span>

                          {/* Active / Paused Badge */}
                          <span
                            className={cn(
                              "inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium border",
                              p.enabled
                                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-500 dark:text-emerald-400"
                                : "border-amber-500/30 bg-amber-500/10 text-amber-500 dark:text-amber-400",
                            )}
                          >
                            {p.enabled ? "Active" : "Paused"}
                          </span>

                          {/* Model Count Badge */}
                          <span className="rounded-md border border-border/60 bg-muted/30 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                            {p.models.length} model{p.models.length === 1 ? "" : "s"}
                          </span>
                        </div>

                        {/* Subtitle: URL snippet */}
                        <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground font-mono">
                          <span className="truncate max-w-[280px] sm:max-w-md">{p.baseUrl}</span>
                        </div>
                      </div>
                    </div>

                    {/* Right: Quick Action Buttons & Chevron */}
                    <div className="flex shrink-0 items-center gap-1.5">
                      {/* Refresh Models Button */}
                      <Button
                        size="xs"
                        variant="outline"
                        disabled={refreshingTileId === p.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleTileRefreshModels(p);
                        }}
                        className="h-7 px-2 gap-1 text-[11px]"
                        title="Reload models from endpoint"
                      >
                        <RefreshCwIcon
                          className={cn("size-3", refreshingTileId === p.id && "animate-spin")}
                        />
                        <span className="hidden sm:inline">
                          {refreshingTileId === p.id ? "Loading..." : "Refresh"}
                        </span>
                      </Button>

                      {/* Edit Button */}
                      <Button
                        size="xs"
                        variant="outline"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleStartEdit(p);
                        }}
                        className="h-7 px-2 gap-1 text-[11px]"
                        title="Edit Provider configuration"
                      >
                        <Edit3Icon className="size-3" />
                        <span className="hidden sm:inline">Edit</span>
                      </Button>

                      {/* Delete Button */}
                      <Button
                        size="xs"
                        variant="destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(p);
                        }}
                        className="h-7 px-2"
                        title="Delete Provider"
                      >
                        <Trash2Icon className="size-3" />
                      </Button>

                      {/* Expand / Collapse Chevron */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleTileExpand(p.id);
                        }}
                        className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors cursor-pointer"
                        title={isExpanded ? "Collapse" : "Expand details"}
                      >
                        <ChevronDownIcon
                          className={cn(
                            "size-4 transition-transform duration-200",
                            isExpanded && "rotate-180",
                          )}
                        />
                      </button>
                    </div>
                  </div>

                  {/* Expanded Details Tray (Accordion Content) */}
                  {isExpanded && (
                    <div className="border-t border-border/50 bg-muted/[0.04] p-4 flex flex-col gap-3.5 animate-in fade-in duration-150">
                      {/* Base URL with 1-click Copy */}
                      <div className="flex flex-col gap-1">
                        <span className="text-[11px] font-semibold text-muted-foreground">
                          API Base URL:
                        </span>
                        <div className="flex items-center gap-2">
                          <code className="flex-1 rounded-md border border-border/70 bg-background px-2.5 py-1.5 font-mono text-xs text-foreground select-all break-all">
                            {p.baseUrl}
                          </code>
                          <Button
                            size="xs"
                            variant="outline"
                            onClick={() => handleCopyText(`url_${p.id}`, p.baseUrl)}
                            className="shrink-0 gap-1"
                            title="Copy Base URL"
                          >
                            {copiedId === `url_${p.id}` ? (
                              <>
                                <CheckIcon className="size-3 text-emerald-500" />
                                <span>Copied</span>
                              </>
                            ) : (
                              <>
                                <CopyIcon className="size-3" />
                                <span>Copy</span>
                              </>
                            )}
                          </Button>
                        </div>
                      </div>

                      {/* API Key & Status Row */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="flex flex-col gap-1">
                          <span className="text-[11px] font-semibold text-muted-foreground">
                            Authentication / API Key:
                          </span>
                          <div className="flex items-center gap-2 text-xs font-mono">
                            {p.apiKey ? (
                              <span className="inline-flex items-center gap-1 rounded border border-border/60 bg-muted/30 px-2 py-1 text-muted-foreground">
                                <KeyIcon className="size-3" />
                                •••••••••••••••• (Key Configured)
                              </span>
                            ) : (
                              <span className="text-muted-foreground/70 italic text-[11px]">
                                None (Unauthenticated / Local)
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Active Switch */}
                        <div className="flex items-center justify-between sm:justify-end gap-3">
                          <span className="text-xs font-medium text-foreground">
                            Provider Status:
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">
                              {p.enabled ? "Active" : "Paused"}
                            </span>
                            <Switch
                              checked={p.enabled}
                              onCheckedChange={() => toggleCustomProvider(p.id)}
                            />
                          </div>
                        </div>
                      </div>

                      {/* Custom Headers (if present) */}
                      {p.headers && p.headers.length > 0 && (
                        <div className="flex flex-col gap-1 border-t border-border/30 pt-2.5">
                          <span className="text-[11px] font-semibold text-muted-foreground">
                            Custom Headers ({p.headers.length}):
                          </span>
                          <div className="flex flex-wrap gap-1.5">
                            {p.headers.map((h, i) => (
                              <span
                                key={i}
                                className="inline-flex items-center rounded border border-border/70 bg-muted/30 px-2 py-0.5 font-mono text-[10px] text-muted-foreground"
                              >
                                <span className="font-semibold text-foreground">{h.key}</span>:{" "}
                                {h.value}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Models List & Refresh */}
                      <div className="flex flex-col gap-1.5 border-t border-border/30 pt-2.5">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                            <LayersIcon className="size-3.5 text-muted-foreground" />
                            <span>Configured Models ({p.models.length}):</span>
                          </div>
                          <button
                            type="button"
                            disabled={refreshingTileId === p.id}
                            onClick={() => handleTileRefreshModels(p)}
                            className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50 cursor-pointer"
                          >
                            <RefreshCwIcon
                              className={cn(
                                "size-2.5",
                                refreshingTileId === p.id && "animate-spin",
                              )}
                            />
                            Refresh Models
                          </button>
                        </div>

                        {p.models.length === 0 ? (
                          <div className="flex items-center justify-between rounded-lg border border-dashed border-border/70 bg-muted/20 p-2.5">
                            <span className="text-xs text-muted-foreground">
                              No models configured. Click &quot;Refresh Models&quot; to
                              auto-discover.
                            </span>
                            <Button
                              size="xs"
                              variant="outline"
                              disabled={refreshingTileId === p.id}
                              onClick={() => handleTileRefreshModels(p)}
                              className="gap-1 font-medium"
                            >
                              <RefreshCwIcon
                                className={cn(
                                  "size-3",
                                  refreshingTileId === p.id && "animate-spin",
                                )}
                              />
                              {refreshingTileId === p.id ? "Loading..." : "Load Models"}
                            </Button>
                          </div>
                        ) : (
                          <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto pr-1">
                            {p.models.map((m) => (
                              <span
                                key={m.id}
                                className="inline-flex items-center rounded-md border border-border/80 bg-background px-2 py-0.5 font-mono text-[11px] text-foreground shadow-2xs"
                              >
                                {m.id}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </SettingsSection>
    </SettingsPageContainer>
  );
}
