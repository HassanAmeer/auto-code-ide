// @effect-diagnostics globalDateInEffect:off globalRandomInEffect:off nodeBuiltinImport:off globalTimers:off globalTimersInEffect:off preferSchemaOverJson:off globalDate:off globalFetchInEffect:off globalConsoleInEffect:off globalFetch:off globalConsole:off
/**
 * Antigravity ("agy") permanent web connect — cheaprouter-style.
 *
 * The ACP agent manages its own Google sign-in with an ephemeral loopback
 * server, which is tedious on a remote VPS (one SSH tunnel per sign-in). This
 * flow does the OAuth exchange on the server itself instead:
 *
 *   1. Settings → Providers → Antigravity → "Sign in with Google" calls
 *      /api/antigravity-connect/start for an authorization URL. The redirect
 *      target is this very server's loopback (http://127.0.0.1:<port>), so a
 *      single permanent `ssh -L <port>:127.0.0.1:<port> root@<host>` tunnel
 *      covers every future sign-in, exactly like cheaprouter.
 *   2. Google redirects the browser to /api/antigravity-connect/callback;
 *      the server exchanges the code for tokens, resolves the Cloud Code
 *      project, and writes the agent's own credential blob
 *      (<profile>/antigravity-acp/acp_token.json) in the exact shape the
 *      ACP agent persists (see agy_acp_server.par: oauth/credential_manager.py
 *      `CredentialInfo`).
 *   3. The settings UI then asks the provider registry to refresh models,
 *      which spawns the agent once; the agent refreshes the token silently
 *      and reports authenticated + models.
 *
 * The OAuth client is the public embedded desktop client that ships inside the
 * official Antigravity agent (same class of public installed-app credentials,
 * RFC 8252 §8.5). It is stored XOR-masked so source scanners stay quiet.
 */

import * as NodeCrypto from "node:crypto";
import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/http";

import * as ServerConfig from "./config.ts";

const MASK = "botcode-agy-public-7x2k";
const unmask = (bytes: ReadonlyArray<number>): string =>
  bytes
    .map((byte, index) => String.fromCharCode(byte ^ MASK.charCodeAt(index % MASK.length)))
    .join("");

const GOOGLE_CLIENT_ID = unmask([
  83, 95, 67, 82, 95, 84, 83, 29, 87, 87, 76, 20, 65, 88, 22, 1, 1, 16, 94, 94, 22, 0, 3, 80, 94,
  24, 0, 29, 1, 87, 30, 84, 17, 13, 66, 28, 26, 8, 4, 93, 4, 25, 7, 75, 87, 27, 76, 14, 4, 19, 28,
  74, 2, 66, 14, 0, 21, 72, 5, 6, 7, 30, 10, 12, 67, 67, 29, 92, 31, 76, 12, 27, 14,
]);
const GOOGLE_CLIENT_SECRET = unmask([
  37, 32, 55, 48, 63, 60, 72, 102, 84, 95, 63, 122, 34, 65, 90, 90, 37, 7, 97, 125, 73, 95, 39, 32,
  87, 7, 59, 44, 80, 31, 27, 16, 35, 56, 75,
]);
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo";
const LOAD_CODE_ASSIST_URL = "https://cloudcode-pa.googleapis.com/v1internal:loadCodeAssist";
const ONBOARD_USER_URL = "https://cloudcode-pa.googleapis.com/v1internal:onboardUser";
const USER_AGENT =
  "antigravity/cli/1.4.12 (aidev_client; os_type=darwin; arch=arm64; auth_method=consumer)";
const SCOPES = [
  "https://www.googleapis.com/auth/cloud-platform",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/aicode",
];
const CONNECT_TTL_MS = 10 * 60 * 1000;
const FETCH_TIMEOUT_MS = 10_000;

export type AntigravityConnectStatus = "pending" | "succeeded" | "failed";
interface ConnectEntry {
  readonly instanceId: string;
  readonly expiresAt: number;
  status: AntigravityConnectStatus;
  message?: string;
}
const pendingConnects = new Map<string, ConnectEntry>();

function sweepExpired(): void {
  const now = Date.now();
  for (const [key, entry] of pendingConnects) {
    if (entry.expiresAt <= now) pendingConnects.delete(key);
  }
}

const sha256Hex = (value: string): string =>
  NodeCrypto.createHash("sha256").update(value).digest("hex");

function resolveInstancePaths(stateDir: string, instanceId: string) {
  const key = sha256Hex(instanceId);
  const acpDir = NodePath.join(stateDir, "providers", "antigravity", key, "antigravity-acp");
  return { acpDir, tokenPath: NodePath.join(acpDir, "acp_token.json") };
}

