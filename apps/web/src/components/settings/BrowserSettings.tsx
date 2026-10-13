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

  // Probe both browsers on host
  const checkBrowsers = useCallback(async () => {
    setState((prev) => ({ ...prev, checking: true }));
    try {
      const command = `
        ROOT_DIR="$(git rev-parse --show-toplevel 2>/dev/null || dirname "$PWD")"
        ENV_FILE="$ROOT_DIR/.env"

        # Check bundled chrome
        BUNDLED_EXEC="$(find ~/.t3/tools/chrome-headless-shell/ -type f -name 'chrome-headless-shell' 2>/dev/null | head -n 1)"
        if [ -n "$BUNDLED_EXEC" ] && [ -x "$BUNDLED_EXEC" ]; then
          BUNDLED_VER="$("$BUNDLED_EXEC" --version 2>/dev/null || echo "Unknown")"
          BUNDLED_RES="FOUND|$BUNDLED_EXEC|$BUNDLED_VER"
        else
          BUNDLED_RES="NOT_FOUND||"
        fi

        # Check custom path in .env
        CUSTOM_ENV="$(grep -E '^T3CODE_BROWSER_EXECUTABLE_PATH=' "$ENV_FILE" 2>/dev/null | cut -d'=' -f2- | tr -d '\"' | tr -d "'" | tr -d ' ')"
        
        # Check bundled disabled flag
        BUNDLED_DIS="$(grep -E '^T3CODE_DISABLE_BUNDLED_BROWSER=' "$ENV_FILE" 2>/dev/null | cut -d'=' -f2- | tr -d '\"' | tr -d "'" | tr -d ' ')"

        # Check detected system chrome
        SYS_CHROME="$(which google-chrome chromium-browser chromium google-chrome-stable 2>/dev/null | head -n 1)"

        # Check bundled chrome disk size
        BUNDLED_SIZE="$(du -sh ~/.t3/tools/chrome-headless-shell 2>/dev/null | awk '{print $1}')"

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
  }, [checkBrowsers]);

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
        title: "Path Saved & Activated",
        description: `Custom browser set to: ${trimmed}`,
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

  // Auto-detect installed Google Chrome
  const handleAutoDetect = async () => {
    setIsDetecting(true);
    try {
      const cmd =
        "which google-chrome chromium-browser chromium google-chrome-stable 2>/dev/null | head -n 1";
      const res = await fetch("/api/terminal/exec", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: cmd }),
      });
      const data = (await res.json()) as { stdout: string };
      const found = data.stdout?.trim();
      if (found) {
        setInputCustomPath(found);
        toastManager.add({
          title: "Browser Found",
          description: `Detected at: ${found}`,
        });
      } else {
        toastManager.add({
          title: "Not Found",
          description: "System PATH me koi Chrome ya Chromium nahi mila.",
        });
      }
    } catch {
      toastManager.add({ title: "Detection failed" });
    } finally {
      setIsDetecting(false);
    }
  };

  // Install bundled headless Chrome
  const handleInstallBundled = async () => {
    setIsInstalling(true);
    try {
      const installCmd = `
        mkdir -p ~/.t3/tools/chrome-headless-shell/linux64/154.0.8037.92
        cd /tmp
        curl -sL "https://storage.googleapis.com/chrome-for-testing-public/154.0.8037.92/linux64/chrome-headless-shell-linux64.zip" -o chrome-headless-shell.zip
        unzip -q -o chrome-headless-shell.zip -d /tmp/chrome-unpacked
        cp -r /tmp/chrome-unpacked/chrome-headless-shell-linux64/* ~/.t3/tools/chrome-headless-shell/linux64/154.0.8037.92/
        chmod +x ~/.t3/tools/chrome-headless-shell/linux64/154.0.8037.92/chrome-headless-shell
        rm -rf /tmp/chrome-headless-shell.zip /tmp/chrome-unpacked
      `;

      const res = await fetch("/api/terminal/exec", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: installCmd, timeoutMs: 180_000 }),
      });

      const data = (await res.json()) as { ok: boolean; stderr?: string };
      if (data.ok) {
        toastManager.add({
          title: "Browser Installed",
          description: "Bundled Headless Chrome is ready to use.",
        });
        await checkBrowsers();
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

  // Uninstall bundled browser
  const handleUninstallBundled = async () => {
    if (!window.confirm("Bundled headless browser ko delete karna chahte hain?")) return;
    setIsUninstalling(true);
    try {
      await fetch("/api/terminal/exec", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: "rm -rf ~/.t3/tools/chrome-headless-shell" }),
      });
      toastManager.add({ title: "Browser Removed", description: "Bundled Chrome deleted." });
      await checkBrowsers();
    } catch (err) {
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
    } catch {
      toastManager.add({ title: "Reset failed" });
    }
  };

  const bothActive = state.bundledEnabled && state.customEnabled;

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
                AI agents aur web app preview ke liye browsers ko manage karein.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => void checkBrowsers()}
              disabled={state.checking}
              className="h-8 gap-1.5 text-xs"
            >
              <RefreshIcon refreshing={state.checking} />
              <span>Rescan</span>
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

        {/* Live Active Status Summary */}
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

        {/* The 2 Browsers Cards (Both can be active at the same time!) */}
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
                  T3 Code ka official Chrome binary jo <code>~/.t3/tools/</code> me rehta hai. AI
                  agents ke automated previews ke liye best hai.
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
