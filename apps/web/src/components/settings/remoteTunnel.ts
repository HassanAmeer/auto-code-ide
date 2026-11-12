/**
 * Remote VPS browser sign-in tunnel helpers.
 *
 * The Antigravity ACP agent runs its Google sign-in loopback on a random
 * `http://127.0.0.1:<port>/` on the machine that hosts the provider. When the
 * user's browser lives on a different machine (laptop) than the environment
 * (remote VPS), Google's redirect cannot reach the agent and sign-in stalls.
 * Mirroring CheapRouter's RemoteTunnelBanner, the Settings UI shows an SSH
 * tunnel command bound to the exact port from the live sign-in URL so the
 * redirect reaches the agent through the laptop's `ssh -L` forward.
 */

const DEFAULT_REMOTE_HOST = "201.18.218.29";

/** Host the laptop can actually `ssh` into. Loopback/LAN hostnames are not routable SSH targets. */
export function detectSshHost(): string {
  if (typeof window === "undefined") return DEFAULT_REMOTE_HOST;
  const hostname = window.location.hostname.trim();
  if (
    hostname.length > 0 &&
    hostname !== "localhost" &&
    hostname !== "127.0.0.1" &&
    hostname !== "[::1]" &&
    hostname !== "::1"
  ) {
    return hostname;
  }
  return DEFAULT_REMOTE_HOST;
}

/** `ssh -L <port>:127.0.0.1:<port> root@<host>` — tunnel the agent's loopback callback. */
export function sshTunnelCommand(port: number, host: string): string {
  return `ssh -L ${port}:127.0.0.1:${port} root@${host}`;
}

/**
 * Port of the loopback redirect the browser flow is registered with, or null
 * when the sign-in URL does not carry a loopback HTTP redirect (public callback,
 * device flow, or a malformed URL). Only then does an SSH tunnel help.
 */
export function loopbackRedirectPort(authorizationUrl: string | null | undefined): number | null {
  if (!authorizationUrl) return null;
  try {
    const redirect = new URL(authorizationUrl).searchParams.get("redirect_uri");
    if (!redirect) return null;
    const uri = new URL(redirect);
    if (uri.protocol !== "http:") return null;
    if (uri.hostname !== "127.0.0.1" && uri.hostname !== "localhost") return null;
    const port = Number(uri.port);
    if (!Number.isInteger(port) || port < 1_024 || port > 65_535 || String(port) !== uri.port) {
      return null;
    }
    return port;
  } catch {
    return null;
  }
}