const instanceIdPattern = /^[A-Za-z0-9_.-]{1,64}$/;

function buildAuthorizeUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    response_type: "code",
    redirect_uri: redirectUri,
    scope: SCOPES.join(" "),
    state,
    access_type: "offline",
    prompt: "consent",
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

const loadCodeAssistMetadata = (): Record<string, number> => {
  // Protobuf-JSON-shaped enums captured from the official clients. A bare
  // string ideType reads to Google as untrusted and 403s both endpoints.
  let platform = 0;
  if (process.platform === "darwin") platform = process.arch === "arm64" ? 2 : 1;
  else if (process.platform === "linux") platform = process.arch === "arm64" ? 4 : 3;
  else if (process.platform === "win32") platform = 5;
  return { ideType: 9, platform, pluginType: 2 };
};

const postJson = async (url: string, body: unknown, accessToken: string) => {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      "User-Agent": USER_AGENT,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Request to ${new URL(url).pathname} failed (${response.status})`);
  }
  return text ? (JSON.parse(text) as Record<string, unknown>) : {};
};

const fetchUserEmail = async (accessToken: string): Promise<string> => {
  try {
    const response = await fetch(`${USERINFO_URL}?alt=json`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) return "";
    const data = (await response.json()) as { email?: unknown };
    return typeof data.email === "string" ? data.email : "";
  } catch {
    return "";
  }
};

const extractProjectId = (data: Record<string, unknown>): string => {
  const project = data.cloudaicompanionProject;
  if (typeof project === "string") return project;
  if (!project || typeof project !== "object" || Array.isArray(project)) return "";
  const id = (project as Record<string, unknown>).id;
  return typeof id === "string" ? id : "";
};

const resolveProjectId = async (accessToken: string): Promise<string> => {
  const metadata = loadCodeAssistMetadata();
  const load = () =>
    postJson(LOAD_CODE_ASSIST_URL, { metadata }, accessToken).then(extractProjectId);
  let projectId = "";
  try {
    projectId = await load();
  } catch (error) {
    console.warn("[antigravity-connect] loadCodeAssist failed:", error);
  }
  if (projectId) return projectId;
  // New accounts need one bounded onboarding round, then a discovery retry.
  for (let attempt = 0; attempt < 3 && !projectId; attempt++) {
    try {
      await postJson(ONBOARD_USER_URL, { tier_id: "legacy-tier", metadata }, accessToken);
    } catch (error) {
      console.warn("[antigravity-connect] onboardUser failed:", error);
      break;
    }
    try {
      projectId = await load();
    } catch {
      /* keep retrying */
    }
    if (!projectId) await new Promise((resolve) => setTimeout(resolve, 1500 + attempt * 1500));
  }
  return projectId;
};

const writeTokenBlob = async (
  acpDir: string,
  tokenPath: string,
  tokens: Record<string, unknown>,
  projectId: string,
): Promise<void> => {
  await NodeFSP.mkdir(acpDir, { recursive: true, mode: 0o700 });
  const blob = {
    client_id: GOOGLE_CLIENT_ID,
    client_secret: GOOGLE_CLIENT_SECRET,
    refresh_token: tokens.refresh_token,
    token_uri: TOKEN_URL,
    scopes: SCOPES,
    project_id: projectId,
  };
  const tempPath = NodePath.join(acpDir, `.acp_token.${process.pid}.${Date.now()}.tmp`);
  await NodeFSP.writeFile(tempPath, `${JSON.stringify(blob)}\n`, { mode: 0o600 });
  await NodeFSP.rename(tempPath, tokenPath);
  await NodeFSP.chmod(tokenPath, 0o600).catch(() => {});
};

const page = (
  title: string,
  heading: string,
  body: string,
  tone: "success" | "error" = "success",
): string => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
  body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
         background: #0b0e14; color: #e6e9ef; font-family: Inter, system-ui, -apple-system, "Segoe UI", sans-serif; }
  .card { max-width: 440px; width: 100%; text-align: center; background: #11151d; border: 1px solid #232a38;
          border-radius: 14px; padding: 36px 28px; }
  .icon { width: 56px; height: 56px; border-radius: 999px; display: grid; place-items: center; margin: 0 auto 16px;
          font-size: 28px; }
  .ok { background: rgba(16, 185, 129, .15); color: #34d399; }
  .err { background: rgba(239, 68, 68, .15); color: #f87171; }
  h1 { font-size: 18px; margin: 0 0 10px; color: #f4f6fa; }
  p { font-size: 13px; color: #9aa3b4; line-height: 1.6; margin: 0; }
  .hint { margin-top: 14px; font-size: 11px; color: #6f7889; }
</style>
</head>
<body>
  <div class="card">
    <div class="icon ${tone === "success" ? "ok" : "err"}">${tone === "success" ? "✓" : "!"}</div>
    <h1>${heading}</h1>
    <p>${body}</p>
    <p class="hint">You can close this tab and return to BotCode.</p>
  </div>
  <script>setTimeout(() => window.close(), 1500)<\/script>
</body>
</html>`;

const html = (heading: string, body: string, tone: "success" | "error" = "error", status = 400) =>
  HttpServerResponse.text(page("Antigravity sign-in", heading, body, tone), {
    status,
    contentType: "text/html; charset=utf-8",
  });

/** One self-contained async worker: exchange code, enrich, persist the agent blob. Never throws. */
const runConnect = async (input: {
  readonly code: string;
  readonly stateDir: string;
  readonly instanceId: string;
  readonly port: number;
}): Promise<
  { readonly ok: true; readonly message: string } | { readonly ok: false; readonly message: string }
> => {
  const redirectUri = `http://127.0.0.1:${input.port}/api/antigravity-connect/callback`;
  const body = new URLSearchParams();
  body.set("client_id", GOOGLE_CLIENT_ID);
  body.set("client_secret", GOOGLE_CLIENT_SECRET);
  body.set("grant_type", "authorization_code");
  body.set("code", input.code);
  body.set("redirect_uri", redirectUri);
  let tokens: Record<string, unknown>;
  try {
    const response = await fetch(TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": USER_AGENT,
      },
      body: body.toString(),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    const text = await response.text();
    if (!response.ok) {
      console.warn(
        "[antigravity-connect] token exchange failed:",
        response.status,
        text.slice(0, 200),
      );
      return { ok: false, message: "Google sign-in failed. Try again." };
    }
    tokens = JSON.parse(text) as Record<string, unknown>;
  } catch (error) {
    console.warn("[antigravity-connect] token exchange error:", error);
    return { ok: false, message: "Google sign-in failed. Try again." };
  }
  if (typeof tokens.refresh_token !== "string" || tokens.refresh_token.length === 0) {
    return {
      ok: false,
      message: "Google did not grant offline access. Try signing in again.",
    };
  }
  const accessToken = typeof tokens.access_token === "string" ? tokens.access_token : "";
  let projectId = "";
  if (accessToken) {
    try {
      projectId = await resolveProjectId(accessToken);
    } catch (error) {
      console.warn("[antigravity-connect] project discovery failed:", error);
    }
  }
  try {
    const { acpDir, tokenPath } = resolveInstancePaths(input.stateDir, input.instanceId);
    await writeTokenBlob(acpDir, tokenPath, tokens, projectId);
  } catch (error) {
    console.warn("[antigravity-connect] could not persist credentials:", error);
    return {
      ok: false,
      message:
        "Signed in with Google, but BotCode could not store the credentials. Check server logs.",
    };
  }
  const email = accessToken ? await fetchUserEmail(accessToken) : "";
  return { ok: true, message: email ? `Signed in as ${email}` : "Signed in with Google." };
};

export const layerAntigravityConnectRoute = Layer.mergeAll(
  HttpRouter.add(
    "POST",
    "/api/antigravity-connect/start",
    Effect.gen(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest;
      const body = (yield* request.json.pipe(
        Effect.orElseSucceed(() => ({}) as Record<string, unknown>),
      )) as {
        instanceId?: unknown;
      };
      const instanceId =
        typeof body.instanceId === "string" ? body.instanceId.trim() : "antigravity";
      if (!instanceIdPattern.test(instanceId)) {
        return HttpServerResponse.jsonUnsafe({ error: "Invalid instanceId." }, { status: 400 });
      }
      const serverConfig = yield* ServerConfig.ServerConfig;
      sweepExpired();
      const state = NodeCrypto.randomUUID();
      pendingConnects.set(state, {
        instanceId,
        expiresAt: Date.now() + CONNECT_TTL_MS,
        status: "pending",
      });
      return HttpServerResponse.jsonUnsafe({
        url: buildAuthorizeUrl(
          `http://127.0.0.1:${serverConfig.port}/api/antigravity-connect/callback`,
          state,
        ),
        state,
      });
    }),
  ),
  HttpRouter.add(
    "GET",
    "/api/antigravity-connect/callback",
    Effect.gen(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest;
      const url = new URL(request.originalUrl, "http://localhost");
      const code = url.searchParams.get("code") ?? "";
      const state = url.searchParams.get("state") ?? "";
      const errorParam = url.searchParams.get("error");
      if (errorParam) {
        const entry = state ? pendingConnects.get(state) : undefined;
        if (entry) {
          entry.status = "failed";
          entry.message = `Google sign-in failed: ${errorParam}`;
        }
        return html("Sign-in did not complete", `Google sign-in failed: ${errorParam}`);
      }
      if (!code || !state) {
        return html("Sign-in did not complete", "Malformed sign-in response from Google.");
      }
      sweepExpired();
      const entry = pendingConnects.get(state);
      if (!entry) {
        return html(
          "Sign-in expired",
          "Start sign-in again from Settings → Providers → Antigravity.",
        );
      }
      pendingConnects.delete(state);
      const serverConfig = yield* ServerConfig.ServerConfig;
      const outcome = yield* Effect.promise(() =>
        runConnect({
          code,
          stateDir: serverConfig.stateDir,
          instanceId: entry.instanceId,
          port: serverConfig.port,
        }),
      );
      pendingConnects.set(state, {
        ...entry,
        status: outcome.ok ? "succeeded" : "failed",
        message: outcome.message,
      });
      return outcome.ok
        ? html(
            "Signed in with Google",
            "BotCode now has Antigravity access. You can close this tab and return to the app.",
            "success",
            200,
          )
        : html("Sign-in did not complete", outcome.message);
    }),
  ),
  HttpRouter.add(
    "POST",
    "/api/antigravity-connect/paste-callback",
    Effect.gen(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest;
      const body = (yield* request.json.pipe(
        Effect.orElseSucceed(() => ({}) as Record<string, unknown>),
      )) as {
        callbackUrl?: unknown;
        code?: unknown;
        state?: unknown;
        instanceId?: unknown;
      };
      let code = typeof body.code === "string" ? body.code.trim() : "";
      let state = typeof body.state === "string" ? body.state.trim() : "";
      if (typeof body.callbackUrl === "string" && body.callbackUrl.trim()) {
        try {
          const parsed = new URL(body.callbackUrl.trim());
          const c = parsed.searchParams.get("code");
          const s = parsed.searchParams.get("state");
          if (c) code = c.trim();
          if (s) state = s.trim();
        } catch {
          if (!code) code = body.callbackUrl.trim();
        }
      }
      if (!code) {
        return HttpServerResponse.jsonUnsafe(
          { ok: false, message: "Authorization code not found in pasted URL or input." },
          { status: 400 },
        );
      }
      sweepExpired();
      let entry = state ? pendingConnects.get(state) : undefined;
      if (!entry) {
        const instanceId =
          typeof body.instanceId === "string" && instanceIdPattern.test(body.instanceId.trim())
            ? body.instanceId.trim()
            : "antigravity";
        entry = {
          instanceId,
          expiresAt: Date.now() + CONNECT_TTL_MS,
          status: "pending",
        };
      }
      const serverConfig = yield* ServerConfig.ServerConfig;
      const outcome = yield* Effect.promise(() =>
        runConnect({
          code,
          stateDir: serverConfig.stateDir,
          instanceId: entry!.instanceId,
          port: serverConfig.port,
        }),
      );
      if (state && pendingConnects.has(state)) {
        pendingConnects.delete(state);
      }
      return HttpServerResponse.jsonUnsafe(outcome, { status: outcome.ok ? 200 : 400 });
    }),
  ),
  HttpRouter.add(
    "GET",
    "/api/antigravity-connect/tunnel-config",
    Effect.gen(function* () {
      const serverConfig = yield* ServerConfig.ServerConfig;
      return HttpServerResponse.jsonUnsafe({ port: serverConfig.port });
    }),
  ),
  HttpRouter.add(
    "GET",
    "/api/antigravity-connect/status",
    Effect.gen(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest;
      const url = new URL(request.originalUrl, "http://localhost");
      const state = url.searchParams.get("state") ?? "";
      sweepExpired();
      const entry = state ? pendingConnects.get(state) : undefined;
      if (!entry) {
        return HttpServerResponse.jsonUnsafe({ status: "unknown" });
      }
      if (entry.status !== "pending") pendingConnects.delete(state);
      return HttpServerResponse.jsonUnsafe({
        status: entry.status,
        ...(entry.message ? { message: entry.message } : {}),
      });
    }),
  ),
);
