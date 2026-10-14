import { memo, useState, useEffect } from "react";
import { X, Key, Server, Plus, Trash2, Check, Copy, ShieldCheck } from "lucide-react";
import { useTerminalStore, terminalStore } from "./terminalStore";
import { cn } from "../../../lib/utils";
import type { TerminalAccessKey } from "./terminalTypes";

export const SshKeysSheet = memo(function SshKeysSheet() {
  const store = useTerminalStore();
  const isOpen = store.isSshSheetOpen;

  // Form State - ONLY Title & Description as explicitly requested
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
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
    terminalStore.setEditingKeyId(key.id);
  };

  const handleResetForm = () => {
    setEditingId(null);
    terminalStore.setEditingKeyId(null);
    setName("");
    setDescription("");
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) return;

    // Auto-parse Host / User / Port if present in description text
    let parsedHost = "";
    let parsedUser = "root";
    let parsedPort = 22;

    if (description) {
      const hostMatch = description.match(/(?:Host|IP):\s*([^\s\n]+)/i);
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

      {/* Cupertino iOS Right-Side Sheet (Mobile: 90% width, Desktop: compact ~380px) */}
      <div
        role="dialog"
        aria-label="Manage SSH Keys"
        className="relative z-50 h-full w-[90vw] max-w-[90vw] sm:w-[380px] bg-[#161618] border-l border-zinc-800 shadow-2xl flex flex-col text-zinc-100 overflow-hidden font-sans"
      >
        {/* Header in Cupertino iOS Style */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800/80 bg-[#1c1c1e] shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-[5px] bg-sky-500/15 text-sky-400 border border-sky-500/30">
              <Key className="size-4" />
            </div>
            <div>
              <h2 className="text-xs font-semibold tracking-tight flex items-center gap-1.5 text-zinc-100">
                SSH Servers & Keys
                <span className="text-4xs font-mono font-medium px-1.5 py-0.2 rounded-[5px] bg-sky-500/15 text-sky-300 border border-sky-500/30">
                  {store.accessKeys.length}
                </span>
              </h2>
              <p className="text-3xs text-zinc-400 mt-0.5">
                Save credentials for automated deployment
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleClose}
            className="p-1 rounded-[5px] text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
            title="Close Sheet"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Sheet Body (Scrollable Single Column Flow) */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-20">
          {/* Form - Only Title and Description */}
          <div className="bg-[#1c1c1e]/90 border border-zinc-800/80 rounded-[5px] p-3.5 space-y-3 shadow-xs">
            <div className="flex items-center justify-between pb-1 border-b border-zinc-800/60">
              <h3 className="text-xs font-semibold text-zinc-200 flex items-center gap-1.5">
                <Plus className="size-3.5 text-sky-400" />
                {editingId ? "Edit Server Key" : "Add Server Key"}
              </h3>
              {editingId && (
                <button
                  type="button"
                  onClick={handleResetForm}
                  className="text-3xs text-zinc-400 hover:text-zinc-200 underline cursor-pointer"
                >
                  Cancel Edit
                </button>
              )}
            </div>

            <form onSubmit={handleSave} className="space-y-3">
              {/* Title Box */}
              <div>
                <label className="block text-3xs font-medium text-zinc-300 mb-1">
                  Title / Name <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Server 1 Keys, Production VPS..."
                  className="w-full px-2.5 py-1.5 text-xs rounded-[5px] border border-zinc-700 bg-zinc-900/80 text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-sky-500 transition-all font-medium"
                />
              </div>

              {/* Description Box */}
              <div>
                <label className="block text-3xs font-medium text-zinc-300 mb-1">
                  Description / Credentials
                </label>
                <textarea
                  rows={5}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={`Paste SSH Root Key, Server Password, or Details:\n\nHost: 201.18.218.29\nUser: root\nPort: 22\nPassword: your-secret-password`}
                  className="w-full px-2.5 py-1.5 text-xs rounded-[5px] border border-zinc-700 bg-zinc-900/80 text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-sky-500 transition-all font-mono leading-relaxed"
                />
              </div>

              {/* Save Button */}
              <button
                type="submit"
                disabled={!name.trim()}
                className={cn(
                  "w-full py-2 px-3 rounded-[5px] font-medium text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-xs",
                  name.trim()
                    ? "bg-sky-500 hover:bg-sky-600 text-white shadow-sky-500/20"
                    : "bg-zinc-800 text-zinc-500 cursor-not-allowed",
                )}
              >
                {saveSuccess ? (
                  <>
                    <Check className="size-3.5" />
                    <span>Saved Successfully!</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="size-3.5" />
                    <span>{editingId ? "Update Key" : "Save Credentials"}</span>
                  </>
                )}
              </button>
            </form>
          </div>

          {/* Saved Keys List */}
          <div className="space-y-2 pt-1">
            <div className="flex items-center justify-between pb-1">
              <h3 className="text-xs font-semibold text-zinc-200 flex items-center gap-1.5">
                <Server className="size-3.5 text-sky-400" />
                Saved Servers ({store.accessKeys.length})
              </h3>
            </div>

            {store.accessKeys.length === 0 ? (
              <div className="rounded-[5px] border border-dashed border-zinc-800 p-6 text-center text-zinc-500 text-xs space-y-1">
                <Key className="size-6 mx-auto opacity-40 text-zinc-400" />
                <p className="font-medium text-3xs">No saved servers yet.</p>
                <p className="text-4xs text-zinc-600">
                  Enter Title and Description above to save your first server.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {store.accessKeys.map((key) => {
                  const isSelected = store.selectedKeyId === key.id;
                  return (
                    <div
                      key={key.id}
                      className={cn(
                        "rounded-[5px] border p-2.5 transition-all space-y-2 relative group text-left",
                        isSelected
                          ? "bg-sky-500/10 border-sky-500/60 shadow-sm ring-1 ring-sky-500/30"
                          : "bg-[#1c1c1e] hover:bg-[#202023] border-zinc-800 shadow-xs",
                      )}
                    >
                      {/* Top Row: Title & Actions */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h4 className="text-xs font-semibold text-zinc-100 truncate flex items-center gap-1.5">
                            <Server className="size-3 text-sky-400 shrink-0" />
                            <span className="truncate">{key.name}</span>
                          </h4>
                          {key.host && (
                            <p className="font-mono text-4xs text-zinc-400 mt-0.5 truncate">
                              {key.user || "root"}@{key.host}:{key.port || 22}
                            </p>
                          )}
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          {/* Copy */}
                          <button
                            type="button"
                            onClick={() => handleCopyDetails(key)}
                            title="Copy details"
                            className="p-1 rounded-[3px] text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors cursor-pointer"
                          >
                            {copiedId === key.id ? (
                              <Check className="size-3 text-emerald-400" />
                            ) : (
                              <Copy className="size-3" />
                            )}
                          </button>

                          {/* Edit */}
                          <button
                            type="button"
                            onClick={() => handleEdit(key)}
                            title="Edit"
                            className="p-1 rounded-[3px] text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors cursor-pointer text-3xs"
                          >
                            Edit
                          </button>

                          {/* Delete */}
                          <button
                            type="button"
                            onClick={() => terminalStore.deleteAccessKeys([key.id])}
                            title="Delete"
                            className="p-1 rounded-[3px] text-zinc-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                          >
                            <Trash2 className="size-3" />
                          </button>
                        </div>
                      </div>

                      {/* Notes / Description Snippet */}
                      {key.notes && (
                        <div className="p-1.5 rounded-[5px] bg-zinc-900/90 border border-zinc-800 font-mono text-3xs text-zinc-400 line-clamp-2 select-text break-all">
                          {key.notes}
                        </div>
                      )}

                      {/* Bottom Row: Set Active Toggle */}
                      <div className="flex items-center justify-between pt-0.5">
                        <button
                          type="button"
                          onClick={() => terminalStore.setSelectedKey(key.id)}
                          className={cn(
                            "px-2 py-0.5 rounded-[5px] text-3xs font-medium transition-all cursor-pointer flex items-center gap-1",
                            isSelected
                              ? "bg-sky-500 text-white shadow-xs font-semibold"
                              : "bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200",
                          )}
                        >
                          {isSelected ? (
                            <>
                              <Check className="size-2.5" />
                              <span>Active</span>
                            </>
                          ) : (
                            <span>Set Active</span>
                          )}
                        </button>

                        <span className="text-4xs text-zinc-500 font-mono">
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

        {/* Close Icon Button on Right Bottom Side in Cupertino iOS Style */}
        <div className="absolute bottom-3 right-3 z-50">
          <button
            type="button"
            onClick={handleClose}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-[5px] bg-zinc-800 hover:bg-zinc-700 text-zinc-200 hover:text-white font-medium text-xs shadow-lg border border-zinc-700 transition-all cursor-pointer"
            title="Close Sheet"
          >
            <X className="size-3.5" />
            <span>Close</span>
          </button>
        </div>
      </div>
    </div>
  );
});
