import { useCallback, useEffect, useState } from "react";
import {
  CheckIcon,
  DownloadIcon,
  GlobeIcon,
  RotateCcwIcon,
  SearchIcon,
  Trash2Icon,
  LaptopIcon,
  CheckCircle2Icon,
  SparklesIcon,
  ShieldCheckIcon,
  TerminalIcon,
  Zap,
  CopyIcon,
  AlertTriangleIcon,
  XCircleIcon,
  ActivityIcon,
  PlayCircleIcon,
} from "lucide-react";

import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Spinner } from "../ui/spinner";
import { Switch } from "../ui/switch";
import { toastManager } from "../ui/toast";
import { RefreshIcon } from "../ui/refresh-icon";
import { cn } from "~/lib/utils";
import { SettingsPageContainer } from "./settingsLayout";

interface BrowserState {
  bundledInstalled: boolean;
  bundledVersion: string | null;
  bundledPath: string | null;
  bundledSize: string | null;
  bundledEnabled: boolean;

  customPath: string;
  customInstalled: boolean;
  customEnabled: boolean;

  checking: boolean;
}

interface HealthCheckState {
  checking: boolean;
  hasRun: boolean;
  osLibs: {
    status: "pass" | "fail" | "idle";
    missing: string[];
  };
  browserBinary: {
    status: "pass" | "fail" | "idle";
    path: string | null;
    version: string | null;
    size: string | null;
  };
  rootSandbox: {
    status: "pass" | "warn" | "idle";
    isRoot: boolean;
    hasFlag: boolean;
  };
  liveExecution: {
    status: "pass" | "fail" | "idle";
    message: string;
  };
}

