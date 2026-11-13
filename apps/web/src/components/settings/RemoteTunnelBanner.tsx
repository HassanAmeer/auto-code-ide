import { CheckIcon, CopyIcon, InfoIcon, TerminalIcon } from "lucide-react";
import { useSyncExternalStore, useState } from "react";

import { writeTextToClipboard } from "../../hooks/useCopyToClipboard";
import { detectSshHost, sshTunnelCommand } from "./remoteTunnel";

/**
 * Remote console → BotCode SSH tunnel banner. The banner shows the concrete
 * ssh command (the environment's own loopback port) with a working copy
 * button, mirroring cheaprouter's permanent tunnel banner. The port comes
 * from the Antigravity sign-in redirect while one is active, otherwise from
 * the environment's tunnel-config endpoint.
 */

type TunnelConfig = { readonly port: number } | null;
const listeners = new Set<() => void>();
let tunnelConfigCache: TunnelConfig | undefined;
let tunnelConfigFetchStarted = false;

function fetchTunnelConfig(): void {
  if (tunnelConfigFetchStarted) return;
  tunnelConfigFetchStarted = true;
  void fetch("/api/antigravity-connect/tunnel-config")
    .then((response) => (response.ok ? response.json() : null))
    .then((body) => {
      const port =
        body && typeof body === "object" && typeof (body as { port?: unknown }).port === "number"
          ? (body as { port: number }).port
          : null;
      tunnelConfigCache = port ? { port } : null;
      for (const listener of listeners) listener();
    })
    .catch(() => {
      tunnelConfigCache = null;
      for (const listener of listeners) listener();
    });
}

const subscribe = (listener: () => void) => {
  fetchTunnelConfig();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
const getSnapshot = () => tunnelConfigCache ?? null;
const getServerSnapshot = () => null;

export function RemoteTunnelBanner({
  port,
  host,
}: {
  readonly port: number | null;
  readonly host?: string | undefined;
}) {
  const [copied, setCopied] = useState(false);
  const fetched = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const resolvedPort = port ?? fetched?.port ?? null;
  const sshHost = host ?? detectSshHost();
  const command =
    resolvedPort !== null
      ? sshTunnelCommand(resolvedPort, sshHost)
      : `ssh -L <port>:127.0.0.1:<port> root@${sshHost}`;

  return (
    <div className="relative my-2 overflow-hidden rounded-xl border border-amber-500/40 bg-gradient-to-r from-amber-500/15 via-orange-500/10 to-amber-500/15 p-3.5 shadow-sm">
      <div className="relative z-10 flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <TerminalIcon className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <span className="text-[11px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
            Remote VPS Browser Login Tunnel (Zero Error Auth)
          </span>
        </div>

        <p className="text-xs leading-relaxed text-muted-foreground">
          Agar aap remote VPS par hain aur Google/OAuth ko real authenticate karna chahte hain, to
          apne us laptop ke terminal mein jahan browser khula hai yeh command chalayein taake Google
          ka loopback bina kisi error ke sign-in tak pahunch jaye:
        </p>

        <div className="flex items-center justify-between gap-2 rounded-lg border border-border/80 bg-zinc-100 px-3 py-2 dark:bg-zinc-900/90">
          <code className="select-all break-all font-mono text-xs text-foreground">{command}</code>
          <button
            type="button"
            disabled={resolvedPort === null}
            onClick={() => {
              if (resolvedPort === null) return;
              void writeTextToClipboard(command, "SSH tunnel command")
                .then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2500);
                })
                .catch(() => setCopied(false));
            }}
            className={`flex shrink-0 items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium transition-all disabled:cursor-not-allowed disabled:opacity-40 ${
              copied
                ? "border-emerald-500/30 bg-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                : "border-transparent bg-zinc-200/80 text-muted-foreground hover:bg-zinc-300 hover:text-foreground dark:bg-zinc-800 dark:hover:bg-zinc-700"
            }`}
            title={
              resolvedPort === null ? "Sign in start hone ke baad asli port aayega" : "Copy command"
            }
            aria-label="Copy SSH tunnel command"
          >
            {copied ? <CheckIcon className="size-3.5" /> : <CopyIcon className="size-3.5" />}
            <span>{copied ? "Copied!" : "Copy"}</span>
          </button>
        </div>

        <div className="flex items-center gap-1.5 text-[11px] text-amber-700/90 dark:text-amber-400/90">
          <InfoIcon className="size-3 shrink-0" />
          <span>
            Command chalane ke baad <strong>Open browser</strong> par click karein — Google sign-in
            ke baad redirect khud tunnel ke zariye sign-in tak pohanch kar login complete kar degi.
            URL paste karne ki zaroorat nahi padegi.
          </span>
        </div>
      </div>
    </div>
  );
}
