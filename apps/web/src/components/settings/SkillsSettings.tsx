import { useCallback, useEffect, useMemo, useState } from "react";
import {
  SparklesIcon,
  CheckIcon,
  Trash2Icon,
  PencilIcon,
  PlusIcon,
  DownloadIcon,
  UploadIcon,
  CopyIcon,
  FileCodeIcon,
  ShieldCheckIcon,
  SearchIcon,
  EyeIcon,
  RefreshCwIcon,
  LayersIcon,
  CheckCircle2Icon,
} from "lucide-react";

import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { Switch } from "../ui/switch";
import { Spinner } from "../ui/spinner";
import { toastManager } from "../ui/toast";
import {
  Dialog,
  DialogPopup,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogPanel,
  DialogFooter,
} from "../ui/dialog";
import { Tooltip, TooltipTrigger, TooltipPopup } from "../ui/tooltip";
import { SettingsPageContainer } from "./settingsLayout";
import { cn } from "~/lib/utils";

export interface SkillItem {
  dirName: string;
  name: string;
  description: string;
  path: string;
  fullPath: string;
  isBuiltin: boolean;
  isActive: boolean;
  content: string;
}

const DEFAULT_BUILTIN_NAMES = new Set([
  "agent-browser-testing",
  "web-ui-design",
  "code-reviewer",
  "web-designer",
  "git-workflow",
  "contribution-triage",
  "test-t3-app",
]);

