import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import type { EnvironmentId, ProviderInstanceId, ServerProvider } from "@t3tools/contracts";
import { useRef, useState } from "react";
import { CheckCircle2Icon } from "lucide-react";

import { ensureLocalApi } from "../../localApi";
import { useAtomCommand } from "../../state/use-atom-command";
import { serverEnvironment } from "../../state/server";
import { Button } from "../ui/button";
import { SettingsRow } from "./settingsLayout";
import { RemoteTunnelBanner } from "./RemoteTunnelBanner";
import { loopbackRedirectPort } from "./remoteTunnel";

type ConnectPhase = "idle" | "starting" | "waiting" | "failed";

/**
 * Cheaprouter-style permanent connect for Antigravity.
 *
 * The ACP agent normally runs its own Google sign-in on an ephemeral loopback
 * port (one SSH tunnel per sign-in on a remote VPS). This flow instead has the
 * server perform the exchange itself against a redirect on the app's OWN
 * loopback port, so one permanent `ssh -L` tunnel covers every future connect.
 */
export function AntigravityWebConnect({
  environmentId,
  environmentLabel,
  instanceId,
  provider,
  readOnly,
}: {
  readonly environmentId: EnvironmentId;
  readonly environmentLabel: string;
  readonly instanceId: ProviderInstanceId;
  readonly provider: ServerProvider;
  readonly readOnly: boolean;
}) {
  const signedIn = provider.auth.status === "authenticated";
  const signedOut = !signedIn;
  const readyToSignIn = signedOut && provider.enabled && provider.installed;
  const refresh = useAtomCommand(serverEnvironment.refreshProviders, { reportFailure: false });
  const logout = useAtomCommand(serverEnvironment.logoutProviderAuth, { reportFailure: false });
  const [phase, setPhase] = useState<ConnectPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [waitingUrl, setWaitingUrl] = useState<string | null>(null);
  const [pastedInput, setPastedInput] = useState("");
  const [isSubmittingPaste, setIsSubmittingPaste] = useState(false);
  // Generation counter; bumping cancels any in-flight poll loop.
  const generationRef = useRef(0);
  const tunnelPort = loopbackRedirectPort(waitingUrl);

  async function handlePasteSubmit() {
    if (!pastedInput.trim()) return;
    setIsSubmittingPaste(true);
    setError(null);
    try {
      const res = await fetch("/api/antigravity-connect/paste-callback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          callbackUrl: pastedInput.trim(),
          instanceId,
        }),
      });
      const data = (await res.json().catch(() => null)) as {
        ok?: boolean;
        message?: string;
      } | null;
      if (!res.ok || !data?.ok) {
        setError(data?.message ?? "Invalid callback code or URL. Please try again.");
        setIsSubmittingPaste(false);
        return;
      }
      setPhase("idle");
      setWaitingUrl(null);
      setPastedInput("");
      await refresh({ environmentId, input: { instanceId, refreshModels: true } });
    } catch {
      setError("Could not complete sign-in. Check server connection.");
    } finally {
      setIsSubmittingPaste(false);
    }
  }

  async function pollUntilSettled(state: string, generation: number) {
    for (;;) {
      if (generationRef.current !== generation) return;
      let payload: Record<string, unknown> | null = null;
      try {
        const response = await fetch(
          `/api/antigravity-connect/status?state=${encodeURIComponent(state)}`,
        );
        payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
      } catch {
        payload = null;
      }
      if (generationRef.current !== generation) return;
      const status = typeof payload?.status === "string" ? payload.status : undefined;
      const message = typeof payload?.message === "string" ? payload.message : undefined;
      if (status === "succeeded") {
        setPhase("idle");
        setWaitingUrl(null);
        await refresh({ environmentId, input: { instanceId, refreshModels: true } });
        return;
      }
      if (status === "failed") {
        setError(message ?? "Google sign-in failed. Try again.");
        setPhase("failed");
        setWaitingUrl(null);
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  }

  async function startSignIn() {
    setError(null);
    setPhase("starting");
    let payload: { url?: string; state?: string; error?: string } | null = null;
    try {
      const response = await fetch("/api/antigravity-connect/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instanceId }),
      });
      payload = await response.json().catch(() => null);
      if (!response.ok || typeof payload?.url !== "string" || typeof payload?.state !== "string") {
        setError(payload?.error ?? "Could not start Google sign-in. Try again.");
        setPhase("failed");
        return;
      }
    } catch {
      setError("Could not start Google sign-in. Try again.");
      setPhase("failed");
      return;
    }
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    setWaitingUrl(payload.url);
    setPhase("waiting");
    try {
      window.open(payload.url, "antigravity_connect", "noopener,noreferrer");
    } catch {
      // Popup blocked — the Open browser button covers this.
    }
    void pollUntilSettled(payload.state, generation);
  }

  function cancelSignIn() {
    generationRef.current += 1;
    setWaitingUrl(null);
    setError(null);
    setPhase("idle");
  }

  async function signOut() {
    const confirmed = await ensureLocalApi().dialogs.confirm(
      `Sign out of Antigravity on ${environmentLabel}? Google credentials in the agent profile are removed; thread history is kept.`,
    );
    if (!confirmed) return;
    const result = await logout({ environmentId, input: { instanceId } });
    if (result._tag !== "Success" && !isAtomCommandInterrupted(result)) {
      const failure = squashAtomCommandFailure(result);
      setError(
        failure instanceof Error
          ? failure.message
          : "Could not sign out of Antigravity. Try again.",
      );
    }
  }

  return (
    <SettingsRow
      title="Account"
      description={
        signedIn ? (
          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
            <CheckCircle2Icon className="size-4 text-emerald-500" />
            <span>Signed in with Google.</span>
          </span>
        ) : phase === "waiting" ? (
          <span role="status">Waiting for Google sign-in. Finish it in your browser.</span>
        ) : phase === "starting" ? (
          <span role="status">Starting Google sign-in…</span>
        ) : phase === "failed" ? (
          <span role="status">Sign-in failed. Try again.</span>
        ) : (
          <span role="status">
            Sign in with the Google account bound to your Antigravity subscription.
          </span>
        )
      }
      status={
        error ? (
          <p role="status" className="[overflow-wrap:anywhere]">
            {error}
          </p>
        ) : undefined
      }
      control={
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          {phase === "waiting" && waitingUrl ? (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  try {
                    window.open(waitingUrl, "antigravity_connect", "noopener,noreferrer");
                  } catch {
                    /* popup blocked */
                  }
                }}
              >
                Open browser
              </Button>
              <Button size="sm" variant="ghost-muted" onClick={() => cancelSignIn()}>
                Cancel
              </Button>
            </>
          ) : signedIn ? (
            <>
              <Button
                size="sm"
                variant="outline"
                disabled={readOnly}
                onClick={() => void startSignIn()}
              >
                Change account
              </Button>
              <Button size="sm" variant="ghost" disabled={readOnly} onClick={() => void signOut()}>
                Sign out
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              variant="outline"
              disabled={readOnly || !readyToSignIn || phase === "starting"}
              onClick={() => void startSignIn()}
            >
              {phase === "failed" ? "Retry sign-in" : "Sign in with Google"}
            </Button>
          )}
        </div>
      }
    >
      {signedIn ? null : (
        <div className="flex flex-col gap-2 w-full pt-1">
          {phase === "waiting" ? (
            <div className="flex flex-col gap-1.5 p-2.5 rounded-lg border border-border/40 bg-muted/20 text-xs">
              <span className="font-medium text-foreground">Remote VPS Sign-In Helper:</span>
              <span className="text-muted-foreground">
                If the browser opens and cannot connect to <code>127.0.0.1</code>, copy the full
                redirected URL (containing <code>code=</code>) from your browser address bar and
                paste it below:
              </span>
              <div className="flex items-center gap-1.5 pt-1">
                <input
                  type="text"
                  value={pastedInput}
                  onChange={(e) => setPastedInput(e.target.value)}
                  placeholder="http://127.0.0.1:.../api/antigravity-connect/callback?code=..."
                  className="flex-1 px-2.5 py-1 text-xs rounded border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void handlePasteSubmit();
                  }}
                />
                <Button
                  size="sm"
                  variant="default"
                  disabled={!pastedInput.trim() || isSubmittingPaste}
                  onClick={() => void handlePasteSubmit()}
                >
                  {isSubmittingPaste ? "Connecting…" : "Complete"}
                </Button>
              </div>
            </div>
          ) : null}
          <RemoteTunnelBanner port={tunnelPort} />
        </div>
      )}
    </SettingsRow>
  );
}
