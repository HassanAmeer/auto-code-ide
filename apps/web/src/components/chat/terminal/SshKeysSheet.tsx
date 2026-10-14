import { memo, useState, useEffect } from "react";
import {
  X,
  Key,
  Server,
  Plus,
  Trash2,
  Check,
  Copy,
  ShieldCheck,
  Terminal,
  Info,
} from "lucide-react";
import { useTerminalStore, terminalStore } from "./terminalStore";
import { cn } from "../../../lib/utils";
import type { TerminalAccessKey } from "./terminalTypes";

export const SshKeysSheet = memo(function SshKeysSheet() {
  const store = useTerminalStore();
  const isOpen = store.isSshSheetOpen;

  // Form State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [host, setHost] = useState("");
  const [user, setUser] = useState("root");
  const [port, setPort] = useState("22");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Close sheet on Escape
  useEffect(() => {
    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        terminalStore.setSshSheetOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  // Auto load key for editing if opened via chip edit icon
  useEffect(() => {
    if (isOpen && store.editingKeyId) {
      const targetKey = store.accessKeys.find((k) => k.id === store.editingKeyId);
      if (targetKey) {
        setEditingId(targetKey.id);
        setName(targetKey.name);
        setDescription(targetKey.notes || "");
        setHost(targetKey.host || "");
        setUser(targetKey.user || "root");
        setPort(String(targetKey.port || 22));
      }
    }
  }, [isOpen, store.editingKeyId, store.accessKeys]);

  if (!isOpen) return null;

  const handleClose = () => {
    terminalStore.setSshSheetOpen(false);
    setEditingId(null);
    terminalStore.setEditingKeyId(null);
  };

  const handleEdit = (key: TerminalAccessKey) => {
    setEditingId(key.id);
    setName(key.name);
    setDescription(key.notes || "");
    setHost(key.host || "");
    setUser(key.user || "root");
    setPort(String(key.port || 22));
    terminalStore.setEditingKeyId(key.id);
  };

  const handleResetForm = () => {
    setEditingId(null);
    terminalStore.setEditingKeyId(null);
    setName("");
    setDescription("");
    setHost("");
    setUser("root");
    setPort("22");
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) return;

    // Auto-parse Host / User if specified in description or inputs
    let parsedHost = host.trim();
    let parsedUser = user.trim() || "root";
    let parsedPort = parseInt(port.trim(), 10) || 22;

    if (!parsedHost && description) {
      const hostMatch =
        description.match(/Host:\s*([^\s\n]+)/i) || description.match(/IP:\s*([^\s\n]+)/i);
      if (hostMatch && hostMatch[1]) parsedHost = hostMatch[1];
      const userMatch = description.match(/User:\s*([^\s\n]+)/i);
      if (userMatch && userMatch[1]) parsedUser = userMatch[1];
      const portMatch = description.match(/Port:\s*(\d+)/i);
      if (portMatch && portMatch[1]) parsedPort = parseInt(portMatch[1], 10);
    }

    terminalStore.saveCustomAccessKey({
      id: editingId ?? undefined,
      name: trimmedName,
      notes: description.trim(),
      host: parsedHost || undefined,
      user: parsedUser,
      port: parsedPort,
      type: "ssh",
    });

    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2000);
    handleResetForm();
  };

  const handleCopyDetails = (key: TerminalAccessKey) => {
    const details = [
      `Server: ${key.name}`,
      key.host ? `Host: ${key.user || "root"}@${key.host}:${key.port || 22}` : null,
      key.notes ? `Details / Credentials:\n${key.notes}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    void navigator.clipboard.writeText(details);
    setCopiedId(key.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end animate-in fade-in duration-200">
      {/* Backdrop */}
      <div
        onClick={handleClose}
        className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity cursor-pointer"
        aria-hidden="true"
      />

      {/* 90% Width Drawer Container */}
      <div
        role="dialog"
        aria-label="Manage SSH Keys"
        className="relative z-50 h-full w-[90vw] max-w-[90vw] bg-card border-l border-border/80 shadow-2xl flex flex-col text-foreground overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border/70 bg-muted/20 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-sky-500/15 text-sky-400 border border-sky-500/30">
              <Key className="size-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-semibold tracking-tight flex items-center gap-2">
                SSH Servers & Access Keys
                <span className="text-2xs font-mono font-medium px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-300 border border-sky-500/30">
                  {store.accessKeys.length} Saved
                </span>
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Save server root credentials, SSH keys, and host IPs for automated project
                deployments.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleClose}
            className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer"
            title="Close Sheet"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Sheet Body (Scrollable) */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 pb-24">
          {/* Main 2-Column Responsive Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Form Column (Left 5 Cols on desktop) */}
            <div className="lg:col-span-5 bg-card/60 border border-border/70 rounded-2xl p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Plus className="size-4 text-emerald-400" />
                  {editingId ? "Edit Server Details" : "Add Server / SSH Key"}
                </h3>
                {editingId && (
                  <button
                    type="button"
                    onClick={handleResetForm}
                    className="text-2xs text-muted-foreground hover:text-foreground underline cursor-pointer"
                  >
                    Cancel Edit
                  </button>
                )}
              </div>

              <form onSubmit={handleSave} className="space-y-4">
                {/* Title Box */}
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1.5">
                    Server Title / Name <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Server 1 Keys, Production VPS, AWS EC2..."
                    className="w-full px-3 py-2 text-xs rounded-xl border border-border bg-background/80 text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition-all font-medium"
                  />
                </div>

                {/* Description / Credentials Box */}
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1.5 flex items-center justify-between">
                    <span>Description / SSH Keys & Passwords</span>
                    <span className="text-3xs text-muted-foreground">
                      Safe in Browser Local Storage
                    </span>
                  </label>
                  <textarea
                    rows={6}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder={`Paste SSH Root Key, Server Password, or Connection Details here:\n\nHost: 201.18.218.29\nUser: root\nPort: 22\nPassword: your-secret-password\nNotes: systemctl restart autojobs`}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-border bg-background/80 text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition-all font-mono leading-relaxed"
                  />
                </div>

                {/* Optional Quick Server IP / User Row */}
                <div className="grid grid-cols-3 gap-2 pt-1 border-t border-border/40">
                  <div className="col-span-2">
                    <label className="block text-3xs font-medium text-muted-foreground mb-1">
                      Host / IP (Optional)
                    </label>
                    <input
                      type="text"
                      value={host}
                      onChange={(e) => setHost(e.target.value)}
                      placeholder="e.g. 201.18.218.29"
                      className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-border bg-background/60 font-mono text-foreground focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-3xs font-medium text-muted-foreground mb-1">
                      User
                    </label>
                    <input
                      type="text"
                      value={user}
                      onChange={(e) => setUser(e.target.value)}
                      placeholder="root"
                      className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-border bg-background/60 font-mono text-foreground focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                {/* Save Button */}
                <button
                  type="submit"
                  disabled={!name.trim()}
                  className={cn(
                    "w-full py-2.5 px-4 rounded-xl font-medium text-xs flex items-center justify-center gap-2 transition-all cursor-pointer shadow-sm",
                    name.trim()
                      ? "bg-emerald-500 hover:bg-emerald-600 text-white shadow-emerald-500/20"
                      : "bg-muted text-muted-foreground/50 cursor-not-allowed",
                  )}
                >
                  {saveSuccess ? (
                    <>
                      <Check className="size-4" />
                      <span>Saved Successfully!</span>
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="size-4" />
                      <span>{editingId ? "Update Server Key" : "Save Server Credentials"}</span>
                    </>
                  )}
                </button>
              </form>
            </div>

            {/* Saved Servers List Column (Right 7 Cols on desktop) */}
            <div className="lg:col-span-7 space-y-3">
              <div className="flex items-center justify-between pb-1">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Server className="size-4 text-sky-400" />
                  Saved Server Connections ({store.accessKeys.length})
                </h3>
                <span className="text-2xs text-muted-foreground">
                  Click a server to set as active for auto-deployment
                </span>
              </div>

              {store.accessKeys.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border/80 p-8 text-center text-muted-foreground text-xs space-y-2">
                  <Key className="size-8 mx-auto opacity-40 text-muted-foreground" />
                  <p className="font-medium">No saved servers or SSH keys found.</p>
                  <p className="text-3xs text-muted-foreground/80 max-w-sm mx-auto">
                    Fill out the form on the left with your server title and root/SSH credentials to
                    save them.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {store.accessKeys.map((key) => {
                    const isSelected = store.selectedKeyId === key.id;
                    return (
                      <div
                        key={key.id}
                        className={cn(
                          "rounded-2xl border p-4 transition-all space-y-3 relative group",
                          isSelected
                            ? "bg-sky-500/10 border-sky-500/60 shadow-md ring-1 ring-sky-500/30"
                            : "bg-card/70 hover:bg-card border-border/70 hover:border-border shadow-xs",
                        )}
                      >
                        {/* Top Row: Title & Action */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <h4 className="text-xs font-semibold text-foreground truncate flex items-center gap-1.5">
                              <Server className="size-3.5 text-sky-400 shrink-0" />
                              <span className="truncate">{key.name}</span>
                            </h4>
                            {key.host && (
                              <p className="font-mono text-3xs text-muted-foreground mt-0.5 truncate">
                                {key.user || "root"}@{key.host}:{key.port || 22}
                              </p>
                            )}
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            {/* Copy button */}
                            <button
                              type="button"
                              onClick={() => handleCopyDetails(key)}
                              title="Copy details"
                              className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors cursor-pointer"
                            >
                              {copiedId === key.id ? (
                                <Check className="size-3 text-emerald-400" />
                              ) : (
                                <Copy className="size-3" />
                              )}
                            </button>

                            {/* Edit button */}
                            <button
                              type="button"
                              onClick={() => handleEdit(key)}
                              title="Edit key"
                              className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors cursor-pointer text-3xs font-medium"
                            >
                              Edit
                            </button>

                            {/* Delete button */}
                            <button
                              type="button"
                              onClick={() => terminalStore.deleteAccessKeys([key.id])}
                              title="Delete server key"
                              className="p-1 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
                            >
                              <Trash2 className="size-3" />
                            </button>
                          </div>
                        </div>

                        {/* Notes / Description Snippet */}
                        {key.notes && (
                          <div className="p-2 rounded-xl bg-background/80 border border-border/40 font-mono text-3xs text-muted-foreground line-clamp-2 select-text break-all">
                            {key.notes}
                          </div>
                        )}

                        {/* Bottom Row: Set Active / Active Status */}
                        <div className="flex items-center justify-between pt-1">
                          <button
                            type="button"
                            onClick={() => terminalStore.setSelectedKey(key.id)}
                            className={cn(
                              "px-2.5 py-1 rounded-lg text-3xs font-medium transition-all cursor-pointer flex items-center gap-1",
                              isSelected
                                ? "bg-sky-500 text-white shadow-xs font-semibold"
                                : "bg-muted/60 hover:bg-muted text-muted-foreground hover:text-foreground",
                            )}
                          >
                            {isSelected ? (
                              <>
                                <Check className="size-2.5" />
                                <span>Active for Deploy</span>
                              </>
                            ) : (
                              <span>Set Active</span>
                            )}
                          </button>

                          <span className="text-4xs text-muted-foreground/60 font-mono">
                            {key.type.toUpperCase()}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Floating Bottom-Right Close Icon Button as requested by user */}
        <div className="absolute bottom-6 right-6 z-50">
          <button
            type="button"
            onClick={handleClose}
            className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-destructive/95 hover:bg-destructive text-white font-medium text-xs shadow-2xl hover:scale-105 active:scale-95 transition-all cursor-pointer border border-white/20"
            title="Close Sheet"
          >
            <X className="size-4" />
            <span>Close</span>
          </button>
        </div>
      </div>
    </div>
  );
});
