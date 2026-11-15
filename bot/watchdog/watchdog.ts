import { executeBash, inspectPreviewEndpoint } from "../cline/tools.ts";
import { autoHealProject } from "../cline/auto-healer.ts";

export interface WatchdogStatus {
  isActive: boolean;
  projectName: string;
  projectRoot: string;
  lastCheckedAt?: number;
  checksCount: number;
  errorsDetected: string[];
  autoFixesApplied: string[];
}

let activeWatchdog: {
  status: WatchdogStatus;
  intervalTimer: NodeJS.Timeout | null;
} = {
  status: {
    isActive: false,
    projectName: "",
    projectRoot: "",
    checksCount: 0,
    errorsDetected: [],
    autoFixesApplied: [],
  },
  intervalTimer: null,
};

export function startWatchdog(
  projectName: string,
  projectRoot: string,
  intervalSeconds = 25,
  onAlert?: (msg: string) => void,
): WatchdogStatus {
  if (activeWatchdog.intervalTimer) {
    clearInterval(activeWatchdog.intervalTimer);
  }

  activeWatchdog.status = {
    isActive: true,
    projectName,
    projectRoot,
    lastCheckedAt: Date.now(),
    checksCount: 0,
    errorsDetected: [],
    autoFixesApplied: [],
  };

  activeWatchdog.intervalTimer = setInterval(async () => {
    activeWatchdog.status.checksCount++;
    activeWatchdog.status.lastCheckedAt = Date.now();

    // Cap the error history so long-running watchdogs don't grow memory unboundedly
    if (activeWatchdog.status.errorsDetected.length > 50) {
      activeWatchdog.status.errorsDetected = activeWatchdog.status.errorsDetected.slice(-50);
    }

    // 1. Check Git Status for unexpected issues
    try {
      const gitRes = await executeBash("git status --short", projectRoot, 8000);
      if (!gitRes.ok) {
        const looksFatal = /fatal|not a git repository|permission denied|error/i.test(
          gitRes.error || "",
        );
        if (looksFatal) {
          activeWatchdog.status.errorsDetected.push(`Git error: ${gitRes.error}`);
          onAlert?.(`⚠️ Watchdog noticed git issue in ${projectName}: ${gitRes.error}`);
        }
      }
    } catch {}

    // 2. Health check preview endpoint
    try {
      const previewPort = Number(process.env.WATCHDOG_PREVIEW_PORT || 3000);
      const preview = await inspectPreviewEndpoint(previewPort);
      if (!preview.ok) {
        activeWatchdog.status.errorsDetected.push(`Preview unreachable: ${preview.error}`);
      }
    } catch {}

    // 3. Autonomous heal: the bot promises "main khud solve kar loonga" when
    //    absence supervision starts. Without this step the watchdog only
    //    recorded errors and never repaired anything, so that promise was false.
    try {
      if (activeWatchdog.status.errorsDetected.length > 0) {
        const lastError =
          activeWatchdog.status.errorsDetected[activeWatchdog.status.errorsDetected.length - 1] ??
          "";
        const heal = await autoHealProject(projectRoot, lastError);
        if (heal.healed) {
          activeWatchdog.status.autoFixesApplied.push(
            `${new Date().toISOString()} — ${heal.actionTaken}`,
          );
          if (activeWatchdog.status.autoFixesApplied.length > 50) {
            activeWatchdog.status.autoFixesApplied =
              activeWatchdog.status.autoFixesApplied.slice(-50);
          }
          onAlert?.(`🛠️ Watchdog auto-fixed ${projectName}: ${heal.actionTaken}`);
          // A successful heal clears the pending error trail.
          activeWatchdog.status.errorsDetected = [];
        }
      }
    } catch (healErr: any) {
      activeWatchdog.status.errorsDetected.push(
        `Auto-heal failed: ${healErr?.message || String(healErr)}`,
      );
    }
  }, intervalSeconds * 1000);

  return activeWatchdog.status;
}

export function stopWatchdog(): WatchdogStatus {
  if (activeWatchdog.intervalTimer) {
    clearInterval(activeWatchdog.intervalTimer);
    activeWatchdog.intervalTimer = null;
  }
  activeWatchdog.status.isActive = false;
  return activeWatchdog.status;
}

export function getWatchdogStatus(): WatchdogStatus {
  return activeWatchdog.status;
}
