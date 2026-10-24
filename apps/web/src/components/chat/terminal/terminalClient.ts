import type { TerminalExecResult, TerminalAccessKey } from "./terminalTypes";
import { resolvePrimaryEnvironmentHttpUrl } from "../../../environments/primary";

export interface TerminalStreamCallbacks {
  onChunk?: (chunk: string, type: "stdout" | "stderr") => void;
  onStderr?: (stderr: string) => void;
  onExit?: (exitCode: number, durationMs: number) => void;
  onError?: (error: string) => void;
}

export async function executeTerminalCommand(
  command: string,
  cwd: string = "/",
  timeoutMs: number = 120_000,
): Promise<TerminalExecResult> {
  const startTime = Date.now();
  try {
    let url = "/api/terminal/exec";
    if (typeof window === "undefined") {
      try {
        url = resolvePrimaryEnvironmentHttpUrl("/api/terminal/exec");
      } catch {
        url = "/api/terminal/exec";
      }
    }

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        command,
        cwd,
        timeoutMs,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        ok: false,
        command,
        cwd,
        stdout: "",
        stderr: errorText || `HTTP ${response.status}: ${response.statusText}`,
        exitCode: response.status,
        durationMs: Date.now() - startTime,
        error: errorText,
      };
    }

    const data = (await response.json()) as TerminalExecResult;
    return data;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      command,
      cwd,
      stdout: "",
      stderr: `Network/Fetch error: ${message}`,
      exitCode: 1,
      durationMs: Date.now() - startTime,
      error: message,
    };
  }
}

/**
 * Executes a terminal command with live streaming output (Server-Sent Events)
 * and support for active cancellation/kill.
 */
export async function executeTerminalCommandStream(
  executionId: string,
  command: string,
  cwd: string = "/",
  callbacks?: TerminalStreamCallbacks,
  timeoutMs: number = 180_000,
): Promise<TerminalExecResult> {
  const startTime = Date.now();
  let stdoutAccum = "";
  let stderrAccum = "";
  let finalExitCode = 0;

  // Pre-check for interactive programs that require full TTY
  const firstWord = command.trim().split(/\s+/)[0]?.toLowerCase() || "";
  if (["nano", "vi", "vim", "htop", "less", "more", "man"].includes(firstWord)) {
    const warningMsg = `[Notice: '${firstWord}' is an interactive TTY program. It cannot receive keyboard input here. Use the Kill button (Ctrl+C) to terminate.]\n`;
    callbacks?.onStderr?.(warningMsg);
    stderrAccum += warningMsg;
  }

  try {
    let streamUrl = "/api/terminal/stream";
    if (typeof window === "undefined") {
      try {
        streamUrl = resolvePrimaryEnvironmentHttpUrl("/api/terminal/stream");
      } catch {
        streamUrl = "/api/terminal/stream";
      }
    }

    const response = await fetch(streamUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        executionId,
        command,
        cwd,
        timeoutMs,
      }),
    });

    if (!response.ok || !response.body) {
      const errorText = await response.text();
      const failMsg = errorText || `HTTP ${response.status}: ${response.statusText}`;
      callbacks?.onError?.(failMsg);
      return {
        ok: false,
        command,
        cwd,
        stdout: "",
        stderr: failMsg,
        exitCode: response.status || 1,
        durationMs: Date.now() - startTime,
        error: failMsg,
      };
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const jsonStr = trimmed.slice(5).trim();
        if (!jsonStr) continue;

        try {
          const parsed = JSON.parse(jsonStr) as {
            type: "stdout" | "stderr" | "exit" | "error";
            data?: string;
            exitCode?: number;
            durationMs?: number;
          };

          if (parsed.type === "stdout" && parsed.data) {
            stdoutAccum += parsed.data;
            callbacks?.onChunk?.(parsed.data, "stdout");
          } else if (parsed.type === "stderr" && parsed.data) {
            stderrAccum += parsed.data;
            callbacks?.onChunk?.(parsed.data, "stderr");
          } else if (parsed.type === "exit") {
            finalExitCode = typeof parsed.exitCode === "number" ? parsed.exitCode : 0;
            callbacks?.onExit?.(finalExitCode, parsed.durationMs ?? Date.now() - startTime);
          } else if (parsed.type === "error" && parsed.data) {
            stderrAccum += (stderrAccum ? "\n" : "") + parsed.data;
            callbacks?.onError?.(parsed.data);
          }
        } catch {
          // ignore malformed SSE line
        }
      }
    }

    const durationMs = Date.now() - startTime;
    return {
      ok: finalExitCode === 0,
      command,
      cwd,
      stdout: stdoutAccum,
      stderr: stderrAccum,
      exitCode: finalExitCode,
      durationMs,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    callbacks?.onError?.(message);
    return {
      ok: false,
      command,
      cwd,
      stdout: stdoutAccum,
      stderr: stderrAccum + (stderrAccum ? "\n" : "") + `Stream error: ${message}`,
      exitCode: 1,
      durationMs: Date.now() - startTime,
      error: message,
    };
  }
}

