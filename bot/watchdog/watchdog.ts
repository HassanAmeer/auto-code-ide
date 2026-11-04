import { executeBash, inspectPreviewEndpoint } from "../cline/tools.ts";

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

    // 1. Check Git Status for unexpected issues
    try {
      const gitRes = await executeBash("git status --short", projectRoot, 8000);
      if (!gitRes.ok && gitRes.error) {
        activeWatchdog.status.errorsDetected.push(`Git error: ${gitRes.error}`);
        onAlert?.(`⚠️ Watchdog noticed git issue in ${projectName}: ${gitRes.error}`);
      }
    } catch {}

    // 2. Health check preview endpoint
    try {
      const preview = await inspectPreviewEndpoint(3000);
      if (!preview.ok) {
        activeWatchdog.status.errorsDetected.push(`Preview unreachable: ${preview.error}`);
      }
    } catch {}
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