export function SkillsSettingsPanel() {
  const [skills, setSkills] = useState<SkillItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<
    "all" | "active" | "inactive" | "builtin" | "custom"
  >("all");

  // View / Edit modal state
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editorDirName, setEditorDirName] = useState("");
  const [editorName, setEditorName] = useState("");
  const [editorDesc, setEditorDesc] = useState("");
  const [editorBody, setEditorBody] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // View Details modal
  const [viewSkill, setViewSkill] = useState<SkillItem | null>(null);

  // Import modal state
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [isImporting, setIsImporting] = useState(false);

  // Delete confirm state
  const [skillToDelete, setSkillToDelete] = useState<SkillItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Load skills list from backend
  const loadSkills = useCallback(async (showToast = false) => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/terminal/exec", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          command: "python3 scripts/skills-manager.py list",
          timeoutMs: 15_000,
        }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { stdout: string; ok: boolean };
      const parsed = JSON.parse(data.stdout || "{}") as { ok: boolean; skills?: SkillItem[] };

      if (parsed.ok && parsed.skills) {
        setSkills(parsed.skills);
        if (showToast) {
          toastManager.add({
            title: "Skills refreshed",
            description: `Loaded ${parsed.skills.length} skills.`,
          });
        }
      }
    } catch (err) {
      console.error("Failed to load skills", err);
      toastManager.add({
        title: "Failed to load skills",
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSkills();
  }, [loadSkills]);

  // Toggle active state for a skill
  const handleToggleActive = async (skill: SkillItem) => {
    const newState = !skill.isActive;
    // Optimistic UI update
    setSkills((prev) =>
      prev.map((s) => (s.dirName === skill.dirName ? { ...s, isActive: newState } : s)),
    );

    try {
      const res = await fetch("/api/terminal/exec", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          command: `python3 scripts/skills-manager.py toggle ${JSON.stringify(skill.dirName)} ${newState ? "1" : "0"}`,
          timeoutMs: 10_000,
        }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toastManager.add({
        title: newState ? "Skill Activated" : "Skill Deactivated",
        description: `${skill.name} is now ${newState ? "active and loaded" : "disabled"}.`,
      });
    } catch (err) {
      // Revert optimistic update
      setSkills((prev) =>
        prev.map((s) => (s.dirName === skill.dirName ? { ...s, isActive: !newState } : s)),
      );
      toastManager.add({
        title: "Toggle failed",
        description: err instanceof Error ? err.message : String(err),
      });
    }
  };

  // Copy skill path
  const handleCopyPath = (path: string) => {
    void navigator.clipboard.writeText(path);
    toastManager.add({
      title: "Path copied to clipboard",
      description: path,
    });
  };

  // Open Create Skill Modal
  const handleOpenCreateModal = () => {
    setIsEditing(false);
    setEditorDirName("");
    setEditorName("");
    setEditorDesc("");
    setEditorBody(
      "# Instructions\n\nProvide step-by-step instructions and principles for this skill.\n\n## Workflow\n1. Analyze the context\n2. Execute requirements\n3. Verify results\n",
    );
    setIsEditorOpen(true);
  };

  // Open Edit Skill Modal
  const handleOpenEditModal = (skill: SkillItem) => {
    setIsEditing(true);
    setEditorDirName(skill.dirName);
    setEditorName(skill.name);
    setEditorDesc(skill.description);

    // Strip frontmatter from content for the body editor
    let body = skill.content;
    const fmMatch = skill.content.match(/^---\s*\n(.*?)\n---\s*\n?/s);
    if (fmMatch?.[0]) {
      body = skill.content.slice(fmMatch[0].length);
    }
    setEditorBody(body);
    setIsEditorOpen(true);
  };

  // Save Skill (Create or Update)
  const handleSaveSkill = async () => {
    const rawName = editorName.trim();
    if (!rawName) {
      toastManager.add({
        title: "Name is required",
        description: "Please enter a valid skill name.",
      });
      return;
    }

    const slug = isEditing
      ? editorDirName
      : rawName
          .toLowerCase()
          .replace(/[^a-z0-9_-]/g, "-")
          .replace(/-+/g, "-");

    const fullContent = `---
name: ${rawName}
description: ${editorDesc.trim()}
---

${editorBody.trim()}
`;

    setIsSaving(true);
    try {
      const b64 = btoa(unescape(encodeURIComponent(fullContent)));
      const res = await fetch("/api/terminal/exec", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          command: `python3 scripts/skills-manager.py save ${JSON.stringify(slug)} ${JSON.stringify(b64)}`,
          timeoutMs: 15_000,
        }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toastManager.add({
        title: isEditing ? "Skill Updated" : "Skill Created",
        description: `Saved to .agents/skills/${slug}/SKILL.md`,
      });

      setIsEditorOpen(false);
      await loadSkills();
    } catch (err) {
      toastManager.add({
        title: "Failed to save skill",
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Delete Skill Confirmation
  const handleDeleteSkill = async () => {
    if (!skillToDelete) return;
    if (skillToDelete.isBuiltin || DEFAULT_BUILTIN_NAMES.has(skillToDelete.dirName)) {
      toastManager.add({
        title: "Action Not Allowed",
        description: "Built-in default skills cannot be deleted. You can disable them instead.",
      });
      setSkillToDelete(null);
      return;
    }

    setIsDeleting(true);
    try {
      const res = await fetch("/api/terminal/exec", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          command: `python3 scripts/skills-manager.py delete ${JSON.stringify(skillToDelete.dirName)}`,
          timeoutMs: 10_000,
        }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toastManager.add({
        title: "Skill Deleted",
        description: `Removed .agents/skills/${skillToDelete.dirName}`,
      });
      setSkillToDelete(null);
      await loadSkills();
    } catch (err) {
      toastManager.add({
        title: "Failed to delete skill",
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsDeleting(false);
    }
  };

  // Reset a built-in skill to its default template
  const handleResetSkill = async (skill: SkillItem) => {
    try {
      const res = await fetch("/api/terminal/exec", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          command: `python3 scripts/skills-manager.py reset ${JSON.stringify(skill.dirName)}`,
          timeoutMs: 10_000,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toastManager.add({
        title: "Skill Restored",
        description: `Reset .agents/skills/${skill.dirName}/SKILL.md to default template.`,
      });
      await loadSkills();
    } catch (err) {
      toastManager.add({
        title: "Failed to reset skill",
        description: err instanceof Error ? err.message : String(err),
      });
    }
  };

  // Export a single skill (.md file download)
  const handleExportSkill = (skill: SkillItem) => {
    const blob = new Blob([skill.content], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${skill.dirName}.skill.md`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toastManager.add({
      title: "Skill Exported",
      description: `Downloaded ${skill.dirName}.skill.md`,
    });
  };

  // Export all active skills bundle as JSON
  const handleExportAllActive = () => {
    const activeSkills = skills.filter((s) => s.isActive);
    if (activeSkills.length === 0) {
      toastManager.add({
        title: "No active skills",
        description: "Select or activate at least one skill to export.",
      });
      return;
    }

    const payload = {
      exportedAt: new Date().toISOString(),
      skills: activeSkills.map((s) => ({
        name: s.name,
        dirName: s.dirName,
        description: s.description,
        path: s.path,
        content: s.content,
      })),
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `t3-active-skills-${Date.now()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toastManager.add({
      title: "Active Skills Bundle Exported",
      description: `Exported ${activeSkills.length} active skills.`,
    });
  };

  // Handle Import from File
  const handleImportFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (text) {
        setImportText(text);
      }
    };
    reader.readAsText(file);
  };

  // Execute Import
  const handleExecuteImport = async () => {
    const raw = importText.trim();
    if (!raw) {
      toastManager.add({
        title: "Content required",
        description: "Please upload or paste markdown content.",
      });
      return;
    }

    // Try parsing frontmatter
    let name = "";
    let desc = "";
    const fmMatch = raw.match(/^---\s*\n(.*?)\n---/s);
    if (fmMatch?.[1]) {
      const lines = fmMatch[1].split("\n");
      for (const line of lines) {
        if (line.startsWith("name:")) {
          name = line
            .replace("name:", "")
            .trim()
            .replace(/^["']|["']$/g, "");
        } else if (line.startsWith("description:")) {
          desc = line
            .replace("description:", "")
            .trim()
            .replace(/^["']|["']$/g, "");
        }
      }
    }

    if (!name) {
      // Default to generic slug if not found
      name = `custom-skill-${Date.now().toString(36)}`;
    }

    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, "-")
      .replace(/-+/g, "-");

    let finalContent = raw;
    if (!fmMatch) {
      // Prepend valid frontmatter if missing
      finalContent = `---
name: ${name}
description: ${desc || "Imported custom skill"}
---

${raw}
`;
    }

    setIsImporting(true);
    try {
      const b64 = btoa(unescape(encodeURIComponent(finalContent)));
      const res = await fetch("/api/terminal/exec", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          command: `python3 scripts/skills-manager.py save ${JSON.stringify(slug)} ${JSON.stringify(b64)}`,
          timeoutMs: 15_000,
        }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toastManager.add({
        title: "Skill Imported Successfully",
        description: `Imported as .agents/skills/${slug}/SKILL.md`,
      });

      setIsImportOpen(false);
      setImportText("");
      await loadSkills();
    } catch (err) {
      toastManager.add({
        title: "Import Failed",
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsImporting(false);
    }
  };

  // Filter skills
  const filteredSkills = useMemo(() => {
    return skills.filter((item) => {
      if (filterType === "active" && !item.isActive) return false;
      if (filterType === "inactive" && item.isActive) return false;
      if (filterType === "builtin" && !item.isBuiltin) return false;
      if (filterType === "custom" && item.isBuiltin) return false;

      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      return (
        item.name.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.path.toLowerCase().includes(q)
      );
    });
  }, [skills, filterType, searchQuery]);

  const activeCount = useMemo(() => skills.filter((s) => s.isActive).length, [skills]);
  const builtinCount = useMemo(() => skills.filter((s) => s.isBuiltin).length, [skills]);
  const customCount = useMemo(() => skills.filter((s) => !s.isBuiltin).length, [skills]);

  return (
    <SettingsPageContainer width="readable">
      {/* Header section */}
      <div className="flex flex-col gap-3 pb-2">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary shadow-xs">
              <SparklesIcon className="size-5" />
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight">Skills</h1>
              <p className="text-xs text-muted-foreground">
                Modular agent skills in{" "}
                <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">
                  .agents/skills/&lt;name&gt;/SKILL.md
                </code>
              </p>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => void loadSkills(true)}
              disabled={isLoading}
            >
              <RefreshCwIcon className={cn("size-3.5", isLoading && "animate-spin")} />
              <span className="hidden sm:inline">Refresh</span>
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleExportAllActive}
              disabled={activeCount === 0}
            >
              <DownloadIcon className="size-3.5" />
              <span>Export Active</span>
            </Button>
            <Button size="sm" variant="outline" onClick={() => setIsImportOpen(true)}>
              <UploadIcon className="size-3.5" />
              <span>Import</span>
            </Button>
            <Button size="sm" variant="default" onClick={handleOpenCreateModal}>
              <PlusIcon className="size-3.5" />
              <span>New Skill</span>
            </Button>
          </div>
        </div>

        {/* Stats Summary Card */}
        <div className="grid grid-cols-2 gap-3 pt-2 sm:grid-cols-4">
          <div className="flex flex-col gap-0.5 rounded-lg border bg-card/50 p-3 shadow-xs">
            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
              Total Skills
            </span>
            <span className="text-lg font-bold">{skills.length}</span>
          </div>
          <div className="flex flex-col gap-0.5 rounded-lg border bg-card/50 p-3 shadow-xs">
            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
              Active
            </span>
            <div className="flex items-center gap-1.5">
              <span className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                {activeCount}
              </span>
              <span className="text-xs text-muted-foreground">/ {skills.length}</span>
            </div>
          </div>
          <div className="flex flex-col gap-0.5 rounded-lg border bg-card/50 p-3 shadow-xs">
            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
              Built-in (Protected)
            </span>
            <span className="text-lg font-bold">{builtinCount}</span>
          </div>
          <div className="flex flex-col gap-0.5 rounded-lg border bg-card/50 p-3 shadow-xs">
            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
              Custom Skills
            </span>
            <span className="text-lg font-bold">{customCount}</span>
          </div>
        </div>

        {/* Search & Filter Bar */}
        <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1">
            <SearchIcon className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search skills by name, description, or path..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 pl-8 text-xs"
            />
          </div>
          <div className="flex flex-wrap items-center gap-1">
            {(
              [
                { id: "all", label: "All" },
                { id: "active", label: `Active (${activeCount})` },
                { id: "inactive", label: "Inactive" },
                { id: "builtin", label: "Built-in" },
                { id: "custom", label: "Custom" },
              ] as const
            ).map((tab) => (
              <Button
                key={tab.id}
                size="sm"
                variant={filterType === tab.id ? "secondary" : "ghost"}
                className={cn(
                  "h-7 px-2.5 text-xs font-medium",
                  filterType === tab.id && "bg-muted shadow-xs",
                )}
                onClick={() => setFilterType(tab.id)}
              >
                {tab.label}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {/* Skills Grid */}
      {isLoading && skills.length === 0 ? (
        <div className="flex h-48 flex-col items-center justify-center gap-2 rounded-xl border border-dashed text-muted-foreground">
          <Spinner className="size-6" />
          <p className="text-xs">Loading skills from .agents/skills...</p>
        </div>
      ) : filteredSkills.length === 0 ? (
        <div className="flex h-48 flex-col items-center justify-center gap-2 rounded-xl border border-dashed text-muted-foreground">
          <LayersIcon className="size-8 stroke-[1.5] text-muted-foreground/60" />
          <p className="text-sm font-medium">No skills found</p>
          <p className="text-xs">Try adjusting your search query or filter options.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-1">
          {filteredSkills.map((skill) => (
            <div
              key={skill.dirName}
              className={cn(
                "group relative flex flex-col justify-between gap-3 rounded-xl border bg-card p-4 transition-all shadow-xs hover:border-foreground/20 hover:shadow-sm",
                skill.isActive &&
                  "border-emerald-500/40 bg-emerald-500/[0.02] dark:border-emerald-500/30",
              )}
            >
              {/* Top row: Title, badges, and toggle switch */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <button
                    type="button"
                    onClick={() => void handleToggleActive(skill)}
                    className={cn(
                      "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border transition-colors cursor-pointer",
                      skill.isActive
                        ? "border-emerald-500 bg-emerald-500 text-white dark:bg-emerald-600"
                        : "border-input bg-background hover:border-foreground/40",
                    )}
                    title={skill.isActive ? "Click to deactivate" : "Click to activate"}
                  >
                    {skill.isActive && <CheckIcon className="size-3.5 stroke-[3]" />}
                  </button>

                  <div className="flex flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-sm tracking-tight">{skill.name}</span>
                      {skill.isBuiltin ? (
                        <Badge
                          variant="secondary"
                          className="gap-1 text-[10px] font-medium text-sky-600 dark:text-sky-400 bg-sky-500/10 border-sky-500/20"
                        >
                          <ShieldCheckIcon className="size-2.5" />
                          Built-in
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] text-muted-foreground">
                          Custom
                        </Badge>
                      )}
                      {skill.isActive ? (
                        <Badge
                          variant="secondary"
                          className="gap-1 text-[10px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
                        >
                          <CheckCircle2Icon className="size-2.5" />
                          Active
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] text-muted-foreground/70">
                          Disabled
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
                      {skill.description}
                    </p>
                  </div>
                </div>

                {/* Right side switch */}
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[11px] text-muted-foreground font-medium hidden sm:inline">
                    {skill.isActive ? "Active" : "Inactive"}
                  </span>
                  <Switch
                    checked={skill.isActive}
                    onCheckedChange={() => void handleToggleActive(skill)}
                    aria-label={`Toggle ${skill.name}`}
                  />
                </div>
              </div>

              {/* Bottom row: Exact Path & Action Buttons */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-2.5 text-xs">
                {/* Exact Antigravity Path with Copy */}
                <div className="flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground bg-muted/40 rounded px-2 py-1 max-w-full overflow-hidden">
                  <FileCodeIcon className="size-3 shrink-0 text-muted-foreground/70" />
                  <span className="truncate">{skill.path}</span>
                  <button
                    type="button"
                    onClick={() => handleCopyPath(skill.path)}
                    className="ml-1 text-muted-foreground hover:text-foreground cursor-pointer"
                    title="Copy relative path"
                  >
                    <CopyIcon className="size-3" />
                  </button>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs"
                    onClick={() => setViewSkill(skill)}
                    title="View skill documentation"
                  >
                    <EyeIcon className="size-3 mr-1" />
                    View
                  </Button>

                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs"
                    onClick={() => handleOpenEditModal(skill)}
                    title="Edit skill"
                  >
                    <PencilIcon className="size-3 mr-1" />
                    Edit
                  </Button>

                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs"
                    onClick={() => handleExportSkill(skill)}
                    title="Export skill as SKILL.md"
                  >
                    <DownloadIcon className="size-3 mr-1" />
                    Export
                  </Button>

                  {/* Reset button for Builtin skills */}
                  {skill.isBuiltin && (
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-xs text-amber-500 hover:bg-amber-500/10 hover:text-amber-500"
                            onClick={() => handleResetSkill(skill)}
                            title="Reset to default"
                          >
                            <RefreshCwIcon className="size-3 mr-1" />
                            Reset
                          </Button>
                        }
                      />
                      <TooltipPopup side="top">
                        Restore this skill's original default template.
                      </TooltipPopup>
                    </Tooltip>
                  )}

                  {/* Delete Button: Disabled / Protected for Builtin */}
                  {skill.isBuiltin ? (
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <span tabIndex={0} className="inline-block cursor-not-allowed">
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled
                              className="h-7 px-2 text-xs text-muted-foreground/40 opacity-50"
                            >
                              <Trash2Icon className="size-3 mr-1" />
                              Delete
                            </Button>
                          </span>
                        }
                      />
                      <TooltipPopup side="top">
                        Default built-in skills cannot be deleted. You can disable them instead.
                      </TooltipPopup>
                    </Tooltip>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => setSkillToDelete(skill)}
                      title="Delete custom skill"
                    >
                      <Trash2Icon className="size-3 mr-1" />
                      Delete
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* View Skill Modal */}
      <Dialog open={!!viewSkill} onOpenChange={(open) => !open && setViewSkill(null)}>
        <DialogPopup className="w-full sm:max-w-2xl">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <SparklesIcon className="size-5 text-primary" />
              <DialogTitle>{viewSkill?.name}</DialogTitle>
            </div>
            <DialogDescription className="font-mono text-xs">{viewSkill?.path}</DialogDescription>
          </DialogHeader>
          <DialogPanel className="max-h-[60vh] overflow-y-auto">
            <div className="rounded-lg border bg-muted/30 p-4 font-mono text-xs whitespace-pre-wrap leading-relaxed select-text">
              {viewSkill?.content}
            </div>
          </DialogPanel>
          <DialogFooter className="flex justify-between sm:justify-between items-center w-full">
            <div className="flex items-center gap-2">
              {viewSkill && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    handleExportSkill(viewSkill);
                  }}
                >
                  <DownloadIcon className="size-3.5 mr-1" />
                  Download SKILL.md
                </Button>
              )}
            </div>
            <Button size="sm" variant="default" onClick={() => setViewSkill(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>

      {/* Create / Edit Skill Modal */}
      <Dialog open={isEditorOpen} onOpenChange={setIsEditorOpen}>
        <DialogPopup className="w-full sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {isEditing ? `Edit Skill: ${editorName}` : "Create New Custom Skill"}
            </DialogTitle>
            <DialogDescription>
              Skills are saved as Markdown instructions with YAML frontmatter at{" "}
              <code className="text-xs font-mono">.agents/skills/&lt;name&gt;/SKILL.md</code>
            </DialogDescription>
          </DialogHeader>
          <DialogPanel className="flex flex-col gap-4 max-h-[65vh] overflow-y-auto pr-1">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium">Skill Name</label>
                <Input
                  placeholder="e.g. fast-code-auditor"
                  value={editorName}
                  onChange={(e) => setEditorName(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium">Folder Slug</label>
                <Input
                  disabled={isEditing}
                  placeholder="auto-derived from name"
                  value={
                    isEditing
                      ? editorDirName
                      : editorName
                          .toLowerCase()
                          .replace(/[^a-z0-9_-]/g, "-")
                          .replace(/-+/g, "-")
                  }
                  className="h-8 text-xs font-mono bg-muted/40"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium">Description</label>
              <Input
                placeholder="Brief summary of what this skill enables the agent to perform"
                value={editorDesc}
                onChange={(e) => setEditorDesc(e.target.value)}
                className="h-8 text-xs"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium">Instructions & Content (Markdown)</label>
                <span className="text-[11px] text-muted-foreground">
                  Antigravity SKILL.md format
                </span>
              </div>
              <Textarea
                rows={12}
                placeholder="# Instructions&#10;&#10;Detailed principles and steps for the agent..."
                value={editorBody}
                onChange={(e) => setEditorBody(e.target.value)}
                className="font-mono text-xs leading-relaxed"
              />
            </div>
          </DialogPanel>
          <DialogFooter>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setIsEditorOpen(false)}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button size="sm" variant="default" onClick={handleSaveSkill} disabled={isSaving}>
              {isSaving ? (
                <>
                  <Spinner className="size-3 mr-1" />
                  Saving...
                </>
              ) : (
                "Save Skill"
              )}
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>

      {/* Import Skill Modal */}
      <Dialog open={isImportOpen} onOpenChange={setIsImportOpen}>
        <DialogPopup className="w-full sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Import Skill</DialogTitle>
            <DialogDescription>
              Upload an existing <code className="text-xs font-mono">SKILL.md</code> or paste
              markdown instructions with frontmatter.
            </DialogDescription>
          </DialogHeader>
          <DialogPanel className="flex flex-col gap-4 max-h-[65vh] overflow-y-auto">
            {/* File upload drag drop / input */}
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-input bg-muted/20 p-6 text-center hover:bg-muted/40 transition-colors">
              <UploadIcon className="size-8 text-muted-foreground/70 mb-2" />
              <p className="text-xs font-medium">Choose a SKILL.md file from your computer</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Supports .md and .txt files
              </p>
              <label className="mt-3 cursor-pointer">
                <span className="inline-flex h-8 items-center justify-center rounded-md border border-input bg-background px-3 text-xs font-medium shadow-xs hover:bg-accent hover:text-accent-foreground">
                  Select File
                </span>
                <input
                  type="file"
                  accept=".md,.txt"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleImportFile(file);
                  }}
                />
              </label>
            </div>

            {/* Direct text paste */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium">Or Paste Skill Content</label>
              <Textarea
                rows={10}
                placeholder="---\nname: my-skill\ndescription: Does awesome tasks\n---\n\n# Skill instructions..."
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                className="font-mono text-xs leading-relaxed"
              />
            </div>
          </DialogPanel>
          <DialogFooter>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setIsImportOpen(false)}
              disabled={isImporting}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              variant="default"
              onClick={handleExecuteImport}
              disabled={isImporting || !importText.trim()}
            >
              {isImporting ? (
                <>
                  <Spinner className="size-3 mr-1" />
                  Importing...
                </>
              ) : (
                "Import & Save"
              )}
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>

      {/* Delete Confirmation Modal */}
      <Dialog open={!!skillToDelete} onOpenChange={(open) => !open && setSkillToDelete(null)}>
        <DialogPopup className="w-full sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-destructive">Delete Custom Skill?</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete{" "}
              <strong className="text-foreground">{skillToDelete?.name}</strong>? This will
              permanently delete the directory{" "}
              <code className="text-xs font-mono">{skillToDelete?.path}</code> from disk.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setSkillToDelete(null)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={handleDeleteSkill}
              disabled={isDeleting}
            >
              {isDeleting ? (
                <>
                  <Spinner className="size-3 mr-1" />
                  Deleting...
                </>
              ) : (
                "Delete Skill"
              )}
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>
    </SettingsPageContainer>
  );
}