/**
 * Signals server to terminate an actively running execution by ID (SIGTERM then SIGKILL)
 */
export async function killTerminalExecution(executionId: string): Promise<boolean> {
  try {
    let killUrl = "/api/terminal/kill";
    if (typeof window === "undefined") {
      try {
        killUrl = resolvePrimaryEnvironmentHttpUrl("/api/terminal/kill");
      } catch {
        killUrl = "/api/terminal/kill";
      }
    }
    const response = await fetch(killUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ executionId }),
    });
    if (!response.ok) return false;
    const data = (await response.json()) as { ok: boolean };
    return Boolean(data.ok);
  } catch {
    return false;
  }
}

export interface CommandSafetyScanResult {
  isDangerous: boolean;
  severity: "critical" | "high" | "medium";
  reason: string;
  matchedPattern: string;
}

/**
 * Safety Guard: Scans commands for catastrophic or destructive patterns
 */
export function scanCommandSafety(command: string): CommandSafetyScanResult | null {
  const cmd = command.trim();

  // 1. Critical: Mass Deletion
  const rmMatch = cmd.match(/\brm\s+-[a-zA-Z]*r[a-zA-Z]*f\s+(\/|\/\*|~|\.\*)/i);
  if (rmMatch) {
    return {
      isDangerous: true,
      severity: "critical",
      reason:
        "Destructive mass file deletion targeting root, home or parent directories (`rm -rf /`)",
      matchedPattern: rmMatch[0],
    };
  }

  // 2. Critical: Raw disk overwrite / partition format
  const diskMatch = cmd.match(/\b(mkfs|dd\s+if=.*of=\/dev|fdisk\s+\/dev|parted\s+\/dev)\b/i);
  if (diskMatch) {
    return {
      isDangerous: true,
      severity: "critical",
      reason: "Direct disk formatting or block device overwrite (`mkfs` / `dd` to raw disk)",
      matchedPattern: diskMatch[0],
    };
  }

  // 3. High: Mass Permission Overwrite
  const chmodMatch = cmd.match(/\bchmod\s+(-R\s+)?(777|000)\s+(\/|\/\*)/i);
  if (chmodMatch) {
    return {
      isDangerous: true,
      severity: "high",
      reason: "Global root permission modification will corrupt system authentication and SSH keys",
      matchedPattern: chmodMatch[0],
    };
  }

  // 4. High: Host Shutdown / Reboot
  const rebootMatch = cmd.match(/\b(shutdown\s+-[rh]\s+now|reboot|poweroff|init\s+[06])\b/i);
  if (rebootMatch) {
    return {
      isDangerous: true,
      severity: "high",
      reason:
        "System shutdown or reboot will terminate all running services and disconnect your session",
      matchedPattern: rebootMatch[0],
    };
  }

  // 5. High: Disabling Remote SSH Access
  const sshDisableMatch = cmd.match(/\bsystemctl\s+(stop|disable)\s+(ssh|sshd)\b/i);
  if (sshDisableMatch) {
    return {
      isDangerous: true,
      severity: "high",
      reason: "Stopping the SSH daemon will lock out remote terminal connections",
      matchedPattern: sshDisableMatch[0],
    };
  }

  // 6. Medium: Database destruction
  const dbMatch = cmd.match(/\b(DROP\s+DATABASE|DROP\s+TABLE|TRUNCATE\s+TABLE)\b/i);
  if (dbMatch) {
    return {
      isDangerous: true,
      severity: "medium",
      reason: "Destructive SQL operation detected (DROP / TRUNCATE)",
      matchedPattern: dbMatch[0],
    };
  }

  return null;
}

export interface FailureDiagnosis {
  cause: string;
  explanation: string;
  suggestedFixCommand?: string | undefined;
  fixLabel?: string | undefined;
}

/**
 * 1-Click "Fix with AI" Auto-Healer:
 * Inspects non-zero exit code output and recommends an exact actionable fix command.
 */
