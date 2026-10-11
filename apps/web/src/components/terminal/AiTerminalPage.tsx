import { memo, useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  Terminal,
  TerminalSquare,
  Sparkles,
  Server,
  Trash2,
  ArrowLeft,
  Activity,
  HardDrive,
  Cpu,
  Network,
  GitBranch,
} from "lucide-react";

import { isElectron } from "../../env";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { ScrollArea } from "../ui/scroll-area";
import { SidebarInset, useSidebar } from "../ui/sidebar";
import { WorkspacePageContainer } from "../WorkspacePageContainer";
import { WorkspacePageHeader } from "../WorkspacePageHeader";
import {
  WorkspaceBreadcrumb,
  WorkspaceBreadcrumbItem,
  WorkspaceBreadcrumbSeparator,
} from "../WorkspaceBreadcrumb";
import {
  AiTerminalQuickCommand,
  TerminalFeed,
  useTerminalStore,
  terminalStore,
} from "../chat/terminal";
import { useNavigateToMainApp } from "../sidebar/mainAppLocation";

interface QuickAction {
  title: string;
  cmd: string;
  desc: string;
  icon: typeof Terminal;
}

const QUICK_ACTIONS: QuickAction[] = [
  {
    title: "System & Kernel",
    cmd: "uname -a",
    desc: "Linux kernel and system architecture",
    icon: Server,
  },
  {
    title: "Disk Space",
    cmd: "df -h",
    desc: "Available disk partitions and space",
    icon: HardDrive,
  },
  {
    title: "Memory & RAM",
    cmd: "free -m",
    desc: "RAM and swap memory consumption",
    icon: Cpu,
  },
  {
    title: "Open Ports",
    cmd: "ss -tulpn",
    desc: "Active listening TCP & UDP network ports",
    icon: Network,
  },
  {
    title: "Git Status",
    cmd: "git status -s",
    desc: "Current branch status and modified files",
    icon: GitBranch,
  },
  {
    title: "Node & Bun",
    cmd: "node -v && bun -v 2>/dev/null || echo 'bun not in path'",
    desc: "Runtime versions installed on the host",
    icon: Activity,
  },
];

export const AiTerminalPage = memo(function AiTerminalPage() {
  const store = useTerminalStore();
  const navigateToMainApp = useNavigateToMainApp();
  const { isMobile, setOpenMobile } = useSidebar();

  const handleBack = useCallback(() => {
    if (isMobile) {
      setOpenMobile(false);
    }
    navigateToMainApp();
  }, [isMobile, navigateToMainApp, setOpenMobile]);

  const handleQuickRun = useCallback(
    (cmd: string) => {
      void terminalStore.runCommand(cmd, store.activeCwd || "/");
    },
    [store.activeCwd],
  );

  const handleClearRuns = useCallback(() => {
    terminalStore.clearRuns();
  }, []);

  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden overscroll-y-none isolate">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-background text-foreground">
        {/* Top bar header */}
        <WorkspacePageHeader electron={isElectron} className="border-b border-border/40">
          <div className="flex w-full min-w-0 items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={handleBack}
                aria-label="Back to chat"
                className="text-muted-foreground hover:text-foreground shrink-0"
              >
                <ArrowLeft className="size-4" />
              </Button>

              <WorkspaceBreadcrumb ariaLabel="AI Terminal breadcrumb" className="min-w-0">
                <WorkspaceBreadcrumbItem>
                  <div className="flex items-center gap-1.5 font-semibold text-foreground">
                    <div className="size-5 rounded-md bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                      <TerminalSquare className="size-3.5" />
                    </div>
                    <span>AI Terminal</span>
                  </div>
                </WorkspaceBreadcrumbItem>
                <WorkspaceBreadcrumbSeparator />
                <WorkspaceBreadcrumbItem current className="hidden sm:inline-flex">
                  <span className="text-xs text-muted-foreground">Host Shell & Remote VPS</span>
                </WorkspaceBreadcrumbItem>
              </WorkspaceBreadcrumb>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {/* Host Status Badge */}
              <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-3xs font-mono text-emerald-400">
                <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span>Host Shell: Connected</span>
              </div>

              {store.runs.length > 0 && (
                <Button
                  variant="ghost"
                  size="compact"
                  onClick={handleClearRuns}
                  className="text-muted-foreground hover:text-destructive text-xs gap-1.5"
                >
                  <Trash2 className="size-3.5" />
                  <span>Clear Runs</span>
                </Button>
              )}
            </div>
          </div>
        </WorkspacePageHeader>

        {/* Main Content Area */}
        <ScrollArea className="min-h-0 flex-1">
          <WorkspacePageContainer width="wide" className="py-6 space-y-6">
            {/* Quick Hero Banner */}
            <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br from-card via-card/90 to-emerald-950/15 p-5 shadow-sm">
              <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-3xs font-mono font-medium">
                      <Sparkles className="size-3" />
                      AUTONOMOUS SHELL
                    </span>
                    <span className="text-3xs text-muted-foreground font-mono">
                      CWD: {store.activeCwd || "/"}
                    </span>
                  </div>
                  <h2 className="text-base sm:text-lg font-semibold tracking-tight text-foreground">
                    Host & VPS Command Center
                  </h2>
                  <p className="text-xs text-muted-foreground max-w-xl leading-relaxed">
                    Execute real-time Linux shell commands, diagnose system processes, manage SSH
                    profiles, and run AI natural language commands directly on your server.
                  </p>
                </div>
              </div>
            </div>

            {/* AI Terminal Interactive Command Box */}
            <div className="rounded-2xl border border-border/60 bg-card/60 p-4 shadow-sm backdrop-blur-xs">
              <AiTerminalQuickCommand projectCwd={store.activeCwd || undefined} />
            </div>

            {/* Output Feed or Starter Quick Actions */}
            {store.runs.length > 0 ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between px-1">
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider font-mono">
                    Terminal Execution Log ({store.runs.length})
                  </h3>
                </div>
                <TerminalFeed />
              </div>
            ) : (
              <div className="space-y-4 pt-2">
                <div className="px-1">
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider font-mono">
                    Quick System Diagnostics
                  </h3>
                  <p className="text-3xs text-muted-foreground">
                    Click any card to instantly execute standard host inspection commands.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {QUICK_ACTIONS.map((action) => {
                    const Icon = action.icon;
                    return (
                      <button
                        key={action.title}
                        type="button"
                        onClick={() => handleQuickRun(action.cmd)}
                        className="flex flex-col items-start p-3.5 rounded-xl border border-border/50 bg-card/40 hover:bg-card hover:border-emerald-500/40 transition-all text-left group shadow-2xs hover:shadow-sm cursor-pointer"
                      >
                        <div className="flex items-center justify-between w-full mb-1.5">
                          <div className="size-7 rounded-lg bg-muted/60 flex items-center justify-center text-foreground group-hover:text-emerald-400 group-hover:bg-emerald-500/10 transition-colors">
                            <Icon className="size-3.5" />
                          </div>
                          <span className="text-3xs font-mono text-muted-foreground bg-muted/40 px-1.5 py-0.5 rounded">
                            Run
                          </span>
                        </div>
                        <span className="text-xs font-semibold text-foreground group-hover:text-emerald-400 transition-colors">
                          {action.title}
                        </span>
                        <code className="text-3xs font-mono text-emerald-400/90 my-1 truncate w-full">
                          $ {action.cmd}
                        </code>
                        <span className="text-3xs text-muted-foreground line-clamp-1">
                          {action.desc}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </WorkspacePageContainer>
        </ScrollArea>
      </div>
    </SidebarInset>
  );
});
