import type { StorageCleanupSettings, WorktreeCleanupRules } from "@t3tools/contracts";
import { resolveWorktreeCleanup } from "@t3tools/shared/projectSettings";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowUpIcon,
  CheckIcon,
  FolderIcon,
  FolderOpenIcon,
  FolderPlusIcon,
  HomeIcon,
  Loader2Icon,
  RefreshCwIcon,
} from "lucide-react";

import { Input } from "../ui/input";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPopup,
  DialogTitle,
} from "../ui/dialog";
import { toastManager } from "../ui/toast";
import { cn } from "~/lib/utils";
import { resolvePrimaryEnvironmentHttpUrl } from "~/environments/primary";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { Switch } from "../ui/switch";
import {
  NumberField,
  NumberFieldDecrement,
  NumberFieldGroup,
  NumberFieldIncrement,
  NumberFieldInput,
} from "../ui/number-field";
import {
  SettingResetButton,
  SettingsPageContainer,
  SettingsRow,
  SettingsSection,
} from "./settingsLayout";
import { SettingsScopeNotice } from "./SettingsScopeNotice";
import type { ScopedSettingsTarget } from "./scopedSettings";
import { useSettingsScope } from "./SettingsScopeContext";
import { searchableSetting } from "./settingsSearch";
import {
  useClearScopedSettings,
  useScopedSettings,
  useScopedSettingsMixed,
  useUpdateScopedSettings,
} from "./useScopedSettings";