export function diagnoseCommandFailure(
  command: string,
  stderr: string,
  exitCode: number,
  cwd: string = "/",
): FailureDiagnosis {
  const err = (stderr || "").toLowerCase();

  // 1. Port already bound (EADDRINUSE)
  if (err.includes("eaddrinuse") || err.includes("address already in use")) {
    const portMatch = stderr.match(/[:\s](\d{3,5})\b/);
    const port = portMatch ? portMatch[1] : "3000";
    return {
      cause: `Port ${port} is already in use by another process.`,
      explanation: `Another web server or daemon is occupying port ${port}. Free the port to allow your service to bind.`,
      suggestedFixCommand: `fuser -k ${port}/tcp 2>/dev/null || lsof -ti:${port} | xargs kill -9 2>/dev/null && echo "Port ${port} cleared."`,
      fixLabel: `Kill process on port ${port}`,
    };
  }

  // 2. Command not found (code 127)
  if (exitCode === 127 || err.includes("command not found") || err.includes("not found")) {
    const missingCmd = command.trim().split(" ")[0] || "command";
    return {
      cause: `Binary or utility '${missingCmd}' is not installed or not in PATH.`,
      explanation: `The server does not have '${missingCmd}' installed. You can install it via package manager.`,
      suggestedFixCommand: `apt update && apt install -y ${missingCmd} 2>/dev/null || npm i -g ${missingCmd} 2>/dev/null`,
      fixLabel: `Install '${missingCmd}'`,
    };
  }

  // 3. Permission denied (EACCES)
  if (err.includes("permission denied") || err.includes("eacces")) {
    return {
      cause: `Permission denied while accessing file or socket in '${cwd}'.`,
      explanation: `The current user does not have executable or write rights. Elevate permissions or run with sudo.`,
      suggestedFixCommand: `sudo ${command}`,
      fixLabel: `Re-run with 'sudo'`,
    };
  }

  // 4. Git merge conflict or unstaged changes blocking pull
  if (
    err.includes("overwritten by merge") ||
    err.includes("commit your changes or stash them") ||
    err.includes("divergent branches")
  ) {
    return {
      cause: "Git working tree contains uncommitted changes blocking pull/merge.",
      explanation:
        "Local files conflict with incoming remote commits. Safely stash changes and pull cleanly.",
      suggestedFixCommand: "git stash && git pull --rebase && git stash pop",
      fixLabel: "Stash changes & Git pull",
    };
  }

  // 5. Node module missing
  const moduleMatch = stderr.match(/cannot find module '([^']+)'/i);
  if (moduleMatch && moduleMatch[1]) {
    const mod = moduleMatch[1];
    return {
      cause: `Node.js module '${mod}' is missing.`,
      explanation: `Your application failed to load '${mod}'. Installing the package will resolve the import.`,
      suggestedFixCommand: `npm install ${mod}`,
      fixLabel: `npm install ${mod}`,
    };
  }

  // 6. Out of disk space (ENOSPC)
  if (err.includes("no space left on device") || err.includes("enospc")) {
    return {
      cause: "Storage partition is 100% full (ENOSPC).",
      explanation:
        "Log files, old Docker images, or package caches have exhausted available disk blocks.",
      suggestedFixCommand:
        "journalctl --vacuum-time=1d && npm cache clean --force && docker system prune -af 2>/dev/null",
      fixLabel: "Purge system logs & caches",
    };
  }

  // 7. General non-zero exit fallback
  return {
    cause: `Process failed with exit code ${exitCode}.`,
    explanation: `Command did not finish cleanly. Inspect stderr logs above or re-run with verbose flags.`,
    suggestedFixCommand: `${command} --help || man ${command.trim().split(" ")[0]}`,
    fixLabel: "View command help",
  };
}

export interface PromptTranslationContext {
  cwd?: string | undefined;
  scopeMode?: "root" | "project" | undefined;
  projectName?: string | null | undefined;
  projectPath?: string | null | undefined;
  activeKeys?: TerminalAccessKey[] | undefined;
  selectedKeyId?: string | null | undefined;
  notes?: string | null | undefined;
}

/**
 * Intelligent prompt-to-command translator for natural language (Urdu & English)
 * Fully context-aware of selected project, git status, SSH keys, notes, and VPS root.
 */
