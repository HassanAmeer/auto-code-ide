import type { TerminalExecResult, TerminalAccessKey } from "./terminalTypes";
import { resolvePrimaryEnvironmentHttpUrl } from "../../../environments/primary";

export async function executeTerminalCommand(
  command: string,
  cwd: string = "/",
  timeoutMs: number = 120_000,
): Promise<TerminalExecResult> {
  const startTime = Date.now();
  try {
    const response = await fetch(resolvePrimaryEnvironmentHttpUrl("/api/terminal/exec"), {
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
 * Intelligent prompt-to-command translator for natural language (Urdu & English)
 */
export function translatePromptToBashCommand(
  prompt: string,
  cwd: string = "/",
  activeKeys: TerminalAccessKey[] = [],
): string {
  const p = prompt.trim().toLowerCase();

  // If active keys exist, see if prompt asks to connect, ping, or execute on one of them
  const sshOrServerKey = activeKeys.find((k) => k.type === "ssh" || k.type === "server");
  const apiKey = activeKeys.find((k) => k.type === "api");
  const targetedKey = activeKeys.find((k) => k.name && p.includes(k.name.toLowerCase()));
  const effectiveKey = targetedKey ?? sshOrServerKey;

  // Remote SSH connection requests (e.g. "connect to server", "ssh karo", "login to vps", or remote command execution)
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

  // Remote command execution on targeted server (e.g. "vps par disk check karo", "server disk space")
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

  // If already a shell command, return directly
  if (
    p.startsWith("ls") ||
    p.startsWith("cd ") ||
    p.startsWith("df") ||
    p.startsWith("free") ||
    p.startsWith("git ") ||
    p.startsWith("npm ") ||
    p.startsWith("docker ") ||
    p.startsWith("pm2 ") ||
    p.startsWith("curl ") ||
    p.startsWith("cat ") ||
    p.startsWith("grep ") ||
    p.startsWith("tail ") ||
    p.startsWith("systemctl ") ||
    p.startsWith("ps ") ||
    p.startsWith("top") ||
    p.startsWith("htop") ||
    p.startsWith("ss ") ||
    p.startsWith("netstat") ||
    p.includes("|") ||
    p.includes(">")
  ) {
    return prompt.trim();
  }

  // Disk space
  if (
    p.includes("disk") ||
    p.includes("storage") ||
    p.includes("space") ||
    p.includes("hard drive")
  ) {
    return "df -h";
  }

  // Memory / RAM
  if (p.includes("ram") || p.includes("memory") || p.includes("free memory")) {
    return "free -h || free -m";
  }

  // CPU / Load / Uptime
  if (p.includes("cpu") || p.includes("load") || p.includes("uptime") || p.includes("specs")) {
    return "uptime && lscpu 2>/dev/null | head -n 15 || cat /proc/cpuinfo | grep 'model name' | head -n 2";
  }

  // Ports / Listening services
  if (p.includes("port") && (p.includes("kill") || p.includes("stop") || p.includes("free"))) {
    const portMatch = p.match(/\b\d{2,5}\b/);
    if (portMatch) {
      return `fuser -k ${portMatch[0]}/tcp 2>/dev/null || lsof -ti:${portMatch[0]} | xargs kill -9 2>/dev/null && echo "Freed port ${portMatch[0]}"`;
    }
  }
  if (p.includes("port") || p.includes("listening") || p.includes("network listen")) {
    return "ss -tulpn 2>/dev/null || netstat -tulpn 2>/dev/null || lsof -i -P -n | grep LISTEN";
  }

  // Processes / High RAM / High CPU
  if (
    p.includes("process") ||
    p.includes("top process") ||
    p.includes("high ram") ||
    p.includes("heavy")
  ) {
    return "ps aux --sort=-%mem | head -n 15";
  }

  // PM2
  if (p.includes("pm2")) {
    if (p.includes("restart")) return "pm2 restart all";
    if (p.includes("log")) return "pm2 logs --lines 50 --nostream";
    return "pm2 status";
  }

  // Docker
  if (p.includes("docker")) {
    if (p.includes("stat")) return "docker stats --no-stream";
    if (p.includes("container") || p.includes("run") || p.includes("ps")) return "docker ps -a";
    if (p.includes("image")) return "docker images";
    return "docker ps -a";
  }

  // Git
  if (p.includes("git") || p.includes("branch") || p.includes("commit") || p.includes("changes")) {
    return "git status && git log -n 5 --oneline";
  }

  // Files / Directory / Largest files
  if (p.includes("largest") || p.includes("big file") || p.includes("heavy file")) {
    return `du -ah ${cwd} 2>/dev/null | sort -rh | head -n 12`;
  }
  if (
    p.includes("list file") ||
    p.includes("show file") ||
    p.includes("directory") ||
    p.includes("files")
  ) {
    return "ls -la";
  }

  // System logs / error logs
  if (p.includes("log") || p.includes("error") || p.includes("journal")) {
    return "journalctl -p 3 -xb --no-pager -n 30 2>/dev/null || dmesg -T | tail -n 25";
  }

  // IP / Network
  if (p.includes("ip") || p.includes("network") || p.includes("internet")) {
    return "ip -brief address show || ifconfig 2>/dev/null || curl -s ifconfig.me";
  }

  // Default fallback: return prompt trimmed
  return prompt.trim();
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
