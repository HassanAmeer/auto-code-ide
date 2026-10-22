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
  TerminalIcon,
  XIcon,
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
import { useOptionalSettingsScope } from "./SettingsScopeContext";
import { Sheet, SheetPopup, SheetHeader, SheetTitle, SheetDescription } from "../ui/sheet";
import { useProjects, useThreadShells } from "../../state/entities";
import { cn } from "~/lib/utils";
import JSZip from "jszip";

export interface ProjectGlobalSkills {
  id: string;
  title: string;
  workspaceRoot: string;
  enabled: string[];
  pending?: boolean;
}

export interface GlobalSkillItem extends SkillItem {
  /** Whether this project already uses the global skill. */
  enabledInProject: boolean;
  /** True while the enable or disable request is running. */
  pending?: boolean;
}

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

/** Skills are listed ten at a time, with the pager above and below the list. */
const SKILL_PAGE_SIZE = 10;

function SkillPagination({
  page,
  pageCount,
  total,
  onPageChange,
}: {
  page: number;
  pageCount: number;
  total: number;
  onPageChange: (page: number) => void;
}) {
  if (total === 0) return null;
  return (
    <div className="flex items-center justify-between gap-2 px-1">
      <span className="text-[11px] text-muted-foreground">
        Page {page} of {pageCount} · {total} skill{total === 1 ? "" : "s"}
      </span>
      <div className="flex items-center gap-1">
        <Button
          size="sm"
          variant="outline"
          className="h-7 px-2 text-xs"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          Previous
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-7 px-2 text-xs"
          disabled={page >= pageCount}
          onClick={() => onPageChange(page + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
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

/**
 * One compact skill row: the name, a short description, the path in grey, and
 * the actions as icon buttons so the list stays tight.
 */
function SkillTile({
  skill,
  path,
  badges,
  footnote,
  actions,
  trailing,
}: {
  skill: SkillItem;
  path: string;
  badges?: React.ReactNode;
  footnote?: React.ReactNode;
  actions: ReadonlyArray<{ label: string; icon: React.ReactNode; onClick: () => void }>;
  trailing?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 border-b border-border/40 px-3 py-2 last:border-b-0">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-center gap-2">
          <span className="truncate text-xs font-medium text-foreground">{skill.name}</span>
          {badges}
        </div>
        {skill.description && (
          <p className="truncate text-[11px] text-muted-foreground">{skill.description}</p>
        )}
        <code className="truncate font-mono text-[10px] text-muted-foreground/80">{path}</code>
        {footnote}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {actions.map((action) => (
          <Tooltip key={action.label}>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  onClick={action.onClick}
                  className="flex size-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  aria-label={action.label}
                >
                  {action.icon}
                </button>
              }
            />
            <TooltipPopup>{action.label}</TooltipPopup>
          </Tooltip>
        ))}
        {trailing}
      </div>
    </div>
  );
}

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
  const [editorTarget, setEditorTarget] = useState<"global" | "project">("project");
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
  const [importName, setImportName] = useState("");
  const [isImporting, setIsImporting] = useState(false);

  // Install-from-command modal state
  const [isInstallOpen, setIsInstallOpen] = useState(false);
  const [installCommand, setInstallCommand] = useState("");
  const [isInstalling, setIsInstalling] = useState(false);
  const [installOutput, setInstallOutput] = useState<string>("");
  const [installTarget, setInstallTarget] = useState<"project" | "global">("project");

  // Global skills: downloaded once, enabled per project
  const [globalSkills, setGlobalSkills] = useState<GlobalSkillItem[]>([]);
  const [isLoadingGlobal, setIsLoadingGlobal] = useState(false);
  const [projectGlobalSkills, setProjectGlobalSkills] = useState<ProjectGlobalSkills[]>([]);
  const [globalPage, setGlobalPage] = useState(1);
  const [globalSkillToDelete, setGlobalSkillToDelete] = useState<GlobalSkillItem | null>(null);
  const [isDeletingGlobal, setIsDeletingGlobal] = useState(false);
  const [projectPage, setProjectPage] = useState(1);

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
          command: "node --experimental-strip-types scripts/skills-manager.ts list",
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
          command: `node --experimental-strip-types scripts/skills-manager.ts toggle ${JSON.stringify(skill.dirName)} ${newState ? "1" : "0"}`,
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
    setEditorTarget("global");
    setEditorDirName("");
    setEditorName("");
    setEditorDesc("");
    setEditorBody(
      "# Instructions\n\nProvide step-by-step instructions and principles for this skill.\n\n## Workflow\n1. Analyze the context\n2. Execute requirements\n3. Verify results\n",
    );
    setIsEditorOpen(true);
  };

  // Open Edit Skill Modal
  const handleOpenEditModal = (skill: SkillItem, target: "global" | "project" = "project") => {
    setIsEditing(true);
    setEditorTarget(target);
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
          command: `node --experimental-strip-types scripts/skills-manager.ts ${editorTarget === "global" ? "save-global" : "save"} ${JSON.stringify(slug)} ${JSON.stringify(b64)}`,
          timeoutMs: 15_000,
        }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toastManager.add({
        title: isEditing ? "Skill Updated" : "Skill Created",
        description: `Added to the skill list. Turn it on to use it in a project.`,
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
          command: `node --experimental-strip-types scripts/skills-manager.ts delete ${JSON.stringify(skillToDelete.dirName)}`,
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
  // Download a zip that keeps the skill folder layout, so the export can be
  // dropped straight into another `.agents/skills` directory.
  const downloadSkillArchive = async (entries: ReadonlyArray<SkillItem>, fileName: string) => {
    const zip = new JSZip();
    for (const skill of entries) {
      const folder = zip.folder(skill.dirName);
      if (!folder) continue;
      folder.file("SKILL.md", skill.content);
    }
    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Export a single skill as its own folder
  const handleExportSkill = async (skill: SkillItem) => {
    try {
      await downloadSkillArchive([skill], `${skill.dirName}.zip`);
      toastManager.add({
        title: "Skill Exported",
        description: `Downloaded ${skill.dirName}/SKILL.md`,
      });
    } catch (err) {
      toastManager.add({
        type: "error",
        title: "Export failed",
        description: err instanceof Error ? err.message : String(err),
      });
    }
  };

  // Export every active skill as a folder per skill
  const handleExportAllActive = async () => {
    const activeSkills = skills.filter((s) => s.isActive);
    if (activeSkills.length === 0) {
      toastManager.add({
        title: "No active skills",
        description: "Select or activate at least one skill to export.",
      });
      return;
    }

    try {
      await downloadSkillArchive(activeSkills, `t3-active-skills-${Date.now()}.zip`);
      toastManager.add({
        title: "Active Skills Bundle Exported",
        description: `Exported ${activeSkills.length} active skills as folders.`,
      });
    } catch (err) {
      toastManager.add({
        type: "error",
        title: "Export failed",
        description: err instanceof Error ? err.message : String(err),
      });
    }
  };

  // The project the global skills are enabled for. The settings scope knows
  // the checkout when one is selected; otherwise the manager falls back to
  // the environment workspace.
  const settingsScope = useOptionalSettingsScope();
  const projects = useProjects();
  const threadShells = useThreadShells();

  const targetProject = useMemo(() => {
    const scope = settingsScope?.scope;
    if (scope?.kind === "project") {
      return { title: scope.group.displayName, workspaceRoot: scope.group.workspaceRoot };
    }
    if (scope?.kind === "checkout") {
      return { title: scope.group.displayName, workspaceRoot: scope.checkout.workspaceRoot };
    }
    const latest = [...threadShells]
      .filter((shell) => Boolean(shell.projectId))
      .sort((left, right) => (right.updatedAt ?? "").localeCompare(left.updatedAt ?? ""))[0];
    const project = latest ? projects.find((entry) => entry.id === latest.projectId) : undefined;
    return project ? { title: project.title, workspaceRoot: project.workspaceRoot } : null;
  }, [projects, settingsScope, threadShells]);

  const targetProjectLabel = targetProject?.title ?? null;

  const encodeProjectRoot = useCallback(() => {
    if (!targetProject?.workspaceRoot) return "";
    return btoa(unescape(encodeURIComponent(targetProject.workspaceRoot)));
  }, [targetProject]);

  // The folder the imported skill lands in, shown while the name is typed.
  const importSlug = useMemo(
    () =>
      importName
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, "-")
        .replace(/-+/g, "-"),
    [importName],
  );
  const importPath = importSlug
    ? `.agents/skills/${importSlug}/SKILL.md`
    : ".agents/skills/<name>/SKILL.md";

  const loadProjectGlobalSkills = useCallback(async () => {
    if (projects.length === 0) {
      setProjectGlobalSkills([]);
      return;
    }
    try {
      // The same checkout can appear in more than one environment, so the
      // matrix lists every workspace once.
      const byRoot = new Map<string, { id: string; title: string; workspaceRoot: string }>();
      for (const project of projects) {
        if (!byRoot.has(project.workspaceRoot)) {
          byRoot.set(project.workspaceRoot, {
            id: project.id,
            title: project.title,
            workspaceRoot: project.workspaceRoot,
          });
        }
      }
      const payload = [...byRoot.values()];
      const res = await fetch("/api/terminal/exec", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          command: `node --experimental-strip-types scripts/skills-manager.ts enabled-matrix ${JSON.stringify(btoa(unescape(encodeURIComponent(JSON.stringify(payload)))))}`,
          timeoutMs: 20_000,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { stdout: string };
      const parsed = JSON.parse(data.stdout || "{}") as {
        ok: boolean;
        projects?: ProjectGlobalSkills[];
      };
      if (parsed.ok && parsed.projects) {
        setProjectGlobalSkills(parsed.projects);
      }
    } catch (err) {
      console.error("Failed to load per-project global skills", err);
    }
  }, [projects]);

  const loadGlobalSkills = useCallback(async () => {
    setIsLoadingGlobal(true);
    try {
      const res = await fetch("/api/terminal/exec", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          command: `node --experimental-strip-types scripts/skills-manager.ts list-global ${JSON.stringify(encodeProjectRoot())}`,
          timeoutMs: 20_000,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { stdout: string };
      const parsed = JSON.parse(data.stdout || "{}") as { ok: boolean; skills?: GlobalSkillItem[] };
      if (parsed.ok && parsed.skills) {
        setGlobalSkills(parsed.skills);
      }
      await loadProjectGlobalSkills();
    } catch (err) {
      console.error("Failed to load global skills", err);
      toastManager.add({
        type: "error",
        title: "Failed to load global skills",
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsLoadingGlobal(false);
    }
  }, [encodeProjectRoot, loadProjectGlobalSkills]);

  // Enable or disable a global skill for this project. Enabling copies the
  // skill into the project, disabling removes that copy.
  const handleToggleGlobalSkill = useCallback(
    async (skill: GlobalSkillItem, enabled: boolean) => {
      setGlobalSkills((prev) =>
        prev.map((entry) =>
          entry.dirName === skill.dirName ? { ...entry, pending: true } : entry,
        ),
      );
      try {
        const res = await fetch("/api/terminal/exec", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            command: `node --experimental-strip-types scripts/skills-manager.ts ${enabled ? "enable" : "disable"} ${JSON.stringify(skill.dirName)} ${JSON.stringify(encodeProjectRoot())}`,
            timeoutMs: 20_000,
          }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { stdout: string };
        const parsed = JSON.parse(data.stdout || "{}") as { ok: boolean; error?: string };
        if (!parsed.ok) {
          throw new Error(parsed.error ?? "The command did not finish");
        }
        setGlobalSkills((prev) =>
          prev.map((entry) =>
            entry.dirName === skill.dirName
              ? { ...entry, enabledInProject: enabled, pending: false }
              : entry,
          ),
        );
        toastManager.add({
          type: "success",
          title: enabled ? "Skill enabled for this project" : "Skill disabled",
          description: enabled
            ? `${skill.name} was copied into this project's .agents/skills.`
            : `${skill.name} was removed from this project.`,
        });
        if (enabled) {
          void loadSkills();
        }
        void loadProjectGlobalSkills();
      } catch (err) {
        setGlobalSkills((prev) =>
          prev.map((entry) =>
            entry.dirName === skill.dirName ? { ...entry, pending: false } : entry,
          ),
        );
        toastManager.add({
          type: "error",
          title: enabled ? "Could not enable the skill" : "Could not disable the skill",
          description: err instanceof Error ? err.message : String(err),
        });
      }
    },
    [encodeProjectRoot, loadProjectGlobalSkills, loadSkills],
  );

  // The global store is read on mount so its list is there without a tab.
  useEffect(() => {
    void loadGlobalSkills();
  }, [loadGlobalSkills]);

  // Enable or disable a global skill for one specific project. The same
  // command the project tab uses, with the project's own root.
  const handleToggleGlobalSkillForProject = useCallback(
    async (skill: GlobalSkillItem, project: ProjectGlobalSkills, enabled: boolean) => {
      setProjectGlobalSkills((prev) =>
        prev.map((entry) => (entry.id === project.id ? { ...entry, pending: true } : entry)),
      );
      try {
        const encodedRoot = btoa(unescape(encodeURIComponent(project.workspaceRoot)));
        const res = await fetch("/api/terminal/exec", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            command: `node --experimental-strip-types scripts/skills-manager.ts ${enabled ? "enable" : "disable"} ${JSON.stringify(skill.dirName)} ${JSON.stringify(encodedRoot)}`,
            timeoutMs: 20_000,
          }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { stdout: string };
        const parsed = JSON.parse(data.stdout || "{}") as { ok: boolean; error?: string };
        if (!parsed.ok) {
          throw new Error(parsed.error ?? "The command did not finish");
        }
        setProjectGlobalSkills((prev) =>
          prev.map((entry) =>
            entry.id === project.id
              ? {
                  ...entry,
                  pending: false,
                  enabled: enabled
                    ? [...new Set([...entry.enabled, skill.dirName])]
                    : entry.enabled.filter((name) => name !== skill.dirName),
                }
              : entry,
          ),
        );
        await Promise.all([loadGlobalSkills(), loadProjectGlobalSkills()]);
      } catch (err) {
        setProjectGlobalSkills((prev) =>
          prev.map((entry) => (entry.id === project.id ? { ...entry, pending: false } : entry)),
        );
        toastManager.add({
          type: "error",
          title: "Could not update the skill",
          description: err instanceof Error ? err.message : String(err),
        });
      }
    },
    [loadGlobalSkills, loadProjectGlobalSkills],
  );

  // Remove a skill from the global store. The project copy is left alone.
  const handleDeleteGlobalSkill = useCallback(async () => {
    const skill = globalSkillToDelete;
    if (!skill) return;
    setIsDeletingGlobal(true);
    try {
      const res = await fetch("/api/terminal/exec", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          command: `node --experimental-strip-types scripts/skills-manager.ts delete-global ${JSON.stringify(skill.dirName)}`,
          timeoutMs: 20_000,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { stdout: string };
      const parsed = JSON.parse(data.stdout || "{}") as { ok: boolean; error?: string };
      if (!parsed.ok) throw new Error(parsed.error ?? "The command did not finish");
      setGlobalSkillToDelete(null);
      toastManager.add({
        type: "success",
        title: "Global skill removed",
        description: `${skill.name} was removed from the global store.`,
      });
      await loadGlobalSkills();
    } catch (err) {
      toastManager.add({
        type: "error",
        title: "Could not remove the skill",
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsDeletingGlobal(false);
    }
  }, [globalSkillToDelete, loadGlobalSkills]);

  // Install a skill with a command, for example the skills CLI:
  // `npx skills add owner/repo`. The command runs on the environment host and
  // the skills it adds land in `.agents/skills`, which both the Codex and the
  // custom engine read.
  const handleExecuteInstall = async () => {
    const command = installCommand.trim();
    if (!command) {
      toastManager.add({
        type: "warning",
        title: "Command required",
        description: "Enter the install command to run, for example: npx skills add owner/repo",
      });
      return;
    }
    setIsInstalling(true);
    setInstallOutput("");
    try {
      const encoded = btoa(unescape(encodeURIComponent(command)));
      const res = await fetch("/api/terminal/exec", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          command: `node --experimental-strip-types scripts/skills-manager.ts ${installTarget === "global" ? "install-global" : "install"} ${JSON.stringify(encoded)}`,
          timeoutMs: 300_000,
        }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { stdout: string; ok: boolean; stderr?: string };
      const parsed = JSON.parse(data.stdout || "{}") as {
        ok: boolean;
        output?: string;
        skills?: SkillItem[];
      };
      setInstallOutput(parsed.output ?? "");

      if (parsed.ok) {
        toastManager.add({
          type: "success",
          title: installTarget === "global" ? "Skill installed globally" : "Skill installed",
          description:
            installTarget === "global"
              ? "The skill is in the global store. Enable it per project from the Global tab."
              : `Skills are ready in .agents/skills. ${parsed.skills?.length ?? 0} skill(s) available now.`,
        });
        setIsInstallOpen(false);
        setInstallCommand("");
        if (installTarget === "global") {
          await loadGlobalSkills();
        } else {
          await loadSkills();
        }
      } else {
        toastManager.add({
          type: "error",
          title: "Install failed",
          description: "The command did not finish. Check the output below.",
        });
      }
    } catch (err) {
      toastManager.add({
        type: "error",
        title: "Install failed",
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsInstalling(false);
    }
  };

  // Handle Import from File
  const handleImportFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (text) {
        setImportText(text);
        // A file that carries frontmatter names the skill for the user.
        const frontmatterName = text
          .match(/^---\s*\n([\s\S]*?)\n---/)?.[1]
          ?.match(/^name:\s*(.+)$/m)?.[1]
          ?.trim()
          .replace(/^["']|["']$/g, "");
        if (frontmatterName) {
          setImportName(frontmatterName);
        } else if (!importName) {
          setImportName(file.name.replace(/\.md$|\.txt$/i, ""));
        }
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

    // The name typed in the sheet wins: the folder and the frontmatter always
    // agree, so the skill is found by the name the user chose.
    const requestedName = importName.trim();
    if (requestedName) {
      name = requestedName;
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
    } else if (requestedName) {
      // Keep the pasted frontmatter but point it at the chosen name.
      const frontmatter = (fmMatch[1] ?? "")
        .split("\n")
        .map((line) => (line.startsWith("name:") ? `name: ${name}` : line))
        .join("\n");
      finalContent = `---\n${frontmatter}\n---${raw.slice(fmMatch[0].length)}`;
    }

    setIsImporting(true);
    try {
      const b64 = btoa(unescape(encodeURIComponent(finalContent)));
      const res = await fetch("/api/terminal/exec", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          command: `node --experimental-strip-types scripts/skills-manager.ts save-global ${JSON.stringify(slug)} ${JSON.stringify(b64)}`,
          timeoutMs: 15_000,
        }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toastManager.add({
        title: "Skill Imported Successfully",
        description: `Imported into the global store as ${slug}/SKILL.md`,
      });

      setIsImportOpen(false);
      setImportText("");
      setImportName("");
      await Promise.all([loadSkills(), loadGlobalSkills()]);
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
  /**
   * The project the current chat belongs to: the settings scope when it names
   * one, otherwise the project of the thread that was used last.
   */
  // Every skill the workspace knows about, in one list: the project's own
  // skills and the global store, so a skill added from anywhere shows up here.
  const allSkills = useMemo(() => {
    const byName = new Map<string, GlobalSkillItem>();
    for (const skill of globalSkills) {
      byName.set(skill.dirName, { ...skill, enabledInProject: skill.enabledInProject });
    }
    for (const skill of skills) {
      const existing = byName.get(skill.dirName);
      byName.set(skill.dirName, {
        ...skill,
        enabledInProject: existing ? existing.enabledInProject : skill.isActive,
      });
    }
    return [...byName.values()].sort((left, right) => left.name.localeCompare(right.name));
  }, [globalSkills, skills]);

  const filteredSkills = useMemo(() => {
    return allSkills.filter((item) => {
      if (filterType === "active" && !item.enabledInProject) return false;
      if (filterType === "inactive" && item.enabledInProject) return false;
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
  }, [allSkills, filterType, searchQuery]);

  const globalPageCount = Math.max(1, Math.ceil(allSkills.length / SKILL_PAGE_SIZE));
  const globalSkillsPage = useMemo(() => {
    const page = Math.min(globalPage, globalPageCount);
    return allSkills.slice((page - 1) * SKILL_PAGE_SIZE, page * SKILL_PAGE_SIZE);
  }, [allSkills, globalPage, globalPageCount]);
  const projectPageCount = Math.max(1, Math.ceil(skills.length / SKILL_PAGE_SIZE));
  const projectSkillsPage = useMemo(() => {
    const page = Math.min(projectPage, projectPageCount);
    return skills.slice((page - 1) * SKILL_PAGE_SIZE, page * SKILL_PAGE_SIZE);
  }, [projectPage, projectPageCount, skills]);

  const activeCount = useMemo(
    () => allSkills.filter((s) => s.enabledInProject).length,
    [allSkills],
  );
  const builtinCount = useMemo(() => allSkills.filter((s) => s.isBuiltin).length, [allSkills]);
  const customCount = useMemo(() => allSkills.filter((s) => !s.isBuiltin).length, [allSkills]);
  const totalSkillCount = allSkills.length;

  return (
    <SettingsPageContainer width="readable">
      {/* Header section */}
      <div className="flex flex-col gap-3 pb-3">
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
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setInstallTarget("global");
                setIsInstallOpen(true);
              }}
            >
              <TerminalIcon className="size-3.5" />
              <span>Install</span>
            </Button>
            <Button size="sm" variant="default" onClick={handleOpenCreateModal}>
              <PlusIcon className="size-3.5" />
              <span>New Skill</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Global skills: downloaded once, enabled per project */}
      <section className="flex flex-col gap-2 pb-5">
        <div className="flex min-w-0 flex-col px-1">
          <h2 className="text-sm font-semibold">All Skills</h2>
          <p className="text-[11px] text-muted-foreground">
            Every skill lives here, whether it came from Import, New Skill or Install. Use Add to
            put one in a project.
          </p>
        </div>

        {isLoadingGlobal && allSkills.length === 0 ? (
          <div className="flex h-32 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed text-muted-foreground">
            <Spinner className="size-5" />
            <p className="text-xs">Loading global skills...</p>
          </div>
        ) : allSkills.length === 0 ? (
          <div className="flex h-32 flex-col items-center justify-center gap-1 rounded-2xl border border-dashed text-muted-foreground">
            <LayersIcon className="size-7 stroke-[1.5] text-muted-foreground/60" />
            <p className="text-xs font-medium">No global skills yet</p>
            <p className="text-[11px]">Install one with npx skills add owner/repo</p>
          </div>
        ) : (
          <>
            {/* Stats Summary Card */}
            <div className="grid grid-cols-2 gap-3 pt-2 sm:grid-cols-4">
              <div className="flex flex-col gap-0.5 rounded-lg border bg-card/50 p-3 shadow-xs">
                <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                  Total Skills
                </span>
                <span className="text-lg font-bold">{totalSkillCount}</span>
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

            <SkillPagination
              page={globalPage}
              pageCount={globalPageCount}
              total={allSkills.length}
              onPageChange={setGlobalPage}
            />
            <div className="overflow-hidden rounded-2xl border bg-card/60">
              {globalSkillsPage.map((skill) => {
                const activeIn = projectGlobalSkills
                  .filter((project) => project.enabled.includes(skill.dirName))
                  .map((project) => project.title);
                const globalEntry = globalSkills.find((entry) => entry.dirName === skill.dirName);
                const projectEntry = skills.find((entry) => entry.dirName === skill.dirName);
                return (
                  <SkillTile
                    key={skill.dirName}
                    skill={skill}
                    path={globalEntry?.fullPath ?? skill.fullPath}
                    badges={
                      skill.enabledInProject ? (
                        <span className="shrink-0 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                          on
                        </span>
                      ) : null
                    }
                    footnote={
                      activeIn.length > 0 ? (
                        <span
                          className="truncate text-[10px] text-muted-foreground"
                          title={activeIn.join(", ")}
                        >
                          Active in: {activeIn.join(", ")}
                        </span>
                      ) : null
                    }
                    actions={[
                      {
                        label: "View",
                        icon: <EyeIcon className="size-3.5" />,
                        onClick: () => setViewSkill(skill),
                      },
                      {
                        label: "Edit",
                        icon: <PencilIcon className="size-3.5" />,
                        onClick: () =>
                          handleOpenEditModal(skill, globalEntry ? "global" : "project"),
                      },
                      {
                        label: "Export",
                        icon: <DownloadIcon className="size-3.5" />,
                        onClick: () => void handleExportSkill(skill),
                      },
                      {
                        label: "Delete",
                        icon: <Trash2Icon className="size-3.5" />,
                        onClick: () =>
                          globalEntry
                            ? setGlobalSkillToDelete(globalEntry)
                            : setSkillToDelete(skill),
                      },
                    ]}
                    trailing={
                      skill.enabledInProject ? (
                        <Button
                          size="xs"
                          variant="ghost"
                          className="h-7 px-2 text-xs text-muted-foreground"
                          onClick={() => {
                            if (globalEntry) {
                              void handleToggleGlobalSkill(globalEntry, false);
                            } else if (projectEntry) {
                              void handleToggleActive(projectEntry);
                            }
                          }}
                        >
                          Added
                        </Button>
                      ) : (
                        <Button
                          size="xs"
                          variant="outline"
                          className="h-7 px-2 text-xs"
                          disabled={!globalEntry}
                          onClick={() => {
                            if (globalEntry) {
                              void handleToggleGlobalSkill(globalEntry, true);
                            }
                          }}
                        >
                          Add
                        </Button>
                      )
                    }
                  />
                );
              })}
            </div>
            <SkillPagination
              page={globalPage}
              pageCount={globalPageCount}
              total={allSkills.length}
              onPageChange={setGlobalPage}
            />
          </>
        )}

        {projectGlobalSkills.length > 0 && (
          <div className="flex flex-wrap gap-1.5 px-1 pt-1">
            {projectGlobalSkills
              .filter((project) => project.enabled.length > 0)
              .map((project) => (
                <span
                  key={project.workspaceRoot}
                  className="inline-flex items-center gap-1 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400"
                >
                  {project.title}: {project.enabled.length}
                </span>
              ))}
          </div>
        )}
      </section>

      {/* This project's own skills */}
      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2 px-1">
          <h2 className="text-sm font-semibold">
            Active skills for {targetProjectLabel ?? "this project"}
          </h2>
          <span className="text-[11px] text-muted-foreground">
            {skills.length} skill{skills.length === 1 ? "" : "s"} in .agents/skills
          </span>
        </div>
        <SkillPagination
          page={projectPage}
          pageCount={projectPageCount}
          total={skills.length}
          onPageChange={setProjectPage}
        />
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
          <div className="overflow-hidden rounded-2xl border bg-card/60">
            {projectSkillsPage.map((skill) => {
              const globalEntry = globalSkills.find((entry) => entry.dirName === skill.dirName);
              return (
                <SkillTile
                  key={skill.dirName}
                  skill={skill}
                  path={skill.fullPath}
                  badges={
                    <>
                      {skill.isBuiltin && (
                        <Badge variant="secondary" className="text-2xs">
                          built-in
                        </Badge>
                      )}
                      {skill.isActive ? (
                        <span className="shrink-0 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                          on
                        </span>
                      ) : (
                        <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                          off
                        </span>
                      )}
                    </>
                  }
                  actions={[
                    {
                      label: "View",
                      icon: <EyeIcon className="size-3.5" />,
                      onClick: () => setViewSkill(skill),
                    },
                  ]}
                  trailing={
                    <Button
                      size="xs"
                      variant="ghost"
                      className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive"
                      onClick={() => {
                        if (globalEntry) {
                          void handleToggleGlobalSkill(globalEntry, false);
                        } else {
                          void handleToggleActive(skill);
                        }
                      }}
                    >
                      Remove
                    </Button>
                  }
                />
              );
            })}
          </div>
        )}

        <SkillPagination
          page={projectPage}
          pageCount={projectPageCount}
          total={skills.length}
          onPageChange={setProjectPage}
        />
      </section>

      {/* View Skill Sheet */}
      <Sheet open={!!viewSkill} onOpenChange={(open) => !open && setViewSkill(null)}>
        <SheetPopup
          side="right"
          showCloseButton={false}
          className="w-[90vw] max-w-[90vw] sm:w-[460px] sm:max-w-[460px]"
        >
          <SheetHeader>
            <div className="flex items-center gap-2">
              <SparklesIcon className="size-5 text-primary" />
              <SheetTitle>{viewSkill?.name}</SheetTitle>
            </div>
            <SheetDescription className="font-mono text-xs">{viewSkill?.path}</SheetDescription>
          </SheetHeader>
          <div className="overflow-y-auto px-6 pb-6">
            <div className="rounded-lg border bg-muted/30 p-4 font-mono text-xs whitespace-pre-wrap leading-relaxed select-text">
              {viewSkill?.content}
            </div>
          </div>
          <div className="mt-auto flex items-center justify-between gap-2 border-t bg-muted/20 px-6 py-4">
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
                  Export Folder
                </Button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="default" onClick={() => setViewSkill(null)}>
                Close
              </Button>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => setViewSkill(null)}
                aria-label="Close sheet"
              >
                <XIcon className="size-4" />
              </Button>
            </div>
          </div>
        </SheetPopup>
      </Sheet>

      {/* Create / Edit Skill Sheet */}
      <Sheet open={isEditorOpen} onOpenChange={setIsEditorOpen}>
        <SheetPopup
          side="right"
          showCloseButton={false}
          className="w-[90vw] max-w-[90vw] sm:w-[460px] sm:max-w-[460px]"
        >
          <SheetHeader>
            <SheetTitle>
              {isEditing ? `Edit Skill: ${editorName}` : "Create New Custom Skill"}
            </SheetTitle>
            <SheetDescription>
              Skills are saved as Markdown instructions with YAML frontmatter at{" "}
              <code className="text-xs font-mono">.agents/skills/&lt;name&gt;/SKILL.md</code>
            </SheetDescription>
          </SheetHeader>
          <div className="flex flex-col gap-4 overflow-y-auto px-6 pb-6">
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
          </div>
          <div className="mt-auto flex items-center justify-end gap-2 border-t bg-muted/20 px-6 py-4">
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
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setIsEditorOpen(false)}
              disabled={isSaving}
              aria-label="Close sheet"
              className="ml-1"
            >
              <XIcon className="size-4" />
            </Button>
          </div>
        </SheetPopup>
      </Sheet>

      {/* Install Skill From Command Sheet */}
      <Sheet open={isInstallOpen} onOpenChange={setIsInstallOpen}>
        <SheetPopup
          side="right"
          showCloseButton={false}
          className="w-[90vw] max-w-[90vw] sm:w-[460px] sm:max-w-[460px]"
        >
          <SheetHeader>
            <SheetTitle>
              {installTarget === "global" ? "Install Skill Globally" : "Install Skill From Command"}
            </SheetTitle>
            <SheetDescription>
              {installTarget === "global" ? (
                <>
                  Run an install command on the environment host. The skill is downloaded once into{" "}
                  <code className="text-xs font-mono">~/.agents/skills</code> and can then be
                  enabled per project.
                </>
              ) : (
                <>
                  Run an install command on the environment host. Installed skills land in{" "}
                  <code className="text-xs font-mono">.agents/skills/&lt;name&gt;/SKILL.md</code>{" "}
                  and become available to the Codex and custom engines.
                </>
              )}
            </SheetDescription>
          </SheetHeader>
          <div className="flex flex-col gap-3 overflow-y-auto px-6 pb-6">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium">Install command</label>
              <Input
                value={installCommand}
                onChange={(e) => setInstallCommand(e.target.value)}
                placeholder="npx skills add vercel-labs/agent-skills --skill web-design-guidelines"
                className="font-mono text-xs"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !isInstalling) {
                    e.preventDefault();
                    void handleExecuteInstall();
                  }
                }}
              />
              <p className="text-[11px] text-muted-foreground">
                The skills CLI is supported out of the box:{" "}
                <code className="font-mono">npx skills add &lt;owner/repo&gt;</code>. The command
                runs with <code className="font-mono">--yes</code> and{" "}
                <code className="font-mono">--agent codex</code> unless you pass your own flags.
              </p>
            </div>
            {installOutput && (
              <div className="max-h-48 overflow-y-auto rounded-lg border bg-muted/30 p-2.5 font-mono text-2xs whitespace-pre-wrap text-muted-foreground">
                {installOutput}
              </div>
            )}
          </div>
          <div className="mt-auto flex items-center justify-end gap-2 border-t bg-muted/20 px-6 py-4">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setIsInstallOpen(false)}
              disabled={isInstalling}
            >
              Close
            </Button>
            <Button size="sm" disabled={isInstalling} onClick={() => void handleExecuteInstall()}>
              {isInstalling ? <Spinner size="sm" /> : <TerminalIcon className="size-3.5" />}
              <span>{isInstalling ? "Installing..." : "Run Command"}</span>
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setIsInstallOpen(false)}
              disabled={isInstalling}
              aria-label="Close sheet"
              className="ml-1"
            >
              <XIcon className="size-4" />
            </Button>
          </div>
        </SheetPopup>
      </Sheet>

      {/* Import Skill Sheet */}
      <Sheet open={isImportOpen} onOpenChange={setIsImportOpen}>
        <SheetPopup
          side="right"
          showCloseButton={false}
          className="w-[90vw] max-w-[90vw] sm:w-[460px] sm:max-w-[460px]"
        >
          <SheetHeader>
            <SheetTitle>Import Skill</SheetTitle>
            <SheetDescription>
              Upload an existing <code className="text-xs font-mono">SKILL.md</code> or paste
              markdown instructions with frontmatter.
            </SheetDescription>
          </SheetHeader>
          <div className="flex flex-col gap-4 overflow-y-auto px-6 pb-6">
            {/* The skill name decides the folder it lands in */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium">Skill Name</label>
              <Input
                placeholder="e.g. fast-code-auditor"
                value={importName}
                onChange={(e) => setImportName(e.target.value)}
                className="h-8 text-xs"
              />
              <div className="flex items-center gap-1.5 rounded-lg border bg-muted/30 px-2.5 py-1.5">
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  Path
                </span>
                <code className="truncate font-mono text-2xs text-foreground">{importPath}</code>
              </div>
            </div>

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
          </div>
          <div className="mt-auto flex items-center justify-end gap-2 border-t bg-muted/20 px-6 py-4">
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
              disabled={isImporting || !importText.trim() || !importName.trim()}
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
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setIsImportOpen(false)}
              disabled={isImporting}
              aria-label="Close sheet"
              className="ml-1"
            >
              <XIcon className="size-4" />
            </Button>
          </div>
        </SheetPopup>
      </Sheet>

      {/* Delete Global Skill Modal */}
      <Dialog
        open={!!globalSkillToDelete}
        onOpenChange={(open) => !open && setGlobalSkillToDelete(null)}
      >
        <DialogPopup className="w-full sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-destructive">Remove Global Skill?</DialogTitle>
            <DialogDescription>
              <strong className="text-foreground">{globalSkillToDelete?.name}</strong> will be
              removed from the global store{" "}
              <code className="text-xs font-mono">~/.agents/skills</code>. Copies already enabled in
              a project stay there.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setGlobalSkillToDelete(null)}
              disabled={isDeletingGlobal}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => void handleDeleteGlobalSkill()}
              disabled={isDeletingGlobal}
            >
              {isDeletingGlobal ? (
                <>
                  <Spinner size="sm" className="mr-1" />
                  Removing...
                </>
              ) : (
                "Remove Skill"
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