export function translatePromptToBashCommand(
  prompt: string,
  cwd: string = "/",
  activeKeys: TerminalAccessKey[] = [],
  context?: PromptTranslationContext,
): string {
  const p = prompt.trim().toLowerCase();
  const effectiveCwd = context?.projectPath || cwd || "/";
  const effectiveKeys = context?.activeKeys ?? activeKeys;

  // 1. SSH & Remote Server Targeting
  const sshOrServerKey = effectiveKeys.find((k) => k.type === "ssh" || k.type === "server");
  const apiKey = effectiveKeys.find((k) => k.type === "api");
  const targetedKey = effectiveKeys.find((k) => k.name && p.includes(k.name.toLowerCase()));
  const effectiveKey = targetedKey ?? sshOrServerKey;

  // Remote SSH connection requests (e.g. "connect to server", "ssh karo", "login to vps")
  if (
    effectiveKey &&
    effectiveKey.host &&
    (p.includes("connect") ||
      p.includes("ssh") ||
      p.includes("login") ||
      p.includes("access") ||
      p.includes("remote"))
  ) {
    const portFlag =
      effectiveKey.port && effectiveKey.port !== 22 ? `-p ${effectiveKey.port} ` : "";
    const userPrefix = effectiveKey.user ? `${effectiveKey.user}@` : "";
    const remoteCmdMatch = prompt.match(
      /(?:and check|and run|and execute|run|execute)\s+["']?([^"']+)["']?$/i,
    );
    const remoteCmd = remoteCmdMatch?.[1]?.trim();
    if (remoteCmd) {
      return `ssh -o StrictHostKeyChecking=no ${portFlag}${userPrefix}${effectiveKey.host} "${remoteCmd}"`;
    }
    return `ssh -o StrictHostKeyChecking=no ${portFlag}${userPrefix}${effectiveKey.host}`;
  }

  // Ping / status check for active server key
  if (
    effectiveKey &&
    effectiveKey.host &&
    (p.includes("ping") || p.includes("server status") || p.includes("online check"))
  ) {
    return `ping -c 4 ${effectiveKey.host} || nc -zv -w 3 ${effectiveKey.host} ${effectiveKey.port || 22}`;
  }

  // Remote command execution on targeted server
  if (
    effectiveKey &&
    effectiveKey.host &&
    (p.includes("on server") ||
      p.includes("vps par") ||
      p.includes("remote") ||
      p.includes("server per"))
  ) {
    const portFlag =
      effectiveKey.port && effectiveKey.port !== 22 ? `-p ${effectiveKey.port} ` : "";
    const userPrefix = effectiveKey.user ? `${effectiveKey.user}@` : "";
    let subCommand = "df -h && free -h";
    if (p.includes("disk") || p.includes("storage")) subCommand = "df -h";
    if (p.includes("ram") || p.includes("memory")) subCommand = "free -h";
    if (p.includes("docker")) subCommand = "docker ps";
    if (p.includes("pm2")) subCommand = "pm2 status";
    return `ssh -o StrictHostKeyChecking=no ${portFlag}${userPrefix}${effectiveKey.host} "${subCommand}"`;
  }

  // API curl request using active API key/token
  if (
    apiKey &&
    apiKey.secret &&
    (p.includes("api") || p.includes("token test") || p.includes("curl"))
  ) {
    const targetHost = apiKey.host || "api.example.com";
    return `curl -s -H "Authorization: Bearer ${apiKey.secret}" "https://${targetHost}"`;
  }

  // 2. SSH Keys & Notes Context Queries
  if (
    p.includes("ssh key") ||
    p.includes("keys dekho") ||
    p.includes("keys list") ||
    p.includes("active keys") ||
    p.includes("server list") ||
    (p.includes("key") && (p.includes("kya") || p.includes("show") || p.includes("list")))
  ) {
    if (effectiveKeys.length === 0) {
      return `echo "No SSH or API access keys are currently stored. Click '+ SSH' in header to add one."`;
    }
    const keySummaries = effectiveKeys
      .map(
        (k, i) =>
          `[${i + 1}] ${k.name} (${k.type.toUpperCase()}) -> ${k.user || "root"}@${k.host || "localhost"}:${k.port || 22}${k.notes ? ` (Notes: ${k.notes.replace(/["\n]/g, " ")})` : ""}`,
      )
      .join("\n");
    return `echo "${keySummaries}"`;
  }

  if (
    p.includes("notes") ||
    p.includes("note dekho") ||
    p.includes("notes check") ||
    p.includes("notes kya")
  ) {
    const notesWithKeys = effectiveKeys.filter((k) => k.notes);
    let out = "=== Stored Notes & Credentials ===\n";
    if (notesWithKeys.length > 0) {
      out += notesWithKeys.map((k) => `• ${k.name}: ${k.notes?.replace(/["\n]/g, " ")}`).join("\n");
    } else {
      out += "No notes attached to current SSH keys.";
    }
    return `echo "${out}"`;
  }

  // 3. Git Inspection: Last Commit / Previous Changes / What Changed / Errors
  // (e.g. "last changes check karo", "last commit kya thi", "pichli commit mein kya galti hui", "what changed")
  if (
    p.includes("last change") ||
    p.includes("pichli commit") ||
    p.includes("last commit") ||
    p.includes("kya galti") ||
    p.includes("pichla code") ||
    p.includes("previous commit") ||
    p.includes("kya change hua") ||
    p.includes("what changed") ||
    p.includes("last modification")
  ) {
    return "git log -1 -p --stat";
  }

  // Git uncommitted changes / what is edited currently
  if (
    p.includes("git status") ||
    p.includes("changes dekho") ||
    p.includes("kya edit") ||
    p.includes("uncommitted") ||
    p.includes("current change") ||
    p.includes("status check karo")
  ) {
    return "git status --short && echo '--- RECENT DIFF STATS ---' && git diff --stat";
  }

  // Full Git diff
  if (
    p.includes("git diff") ||
    p.includes("code diff") ||
    p.includes("diff dekho") ||
    p.includes("show diff")
  ) {
    return "git diff";
  }

  // Push to GitHub (e.g. "github per push karo", "push to github", "git push")
  if (
    p.includes("push") &&
    (p.includes("git") || p.includes("github") || p.includes("karo") || p.includes("code"))
  ) {
    return `git status --short && git add -A && git commit -m "feat: updates via AI Terminal [$(date +'%Y-%m-%d %H:%M:%S')]" && git push origin HEAD`;
  }

  // Pull from GitHub
  if (
    p.includes("pull") &&
    (p.includes("git") || p.includes("github") || p.includes("karo") || p.includes("code"))
  ) {
    return "git pull";
  }

  // Git commits history / log
  if (
    p.includes("git log") ||
    p.includes("commit history") ||
    p.includes("commits dekho") ||
    p.includes("history check")
  ) {
    return "git log -n 6 --graph --pretty=format:'%Cred%h%Creset -%C(yellow)%d%Creset %s %Cgreen(%cr) %C(bold blue)<%an>%Creset'";
  }

  // Git branches / remote
  if (p.includes("git branch") || p.includes("branches dekho") || p.includes("branch check")) {
    return "git branch -a && git status -sb";
  }
  if (p.includes("remote") && (p.includes("git") || p.includes("repo") || p.includes("origin"))) {
    return "git remote -v && git branch -vv";
  }

  // 4. Project Deployment & Build Pipelines
  // (e.g. "deploy karo", "project deploy karo", "production deploy")
  if (
    p.includes("deploy") ||
    p.includes("production deploy") ||
    p.includes("live karo") ||
    p.includes("deploy project")
  ) {
    return `echo "=== Step 1: Checking Git status ===" && git status --short && echo "=== Step 2: Building project ===" && (pnpm --filter @t3tools/web build || npm run build) && echo "=== Step 3: Restarting autojobs service ===" && systemctl restart autojobs.service && sleep 2 && systemctl is-active autojobs.service && echo "=== Safe Deployment Complete & Active! ==="`;
  }

  // Build commands
  if (
    p.includes("build") &&
    (p.includes("karo") || p.includes("check") || p.includes("run") || p.includes("test"))
  ) {
    return "pnpm --filter @t3tools/web build || npm run build";
  }

  // Package dependencies install
  if (
    p.includes("install") &&
    (p.includes("package") || p.includes("dep") || p.includes("npm") || p.includes("pnpm"))
  ) {
    return "pnpm install || npm install";
  }

  // 5. System Services & VPS Process Management
  // (e.g. "service restart karo", "autojobs status", "service logs dekho", "journalctl")
  if (
    p.includes("restart") &&
    (p.includes("service") || p.includes("autojobs") || p.includes("jobi") || p.includes("server"))
  ) {
    return "systemctl restart autojobs.service && sleep 2 && systemctl is-active autojobs.service && systemctl status autojobs.service --no-pager";
  }

  if (
    p.includes("service status") ||
    p.includes("autojobs status") ||
    p.includes("jobi status") ||
    (p.includes("status") && p.includes("service"))
  ) {
    return "systemctl status autojobs.service --no-pager";
  }

  if (
    p.includes("service log") ||
    p.includes("crash log") ||
    p.includes("error log") ||
    p.includes("journalctl") ||
    (p.includes("logs") && (p.includes("dekho") || p.includes("check")))
  ) {
    return "journalctl -u autojobs.service -n 50 --no-pager";
  }

  if (p.includes("nginx")) {
    if (p.includes("restart"))
      return "nginx -t && systemctl restart nginx && systemctl status nginx --no-pager";
    return "nginx -t 2>/dev/null && systemctl status nginx --no-pager";
  }

  // 6. Hardware & Resources (Swap, RAM, Disk, CPU, Uptime)
  // (e.g. "swap memory check karo", "ram check karo", "nvme space", "top processes")
  if (p.includes("swap") || p.includes("swap memory") || p.includes("swappiness")) {
    return "free -h && echo '--- SWAP ACTIVE ---' && swapon --show && echo '--- SYSCTL TUNING ---' && sysctl vm.swappiness vm.vfs_cache_pressure";
  }

  if (p.includes("ram") || p.includes("memory") || p.includes("free ram")) {
    return "free -h";
  }

  if (
    p.includes("disk") ||
    p.includes("storage") ||
    p.includes("space") ||
    p.includes("hard drive") ||
    p.includes("nvme")
  ) {
    return "df -h";
  }

  if (
    p.includes("process") ||
    p.includes("top process") ||
    p.includes("high ram") ||
    p.includes("heavy process") ||
    p.includes("ram kaun le raha")
  ) {
    return "ps aux --sort=-%mem | head -n 12";
  }

  if (p.includes("cpu") || p.includes("load") || p.includes("uptime") || p.includes("specs")) {
    return "uptime && lscpu 2>/dev/null | head -n 15 || cat /proc/cpuinfo | grep 'model name' | head -n 2";
  }

  // 7. Ports & Networking
  if (p.includes("port") && (p.includes("kill") || p.includes("stop") || p.includes("free"))) {
    const portMatch = p.match(/\b\d{2,5}\b/);
    if (portMatch) {
      return `fuser -k ${portMatch[0]}/tcp 2>/dev/null || lsof -ti:${portMatch[0]} | xargs kill -9 2>/dev/null && echo "Freed port ${portMatch[0]}"`;
    }
  }
  if (p.includes("port") || p.includes("listening") || p.includes("network listen")) {
    return "ss -tulpn 2>/dev/null || netstat -tulpn 2>/dev/null || lsof -i -P -n | grep LISTEN";
  }
  if (p.includes("ip") || p.includes("network") || p.includes("internet")) {
    return "ip -brief address show || ifconfig 2>/dev/null || curl -s ifconfig.me";
  }

  // 8. Files / Directory / Search
  if (
    (p.includes("total") || p.includes("count") || p.includes("kitni") || p.includes("kitne")) &&
    (p.includes("file") || p.includes("fiel") || p.includes("folder") || p.includes("item"))
  ) {
    return `echo "=== Total Files Count ===" && find . -maxdepth 2 -not -path '*/.*' | wc -l && echo "=== Directory Listing (Top 20) ===" && ls -lah | head -n 22`;
  }
  if (p.includes("largest") || p.includes("big file") || p.includes("heavy file")) {
    return `du -ah ${effectiveCwd} 2>/dev/null | sort -rh | head -n 12`;
  }
  if (
    p.includes("list file") ||
    p.includes("show file") ||
    p.includes("directory") ||
    p.includes("files dekho") ||
    p.includes("files bata") ||
    p.includes("fiels bata")
  ) {
    return "ls -lah --color=auto";
  }
  // 9. Codebase Research & File Search
  if (p.includes("find file") || p.includes("file dhundo") || p.includes("locate file")) {
    const fileMatch = prompt.match(/(?:find file|file dhundo|locate file)\s+["']?([^"']+)["']?/i);
    const filename = fileMatch?.[1]?.replace(/karo|mein|ko|hai/gi, "").trim();
    if (filename) {
      return `find . -not -path '*/.*' -not -path '*/node_modules/*' -iname "*${filename}*" | head -n 25`;
    }
  }

  if (
    p.includes("search") ||
    p.includes("find in code") ||
    p.includes("code search") ||
    p.includes("dhundo") ||
    p.includes("kahan hai") ||
    p.includes("research")
  ) {
    const match = prompt.match(
      /(?:search for|search|research|dhundo|find|check)\s+["']?([^"']+)["']?/i,
    );
    const query = match?.[1]?.replace(/karo|mein|ko|hai|codebase|code/gi, "").trim();
    if (query && query.length > 1) {
      return `echo "=== Searching for '${query}' in codebase ===" && grep -rnI --exclude-dir={node_modules,.git,dist,build,.next} "${query}" . 2>/dev/null | head -n 30`;
    }
    return `git status --short && ls -la`;
  }

  if (
    p.includes("database") ||
    p.includes("db inspect") ||
    p.includes("db check") ||
    p.includes("tables dekho")
  ) {
    return `ls -lah *db* *sqlite* prisma/ migrations/ 2>/dev/null || echo "Checking database files in $(pwd)..." && find . -maxdepth 3 -name "*.sqlite" -o -name "*.db" 2>/dev/null`;
  }

  if (p.includes("whoami") || p.includes("current user") || p.includes("user kaun")) {
    return "whoami && id";
  }
  if (p.includes("pwd") || p.includes("current path") || p.includes("path kya")) {
    return "pwd";
  }
  if (p.includes("package.json") || p.includes("dependencies dekho")) {
    return "cat package.json 2>/dev/null | head -n 40 || ls -la";
  }

  // If already a shell command, return directly
  if (
    p.startsWith("ls") ||
    p.startsWith("cd ") ||
    p.startsWith("df") ||
    p.startsWith("free") ||
    p.startsWith("git ") ||
    p.startsWith("npm ") ||
    p.startsWith("pnpm ") ||
    p.startsWith("docker ") ||
    p.startsWith("pm2 ") ||
    p.startsWith("curl ") ||
    p.startsWith("cat ") ||
    p.startsWith("grep ") ||
    p.startsWith("tail ") ||
    p.startsWith("head ") ||
    p.startsWith("systemctl ") ||
    p.startsWith("journalctl ") ||
    p.startsWith("ps ") ||
    p.startsWith("top") ||
    p.startsWith("htop") ||
    p.startsWith("ss ") ||
    p.startsWith("netstat") ||
    p.includes("|") ||
    p.includes(">") ||
    p.includes("&&")
  ) {
    return prompt.trim();
  }

  // Default fallback: return prompt trimmed
  return prompt.trim();
}

/**
 * Intelligent helper to detect whether an input string is a natural language command
 * (in Roman Urdu or English) vs a direct raw terminal shell command.
 */
export function isNaturalLanguagePrompt(input: string): boolean {
  const trimmed = input.trim();
  if (!trimmed) return false;

  // Obvious shell command indicators: starts with binary + flags or contains shell operators
  if (/^[a-zA-Z0-9_\-\.\/]+\s+-[a-zA-Z0-9]/.test(trimmed)) return false;
  if (/[|&;><]/.test(trimmed)) return false;

  // Single word known unix commands
  const firstWord = trimmed.split(/\s+/)[0]?.toLowerCase();
  const knownBinaries = new Set([
    "ls",
    "cd",
    "pwd",
    "cat",
    "mkdir",
    "rm",
    "cp",
    "mv",
    "touch",
    "chmod",
    "chown",
    "grep",
    "find",
    "tail",
    "head",
    "less",
    "more",
    "df",
    "free",
    "top",
    "htop",
    "ps",
    "kill",
    "curl",
    "wget",
    "ssh",
    "scp",
    "ping",
    "systemctl",
    "journalctl",
    "docker",
    "docker-compose",
    "pm2",
    "npm",
    "pnpm",
    "yarn",
    "bun",
    "python",
    "node",
  ]);

  // If it's literally just the binary name (e.g. "free", "top", "uptime", "pwd")
  if (
    firstWord &&
    knownBinaries.has(firstWord) &&
    trimmed.split(/\s+/).length <= 2 &&
    !trimmed.includes("karo") &&
    !trimmed.includes("dekho")
  ) {
    return false;
  }

  const p = trimmed.toLowerCase();

  // Roman Urdu and English natural language keywords
  const naturalKeywords = [
    "karo",
    "dekho",
    "batao",
    "dhundo",
    "chalao",
    "kya",
    "hai",
    "hain",
    "kis",
    "kaun",
    "kaise",
    "galti",
    "pichli",
    "last",
    "check",
    "dikhao",
    "theek",
    "how",
    "what",
    "why",
    "where",
    "show",
    "list",
    "find",
    "restart",
    "deploy",
    "status",
    "push",
    "pull",
    "commit",
    "changes",
    "fix",
    "memory",
    "swap",
    "notes",
    "server",
    "keys",
    "error",
    "logs",
    "mujhe",
    "mujhy",
    "fiels",
    "bataen",
    "hen",
    "kitni",
    "kitne",
    "total",
    "count",
  ];

  for (const kw of naturalKeywords) {
    if (new RegExp(`\\b${kw}\\b`, "i").test(p)) {
      return true;
    }
  }

  // If multi-word without shell syntax and not starting with a known binary, treat as natural prompt
  if (trimmed.split(/\s+/).length >= 3 && (!firstWord || !knownBinaries.has(firstWord))) {
    return true;
  }

  return false;
}

/**
 * Generates an intelligent, context-aware AI explanation and next steps
 * based on the command executed, output, and exit status.
 */
export function generateAiExplanation(
  command: string,
  result: TerminalExecResult,
): { explanation: string; nextSteps: string[] } {
  const trimmedCmd = command.trim();
  const isSuccess = result.exitCode === 0;

  if (trimmedCmd.startsWith("ls") || trimmedCmd === "dir") {
    if (isSuccess) {
      const lineCount = result.stdout.trim().split("\n").filter(Boolean).length;
      return {
        explanation: `Directory listing completed in \`${result.cwd}\`. Retrieved ${lineCount} items with file permissions and ownership.`,
        nextSteps: ["cd <directory>", "cat <filename>", "stat <file>"],
      };
    }
  }

  if (trimmedCmd.startsWith("df")) {
    if (isSuccess) {
      return {
        explanation: `Disk filesystem usage checked successfully. Root filesystem (\`/\`) and mounted storage pools are operating with active space allocations.`,
        nextSteps: ["du -sh *", "lsblk", "find / -type f -size +100M 2>/dev/null"],
      };
    }
  }

  if (
    trimmedCmd.startsWith("free") ||
    trimmedCmd.startsWith("top") ||
    trimmedCmd.startsWith("htop")
  ) {
    if (isSuccess) {
      return {
        explanation: `System memory (RAM & Swap) checked. Server buffers and cache are actively allocated.`,
        nextSteps: ["vmstat 1 5", "ps aux --sort=-%mem | head -n 10", "uptime"],
      };
    }
  }

  if (trimmedCmd.startsWith("git")) {
    if (isSuccess) {
      return {
        explanation: `Git command \`${trimmedCmd}\` executed successfully. Working tree and repository state updated.`,
        nextSteps: ["git status", "git log -n 5 --oneline", "git diff"],
      };
    }
  }

  if (
    trimmedCmd.startsWith("pm2") ||
    trimmedCmd.startsWith("systemctl") ||
    trimmedCmd.startsWith("service")
  ) {
    if (isSuccess) {
      return {
        explanation: `Service/process management command executed successfully. Active daemon states updated.`,
        nextSteps: ["pm2 status", "journalctl -xe --no-pager -n 20", "systemctl status"],
      };
    }
  }

  if (trimmedCmd.startsWith("docker")) {
    if (isSuccess) {
      return {
        explanation: `Docker container engine command executed cleanly. Container and image state refreshed.`,
        nextSteps: ["docker ps -a", "docker stats --no-stream", "docker logs --tail 50"],
      };
    }
  }

  if (trimmedCmd.startsWith("ssh")) {
    return {
      explanation: isSuccess
        ? `SSH connection / remote command executed successfully on target host.`
        : `SSH connection failed or terminated with code ${result.exitCode}. Check credentials and network route.`,
      nextSteps: ["ssh -v", "ping -c 3 host", "curl -I"],
    };
  }

  if (
    trimmedCmd.startsWith("apt") ||
    trimmedCmd.startsWith("npm") ||
    trimmedCmd.startsWith("pip")
  ) {
    return {
      explanation: isSuccess
        ? `Package manager operation (\`${trimmedCmd.split(" ")[0]}\`) completed successfully with exit code 0.`
        : `Package manager operation encountered an error (${result.exitCode}). Check package names and repository locks.`,
      nextSteps: isSuccess
        ? ["apt list --upgradable", "npm list --depth=0"]
        : ["sudo apt update --fix-missing", "npm cache clean --force"],
    };
  }

  if (isSuccess) {
    return {
      explanation: `Command \`${trimmedCmd}\` executed with exit status 0 (Success) in \`${result.cwd}\` (${result.durationMs}ms). Output captured above.`,
      nextSteps: ["echo $?", "pwd"],
    };
  } else {
    return {
      explanation: `Command \`${trimmedCmd}\` exited with non-zero status code ${result.exitCode} (${result.durationMs}ms). Output logged to stderr above.`,
      nextSteps: [`man ${trimmedCmd.split(" ")[0]}`, `${trimmedCmd} --help`],
    };
  }
}
