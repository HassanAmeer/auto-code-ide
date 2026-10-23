import { memo, useEffect, useState } from "react";
import {
  CheckIcon,
  CopyIcon,
  RotateCcwIcon,
  SaveIcon,
  SparklesIcon,
  FileCodeIcon,
} from "lucide-react";
import { Button } from "../ui/button";
import { toastManager } from "../ui/toast";
import {
  DEFAULT_PROJECT_RULES,
  getProjectRules,
  RULE_PRESETS,
  saveProjectRules,
  subscribeProjectRules,
} from "~/lib/projectRulesService";
import { SettingsSection } from "./settingsLayout";

export const ProjectAiRulesSettings = memo(function ProjectAiRulesSettings(props: {
  projectKey?: string;
  workspaceRoot?: string;
  projectName?: string;
}) {
  const { projectKey, workspaceRoot, projectName } = props;
  const [rules, setRules] = useState<string>(() => getProjectRules(projectKey));
  const [isSaved, setIsSaved] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  useEffect(() => {
    setRules(getProjectRules(projectKey));
    return subscribeProjectRules(projectKey, (updatedRules) => {
      setRules(updatedRules);
    });
  }, [projectKey]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const res = await saveProjectRules(projectKey, rules, workspaceRoot);
      setIsSaved(true);
      setTimeout(() => setIsSaved(false), 2500);

      toastManager.add({
        type: "success",
        title: "Project Rules Saved",
        description: res.fileSaved
          ? `Rules updated in memory and written to .autocode/rules.md.`
          : `Rules updated and active for all upcoming AI turns.`,
      });
    } catch (err) {
      toastManager.add({
        type: "error",
        title: "Failed to Save Rules",
        description: err instanceof Error ? err.message : "An unexpected error occurred.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    setRules(DEFAULT_PROJECT_RULES);
  };

  const handleCopy = () => {
    if (navigator.clipboard) {
      void navigator.clipboard.writeText(rules);
      toastManager.add({
        type: "info",
        title: "Copied to Clipboard",
        description: "Project AI rules copied to clipboard.",
      });
    }
  };

  const handleAddPreset = (snippet: string) => {
    setRules((prev) => {
      const trimmed = prev.trimEnd();
      if (!trimmed.includes(snippet.trim())) {
        return `${trimmed}\n${snippet}`;
      }
      return prev;
    });
  };

  const lineCount = rules.split("\n").length;
  const charCount = rules.length;

  return (
    <SettingsSection id="project-ai-rules" title="Project AI Rules (.autocode/rules.md)">
      <div className="flex flex-col gap-4 p-4 rounded-xl border border-border/40 bg-card/60 backdrop-blur-sm">
        {/* Header row with badges */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/30 pb-3">
          <div className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400">
              <FileCodeIcon className="size-4" />
            </span>
            <div>
              <span className="font-semibold text-sm text-foreground">
                {projectName ? `${projectName} Rules` : "Active Project Rules"}
              </span>
              <span className="ml-2 font-mono text-2xs px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
                .autocode/rules.md
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 text-2xs text-muted-foreground font-mono">
            <span>{lineCount} lines</span>
            <span>•</span>
            <span>{charCount} chars</span>
          </div>
        </div>

        {/* Quick Presets row */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <SparklesIcon className="size-3.5 text-amber-400" />
            <span>Quick Presets (Click to append):</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {RULE_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => handleAddPreset(preset.snippet)}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-2xs rounded-lg border border-border/50 bg-secondary/60 hover:bg-secondary text-secondary-foreground transition-all duration-150 hover:scale-[1.02] active:scale-[0.98]"
              >
                <span>{preset.icon}</span>
                <span>{preset.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Textarea editor */}
        <div className="relative rounded-lg border border-border/60 bg-background/90 focus-within:border-emerald-500/60 transition-colors">
          <textarea
            value={rules}
            onChange={(e) => setRules(e.target.value)}
            rows={10}
            className="w-full resize-y bg-transparent p-3 font-mono text-xs leading-relaxed text-foreground placeholder:text-muted-foreground focus:outline-none"
            placeholder="# Enter project AI rules in Markdown..."
            aria-label="Project AI rules markdown"
          />
        </div>

        {/* Footer actions */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handleReset}
              className="text-xs gap-1.5"
            >
              <RotateCcwIcon className="size-3.5" />
              Reset Default
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={handleCopy}
              className="text-xs gap-1.5 text-muted-foreground hover:text-foreground"
            >
              <CopyIcon className="size-3.5" />
              Copy
            </Button>
          </div>

          <Button
            type="button"
            size="sm"
            onClick={() => void handleSave()}
            disabled={isSaving}
            className={`text-xs gap-1.5 font-medium transition-all ${
              isSaved
                ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                : "bg-primary text-primary-foreground hover:bg-primary/90"
            }`}
          >
            {isSaved ? (
              <>
                <CheckIcon className="size-3.5 text-white animate-in zoom-in-75" />
                Saved!
              </>
            ) : (
              <>
                <SaveIcon className="size-3.5" />
                Save Rules
              </>
            )}
          </Button>
        </div>
      </div>
    </SettingsSection>
  );
});