function DirectoryBrowserModal({
  open,
  onOpenChange,
  currentValue,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentValue: string;
  onSelect: (path: string) => void;
}) {
  const [currentPath, setCurrentPath] = useState("");
  const [parentPath, setParentPath] = useState<string | null>(null);
  const [homePath, setHomePath] = useState("");
  const [directories, setDirectories] = useState<string[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [creating, setCreating] = useState(false);

  const fetchDirectory = useCallback(async (pathQuery?: string) => {
    setLoading(true);
    setSelectedFolder(null);
    setNewFolderOpen(false);
    try {
      const res = await fetch(resolvePrimaryEnvironmentHttpUrl("/api/fs/browse"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: pathQuery || "" }),
      });
      const data = await res.json();
      if (data.ok) {
        setCurrentPath(data.currentPath);
        setParentPath(
          data.parentPath && data.parentPath !== data.currentPath ? data.parentPath : null,
        );
        setHomePath(data.homePath || "");
        setDirectories(data.directories || []);
      }
    } catch {
      // ignore network errors
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      void fetchDirectory(currentValue || "");
    }
  }, [open, currentValue, fetchDirectory]);

  const handleCreateFolder = async () => {
    const trimmed = newFolderName.trim();
    if (!trimmed) return;
    setCreating(true);
    try {
      const folderPath = `${currentPath}/${trimmed}`;
      const res = await fetch(resolvePrimaryEnvironmentHttpUrl("/api/fs/ensure-dir"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: folderPath }),
      });
      const data = await res.json();
      if (data.ok) {
        setNewFolderName("");
        setNewFolderOpen(false);
        await fetchDirectory(folderPath);
      }
    } catch {
      // ignore
    } finally {
      setCreating(false);
    }
  };

  const handleConfirmSelect = async () => {
    const base = selectedFolder ? `${currentPath}/${selectedFolder}` : currentPath;
    if (!base) return;
    const storageName = "autocode-storage";
    const norm = base.replace(/\/+$/, "");
    const finalPath = norm.toLowerCase().endsWith(storageName.toLowerCase())
      ? norm
      : `${norm}/${storageName}`;
    try {
      await fetch(resolvePrimaryEnvironmentHttpUrl("/api/fs/ensure-dir"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: finalPath }),
      });
      onSelect(finalPath);
      onOpenChange(false);
    } catch {
      onSelect(finalPath);
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-semibold">
            <FolderOpenIcon className="size-4 text-primary" />
            Choose Projects Folder
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Browse and choose the location for your projects. Folders are automatically created if
            they do not exist.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 px-6 py-2">
          {/* Navigation Toolbar */}
          <div className="flex items-center gap-1.5 bg-muted/40 p-1.5 rounded-lg border border-border/50 text-xs">
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              title="Home directory (~)"
              onClick={() => void fetchDirectory(homePath)}
              disabled={loading || !homePath}
            >
              <HomeIcon className="size-3.5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              title="Parent directory"
              onClick={() => parentPath && void fetchDirectory(parentPath)}
              disabled={loading || !parentPath}
            >
              <ArrowUpIcon className="size-3.5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              title="Refresh"
              onClick={() => void fetchDirectory(currentPath)}
              disabled={loading}
            >
              <RefreshCwIcon className={cn("size-3.5", loading && "animate-spin")} />
            </Button>
            <div className="h-4 w-px bg-border/60 mx-1" />
            <span className="font-mono text-[11px] truncate select-all flex-1 text-foreground/80 px-1">
              {currentPath || "Loading..."}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={() => setNewFolderOpen(!newFolderOpen)}
              className="gap-1 text-[11px] shrink-0"
            >
              <FolderPlusIcon className="size-3.5" />
              New Folder
            </Button>
          </div>

          {/* New folder creation bar */}
          {newFolderOpen && (
            <div className="flex items-center gap-2 p-2 bg-accent/20 rounded-lg border border-accent/30">
              <Input
                size="sm"
                placeholder="Folder name (e.g. autocode-storage)"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleCreateFolder();
                }}
                className="text-xs h-7"
                autoFocus
              />
              <Button
                type="button"
                size="xs"
                variant="default"
                disabled={creating || !newFolderName.trim()}
                onClick={() => void handleCreateFolder()}
              >
                {creating ? "Creating..." : "Create"}
              </Button>
              <Button
                type="button"
                size="xs"
                variant="ghost"
                onClick={() => {
                  setNewFolderOpen(false);
                  setNewFolderName("");
                }}
              >
                Cancel
              </Button>
            </div>
          )}

          {/* Folder listing */}
          <div className="h-60 overflow-y-auto border border-border/40 rounded-lg p-1.5 bg-background/50 divide-y divide-border/20">
            {loading ? (
              <div className="flex items-center justify-center h-full gap-2 text-xs text-muted-foreground">
                <Loader2Icon className="size-4 animate-spin text-primary" />
                Reading directories...
              </div>
            ) : directories.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-1 text-xs text-muted-foreground">
                <FolderIcon className="size-6 text-muted-foreground/40 mb-1" />
                No subdirectories here
                <span className="text-[10px] text-muted-foreground/60">
                  You can select this folder directly or create a new one above
                </span>
              </div>
            ) : (
              directories.map((dir) => {
                const isSelected = selectedFolder === dir;
                return (
                  <div
                    key={dir}
                    onClick={() => setSelectedFolder(isSelected ? null : dir)}
                    onDoubleClick={() => void fetchDirectory(`${currentPath}/${dir}`)}
                    className={cn(
                      "flex items-center justify-between px-2.5 py-1.5 rounded-md cursor-pointer text-xs transition-colors group select-none",
                      isSelected
                        ? "bg-primary/15 text-primary font-medium"
                        : "hover:bg-muted/60 text-foreground/80",
                    )}
                  >
                    <div className="flex items-center gap-2 truncate flex-1 min-w-0">
                      <FolderIcon
                        className={cn(
                          "size-3.5 shrink-0",
                          isSelected
                            ? "text-primary"
                            : "text-muted-foreground/70 group-hover:text-foreground",
                        )}
                      />
                      <span className="truncate">{dir}</span>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-micro"
                      title={`Open ${dir}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        void fetchDirectory(`${currentPath}/${dir}`);
                      }}
                      className="opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <ArrowUpIcon className="size-3 rotate-90" />
                    </Button>
                  </div>
                );
              })
            )}
          </div>

          {/* Active selection preview */}
          <div className="text-[11px] text-muted-foreground flex items-center justify-between px-1">
            <span className="truncate">
              Target:{" "}
              <strong className="text-foreground font-mono">
                {(() => {
                  const base = selectedFolder ? `${currentPath}/${selectedFolder}` : currentPath;
                  if (!base) return "~/autocode-storage";
                  const norm = base.replace(/\/+$/, "");
                  return norm.toLowerCase().endsWith("autocode-storage")
                    ? norm
                    : `${norm}/autocode-storage`;
                })()}
              </strong>
            </span>
            <span className="text-[10px] text-muted-foreground/60 shrink-0 ml-2">
              (Double click to open folder)
            </span>
          </div>
        </div>

        <DialogFooter variant="default">
          <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="default"
            size="sm"
            onClick={() => void handleConfirmSelect()}
            disabled={!currentPath}
            className="gap-1.5"
          >
            <CheckIcon className="size-3.5" />
            Select This Folder
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}

function ProjectsDirectoryRow() {
  const settings = useScopedSettings();
  const updateSettings = useUpdateScopedSettings();
  const mixed = useScopedSettingsMixed(["projectsDirectory"]);
  const [browserOpen, setBrowserOpen] = useState(false);
  const [inputValue, setInputValue] = useState(settings.projectsDirectory || "");

  useEffect(() => {
    setInputValue(settings.projectsDirectory || "");
  }, [settings.projectsDirectory]);

  const savePath = async (rawPath: string) => {
    const trimmed = rawPath.trim();
    let finalPath = trimmed;
    if (trimmed) {
      const storageName = "autocode-storage";
      const norm = trimmed.replace(/\/+$/, "");
      finalPath = norm.toLowerCase().endsWith(storageName.toLowerCase())
        ? norm
        : `${norm}/${storageName}`;
      try {
        await fetch(resolvePrimaryEnvironmentHttpUrl("/api/fs/ensure-dir"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path: finalPath }),
        });
      } catch {
        // ignore
      }
    }
    updateSettings({ projectsDirectory: finalPath });
    toastManager.add({
      title: "Storage location updated",
      description: finalPath || "~/autocode-storage (default)",
      type: "success",
    });
  };

  return (
    <>
      <SettingsRow
        {...searchableSetting("storage-projects-location")}
        title="Storage location (autocode-storage)"
        description={
          "Folder where all projects, zip uploads, and Git clones are created and stored inside the fixed 'autocode-storage' folder (e.g. ~/autocode-storage or a custom path). Automatically created if it does not exist."
        }
        resetAction={
          mixed || (settings.projectsDirectory && settings.projectsDirectory !== "") ? (
            <SettingResetButton
              label="storage location"
              onClick={() => {
                void savePath("");
                setInputValue("");
              }}
            />
          ) : null
        }
        control={
          <div className="flex items-center gap-1.5 w-full max-w-sm">
            <Input
              aria-label="Storage location"
              autoCapitalize="none"
              spellCheck={false}
              placeholder={mixed ? "Mixed" : "~/autocode-storage"}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onBlur={() => {
                if (inputValue !== settings.projectsDirectory) {
                  void savePath(inputValue);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  if (inputValue !== settings.projectsDirectory) {
                    void savePath(inputValue);
                  }
                }
              }}
              className="font-mono text-xs flex-1"
            />
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              title="Browse folders on server"
              aria-label="Browse folders"
              onClick={() => setBrowserOpen(true)}
              className="shrink-0"
            >
              <FolderOpenIcon className="size-4" />
            </Button>
          </div>
        }
      />
      <DirectoryBrowserModal
        open={browserOpen}
        onOpenChange={setBrowserOpen}
        currentValue={inputValue}
        onSelect={(newPath) => {
          setInputValue(newPath);
          void savePath(newPath);
        }}
      />
    </>
  );
}

function WorktreesDirectoryRow() {
  const { connectedEnvironments, targets } = useSettingsScope();
  const settings = useScopedSettings();
  const updateSettings = useUpdateScopedSettings();
  const mixed = useScopedSettingsMixed(["worktreesDirectory"]);
  const edited = useRef(false);
  if (
    connectedEnvironments.some(
      (environment) =>
        environment.serverConfig?.environment.capabilities.worktreesDirectory !== true,
    )
  )
    return null;
  const scopeKey = targets.map((target) => target.environmentId).join(",");

  return (
    <SettingsRow
      {...searchableSetting("storage-worktrees-location")}
      description={
        "Folder where new worktrees are created, on any drive, such as D:\\worktrees or ~/worktrees. Existing worktrees stay where they are. Leave empty to use the T3 home folder."
      }
      serverScoped
      settingKeys={["worktreesDirectory"]}
      resetAction={
        mixed || settings.worktreesDirectory !== "" ? (
          <SettingResetButton
            label="worktree location"
            onClick={() => updateSettings({ worktreesDirectory: "" })}
          />
        ) : null
      }
      control={
        <Input
          key={`${scopeKey}:${mixed}:${settings.worktreesDirectory}`}
          aria-label="Worktree location"
          autoCapitalize="none"
          spellCheck={false}
          placeholder={mixed ? "Mixed" : "Default"}
          defaultValue={mixed ? "" : settings.worktreesDirectory}
          onChange={() => {
            edited.current = true;
          }}
          onBlur={(event) => {
            const value = event.target.value.trim();
            if (edited.current && (mixed || value !== settings.worktreesDirectory))
              updateSettings({ worktreesDirectory: value });
            edited.current = false;
          }}
        />
      }
    />
  );
}

function RetentionControl({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
}) {
  const [draft, setDraft] = useState(value);
  const [savedValue, setSavedValue] = useState(value);
  if (savedValue !== value) {
    setSavedValue(value);
    setDraft(value);
  }

  return (
    <div className="flex items-center gap-3">
      {value !== null ? (
        <NumberField
          value={draft}
          min={1}
          max={3650}
          step={1}
          size="sm"
          className="w-auto"
          onValueChange={setDraft}
          onValueCommitted={(next) => {
            if (next === null) setDraft(value);
            else {
              const days = Math.min(3650, Math.max(1, Math.round(next)));
              setDraft(days);
              onChange(days);
            }
          }}
        >
          <NumberFieldGroup>
            <NumberFieldDecrement aria-label={`Decrease ${label}`} />
            <NumberFieldInput
              aria-label={`${label} in days`}
              size={new Intl.NumberFormat().format(draft ?? value).length}
              className="field-sizing-content w-auto min-w-[1ch] grow-0 text-right"
            />
            <span aria-hidden="true" className="self-center pr-2 text-xs">
              days
            </span>
            <NumberFieldIncrement aria-label={`Increase ${label}`} />
          </NumberFieldGroup>
        </NumberField>
      ) : (
        <span className="text-xs text-muted-foreground">Off</span>
      )}
      <Switch
        aria-label={label}
        checked={value !== null}
        onCheckedChange={(enabled) => onChange(enabled ? 8 : null)}
      />
    </div>
  );
}

export function StorageSettingsPanel() {
  const { scope, connectedEnvironments, targets, target } = useSettingsScope();
  const scopedSettings = useScopedSettings();
  const isProjectScope = scope.kind === "project" || scope.kind === "checkout";
  const settings = {
    ...scopedSettings.storageCleanup,
    ...resolveWorktreeCleanup(scopedSettings, null),
  };
  const projectMode = (entry: ScopedSettingsTarget | null) =>
    entry?.sources.worktreeCleanup === "project"
      ? (entry.settings.worktreeCleanup?.mode ?? "inherit")
      : "inherit";
  const mode = projectMode(target);
  const mixedModes = targets.some((entry) => projectMode(entry) !== mode);
  const updateSettings = useUpdateScopedSettings();
  const clearSettings = useClearScopedSettings();
  const ruleStatus = (key: keyof StorageCleanupSettings) =>
    targets.some(
      (target) =>
        ({ ...target.settings.storageCleanup, ...resolveWorktreeCleanup(target.settings, null) })[
          key
        ] !== settings[key],
    )
      ? "Mixed across selected machines"
      : undefined;
  const update = (patch: Partial<StorageCleanupSettings>) =>
    updateSettings({ storageCleanup: patch });
  const updateWorktree = (patch: Partial<WorktreeCleanupRules>) =>
    isProjectScope
      ? updateSettings({ worktreeCleanup: { mode: "custom", rules: patch } })
      : update(patch);

  if (
    isProjectScope &&
    connectedEnvironments.some(
      (environment) =>
        environment.serverConfig?.environment.capabilities.projectWorktreeCleanup !== true,
    )
  ) {
    return (
      <SettingsScopeNotice target="all">
        Update the selected machines to configure project worktree cleanup.
      </SettingsScopeNotice>
    );
  }

  if (
    connectedEnvironments.some(
      (environment) => environment.serverConfig?.environment.capabilities.storageCleanup !== true,
    )
  ) {
    return (
      <SettingsScopeNotice
        target="environment"
        eligibleEnvironmentIds={connectedEnvironments
          .filter(
            (environment) =>
              environment.serverConfig?.environment.capabilities.storageCleanup === true,
          )
          .map((environment) => environment.environmentId)}
      >
        Update the selected environments to use storage cleanup, or choose a machine that supports
        it.
      </SettingsScopeNotice>
    );
  }

  return (
    <SettingsPageContainer>
      {!isProjectScope && (
        <SettingsSection id="storage-projects" title="Projects & Workspace Location">
          <ProjectsDirectoryRow />
        </SettingsSection>
      )}
      <SettingsSection id="storage-worktrees" title="Worktrees">
        {!isProjectScope && <WorktreesDirectoryRow />}
        {isProjectScope && (
          <SettingsRow
            title="Automatic worktree cleanup"
            description={
              mode === "off"
                ? "Keep this project's worktrees until you delete them manually."
                : mode === "custom"
                  ? "Use these rules for this project."
                  : "Use each machine's worktree cleanup settings."
            }
            serverScoped
            settingKeys={["worktreeCleanup"]}
            mixed={mixedModes}
            control={
              <Select
                value={mixedModes ? null : mode}
                onValueChange={(next) => {
                  if (next === "inherit") clearSettings(["worktreeCleanup"]);
                  else if (next === "off") updateSettings({ worktreeCleanup: { mode: "off" } });
                  else if (next === "custom")
                    updateSettings({ worktreeCleanup: { mode: "custom", rules: {} } });
                }}
              >
                <SelectTrigger size="sm" aria-label="Automatic worktree cleanup">
                  <SelectValue>
                    {mixedModes
                      ? "Mixed"
                      : mode === "inherit"
                        ? "Inherit"
                        : mode === "off"
                          ? "Off"
                          : "Custom"}
                  </SelectValue>
                </SelectTrigger>
                <SelectPopup align="end" alignItemWithTrigger={false}>
                  <SelectItem value="inherit">Inherit</SelectItem>
                  <SelectItem value="off">Off</SelectItem>
                  <SelectItem value="custom">Custom</SelectItem>
                </SelectPopup>
              </Select>
            }
          />
        )}
        {(!isProjectScope || (!mixedModes && mode === "custom")) && (
          <>
            <SettingsRow
              title="Delete worktrees with deleted threads"
              status={ruleStatus("worktreeOnDelete")}
              description="Remove unused worktrees when active or archived threads are deleted. Worktrees with local changes are kept."
              serverScoped={!isProjectScope}
              control={
                <Switch
                  aria-label="Delete worktrees with deleted threads"
                  checked={settings.worktreeOnDelete}
                  onCheckedChange={(worktreeOnDelete) => updateWorktree({ worktreeOnDelete })}
                />
              }
            />
            <SettingsRow
              title="Delete inactive worktrees"
              status={ruleStatus("worktreeAfterDays")}
              description="Remove worktrees after their threads have been inactive for this many days. Branches and thread history are kept."
              serverScoped={!isProjectScope}
              control={
                <RetentionControl
                  label="Delete inactive worktrees"
                  value={settings.worktreeAfterDays}
                  onChange={(worktreeAfterDays) => updateWorktree({ worktreeAfterDays })}
                />
              }
            />
            <SettingsRow
              title="Delete merged worktrees"
              status={ruleStatus("worktreeOnMerge")}
              description="Remove worktrees whose pull request is merged and whose commits are included in the default branch."
              serverScoped={!isProjectScope}
              control={
                <Switch
                  aria-label="Delete merged worktrees"
                  checked={settings.worktreeOnMerge}
                  onCheckedChange={(worktreeOnMerge) => updateWorktree({ worktreeOnMerge })}
                />
              }
            />
            <SettingsRow
              title="Delete unchanged worktrees"
              status={ruleStatus("worktreeUnchanged")}
              description="Remove worktrees with no commits beyond the default branch."
              serverScoped={!isProjectScope}
              control={
                <Switch
                  aria-label="Delete unchanged worktrees"
                  checked={settings.worktreeUnchanged}
                  onCheckedChange={(worktreeUnchanged) => updateWorktree({ worktreeUnchanged })}
                />
              }
            />
          </>
        )}
      </SettingsSection>

      {!isProjectScope && (
        <SettingsSection id="storage-artifacts" title="Artifacts and logs">
          <SettingsRow
            title="Delete old browser artifacts"
            status={ruleStatus("browserArtifactsAfterDays")}
            description="Delete saved browser captures after this many days. Older capture links will no longer open."
            serverScoped
            control={
              <RetentionControl
                label="Delete old browser artifacts"
                value={settings.browserArtifactsAfterDays}
                onChange={(browserArtifactsAfterDays) => update({ browserArtifactsAfterDays })}
              />
            }
          />
          <SettingsRow
            title="Delete old rotated logs"
            status={ruleStatus("logsAfterDays")}
            description="Delete inactive rotated log files after this many days. Current logs are kept."
            serverScoped
            control={
              <RetentionControl
                label="Delete old rotated logs"
                value={settings.logsAfterDays}
                onChange={(logsAfterDays) => update({ logsAfterDays })}
              />
            }
          />
        </SettingsSection>
      )}
    </SettingsPageContainer>
  );
}