export function BrowserSettingsPanel() {
  const [state, setState] = useState<BrowserState>({
    bundledInstalled: false,
    bundledVersion: null,
    bundledPath: null,
    bundledSize: null,
    bundledEnabled: true,

    customPath: "/usr/bin/google-chrome",
    customInstalled: false,
    customEnabled: false,

    checking: true,
  });

  const [inputCustomPath, setInputCustomPath] = useState("/usr/bin/google-chrome");
  const [isInstalling, setIsInstalling] = useState(false);
  const [isUninstalling, setIsUninstalling] = useState(false);
  const [isSavingPath, setIsSavingPath] = useState(false);
  const [isDetecting, setIsDetecting] = useState(false);

  // Setup tabs & execution
  const [setupTab, setSetupTab] = useState<"auto" | "manual">("auto");
  const [isSetupingLibs, setIsSetupingLibs] = useState(false);
  const [isApplyingFlags, setIsApplyingFlags] = useState(false);
  const [isAllInOneRunning, setIsAllInOneRunning] = useState(false);
  const [setupLog, setSetupLog] = useState("");
  const [copiedStep, setCopiedStep] = useState<string | null>(null);

  // Health verification state
  const [health, setHealth] = useState<HealthCheckState>({
    checking: false,
    hasRun: false,
    osLibs: { status: "idle", missing: [] },
    browserBinary: { status: "idle", path: null, version: null, size: null },
    rootSandbox: { status: "idle", isRoot: false, hasFlag: false },
    liveExecution: { status: "idle", message: "" },
  });

  const copyToClipboard = (text: string, stepId: string) => {
    void navigator.clipboard.writeText(text);
    setCopiedStep(stepId);
    setTimeout(() => {
      setCopiedStep((prev) => (prev === stepId ? null : prev));
    }, 2000);
    toastManager.add({ title: "Copied to clipboard ✓" });
  };

  // Run full health check & verification across all 4 components
  const runFullHealthCheck = useCallback(async () => {
    setHealth((prev) => ({ ...prev, checking: true }));
    try {
      const probeCmd = `
        ROOT_DIR="$(git rev-parse --show-toplevel 2>/dev/null || dirname "$PWD")"
        ENV_FILE="$ROOT_DIR/.env"

        # 1. OS Libraries check
        MISSING_LIBS=""
        for lib in libnss3.so libnspr4.so libatk-1.0.so.0 libatk-bridge-2.0.so.0 libatspi.so.0 libasound.so.2 libgbm.so.1 libxkbcommon.so.0; do
          if ! ldconfig -p 2>/dev/null | grep -q "$lib"; then
            MISSING_LIBS="\${MISSING_LIBS}\${MISSING_LIBS:+,}$lib"
          fi
        done

        # 2. Chrome binary check (checks standard T3 locations and data folder)
        CHROME_PATH="$(find ~/.t3/tools/chrome-headless-shell/ /root/autojobs/data/tools/chrome-headless-shell/ "$ROOT_DIR/data/tools/chrome-headless-shell/" -type f -name "chrome-headless-shell" 2>/dev/null | head -n 1)"
        if [ -z "$CHROME_PATH" ]; then
          CHROME_PATH="$(find "$HOME" -path "*/tools/chrome-headless-shell/*" -name "chrome-headless-shell" 2>/dev/null | head -n 1)"
        fi

        CHROME_VER=""
        CHROME_SIZE=""
        if [ -n "$CHROME_PATH" ] && [ -x "$CHROME_PATH" ]; then
          CHROME_VER="$("$CHROME_PATH" --version 2>/dev/null || echo "Ready")"
          CHROME_DIR="$(dirname "$(dirname "$(dirname "$CHROME_PATH")")")"
          CHROME_SIZE="$(du -sh "$CHROME_DIR" 2>/dev/null | awk '{print $1}')"
        fi

        # 3. Root & sandbox flags
        IS_ROOT="0"
        if [ "$(id -u)" = "0" ]; then IS_ROOT="1"; fi
        NO_SANDBOX="0"
        if env | grep -q "T3CODE_BROWSER_NO_SANDBOX=1" || grep -qs "T3CODE_BROWSER_NO_SANDBOX=1" "$ENV_FILE" /etc/systemd/system/autojobs.service /etc/systemd/system/t3code.service; then
          NO_SANDBOX="1"
        fi

        # 4. Live execution test
        LIVE_OK="0"
        LIVE_MSG=""
        if [ -n "$CHROME_PATH" ] && [ -x "$CHROME_PATH" ]; then
          TEST_OUT="$("$CHROME_PATH" --no-sandbox --headless --dump-dom about:blank 2>&1)"
          if echo "$TEST_OUT" | grep -q "<html>"; then
            LIVE_OK="1"
            LIVE_MSG="DOM dump test passed successfully"
          else
            LIVE_MSG="$(echo "$TEST_OUT" | head -n 1 | tr '|' ' ')"
          fi
        else
          LIVE_MSG="Browser binary not installed"
        fi

        echo "HEALTH:LIBS=$MISSING_LIBS|PATH=$CHROME_PATH|VER=$CHROME_VER|SIZE=$CHROME_SIZE|ROOT=$IS_ROOT|SANDBOX=$NO_SANDBOX|LIVE=$LIVE_OK|MSG=$LIVE_MSG"
      `;

      const res = await fetch("/api/terminal/exec", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: probeCmd, timeoutMs: 25_000 }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { stdout: string; ok: boolean };
      const out = data.stdout?.trim() || "";

      const healthLine = out.split("\n").find((l) => l.startsWith("HEALTH:")) || "";
      const raw = healthLine.replace("HEALTH:", "");
      const params = Object.fromEntries(
        raw.split("|").map((p) => {
          const idx = p.indexOf("=");
          return idx > -1 ? [p.slice(0, idx), p.slice(idx + 1)] : [p, ""];
        }),
      );

      const missingLibs = params.LIBS ? params.LIBS.split(",").filter(Boolean) : [];
      const hasBinary = Boolean(params.PATH && params.PATH.trim().length > 0);
      const isRoot = params.ROOT === "1";
      const hasSandboxFlag = params.SANDBOX === "1";
      const liveOk = params.LIVE === "1";

      setHealth({
        checking: false,
        hasRun: true,
        osLibs: {
          status: missingLibs.length === 0 ? "pass" : "fail",
          missing: missingLibs,
        },
        browserBinary: {
          status: hasBinary ? "pass" : "fail",
          path: params.PATH || null,
          version: params.VER || null,
          size: params.SIZE ? `${params.SIZE.toUpperCase()}B` : null,
        },
        rootSandbox: {
          status: isRoot ? (hasSandboxFlag ? "pass" : "warn") : "pass",
          isRoot,
          hasFlag: hasSandboxFlag,
        },
        liveExecution: {
          status: liveOk ? "pass" : "fail",
          message: params.MSG || (liveOk ? "Live test passed" : "Execution failed"),
        },
      });
    } catch {
      setHealth((prev) => ({ ...prev, checking: false, hasRun: true }));
    }
  }, []);

  // Probe both browsers on host
  const checkBrowsers = useCallback(async () => {
    setState((prev) => ({ ...prev, checking: true }));
    try {
      const command = `
        ROOT_DIR="$(git rev-parse --show-toplevel 2>/dev/null || dirname "$PWD")"
        ENV_FILE="$ROOT_DIR/.env"

        # Check bundled chrome (includes autojobs data path and home tools)
        BUNDLED_EXEC="$(find ~/.t3/tools/chrome-headless-shell/ /root/autojobs/data/tools/chrome-headless-shell/ "$ROOT_DIR/data/tools/chrome-headless-shell/" -type f -name 'chrome-headless-shell' 2>/dev/null | head -n 1)"
        if [ -z "$BUNDLED_EXEC" ]; then
          BUNDLED_EXEC="$(find "$HOME" -path "*/tools/chrome-headless-shell/*" -name "chrome-headless-shell" 2>/dev/null | head -n 1)"
        fi

        if [ -n "$BUNDLED_EXEC" ] && [ -x "$BUNDLED_EXEC" ]; then
          BUNDLED_VER="$("$BUNDLED_EXEC" --version 2>/dev/null || echo "Ready")"
          BUNDLED_RES="FOUND|$BUNDLED_EXEC|$BUNDLED_VER"
          CHROME_DIR="$(dirname "$(dirname "$(dirname "$BUNDLED_EXEC")")")"
          BUNDLED_SIZE="$(du -sh "$CHROME_DIR" 2>/dev/null | awk '{print $1}')"
        else
          BUNDLED_RES="NOT_FOUND||"
          BUNDLED_SIZE=""
        fi

        # Check custom path in .env
        CUSTOM_ENV="$(grep -E '^T3CODE_BROWSER_EXECUTABLE_PATH=' "$ENV_FILE" 2>/dev/null | cut -d'=' -f2- | tr -d '\"' | tr -d "'" | tr -d ' ')"
        
        # Check bundled disabled flag
        BUNDLED_DIS="$(grep -E '^T3CODE_DISABLE_BUNDLED_BROWSER=' "$ENV_FILE" 2>/dev/null | cut -d'=' -f2- | tr -d '\"' | tr -d "'" | tr -d ' ')"

        # Check detected system chrome
        SYS_CHROME="$(which google-chrome chromium-browser chromium google-chrome-stable 2>/dev/null | head -n 1)"

        echo "$BUNDLED_RES|$CUSTOM_ENV|$BUNDLED_DIS|$SYS_CHROME|$BUNDLED_SIZE"
      `;

      const res = await fetch("/api/terminal/exec", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command, timeoutMs: 15_000 }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = (await res.json()) as { stdout: string; ok: boolean };
      const output = data.stdout?.trim() || "";
      const [
        bundledStatus,
        bundledPath,
        bundledVersion,
        customEnv,
        bundledDis,
        sysChrome,
        bundledSize,
      ] = output.split("|");

      const bundledInstalled = bundledStatus === "FOUND";
      const bundledEnabled = bundledDis !== "1";

      const hasCustom = Boolean(customEnv && customEnv.trim().length > 0);
      const effectiveCustomPath =
        hasCustom && customEnv ? customEnv.trim() : sysChrome?.trim() || "/usr/bin/google-chrome";

      setState({
        bundledInstalled,
        bundledVersion: bundledVersion || null,
        bundledPath: bundledPath || null,
        bundledSize: bundledSize ? `${bundledSize.toUpperCase()}B` : null,
        bundledEnabled: bundledInstalled && bundledEnabled,

        customPath: effectiveCustomPath,
        customInstalled: Boolean(sysChrome && sysChrome.trim().length > 0),
        customEnabled: hasCustom,

        checking: false,
      });

      setInputCustomPath(effectiveCustomPath);
    } catch {
      setState((prev) => ({ ...prev, checking: false }));
    }
  }, []);

  useEffect(() => {
    void checkBrowsers();
    void runFullHealthCheck();
  }, [checkBrowsers, runFullHealthCheck]);

  // Toggle Bundled Headless Chrome
  const handleToggleBundled = async () => {
    const nextState = !state.bundledEnabled;
    setState((prev) => ({ ...prev, bundledEnabled: nextState }));

    try {
      const cmd = `
        ROOT_DIR="$(git rev-parse --show-toplevel 2>/dev/null || dirname "$PWD")"
        ENV_FILE="$ROOT_DIR/.env"
        if [ "${nextState ? "1" : "0"}" = "1" ]; then
          sed -i '/T3CODE_DISABLE_BUNDLED_BROWSER=/d' "$ENV_FILE" 2>/dev/null || true
        else
          if grep -q "T3CODE_DISABLE_BUNDLED_BROWSER=" "$ENV_FILE" 2>/dev/null; then
            sed -i 's|^T3CODE_DISABLE_BUNDLED_BROWSER=.*|T3CODE_DISABLE_BUNDLED_BROWSER=1|' "$ENV_FILE"
          else
            echo "T3CODE_DISABLE_BUNDLED_BROWSER=1" >> "$ENV_FILE"
          fi
        fi
      `;
      await fetch("/api/terminal/exec", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: cmd }),
      });
      toastManager.add({
        title: nextState ? "Bundled Chrome Enabled" : "Bundled Chrome Disabled",
        description: nextState
          ? "Official headless browser active."
          : "Bundled headless browser turned off.",
      });
      await checkBrowsers();
    } catch (err) {
      toastManager.add({
        title: "Toggle failed",
        description: err instanceof Error ? err.message : String(err),
      });
    }
  };

  // Toggle Custom / System Chrome
  const handleToggleCustom = async () => {
    const nextState = !state.customEnabled;
    const pathToUse = inputCustomPath.trim() || state.customPath || "/usr/bin/google-chrome";

    setState((prev) => ({ ...prev, customEnabled: nextState }));

    try {
      const cmd = `
        ROOT_DIR="$(git rev-parse --show-toplevel 2>/dev/null || dirname "$PWD")"
        ENV_FILE="$ROOT_DIR/.env"
        if [ "${nextState ? "1" : "0"}" = "1" ]; then
          if grep -q "T3CODE_BROWSER_EXECUTABLE_PATH=" "$ENV_FILE" 2>/dev/null; then
            sed -i 's|^T3CODE_BROWSER_EXECUTABLE_PATH=.*|T3CODE_BROWSER_EXECUTABLE_PATH=${pathToUse}|' "$ENV_FILE"
          else
            echo "T3CODE_BROWSER_EXECUTABLE_PATH=${pathToUse}" >> "$ENV_FILE"
          fi
        else
          sed -i '/T3CODE_BROWSER_EXECUTABLE_PATH=/d' "$ENV_FILE" 2>/dev/null || true
        fi
      `;
      await fetch("/api/terminal/exec", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: cmd }),
      });
      toastManager.add({
        title: nextState ? "System Chrome Enabled" : "System Chrome Disabled",
        description: nextState ? `Active at: ${pathToUse}` : "Custom browser disabled.",
      });
      await checkBrowsers();
    } catch (err) {
      toastManager.add({
        title: "Toggle failed",
        description: err instanceof Error ? err.message : String(err),
      });
    }
  };

  // Save new custom path
  const handleSaveCustomPath = async () => {
    const trimmed = inputCustomPath.trim();
    if (!trimmed) {
      toastManager.add({
        title: "Path required",
        description: "Please enter a valid browser executable path.",
      });
      return;
    }

    setIsSavingPath(true);
    try {
      const cmd = `
        ROOT_DIR="$(git rev-parse --show-toplevel 2>/dev/null || dirname "$PWD")"
        ENV_FILE="$ROOT_DIR/.env"
        if grep -q "T3CODE_BROWSER_EXECUTABLE_PATH=" "$ENV_FILE" 2>/dev/null; then
          sed -i 's|^T3CODE_BROWSER_EXECUTABLE_PATH=.*|T3CODE_BROWSER_EXECUTABLE_PATH=${trimmed}|' "$ENV_FILE"
        else
          echo "T3CODE_BROWSER_EXECUTABLE_PATH=${trimmed}" >> "$ENV_FILE"
        fi
      `;
      await fetch("/api/terminal/exec", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: cmd }),
      });
      toastManager.add({
        title: "Path Saved",
        description: `Using custom browser at: ${trimmed}`,
      });
      await checkBrowsers();
    } catch (err) {
      toastManager.add({
        title: "Save failed",
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsSavingPath(false);
    }
  };

  // Auto-detect system chrome
  const handleAutoDetect = async () => {
    setIsDetecting(true);
    try {
      const cmd = `which google-chrome chromium-browser chromium google-chrome-stable 2>/dev/null | head -n 1`;
      const res = await fetch("/api/terminal/exec", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: cmd }),
      });
      const data = (await res.json()) as { stdout: string };
      const detected = data.stdout?.trim();
      if (detected) {
        setInputCustomPath(detected);
        toastManager.add({
          title: "Browser Detected",
          description: `Found: ${detected}`,
        });
      } else {
        toastManager.add({
          title: "Not Found",
          description: "Aapke system me koi standard Google Chrome nahi mila.",
        });
      }
    } catch {
      toastManager.add({ title: "Detection failed" });
    } finally {
      setIsDetecting(false);
    }
  };

  // Step 1: Install host OS libraries (Ubuntu/Debian)
  const handleSetupHostLibs = async () => {
    setIsSetupingLibs(true);
    setSetupLog("");
    try {
      const cmd = `
        export DEBIAN_FRONTEND=noninteractive
        apt-get update -qq 2>&1 | tail -3
        apt-get install -y --no-install-recommends \\
          libnspr4 libnss3 \\
          libatk1.0-0t64 libatk-bridge2.0-0t64 libatspi2.0-0t64 \\
          libxdamage1 libasound2t64 libgbm1 \\
          libxkbcommon0 libxcomposite1 libxrandr2 libxfixes3 libdrm2 \\
          libglib2.0-0t64 libdbus-1-3 libx11-6 libxcb1 libxext6 libexpat1 2>&1
        echo "LIBS_SETUP_OK"
      `;
      const res = await fetch("/api/terminal/exec", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: cmd, timeoutMs: 120_000 }),
      });
      const data = (await res.json()) as { stdout: string; stderr?: string; ok: boolean };
      const output = (data.stdout || "") + (data.stderr || "");
      setSetupLog(output.slice(-2000));
      if (output.includes("LIBS_SETUP_OK") || data.ok) {
        toastManager.add({
          title: "Step 1: Host Libraries Installed ✓",
          description: "All OS shared libraries are installed.",
        });
      } else {
        toastManager.add({
          title: "Step 1 mein masla aya",
          description: "Check log below or run manually via SSH.",
        });
      }
      await runFullHealthCheck();
    } catch (err) {
      toastManager.add({
        title: "Request failed",
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsSetupingLibs(false);
    }
  };

  // Step 2: Download/Install Bundled Chrome Headless Shell
  const handleInstallBundled = async () => {
    setIsInstalling(true);
    setSetupLog("");
    try {
      const installCmd = `
        mkdir -p ~/.t3/tools/chrome-headless-shell/linux64/154.0.8037.92
        cd /tmp
        curl -sL "https://storage.googleapis.com/chrome-for-testing-public/154.0.8037.92/linux64/chrome-headless-shell-linux64.zip" -o chrome-headless-shell.zip
        unzip -q -o chrome-headless-shell.zip -d /tmp/chrome-unpacked
        cp -r /tmp/chrome-unpacked/chrome-headless-shell-linux64/* ~/.t3/tools/chrome-headless-shell/linux64/154.0.8037.92/
        chmod +x ~/.t3/tools/chrome-headless-shell/linux64/154.0.8037.92/chrome-headless-shell
        rm -rf /tmp/chrome-headless-shell.zip /tmp/chrome-unpacked
        echo "BROWSER_INSTALL_OK"
      `;

      const res = await fetch("/api/terminal/exec", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: installCmd, timeoutMs: 180_000 }),
      });

      const data = (await res.json()) as { stdout?: string; stderr?: string; ok: boolean };
      const output = (data.stdout || "") + (data.stderr || "");
      setSetupLog(output.slice(-2000));

      if (data.ok || output.includes("BROWSER_INSTALL_OK")) {
        toastManager.add({
          title: "Step 2: Browser Installed ✓",
          description: "Chrome Headless Shell downloaded and ready.",
        });
        await checkBrowsers();
        await runFullHealthCheck();
      } else {
        throw new Error(data.stderr || "Download failed.");
      }
    } catch (err) {
      toastManager.add({
        title: "Installation failed",
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsInstalling(false);
    }
  };

  // Step 3: Apply VPS Root Sandbox Flags & Restart Service
  const handleApplyRootFlagsAndRestart = async () => {
    setIsApplyingFlags(true);
    try {
      const cmd = `
        ROOT_DIR="$(git rev-parse --show-toplevel 2>/dev/null || dirname "$PWD")"
        ENV_FILE="$ROOT_DIR/.env"
        
        # Ensure env file has root sandbox flags
        grep -q "T3CODE_BROWSER_NO_SANDBOX=" "$ENV_FILE" 2>/dev/null || echo "T3CODE_BROWSER_NO_SANDBOX=1" >> "$ENV_FILE"
        grep -q "T3CODE_SERVER_BROWSER_SANDBOX=" "$ENV_FILE" 2>/dev/null || echo "T3CODE_SERVER_BROWSER_SANDBOX=0" >> "$ENV_FILE"
        grep -q "T3CODE_MODE=" "$ENV_FILE" 2>/dev/null || echo "T3CODE_MODE=web" >> "$ENV_FILE"

        # If systemd service exists, ensure flags are in it
        SVC_FILE="/etc/systemd/system/autojobs.service"
        if [ -f "$SVC_FILE" ]; then
          sed -i '/Environment=T3CODE_BROWSER_NO_SANDBOX=/d' "$SVC_FILE" 2>/dev/null || true
          sed -i '/Environment=T3CODE_SERVER_BROWSER_SANDBOX=/d' "$SVC_FILE" 2>/dev/null || true
          sed -i '/Environment=T3CODE_MODE=/d' "$SVC_FILE" 2>/dev/null || true
          sed -i '/\\[Service\\]/a Environment=T3CODE_BROWSER_NO_SANDBOX=1\\nEnvironment=T3CODE_SERVER_BROWSER_SANDBOX=0\\nEnvironment=T3CODE_MODE=web' "$SVC_FILE" 2>/dev/null || true
          systemctl daemon-reload 2>/dev/null || true
          systemctl restart autojobs 2>/dev/null || true
        fi
        echo "FLAGS_OK"
      `;

      await fetch("/api/terminal/exec", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: cmd, timeoutMs: 30_000 }),
      });

      toastManager.add({
        title: "Step 3: Flags Applied & Service Restarted ✓",
        description: "Sandbox bypass enabled for root VPS.",
      });
      await runFullHealthCheck();
    } catch (err) {
      toastManager.add({
        title: "Flags update failed",
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsApplyingFlags(false);
    }
  };

  // 1-Click Complete Auto Setup (Step 1 -> Step 2 -> Step 3 -> Verify)
  const handleAllInOneSetup = async () => {
    setIsAllInOneRunning(true);
    setSetupLog("=== Starting 1-Click All-in-One Setup ===\n");
    try {
      setSetupLog((p) => p + "[Step 1/3] Installing OS Host System Libraries...\n");
      await handleSetupHostLibs();

      setSetupLog((p) => p + "[Step 2/3] Downloading & configuring Headless Chrome...\n");
      await handleInstallBundled();

      setSetupLog((p) => p + "[Step 3/3] Setting root sandbox bypass flags & restarting...\n");
      await handleApplyRootFlagsAndRestart();

      setSetupLog((p) => p + "[Verification] Running full system health check...\n");
      await runFullHealthCheck();

      toastManager.add({
        title: "1-Click Setup Complete! 🎉",
        description: "Browser preview is now fully configured and verified.",
      });
    } catch (err) {
      toastManager.add({
        title: "Auto setup encountered an error",
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsAllInOneRunning(false);
    }
  };

  // Uninstall bundled browser
  const handleUninstallBundled = async () => {
    if (!window.confirm("Bundled headless browser ko delete karna chahte hain?")) return;
    setIsUninstalling(true);
    try {
      await fetch("/api/terminal/exec", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          command:
            "rm -rf ~/.t3/tools/chrome-headless-shell /root/autojobs/data/tools/chrome-headless-shell",
        }),
      });
      toastManager.add({ title: "Browser Removed", description: "Bundled Chrome deleted." });
      await checkBrowsers();
      await runFullHealthCheck();
    } catch {
      toastManager.add({ title: "Uninstall failed" });
    } finally {
      setIsUninstalling(false);
    }
  };

  // Reset all
  const handleReset = async () => {
    if (!window.confirm("Reset browser settings to defaults?")) return;
    try {
      const cmd = `
        ROOT_DIR="$(git rev-parse --show-toplevel 2>/dev/null || dirname "$PWD")"
        ENV_FILE="$ROOT_DIR/.env"
        sed -i '/T3CODE_BROWSER_EXECUTABLE_PATH=/d' "$ENV_FILE" 2>/dev/null || true
        sed -i '/T3CODE_DISABLE_BUNDLED_BROWSER=/d' "$ENV_FILE" 2>/dev/null || true
      `;
      await fetch("/api/terminal/exec", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: cmd }),
      });
      toastManager.add({ title: "Reset Complete", description: "Default configuration restored." });
      await checkBrowsers();
      await runFullHealthCheck();
    } catch {
      toastManager.add({ title: "Reset failed" });
    }
  };

  const bothActive = state.bundledEnabled && state.customEnabled;
  const allHealthPass =
    health.osLibs.status === "pass" &&
    health.browserBinary.status === "pass" &&
    health.liveExecution.status === "pass";

  return (
    <SettingsPageContainer width="readable">
      <div className="flex flex-col gap-6 py-2">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b pb-4">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary shadow-xs">
              <GlobeIcon className="size-5" />
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight">Browser</h1>
              <p className="text-xs text-muted-foreground">
                AI agents aur web app preview ke liye browsers aur OS dependencies ko manage karein.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                void checkBrowsers();
                void runFullHealthCheck();
              }}
              disabled={state.checking || health.checking}
              className="h-8 gap-1.5 text-xs"
            >
              <RefreshIcon refreshing={state.checking || health.checking} />
              <span>Rescan & Test</span>
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void handleReset()}
              className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              <RotateCcwIcon className="size-3" />
              <span>Reset</span>
            </Button>
          </div>
        </div>

        {/* ── 1. ACTIVE CONFIGURATION SUMMARY ── */}
        <div className="rounded-xl border bg-card/60 p-4 shadow-xs space-y-2">
          <div className="flex items-center gap-2">
            <div className="flex size-3 items-center justify-center">
              <span className="relative flex size-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex size-2.5 rounded-full bg-emerald-500" />
              </span>
            </div>
            <span className="text-xs font-semibold text-foreground">Active Configuration:</span>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-0.5">
            {bothActive ? (
              <Badge
                variant="secondary"
                className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-xs gap-1.5 py-1"
              >
                <SparklesIcon className="size-3.5" />
                Both Browsers Active (Smart Fallback Enabled)
              </Badge>
            ) : state.customEnabled ? (
              <Badge
                variant="secondary"
                className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30 text-xs font-mono py-1"
              >
                System Chrome Active ({state.customPath})
              </Badge>
            ) : state.bundledEnabled ? (
              <Badge
                variant="secondary"
                className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-xs py-1"
              >
                Bundled Headless Chrome Active
              </Badge>
            ) : (
              <Badge variant="outline" className="text-xs text-muted-foreground">
                No browser active (Previews disabled)
              </Badge>
            )}
          </div>

          <p className="text-[11px] text-muted-foreground leading-relaxed pt-1">
            {bothActive
              ? "Dono browsers enabled hain! Agent pehle aapke System Chrome ko use karega, aur agar wo busy ya unavailable ho to Bundled Chrome fallback ke tor par khud chal padega."
              : "Aap chahein to ek waqt me dono ko bhi enable rakh sakte hain (multi-select), ya sirf kisi ek ko."}
          </p>
        </div>

        {/* ── 2. SYSTEM HEALTH & VERIFICATION CHECKLIST (GREEN CHECKMARKS) ── */}
        <div className="rounded-xl border bg-card/80 shadow-xs overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b bg-muted/20">
            <div className="flex items-center gap-2.5">
              <div className="flex size-7 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-500">
                <ActivityIcon className="size-4" />
              </div>
              <div>
                <h3 className="text-sm font-semibold leading-none">System Health & Verification</h3>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Har setup step ka live test aur green checkmark status
                </p>
              </div>
            </div>

            <Button
              size="sm"
              variant="outline"
              disabled={health.checking}
              onClick={() => void runFullHealthCheck()}
              className="h-7 text-xs gap-1.5"
            >
              {health.checking ? (
                <>
                  <Spinner className="size-3" />
                  <span>Checking...</span>
                </>
              ) : (
                <>
                  <PlayCircleIcon className="size-3 text-emerald-500" />
                  <span>Run Health Check</span>
                </>
              )}
            </Button>
          </div>

          {/* Overall status banner */}
          {health.hasRun && (
            <div
              className={cn(
                "px-4 py-2 text-xs font-medium border-b flex items-center gap-2",
                allHealthPass
                  ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20"
                  : "bg-amber-500/10 text-amber-800 dark:text-amber-200 border-amber-500/20",
              )}
            >
              {allHealthPass ? (
                <>
                  <CheckCircle2Icon className="size-4 shrink-0 text-emerald-500" />
                  <span>
                    <strong>Sab Theek Hai!</strong> Tamam 4 checks pass ho gaye hain. Browser
                    preview 100% operational hai.
                  </span>
                </>
              ) : (
                <>
                  <AlertTriangleIcon className="size-4 shrink-0 text-amber-500" />
                  <span>
                    <strong>Attention Needed:</strong> Kuch checks fail ya incomplete hain — neeche
                    diye gaye setup steps follow karein.
                  </span>
                </>
              )}
            </div>
          )}

          {/* 4 Health Items Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x border-b">
            {/* Check 1: OS Libraries */}
            <div className="p-4 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-foreground">
                  Step 1: Host System Libraries
                </span>
                {health.checking ? (
                  <Badge variant="outline" className="text-[10px] gap-1">
                    <Spinner className="size-2.5" /> Checking
                  </Badge>
                ) : health.osLibs.status === "pass" ? (
                  <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-[10px] gap-1">
                    <CheckCircle2Icon className="size-3" /> Installed ✓
                  </Badge>
                ) : health.osLibs.status === "fail" ? (
                  <Badge className="bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30 text-[10px] gap-1">
                    <XCircleIcon className="size-3" /> Missing
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-[10px]">
                    Not Tested
                  </Badge>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                {health.osLibs.status === "pass"
                  ? "Tamam 12 Linux system libraries (libnss3, libasound2, libgbm, libatk) verified hain."
                  : health.osLibs.missing.length > 0
                    ? `Missing: ${health.osLibs.missing.join(", ")}`
                    : "OS shared libraries Chrome process ke liye lazmi hoti hain."}
              </p>
            </div>

            {/* Check 2: Browser Binary */}
            <div className="p-4 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-foreground">
                  Step 2: Headless Chrome Binary
                </span>
                {health.checking ? (
                  <Badge variant="outline" className="text-[10px] gap-1">
                    <Spinner className="size-2.5" /> Checking
                  </Badge>
                ) : health.browserBinary.status === "pass" ? (
                  <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-[10px] gap-1">
                    <CheckCircle2Icon className="size-3" /> Ready ✓
                  </Badge>
                ) : health.browserBinary.status === "fail" ? (
                  <Badge className="bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30 text-[10px] gap-1">
                    <AlertTriangleIcon className="size-3" /> Not Found
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-[10px]">
                    Not Tested
                  </Badge>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                {health.browserBinary.status === "pass"
                  ? `Chrome Headless Shell (${health.browserBinary.version || "Installed"})${
                      health.browserBinary.size ? ` • ${health.browserBinary.size}` : ""
                    }`
                  : "Chrome Headless Shell binary abhi download nahi hua."}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x">
            {/* Check 3: Root & Sandbox Flags */}
            <div className="p-4 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-foreground">
                  Step 3: Root Sandbox Bypass
                </span>
                {health.checking ? (
                  <Badge variant="outline" className="text-[10px] gap-1">
                    <Spinner className="size-2.5" /> Checking
                  </Badge>
                ) : health.rootSandbox.status === "pass" ? (
                  <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-[10px] gap-1">
                    <CheckCircle2Icon className="size-3" /> Configured ✓
                  </Badge>
                ) : (
                  <Badge className="bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30 text-[10px] gap-1">
                    <AlertTriangleIcon className="size-3" /> Needs Flag
                  </Badge>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                {health.rootSandbox.isRoot
                  ? health.rootSandbox.hasFlag
                    ? "VPS root user detected — --no-sandbox flags properly configured ✓"
                    : "VPS root user par --no-sandbox flags lazmi hain warna Chrome crash hoga."
                  : "Standard non-root user environment."}
              </p>
            </div>

            {/* Check 4: Live Execution Test */}
            <div className="p-4 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-foreground">
                  Step 4: Live DOM Render Test
                </span>
                {health.checking ? (
                  <Badge variant="outline" className="text-[10px] gap-1">
                    <Spinner className="size-2.5" /> Testing
                  </Badge>
                ) : health.liveExecution.status === "pass" ? (
                  <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-[10px] gap-1">
                    <CheckCircle2Icon className="size-3" /> Passed ✓
                  </Badge>
                ) : health.liveExecution.status === "fail" ? (
                  <Badge className="bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30 text-[10px] gap-1">
                    <XCircleIcon className="size-3" /> Failed
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-[10px]">
                    Not Tested
                  </Badge>
                )}
              </div>
              <p
                className="text-[11px] text-muted-foreground leading-relaxed truncate"
                title={health.liveExecution.message}
              >
                {health.liveExecution.status === "pass"
                  ? "Headless process ne live webpage test render kiya — output verified!"
                  : health.liveExecution.message || "Live browser execution test pending."}
              </p>
            </div>
          </div>
        </div>

        {/* ── 3. IMPORTANT ORANGE CALLOUT / RULES (ZARURI GUIDELINES) ── */}
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 dark:bg-amber-950/20 p-4 shadow-xs space-y-3">
          <div className="flex items-center gap-2.5 text-amber-800 dark:text-amber-300">
            <AlertTriangleIcon className="size-4.5 shrink-0" />
            <h3 className="text-xs font-bold uppercase tracking-wider">
              Zaruri Rules & Setup Guidelines (Read First)
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-[11px] text-amber-900/90 dark:text-amber-200/90 leading-relaxed">
            <div className="rounded-lg bg-background/50 dark:bg-background/20 p-2.5 border border-amber-500/20 space-y-1">
              <p className="font-semibold text-amber-800 dark:text-amber-300">
                1. Order of Installation
              </p>
              <p>
                Hamesha <strong>Step 1 (Host Libraries)</strong> pehle install karein, uske baad{" "}
                <strong>Step 2 (Browser Binary)</strong>. Agar system libraries na hon toh browser
                launch fail ho jata hai.
              </p>
            </div>

            <div className="rounded-lg bg-background/50 dark:bg-background/20 p-2.5 border border-amber-500/20 space-y-1">
              <p className="font-semibold text-amber-800 dark:text-amber-300">
                2. VPS Root User Rule
              </p>
              <p>
                Linux VPS par jab server <code>root</code> user se chal raha ho, toh Chromium bina{" "}
                <code>--no-sandbox</code> flags ke start nahi hota. Humara setup ise auto-apply
                karta hai.
              </p>
            </div>

            <div className="rounded-lg bg-background/50 dark:bg-background/20 p-2.5 border border-amber-500/20 space-y-1">
              <p className="font-semibold text-amber-800 dark:text-amber-300">
                3. RAM / Disk Sizing
              </p>
              <p>
                Headless Chrome har open tab par taqreeban <strong>150MB - 300MB RAM</strong> leta
                hai. Disk space ~280 MB chahiye. VPS par 2GB RAM behtareen rehti hai.
              </p>
            </div>
          </div>
        </div>

        {/* ── 4. STEP-BY-STEP SETUP GUIDE (AUTO VS MANUAL TABS) ── */}
        <div className="rounded-xl border bg-card/80 shadow-xs overflow-hidden">
          {/* Sub-nav Tabs Header */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 border-b bg-muted/20">
            <div className="flex items-center gap-2">
              <div className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Zap className="size-4" />
              </div>
              <span className="text-sm font-semibold">Browser Installation & Setup</span>
            </div>

            {/* Tab switchers: Auto vs Manual */}
            <div className="flex items-center rounded-lg border bg-muted/40 p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setSetupTab("auto")}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-3 py-1 font-medium transition-all",
                  setupTab === "auto"
                    ? "bg-background text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Zap className="size-3 text-amber-500" />
                <span>Setup Auto</span>
              </button>

              <button
                type="button"
                onClick={() => setSetupTab("manual")}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-3 py-1 font-medium transition-all",
                  setupTab === "manual"
                    ? "bg-background text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <TerminalIcon className="size-3 text-violet-500" />
                <span>Setup Manually</span>
              </button>
            </div>
          </div>

          {/* TAB 1: AUTO SETUP */}
          {setupTab === "auto" && (
            <div className="p-4 space-y-5">
              {/* 1-Click All-in-One Auto Setup banner */}
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/20 bg-primary/5 p-3.5">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1.5 font-semibold text-xs text-foreground">
                    <SparklesIcon className="size-3.5 text-primary" />
                    <span>1-Click Complete Auto Setup</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Step 1 (Libraries) + Step 2 (Browser) + Step 3 (Root Flags & Restart) sab khud
                    ba khud run karega.
                  </p>
                </div>

                <Button
                  size="sm"
                  variant="default"
                  disabled={isAllInOneRunning || isSetupingLibs || isInstalling || isApplyingFlags}
                  onClick={() => void handleAllInOneSetup()}
                  className="h-8 gap-1.5 text-xs font-semibold shadow-xs"
                >
                  {isAllInOneRunning ? (
                    <>
                      <Spinner className="size-3" />
                      <span>Setting up everything...</span>
                    </>
                  ) : (
                    <>
                      <Zap className="size-3.5" />
                      <span>Run All-in-One Auto Setup</span>
                    </>
                  )}
                </Button>
              </div>

              {/* Step-by-Step Auto Actions */}
              <div className="space-y-3">
                {/* Step 1 Auto Card */}
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 hover:bg-muted/10 transition-colors">
                  <div className="flex items-center gap-3">
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">
                      1
                    </span>
                    <div>
                      <p className="text-xs font-semibold text-foreground">
                        Step 1: Install Host System Libraries
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        Ubuntu/Debian OS libraries (libnss3, libasound2, libgbm1) background apt se
                        install hongi.
                      </p>
                    </div>
                  </div>

                  <Button
                    size="sm"
                    variant={health.osLibs.status === "pass" ? "outline" : "default"}
                    disabled={isSetupingLibs || isAllInOneRunning}
                    onClick={() => void handleSetupHostLibs()}
                    className="h-7 text-xs gap-1.5 shrink-0"
                  >
                    {isSetupingLibs ? (
                      <>
                        <Spinner className="size-3" />
                        <span>Installing...</span>
                      </>
                    ) : health.osLibs.status === "pass" ? (
                      <>
                        <CheckIcon className="size-3 text-emerald-500" />
                        <span>Re-install Libraries</span>
                      </>
                    ) : (
                      <>
                        <DownloadIcon className="size-3" />
                        <span>Install Libraries</span>
                      </>
                    )}
                  </Button>
                </div>

                {/* Step 2 Auto Card */}
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 hover:bg-muted/10 transition-colors">
                  <div className="flex items-center gap-3">
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">
                      2
                    </span>
                    <div>
                      <p className="text-xs font-semibold text-foreground">
                        Step 2: Download Chrome Headless Shell
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        Official Google Chrome Headless Shell (~85MB download, ~260MB extracted)
                        setup hoga.
                      </p>
                    </div>
                  </div>

                  <Button
                    size="sm"
                    variant={state.bundledInstalled ? "outline" : "default"}
                    disabled={isInstalling || isAllInOneRunning}
                    onClick={() => void handleInstallBundled()}
                    className="h-7 text-xs gap-1.5 shrink-0"
                  >
                    {isInstalling ? (
                      <>
                        <Spinner className="size-3" />
                        <span>Downloading...</span>
                      </>
                    ) : state.bundledInstalled ? (
                      <>
                        <CheckIcon className="size-3 text-emerald-500" />
                        <span>Update / Re-download</span>
                      </>
                    ) : (
                      <>
                        <DownloadIcon className="size-3" />
                        <span>Download Browser</span>
                      </>
                    )}
                  </Button>
                </div>

                {/* Step 3 Auto Card */}
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 hover:bg-muted/10 transition-colors">
                  <div className="flex items-center gap-3">
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">
                      3
                    </span>
                    <div>
                      <p className="text-xs font-semibold text-foreground">
                        Step 3: Root Sandbox Flags & Restart
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        VPS root environment flags (T3CODE_BROWSER_NO_SANDBOX=1) set karega aur
                        service restart karega.
                      </p>
                    </div>
                  </div>

                  <Button
                    size="sm"
                    variant="outline"
                    disabled={isApplyingFlags || isAllInOneRunning}
                    onClick={() => void handleApplyRootFlagsAndRestart()}
                    className="h-7 text-xs gap-1.5 shrink-0"
                  >
                    {isApplyingFlags ? (
                      <>
                        <Spinner className="size-3" />
                        <span>Restarting...</span>
                      </>
                    ) : (
                      <>
                        <ShieldCheckIcon className="size-3 text-primary" />
                        <span>Apply & Restart Service</span>
                      </>
                    )}
                  </Button>
                </div>
              </div>

              {/* Progress Log Output (if any) */}
              {setupLog.length > 0 && (
                <div className="rounded-lg border bg-muted/30 overflow-hidden">
                  <div className="flex items-center justify-between px-3 py-1.5 border-b bg-muted/40 text-[10px] font-mono text-muted-foreground">
                    <span>Terminal Progress Log</span>
                    <button
                      type="button"
                      onClick={() => setSetupLog("")}
                      className="hover:text-foreground"
                    >
                      Clear
                    </button>
                  </div>
                  <pre className="max-h-40 overflow-y-auto p-3 text-[10px] font-mono text-muted-foreground leading-relaxed whitespace-pre-wrap">
                    {setupLog}
                  </pre>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: MANUAL SETUP (SSH COMMANDS) */}
          {setupTab === "manual" && (
            <div className="p-4 space-y-4">
              <p className="text-xs text-muted-foreground">
                Agar aap khud apne VPS terminal (SSH) par step-by-step commands run karna chahein
                toh yeh steps follow karein:
              </p>

              {/* Step 1 Manual */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <span className="flex size-4.5 items-center justify-center rounded-full bg-primary/10 text-primary text-[10px] font-bold">
                      1
                    </span>
                    Host Libraries Install Karein (Ubuntu 24/26):
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      copyToClipboard(
                        `sudo apt-get update && sudo apt-get install -y \\\n  libnspr4 libnss3 \\\n  libatk1.0-0t64 libatk-bridge2.0-0t64 libatspi2.0-0t64 \\\n  libxdamage1 libasound2t64 libgbm1 \\\n  libxkbcommon0 libxcomposite1 libxrandr2 \\\n  libxfixes3 libdrm2 libglib2.0-0t64 \\\n  libdbus-1-3 libx11-6 libxcb1 libxext6 libexpat1`,
                        "step1",
                      )
                    }
                    className="h-6 px-2 text-[10px] gap-1"
                  >
                    {copiedStep === "step1" ? (
                      <CheckIcon className="size-3 text-emerald-500" />
                    ) : (
                      <CopyIcon className="size-3" />
                    )}
                    <span>{copiedStep === "step1" ? "Copied" : "Copy"}</span>
                  </Button>
                </div>
                <pre className="rounded-lg bg-background border px-3 py-2 text-[10px] font-mono text-foreground leading-relaxed select-all overflow-x-auto">{`sudo apt-get update && sudo apt-get install -y \\
  libnspr4 libnss3 \\
  libatk1.0-0t64 libatk-bridge2.0-0t64 libatspi2.0-0t64 \\
  libxdamage1 libasound2t64 libgbm1 \\
  libxkbcommon0 libxcomposite1 libxrandr2 \\
  libxfixes3 libdrm2 libglib2.0-0t64 \\
  libdbus-1-3 libx11-6 libxcb1 libxext6 libexpat1`}</pre>
                <p className="text-[10px] text-muted-foreground">
                  💡 Ubuntu 22 par <code>libasound2</code> aur <code>libatk1.0-0</code> use karein
                  (bina <code>t64</code> ke).
                </p>
              </div>

              {/* Step 2 Manual */}
              <div className="space-y-1.5 pt-2 border-t">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <span className="flex size-4.5 items-center justify-center rounded-full bg-primary/10 text-primary text-[10px] font-bold">
                      2
                    </span>
                    Browser Binary Setup Karein:
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => copyToClipboard(`sudo t3 browser setup`, "step2")}
                    className="h-6 px-2 text-[10px] gap-1"
                  >
                    {copiedStep === "step2" ? (
                      <CheckIcon className="size-3 text-emerald-500" />
                    ) : (
                      <CopyIcon className="size-3" />
                    )}
                    <span>{copiedStep === "step2" ? "Copied" : "Copy"}</span>
                  </Button>
                </div>
                <pre className="rounded-lg bg-background border px-3 py-2 text-[10px] font-mono text-foreground leading-relaxed select-all overflow-x-auto">{`sudo t3 browser setup`}</pre>
              </div>

              {/* Step 3 Manual */}
              <div className="space-y-1.5 pt-2 border-t">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <span className="flex size-4.5 items-center justify-center rounded-full bg-primary/10 text-primary text-[10px] font-bold">
                      3
                    </span>
                    VPS Root Flags & Service Restart:
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      copyToClipboard(
                        `# Service file (/etc/systemd/system/autojobs.service) me add karein:\nEnvironment=T3CODE_BROWSER_NO_SANDBOX=1\nEnvironment=T3CODE_SERVER_BROWSER_SANDBOX=0\nEnvironment=T3CODE_MODE=web\n\n# Reload aur restart karein:\nsudo systemctl daemon-reload\nsudo systemctl restart autojobs`,
                        "step3",
                      )
                    }
                    className="h-6 px-2 text-[10px] gap-1"
                  >
                    {copiedStep === "step3" ? (
                      <CheckIcon className="size-3 text-emerald-500" />
                    ) : (
                      <CopyIcon className="size-3" />
                    )}
                    <span>{copiedStep === "step3" ? "Copied" : "Copy"}</span>
                  </Button>
                </div>
                <pre className="rounded-lg bg-background border px-3 py-2 text-[10px] font-mono text-foreground leading-relaxed select-all overflow-x-auto">{`# Service file (/etc/systemd/system/autojobs.service) me [Service] ke neeche add karein:
Environment=T3CODE_BROWSER_NO_SANDBOX=1
Environment=T3CODE_SERVER_BROWSER_SANDBOX=0
Environment=T3CODE_MODE=web

# Reload aur restart karein:
sudo systemctl daemon-reload
sudo systemctl restart autojobs`}</pre>
              </div>

              {/* Step 4 Manual */}
              <div className="space-y-1.5 pt-2 border-t">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <span className="flex size-4.5 items-center justify-center rounded-full bg-primary/10 text-primary text-[10px] font-bold">
                      4
                    </span>
                    Test aur Verification Command:
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      copyToClipboard(
                        `CHROME="$(find ~/.t3/tools/ /root/autojobs/data/tools/ -name chrome-headless-shell 2>/dev/null | head -1)"\n$CHROME --no-sandbox --headless --dump-dom about:blank | head -5`,
                        "step4",
                      )
                    }
                    className="h-6 px-2 text-[10px] gap-1"
                  >
                    {copiedStep === "step4" ? (
                      <CheckIcon className="size-3 text-emerald-500" />
                    ) : (
                      <CopyIcon className="size-3" />
                    )}
                    <span>{copiedStep === "step4" ? "Copied" : "Copy"}</span>
                  </Button>
                </div>
                <pre className="rounded-lg bg-background border px-3 py-2 text-[10px] font-mono text-foreground leading-relaxed select-all overflow-x-auto">{`CHROME="$(find ~/.t3/tools/ /root/autojobs/data/tools/ -name chrome-headless-shell 2>/dev/null | head -1)"
$CHROME --no-sandbox --headless --dump-dom about:blank | head -5
# Agar <html> output aye toh browser 100% chal raha hai ✓`}</pre>
              </div>
            </div>
          )}
        </div>

        {/* ── 5. THE 2 BROWSERS CARDS (MULTI-SELECT SUPPORTED) ── */}
        <div className="space-y-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Available Browsers (Multi-Select Supported)
          </h2>

          {/* Browser 1: Bundled Headless Chrome */}
          <div
            className={cn(
              "relative flex flex-col justify-between gap-4 rounded-xl border p-4 transition-all shadow-xs",
              state.bundledEnabled
                ? "border-emerald-500/40 bg-emerald-500/[0.03] ring-1 ring-emerald-500/20"
                : "border-border/60 bg-card opacity-70",
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <GlobeIcon className="size-4.5 text-emerald-600 dark:text-emerald-400" />
                  <span className="font-semibold text-sm">Bundled Headless Chrome</span>
                  <Badge
                    variant="outline"
                    className="text-[10px] text-emerald-600 dark:text-emerald-400 border-emerald-500/30 bg-emerald-500/5"
                  >
                    Official / Zero-Config
                  </Badge>
                  <Badge
                    variant="secondary"
                    className="text-[10px] bg-muted/60 text-muted-foreground border-border/40 font-mono"
                  >
                    Install Size: {state.bundledSize || "263 MB"}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  T3 Code ka official Chrome binary jo <code>tools/</code> me rehta hai. AI agents
                  ke automated previews ke liye best hai.
                </p>
              </div>

              {/* Checkbox / Switch toggle */}
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs font-medium text-muted-foreground hidden sm:inline">
                  {state.bundledEnabled ? "Active" : "Disabled"}
                </span>
                <Switch
                  checked={state.bundledEnabled}
                  onCheckedChange={() => void handleToggleBundled()}
                  disabled={!state.bundledInstalled}
                  aria-label="Toggle Bundled Chrome"
                />
              </div>
            </div>

            {/* Bottom row: Status and Download/Uninstall */}
            <div className="flex flex-wrap items-center justify-between border-t pt-3 text-xs gap-2">
              <div className="flex items-center gap-2">
                {state.bundledInstalled ? (
                  <span className="inline-flex items-center gap-1 font-medium text-emerald-600 dark:text-emerald-400 text-xs">
                    <CheckCircle2Icon className="size-3.5" />
                    Installed ({state.bundledVersion || "Ready"}) • Install Size:{" "}
                    {state.bundledSize || "263 MB"}
                  </span>
                ) : (
                  <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">
                    Not downloaded yet (Download: ~85 MB • Install Size: ~260 MB)
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                {state.bundledInstalled ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={isUninstalling}
                    onClick={() => void handleUninstallBundled()}
                    className="h-7 px-2 text-xs text-destructive hover:bg-destructive/10"
                  >
                    {isUninstalling ? (
                      <Spinner className="size-3 mr-1" />
                    ) : (
                      <Trash2Icon className="size-3 mr-1" />
                    )}
                    <span>Uninstall</span>
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="default"
                    disabled={isInstalling}
                    onClick={() => void handleInstallBundled()}
                    className="h-7 text-xs gap-1"
                  >
                    {isInstalling ? (
                      <Spinner className="size-3" />
                    ) : (
                      <DownloadIcon className="size-3" />
                    )}
                    <span>Install Bundled Chrome</span>
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* Browser 2: System / Custom Google Chrome */}
          <div
            className={cn(
              "relative flex flex-col justify-between gap-4 rounded-xl border p-4 transition-all shadow-xs",
              state.customEnabled
                ? "border-amber-500/40 bg-amber-500/[0.03] ring-1 ring-amber-500/20"
                : "border-border/60 bg-card opacity-70",
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <LaptopIcon className="size-4.5 text-amber-600 dark:text-amber-400" />
                  <span className="font-semibold text-sm">System / Custom Chrome</span>
                  <Badge
                    variant="outline"
                    className="text-[10px] text-amber-600 dark:text-amber-400 border-amber-500/30 bg-amber-500/5"
                  >
                    User PC / VPS Chrome
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Aapke system ya VPS me pehle se install shuda Google Chrome ya Chromium. Aap khud
                  bhi use kar sakte hain aur agent bhi!
                </p>
              </div>

              {/* Checkbox / Switch toggle */}
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs font-medium text-muted-foreground hidden sm:inline">
                  {state.customEnabled ? "Active" : "Disabled"}
                </span>
                <Switch
                  checked={state.customEnabled}
                  onCheckedChange={() => void handleToggleCustom()}
                  aria-label="Toggle Custom Chrome"
                />
              </div>
            </div>

            {/* Path Input & Auto Detect */}
            <div className="space-y-2 border-t pt-3">
              <label className="text-[11px] font-medium text-muted-foreground">
                Executable Path on your PC:
              </label>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Input
                  value={inputCustomPath}
                  onChange={(e) => setInputCustomPath(e.target.value)}
                  placeholder="/usr/bin/google-chrome"
                  className="h-8 font-mono text-xs flex-1"
                />

                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={isDetecting}
                    onClick={() => void handleAutoDetect()}
                    className="h-8 text-xs gap-1"
                    title="System me Chrome detect karein"
                  >
                    {isDetecting ? (
                      <Spinner className="size-3" />
                    ) : (
                      <SearchIcon className="size-3" />
                    )}
                    <span>Auto-Detect</span>
                  </Button>

                  <Button
                    size="sm"
                    variant="default"
                    disabled={isSavingPath || !inputCustomPath.trim()}
                    onClick={() => void handleSaveCustomPath()}
                    className="h-8 text-xs gap-1"
                  >
                    {isSavingPath ? (
                      <Spinner className="size-3" />
                    ) : (
                      <CheckIcon className="size-3" />
                    )}
                    <span>Save & Enable</span>
                  </Button>
                </div>
              </div>

              {state.customInstalled && (
                <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium pt-1">
                  ✓ Google Chrome aapke system par available hai (`{state.customPath}`).
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </SettingsPageContainer>
  );
}
