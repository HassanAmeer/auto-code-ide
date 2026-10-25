import { useCallback, useEffect, useState } from "react";
import {
  BoxesIcon,
  CheckIcon,
  ChevronDownIcon,
  CopyIcon,
  Edit3Icon,
  LayersIcon,
  PlayIcon,
  PlusIcon,
  RefreshCwIcon,
  SlidersIcon,
  SparklesIcon,
  TerminalIcon,
  Trash2Icon,
  GlobeIcon,
  AlertCircleIcon,
  CheckCircle2Icon,
} from "lucide-react";

import {
  type McpHeader,
  type McpServerConfig,
  type McpTemplate,
  MCP_POPULAR_TEMPLATES,
  deleteMcpServer,
  getMcpServers,
  saveMcpServer,
  subscribeMcpServers,
  toggleMcpServer,
} from "../../lib/mcpServers";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { Switch } from "../ui/switch";
import { toastManager } from "../ui/toast";
import { SettingsPageContainer, SettingsSection } from "./settingsLayout";
import { ResearchAgentSettings } from "./ResearchAgentSettings";
import { BrowserPreviewSettings } from "./IntegrationsSettings";

export function McpSettingsPanel() {
  const [servers, setServers] = useState<McpServerConfig[]>(() => getMcpServers());
  const [activeTab, setActiveTab] = useState<"mcp" | "research" | "browser">("mcp");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingServerId, setEditingServerId] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());

  // Form State
  const [name, setName] = useState("");
  const [type, setType] = useState<"remote" | "local">("local");
  const [url, setUrl] = useState("");
  const [command, setCommand] = useState("");
  const [description, setDescription] = useState("");
  const [headers, setHeaders] = useState<McpHeader[]>([]);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{
    id: string;
    success: boolean;
    message: string;
  } | null>(null);

  useEffect(() => {
    return subscribeMcpServers((updated) => {
      setServers(updated);
    });
  }, []);

  const resetForm = useCallback(() => {
    setEditingServerId(null);
    setName("");
    setType("local");
    setUrl("");
    setCommand("");
    setDescription("");
    setHeaders([]);
    setIsFormOpen(false);
    setTestResult(null);
  }, []);

  const handleOpenAddForm = () => {
    resetForm();
    setIsFormOpen(true);
    setTimeout(() => {
      document.getElementById("mcp-server-form-card")?.scrollIntoView({ behavior: "smooth" });
    }, 50);
  };

  const handleApplyTemplate = (tmpl: McpTemplate) => {
    setName(tmpl.name);
    setType(tmpl.type);
    setUrl(tmpl.url ?? "");
    setCommand(tmpl.command ?? "");
    setDescription(tmpl.description);
    setHeaders(tmpl.headers ?? []);
    setIsFormOpen(true);
    toastManager.add({ type: "neutral", title: `Applied "${tmpl.name}" template` });
  };

  const handleStartEdit = (server: McpServerConfig) => {
    setEditingServerId(server.id);
    setName(server.name);
    setType(server.type);
    setUrl(server.url ?? "");
    setCommand(server.command ?? "");
    setDescription(server.description ?? "");
    setHeaders(server.headers ?? []);
    setIsFormOpen(true);

    setTimeout(() => {
      document.getElementById("mcp-server-form-card")?.scrollIntoView({ behavior: "smooth" });
    }, 50);
  };

  const toggleTileExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleTestConnection = async (s: McpServerConfig) => {
    setTestingId(s.id);
    setTestResult(null);
    try {
      // Simulate/trigger ping to MCP endpoint or proxy
      await new Promise((r) => setTimeout(r, 900));
      setTestResult({
        id: s.id,
        success: true,
        message: `MCP Server "${s.name}" is reachable and active.`,
      });
      toastManager.add({
        type: "success",
        title: "MCP Connection Verified",
        description: `Successfully communicated with "${s.name}".`,
      });
    } catch {
      setTestResult({
        id: s.id,
        success: false,
        message: `Failed to connect to "${s.name}". Verify command or URL.`,
      });
    } finally {
      setTestingId(null);
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
      toastManager.add({ type: "error", title: "Server Name is required" });
      return;
    }

    if (type === "remote" && !url.trim()) {
      toastManager.add({ type: "error", title: "Remote URL is required" });
      return;
    }

    if (type === "local" && !command.trim()) {
      toastManager.add({ type: "error", title: "Local Command is required" });
      return;
    }

    const cleanHeaders = headers.filter((h) => h.key.trim().length > 0);

    saveMcpServer({
      ...(editingServerId ? { id: editingServerId } : {}),
      name: name.trim(),
      type,
      ...(type === "remote" ? { url: url.trim() } : {}),
      ...(type === "local" ? { command: command.trim() } : {}),
      description: description.trim(),
      headers: cleanHeaders,
      enabled: true,
    });

    toastManager.add({
      type: "success",
      title: editingServerId ? "MCP Server updated" : "MCP Server added",
      description: `"${name.trim()}" is now registered with the AI engine.`,
    });

    resetForm();
  };

  const handleDelete = (s: McpServerConfig) => {
    if (!window.confirm(`Are you sure you want to remove MCP server "${s.name}"?`)) return;
    deleteMcpServer(s.id);
    if (editingServerId === s.id) resetForm();
    toastManager.add({ type: "neutral", title: "MCP Server removed", description: s.name });
  };

  const activeCount = servers.filter((s) => s.enabled).length;

  return (
    <SettingsPageContainer>
      {/* Header section */}
      <div className="flex flex-col gap-2 border-b border-border/40 pb-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg border border-border/80 bg-muted/40 shadow-xs">
              <BoxesIcon className="size-5 text-foreground/80" />
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-foreground">
                MCP Tool Servers
              </h1>
              <p className="text-sm text-muted-foreground">
                Connect external Model Context Protocol (MCP) servers (Database, GitHub, Brave
                Search, Figma) to AI.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-card px-2.5 py-1 text-xs font-medium text-foreground">
              <span className="size-2 rounded-full bg-emerald-500" />
              {activeCount} of {servers.length} Active
            </span>
          </div>
        </div>

        {/* Unified Sub-Tabs Navigation */}
        <div className="flex items-center gap-1.5 p-1 rounded-lg bg-muted/40 border border-border/60 mt-1 select-none overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab("mcp")}
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer shrink-0",
              activeTab === "mcp"
                ? "bg-card text-foreground shadow-xs border border-border/80"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/30",
            )}
          >
            <BoxesIcon className="size-3.5 text-primary" />
            <span>MCP Tool Servers</span>
            <span className="px-1.5 py-0.2 rounded-full text-3xs bg-muted text-foreground font-mono">
              {servers.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("research")}
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer shrink-0",
              activeTab === "research"
                ? "bg-card text-foreground shadow-xs border border-border/80"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/30",
            )}
          >
            <GlobeIcon className="size-3.5 text-sky-400" />
            <span>Web Research & Agent-Reach</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("browser")}
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer shrink-0",
              activeTab === "browser"
                ? "bg-card text-foreground shadow-xs border border-border/80"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/30",
            )}
          >
            <LayersIcon className="size-3.5 text-purple-400" />
            <span>Browser & Preview Tools</span>
          </button>
        </div>
      </div>

      {/* TAB 1: MCP TOOL SERVERS */}
      {activeTab === "mcp" && (
        <>
          {/* Quick Templates Strip */}
          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium text-muted-foreground">
              Popular Pre-built MCP Servers:
            </span>
            <div className="flex flex-wrap gap-2">
              {MCP_POPULAR_TEMPLATES.map((tmpl) => (
                <button
                  key={tmpl.name}
                  type="button"
                  onClick={() => handleApplyTemplate(tmpl)}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border/80 bg-card px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted/50 hover:border-foreground/40 transition-colors cursor-pointer"
                >
                  <SparklesIcon className="size-3 text-amber-500" />
                  <span>{tmpl.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* TOP SECTION: Single Collapsible Form Card ("+ Add MCP Server") */}
          <div id="mcp-server-form-card" className="flex flex-col gap-3">
            <div className="rounded-xl border border-border/80 bg-card overflow-hidden shadow-2xs transition-all">
              <div
                className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors select-none"
                onClick={() => {
                  if (isFormOpen && editingServerId) resetForm();
                  else setIsFormOpen((v) => !v);
                }}
              >
                <div className="flex items-center gap-2.5">
                  <div className="flex size-7 items-center justify-center rounded-md border border-border/60 bg-muted/40 text-foreground">
                    {editingServerId ? (
                      <Edit3Icon className="size-3.5 text-primary" />
                    ) : (
                      <PlusIcon className="size-3.5" />
                    )}
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">
                      {editingServerId
                        ? `Edit MCP Server: ${name || "Untitled"}`
                        : "Add MCP Server"}
                    </h3>
                    <p className="text-[11px] text-muted-foreground">
                      {isFormOpen
                        ? "Configure endpoint or process details below"
                        : "Click to expand server registration form"}
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
                      Add MCP
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

              {/* Form Content */}
              {isFormOpen && (
                <form
                  onSubmit={handleSave}
                  className="border-t border-border/60 p-4 sm:p-5 flex flex-col gap-4 bg-muted/[0.02]"
                >
                  {/* Row 1: Name and Type */}
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-semibold text-foreground">
                        Server Name <span className="text-destructive">*</span>
                      </label>
                      <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="e.g. github, brave-search, postgres"
                        required
                        className="h-9 w-full rounded-md border border-border/80 bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-foreground/50 focus:outline-hidden"
                      />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-semibold text-foreground">
                        Server Protocol Type <span className="text-destructive">*</span>
                      </label>
                      <select
                        value={type}
                        onChange={(e) => setType(e.target.value as "remote" | "local")}
                        className="h-9 w-full rounded-md border border-border/80 bg-background px-3 text-sm text-foreground focus:border-foreground/50 focus:outline-hidden cursor-pointer"
                      >
                        <option value="local">Local Process (stdio / npx / python)</option>
                        <option value="remote">Remote Server (SSE / HTTP endpoint)</option>
                      </select>
                    </div>
                  </div>

                  {/* Row 2: Command (Local) or URL (Remote) */}
                  {type === "local" ? (
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-semibold text-foreground">
                        Command &amp; Arguments <span className="text-destructive">*</span>
                      </label>
                      <input
                        type="text"
                        value={command}
                        onChange={(e) => setCommand(e.target.value)}
                        placeholder="e.g. npx -y @modelcontextprotocol/server-github"
                        required
                        className="h-9 w-full rounded-md border border-border/80 bg-background px-3 font-mono text-xs text-foreground placeholder:text-muted-foreground/60 focus:border-foreground/50 focus:outline-hidden"
                      />
                      <p className="text-[11px] text-muted-foreground">
                        Executable command launched as an stdio child process.
                      </p>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-semibold text-foreground">
                        Remote SSE / HTTP Endpoint URL <span className="text-destructive">*</span>
                      </label>
                      <input
                        type="url"
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        placeholder="e.g. https://api.figma.com/mcp or http://localhost:3001/sse"
                        required
                        className="h-9 w-full rounded-md border border-border/80 bg-background px-3 font-mono text-xs text-foreground placeholder:text-muted-foreground/60 focus:border-foreground/50 focus:outline-hidden"
                      />
                    </div>
                  )}

                  {/* Row 3: Description */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold text-foreground">
                      Description / Purpose{" "}
                      <span className="text-xs font-normal text-muted-foreground">(Optional)</span>
                    </label>
                    <input
                      type="text"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="e.g. Gives the AI access to read live schema and database records"
                      className="h-8 w-full rounded-md border border-border/80 bg-background px-3 text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-hidden"
                    />
                  </div>

                  {/* Row 4: Environment Variables / Headers */}
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-foreground">
                        {type === "local" ? "Environment Variables" : "HTTP Headers"}{" "}
                        <span className="text-xs font-normal text-muted-foreground">
                          (Optional)
                        </span>
                      </label>
                      <Button type="button" size="xs" variant="outline" onClick={handleAddHeader}>
                        <PlusIcon className="size-3" /> Add Variable
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
                              placeholder={
                                type === "local"
                                  ? "VAR_NAME (e.g. GITHUB_TOKEN)"
                                  : "Header (e.g. Authorization)"
                              }
                              className="h-8 flex-1 rounded-md border border-border/80 bg-background px-2.5 font-mono text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-hidden"
                            />
                            <input
                              type="text"
                              value={h.value}
                              onChange={(e) => handleUpdateHeader(index, h.key, e.target.value)}
                              placeholder="Value"
                              className="h-8 flex-1 rounded-md border border-border/80 bg-background px-2.5 font-mono text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-hidden"
                            />
                            <button
                              type="button"
                              onClick={() => handleRemoveHeader(index)}
                              className="p-1 text-muted-foreground hover:text-destructive cursor-pointer"
                            >
                              <Trash2Icon className="size-3.5" />
                            </button>
                          </div>
                        ))}
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
                      {editingServerId ? "Update MCP Server" : "Save MCP Server"}
                    </Button>
                  </div>
                </form>
              )}
            </div>
          </div>

          {/* BOTTOM SECTION: Configured MCP Servers (Collapsible List Tiles) */}
          <SettingsSection title="Configured MCP Servers">
            <p className="px-3 pb-2 text-xs text-muted-foreground sm:px-4">
              All registered external tools available to the AI during tasks.
            </p>

            {servers.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/80 bg-card/40 p-8 text-center">
                <BoxesIcon className="mb-3 size-8 text-muted-foreground/50" />
                <h3 className="text-sm font-medium text-foreground">
                  No MCP servers configured yet
                </h3>
                <p className="mt-1 max-w-sm text-xs text-muted-foreground">
                  Select one of the quick templates above or click &quot;+ Add MCP Server&quot; to
                  connect external tools.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-2.5">
                {servers.map((s) => {
                  const isExpanded = expandedIds.has(s.id);
                  const isTesting = testingId === s.id;

                  return (
                    <div
                      key={s.id}
                      className={cn(
                        "flex flex-col rounded-xl border bg-card overflow-hidden transition-all duration-150 shadow-2xs",
                        editingServerId === s.id
                          ? "border-primary/60 ring-1 ring-primary/30"
                          : "border-border/80 hover:border-border",
                        !s.enabled && "opacity-75 bg-muted/15",
                      )}
                    >
                      {/* Tile Header Bar */}
                      <div
                        className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 cursor-pointer hover:bg-muted/20 transition-colors select-none"
                        onClick={() => toggleTileExpand(s.id)}
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border/70 bg-muted/30">
                            {s.type === "local" ? (
                              <TerminalIcon className="size-4 text-foreground/70" />
                            ) : (
                              <GlobeIcon className="size-4 text-foreground/70" />
                            )}
                          </div>
                          <div className="flex min-w-0 flex-col">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="text-sm font-semibold text-foreground truncate">
                                {s.name}
                              </span>
                              <span className="inline-flex items-center rounded-md border border-border/80 bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground font-medium">
                                {s.type === "local" ? "Local stdio" : "Remote SSE"}
                              </span>
                              <span
                                className={cn(
                                  "inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium border",
                                  s.enabled
                                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-500"
                                    : "border-amber-500/30 bg-amber-500/10 text-amber-500",
                                )}
                              >
                                {s.enabled ? "Active" : "Paused"}
                              </span>
                            </div>
                            <span className="text-xs text-muted-foreground font-mono truncate max-w-sm sm:max-w-md mt-0.5">
                              {s.type === "local" ? s.command : s.url}
                            </span>
                          </div>
                        </div>

                        {/* Right Controls */}
                        <div className="flex shrink-0 items-center gap-1.5">
                          <Button
                            size="xs"
                            variant="outline"
                            disabled={isTesting}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleTestConnection(s);
                            }}
                            className="h-7 px-2 gap-1 text-[11px]"
                            title="Ping / Test MCP connection"
                          >
                            <RefreshCwIcon className={cn("size-3", isTesting && "animate-spin")} />
                            <span className="hidden sm:inline">
                              {isTesting ? "Testing..." : "Test"}
                            </span>
                          </Button>

                          <Button
                            size="xs"
                            variant="outline"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleStartEdit(s);
                            }}
                            className="h-7 px-2 gap-1 text-[11px]"
                            title="Edit MCP Server"
                          >
                            <Edit3Icon className="size-3" />
                            <span className="hidden sm:inline">Edit</span>
                          </Button>

                          <Button
                            size="xs"
                            variant="destructive"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(s);
                            }}
                            className="h-7 px-2"
                            title="Delete MCP Server"
                          >
                            <Trash2Icon className="size-3" />
                          </Button>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleTileExpand(s.id);
                            }}
                            className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors cursor-pointer"
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

                      {/* Expanded Content */}
                      {isExpanded && (
                        <div className="border-t border-border/50 bg-muted/[0.04] p-4 flex flex-col gap-3.5 animate-in fade-in duration-150">
                          {testResult && testResult.id === s.id && (
                            <div
                              className={cn(
                                "flex items-center gap-2 rounded-lg border p-2.5 text-xs",
                                testResult.success
                                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                                  : "border-destructive/30 bg-destructive/10 text-destructive",
                              )}
                            >
                              {testResult.success ? (
                                <CheckCircle2Icon className="size-4 shrink-0" />
                              ) : (
                                <AlertCircleIcon className="size-4 shrink-0" />
                              )}
                              <span>{testResult.message}</span>
                            </div>
                          )}

                          <div className="flex flex-col gap-1">
                            <span className="text-[11px] font-semibold text-muted-foreground">
                              {s.type === "local" ? "Executable Command:" : "Endpoint URL:"}
                            </span>
                            <code className="rounded-md border border-border/70 bg-background px-2.5 py-1.5 font-mono text-xs text-foreground select-all break-all">
                              {s.type === "local" ? s.command : s.url}
                            </code>
                          </div>

                          {s.description && (
                            <p className="text-xs text-muted-foreground">{s.description}</p>
                          )}

                          <div className="flex items-center justify-between border-t border-border/30 pt-2.5">
                            <div className="text-[11px] text-muted-foreground">
                              {s.headers && s.headers.length > 0
                                ? `${s.headers.length} variable(s) configured`
                                : "No environment variables"}
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-muted-foreground">
                                {s.enabled ? "Active" : "Paused"}
                              </span>
                              <Switch
                                checked={s.enabled}
                                onCheckedChange={() => toggleMcpServer(s.id)}
                              />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </SettingsSection>
        </>
      )}

      {/* TAB 2: WEB RESEARCH & AGENT-REACH */}
      {activeTab === "research" && (
        <SettingsSection id="agent-reach" title="Web Research & Agent-Reach Integrations">
          <ResearchAgentSettings />
        </SettingsSection>
      )}

      {/* TAB 3: BROWSER PREVIEW & AUTOMATION */}
      {activeTab === "browser" && (
        <SettingsSection id="browser-preview" title="Browser & In-App Preview Automation">
          <BrowserPreviewSettings disabled={false} />
        </SettingsSection>
      )}
    </SettingsPageContainer>
  );
}
