// @effect-diagnostics globalDateInEffect:off globalRandomInEffect:off nodeBuiltinImport:off globalTimers:off preferSchemaOverJson:off globalDate:off
import * as NodeOs from "node:os";
import * as NodeFs from "node:fs";
import * as NodeChildProcess from "node:child_process";
import * as NodePath from "node:path";
import {
  runBashCommandOnHost,
  createTerminalEventStream,
  killTerminalProcess,
} from "./terminalExec.ts";
import * as ManagedProjectFolders from "./project/ManagedProjectFolders.ts";
import * as ProjectService from "./project/ProjectService.ts";
import * as Mime from "effect/http/Mime";
import {
  AuthOrchestrationOperateScope,
  AuthOrchestrationReadScope,
  CommandId,
  EnvironmentHttpApi,
  ProjectId,
} from "@t3tools/contracts";
import { isDevProxiedPath } from "@t3tools/shared/devProxy";
import { decodeOtlpTraceRecords } from "@t3tools/shared/observability";
import * as Cause from "effect/Cause";
import * as Clock from "effect/Clock";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import { cast } from "effect/Function";
import {
  HttpClient,
  HttpClientResponse,
  HttpMiddleware,
  HttpRouter,
  HttpServerResponse,
  HttpServerRequest,
  HttpServerRespondable,
} from "effect/http";
import * as HttpApiBuilder from "effect/http-api/HttpApiBuilder";
import { OtlpTracer, OtlpSerialization } from "effect/observability";

import * as ServerConfig from "./config.ts";
import * as ServerBrowser from "./preview/ServerBrowser.ts";
import {
  registerFallbackCustomProvider,
  unregisterFallbackCustomProvider,
  GLOBAL_AI_MODEL_LOGS,
  clearAiModelLogs,
} from "./provider/Drivers/CustomDriver.ts";
import {
  getAllAppSettings,
  setAppSetting,
  listCustomProviders,
  saveCustomProvider,
  deleteCustomProvider,
  syncCustomProviders,
  type StoredCustomProvider,
} from "./persistence/AppSettingsStore.ts";
import { ASSET_ROUTE_PREFIX, resolveAsset } from "./assets/AssetAccess.ts";
import { githubMediaResponse } from "./assets/GitHubMediaFetch.ts";
import { statMediaFile, streamMediaFile, type OpenMediaFile } from "./assets/MediaFile.ts";
import {
  ATTACHMENT_UPLOAD_ROUTE_PREFIX,
  storeAttachmentUpload,
  validateAttachmentUploadToken,
} from "./assets/AttachmentUpload.ts";
import * as BrowserTraceCollector from "./observability/BrowserTraceCollector.ts";
import * as EnvironmentAuth from "./auth/EnvironmentAuth.ts";
import { traceRelayRequest } from "./cloud/traceRelayRequest.ts";
import {
  annotateEnvironmentRequest,
  failEnvironmentScopeRequired,
  failEnvironmentAuthInvalid,
  failEnvironmentInternal,
} from "./auth/http.ts";
import * as ServerEnvironment from "./environment/ServerEnvironment.ts";
import { WEBHOOK_ROUTE_PREFIX } from "./scheduledTasks/ScheduledTaskService.ts";
import { browserApiCorsAllowedHeaders, browserApiCorsAllowedMethods } from "./httpCors.ts";

const OTLP_TRACES_PROXY_PATH = "/api/observability/v1/traces";
const LOOPBACK_HOSTNAMES = new Set(["127.0.0.1", "::1", "localhost"]);
const DESKTOP_RENDERER_ORIGINS = ["t3code://app", "t3code-dev://app"];
const SVG_CONTENT_SECURITY_POLICY = "default-src 'none'; style-src 'unsafe-inline'; sandbox";
// HTML previews are agent output, not the app. The sandbox gives the document an
// opaque origin: scripts run, but same-origin cookies, storage, and API calls are
// out of reach. Relative sibling assets still load through their signed URLs.
// No modals: agent HTML can open without a click (inline renders, and mobile
// loads it as the top document), and must not raise blocking dialogs. Downloads
// stay allowed so download links and buttons in the page work.
const HTML_CONTENT_SECURITY_POLICY =
  "sandbox allow-scripts allow-forms allow-popups allow-downloads";

// Types a browser may render as a document if a proxy strips the disposition
// header. Downloads of these fall back to octet-stream.
const DOWNLOAD_MIME_TYPE_PATTERN = /^[\w!#$&^.+-]+\/[\w!#$&^.+-]+$/;
const isSafeDownloadMimeType = (mimeType: string): boolean =>
  DOWNLOAD_MIME_TYPE_PATTERN.test(mimeType) &&
  !/(?:^text\/html$|\/xml(?:$|-)|\+xml$)/i.test(mimeType.trim().toLowerCase());
const isSafeInlineMediaMimeType = (mimeType: string): boolean =>
  DOWNLOAD_MIME_TYPE_PATTERN.test(mimeType) && /^(?:audio|video)\//i.test(mimeType);
const isSafeInlineDocumentMimeType = (mimeType: string): boolean =>
  mimeType.toLowerCase() === "application/pdf" || mimeType.toLowerCase() === "text/html";

/** RFC 6266 disposition with an ASCII fallback name plus a UTF-8 `filename*`. */
export function downloadContentDisposition(fileName?: string): string {
  if (fileName === undefined) {
    return "attachment";
  }
  // toWellFormed: encodeURIComponent throws URIError on unpaired surrogates.
  const sanitized = fileName.toWellFormed().replace(/[\p{Cc}"\\]/gu, "_");
  const asciiFallback = sanitized.replace(/[^\u0020-\u007e]/g, "_");
  const needsExtended = asciiFallback !== sanitized;
  const extendedName = encodeURIComponent(sanitized).replace(
    /['()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="${asciiFallback}"${
    needsExtended ? `; filename*=UTF-8''${extendedName}` : ""
  }`;
}

export function assetResponseHeaders(
  filePath: string,
  options?: {
    readonly download?: boolean;
    readonly fileName?: string;
    readonly mimeType?: string;
    readonly mutable?: boolean;
  },
): Record<string, string> {
  const lowerPath = filePath.toLowerCase();
  const inlineMimeType = options?.mimeType?.split(";", 1)[0]?.trim();
  return {
    "Cache-Control": options?.mutable
      ? "no-cache, no-store, must-revalidate"
      : "private, max-age=3600",
    ...(options?.mutable ? { Pragma: "no-cache", Expires: "0" } : {}),
    "X-Content-Type-Options": "nosniff",
    ...(options?.download
      ? {
          "Content-Disposition": downloadContentDisposition(options.fileName),
          "Content-Security-Policy": "default-src 'none'; sandbox",
          "Content-Type":
            options.mimeType !== undefined && isSafeDownloadMimeType(options.mimeType)
              ? options.mimeType
              : "application/octet-stream",
        }
      : inlineMimeType !== undefined && isSafeInlineMediaMimeType(inlineMimeType)
        ? { "Content-Type": inlineMimeType }
        : inlineMimeType !== undefined && isSafeInlineDocumentMimeType(inlineMimeType)
          ? {
              "Content-Type":
                inlineMimeType.toLowerCase() === "text/html"
                  ? "text/html; charset=utf-8"
                  : "application/pdf",
              ...(inlineMimeType.toLowerCase() === "text/html"
                ? { "Content-Security-Policy": HTML_CONTENT_SECURITY_POLICY }
                : {}),
            }
          : lowerPath.endsWith(".html") || lowerPath.endsWith(".htm")
            ? {
                "Content-Type": "text/html; charset=utf-8",
                "Content-Security-Policy": HTML_CONTENT_SECURITY_POLICY,
              }
            : {}),
    ...(!options?.download && lowerPath.endsWith(".svg")
      ? { "Content-Security-Policy": SVG_CONTENT_SECURITY_POLICY }
      : {}),
  };
}

/** A single byte range for native media readers; unsupported range syntax uses the full file. */
function assetByteRange(header: string, size: bigint) {
  const match = /^bytes=(\d*)-(\d*)$/i.exec(header.trim());
  if (!match || (!match[1] && !match[2])) return null;
  const first = match[1] ? BigInt(match[1]) : null;
  const last = match[2] ? BigInt(match[2]) : null;
  if (first !== null && last !== null && last < first) return null;
  if (size === 0n || (first !== null && first >= size) || (first === null && last === 0n)) {
    return { _tag: "Unsatisfiable" as const };
  }
  const start = first ?? (last! >= size ? 0n : size - last!);
  const end = first === null || last === null || last >= size ? size - 1n : last;
  if (!Number.isSafeInteger(Number(start)) || !Number.isSafeInteger(Number(end))) {
    return { _tag: "Unsatisfiable" as const };
  }
  return {
    _tag: "Range" as const,
    offset: start,
    bytesToRead: end - start + 1n,
    contentRange: `bytes ${start}-${end}/${size}`,
  };
}

export const assetFileResponse = Effect.fn("assetFileResponse")(function* (
  asset: {
    readonly path: string;
    readonly download?: boolean;
    readonly fileName?: string;
    readonly mimeType?: string;
    readonly file?: OpenMediaFile;
    readonly mutable?: boolean;
  },
  rangeHeader?: string,
  ifRangeHeader?: string,
  method: "GET" | "HEAD" = "GET",
) {
  const headers = assetResponseHeaders(asset.path, asset);
  if (asset.mutable) {
    headers["Cache-Control"] = "no-cache, no-store, must-revalidate";
    headers.Pragma = "no-cache";
    headers.Expires = "0";
  }
  const mediaFile = asset.file;
  const mediaInfo = mediaFile ? yield* statMediaFile(asset.path, mediaFile) : undefined;
  const isMedia = /^(?:audio|video)\//i.test(headers["Content-Type"] ?? "");
  if (isMedia) {
    // Host media can change in place. Do not invite conditional range requests
    // with validators that cannot establish byte-for-byte identity. Attachment media
    // carries no `file`, and must not outlive the signed URL that granted it either.
    headers["Cache-Control"] = "private, no-store";
  }
  let status = 200;
  let offset = 0n;
  let bytesToRead: bigint | undefined;
  if (isMedia) {
    headers["Accept-Ranges"] = "bytes";
    // If-Range requires a matching validator. A full response is safe when we cannot validate it.
    if (method === "GET" && rangeHeader && ifRangeHeader === undefined) {
      const fs = yield* FileSystem.FileSystem;
      const info = mediaInfo ?? (yield* fs.stat(asset.path));
      const range = assetByteRange(rangeHeader, info.size);
      if (range?._tag === "Unsatisfiable") {
        return HttpServerResponse.empty({
          status: 416,
          headers: { ...headers, "Content-Range": `bytes */${info.size}` },
        });
      }
      if (range?._tag === "Range") {
        status = 206;
        offset = range.offset;
        bytesToRead = range.bytesToRead;
        headers["Content-Range"] = range.contentRange;
      }
    }
  }
  if (mediaFile && mediaInfo) {
    const size = bytesToRead ?? mediaInfo.size;
    headers["Content-Type"] ??= Option.getOrElse(
      Mime.getType(asset.path),
      () => "application/octet-stream",
    );
    headers["Content-Length"] = String(size);
    if (!isMedia) {
      headers["Last-Modified"] = mediaInfo.mtime.toUTCString();
      headers.ETag = `W/"${mediaInfo.size.toString(16)}-${mediaInfo.mtimeMs.toString(16)}"`;
    }
    if (method === "HEAD" || size === 0n) {
      return HttpServerResponse.empty({ status, headers });
    }
    const body = streamMediaFile(mediaFile, offset, size);
    if (!body) {
      return HttpServerResponse.text("File is too large to preview.", { status: 413 });
    }
    return HttpServerResponse.stream(body, {
      status,
      headers,
    });
  }
  return yield* HttpServerResponse.file(asset.path, { status, offset, bytesToRead, headers });
});

export const layerHttpCompression = HttpRouter.middleware(HttpMiddleware.compression(), {
  global: true,
});

export const layerBrowserApiCors = Layer.unwrap(
  Effect.gen(function* () {
    const config = yield* ServerConfig.ServerConfig;
    const devOrigin = config.devUrl?.origin;
    // Dev uses credentialed requests from Vite or the Electron custom origin, so both must be
    // explicit. Packaged desktop omits credentials and uses Effect's default wildcard origin.
    //
    // T3CODE_DEV_ALLOWED_ORIGINS covers dev servers reached from a second
    // origin — a tailnet name, a LAN IP, a phone. Browser dev normally proxies
    // through Vite and is same-origin (no preflight at all), so this is a
    // safety net for the desktop renderer and any direct-to-backend caller.
    return HttpRouter.cors({
      ...(devOrigin
        ? {
            allowedOrigins: [devOrigin, ...DESKTOP_RENDERER_ORIGINS, ...config.devAllowedOrigins],
            credentials: true,
          }
        : {}),
      allowedMethods: browserApiCorsAllowedMethods,
      allowedHeaders: browserApiCorsAllowedHeaders,
      maxAge: 600,
    });
  }),
);

export function isLoopbackHostname(hostname: string): boolean {
  const normalizedHostname = hostname
    .trim()
    .toLowerCase()
    .replace(/^\[(.*)\]$/, "$1");
  return LOOPBACK_HOSTNAMES.has(normalizedHostname);
}

export function resolveDevRedirectUrl(devUrl: URL, requestUrl: URL): string {
  const redirectUrl = new URL(devUrl.toString());
  redirectUrl.pathname = requestUrl.pathname;
  redirectUrl.search = requestUrl.search;
  redirectUrl.hash = requestUrl.hash;
  return redirectUrl.toString();
}

const authenticateRawRouteWithScope = (
  scope: typeof AuthOrchestrationReadScope | typeof AuthOrchestrationOperateScope,
) =>
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const serverAuth = yield* EnvironmentAuth.EnvironmentAuth;
    const session = yield* serverAuth.authenticateHttpRequest(request).pipe(
      Effect.catchIf(EnvironmentAuth.isServerAuthCredentialError, (error) =>
        failEnvironmentAuthInvalid(
          EnvironmentAuth.serverAuthCredentialReason(error),
          EnvironmentAuth.serverAuthDpopFailureReason(error),
        ),
      ),
      Effect.catchIf(EnvironmentAuth.isServerAuthInternalError, (error) =>
        failEnvironmentInternal("internal_error", error),
      ),
    );
    if (!session.scopes.includes(scope)) {
      return yield* failEnvironmentScopeRequired(scope);
    }
  });

export const layerServerEnvironmentHttpApi = HttpApiBuilder.group(
  EnvironmentHttpApi,
  "metadata",
  Effect.fnUntraced(function* (handlers) {
    const serverEnvironment = yield* ServerEnvironment.ServerEnvironment;
    return handlers.handle(
      "descriptor",
      Effect.fn("environment.metadata.descriptor")(function* (args) {
        yield* annotateEnvironmentRequest(args.endpoint.name);
        return yield* serverEnvironment.getDescriptor;
      }, traceRelayRequest),
    );
  }),
);

class DecodeOtlpTraceRecordsError extends Data.TaggedError("DecodeOtlpTraceRecordsError")<{
  readonly cause: unknown;
}> {}

// Renderers export up to once a second while they have spans buffered, so
// tracing this proxy would add more server spans than it forwards.
// withTracerEnabled(false) drops the handler's spans, including the forward.
// untracedRequestsLayer drops the HTTP server span.
export const layerOtlpTracesProxyRoute = HttpRouter.add(
  "POST",
  OTLP_TRACES_PROXY_PATH,
  Effect.gen(function* () {
    yield* authenticateRawRouteWithScope(AuthOrchestrationOperateScope);
    const request = yield* HttpServerRequest.HttpServerRequest;
    const config = yield* ServerConfig.ServerConfig;
    const otlpTracesUrl = config.otlpTracesUrl;
    const otlpHeaders = config.otlpTracesExport.headers;
    const browserTraceCollector = yield* BrowserTraceCollector.BrowserTraceCollector;
    const httpClient = yield* HttpClient.HttpClient;
    const serialization = yield* OtlpSerialization.OtlpSerialization;
    const bodyJson = cast<unknown, OtlpTracer.TraceData>(yield* request.json);

    yield* Effect.try({
      try: () => decodeOtlpTraceRecords(bodyJson),
      catch: (cause) => new DecodeOtlpTraceRecordsError({ cause }),
    }).pipe(
      Effect.flatMap((records) => browserTraceCollector.record(records)),
      Effect.catch((cause) => Effect.logWarning("Failed to decode browser OTLP traces", { cause })),
    );

    if (otlpTracesUrl === undefined) {
      return HttpServerResponse.empty({ status: 204 });
    }

    return yield* httpClient
      .post(otlpTracesUrl, {
        body: serialization.traces(bodyJson),
        headers: otlpHeaders,
      })
      .pipe(
        Effect.flatMap(HttpClientResponse.filterStatusOk),
        Effect.as(HttpServerResponse.empty({ status: 204 })),
        Effect.tapError((cause) =>
          Effect.logWarning("Failed to export browser OTLP traces", {
            cause,
            otlpTracesUrl,
          }),
        ),
        Effect.orElseSucceed(() =>
          HttpServerResponse.text("Trace export failed.", { status: 502 }),
        ),
      );
  }).pipe(
    Effect.catchTags({
      EnvironmentAuthInvalidError: HttpServerRespondable.toResponse,
      EnvironmentInternalError: HttpServerRespondable.toResponse,
      EnvironmentScopeRequiredError: HttpServerRespondable.toResponse,
    }),
    Effect.withTracerEnabled(false),
  ),
);

const UNTRACED_REQUEST_PATHS: ReadonlySet<string> = new Set([OTLP_TRACES_PROXY_PATH]);

// Skips the HTTP server span for UNTRACED_REQUEST_PATHS. That span starts
// before routing, so a route handler cannot skip it. TracerDisabledWhen is one
// predicate for the whole server, and HttpRouter.serve builds its routes
// privately, so it is provided to the served layer, never merged into the
// routes. Add paths here instead of providing it again. The query string is
// ignored, as in routing.
const layerUntracedRequests = Layer.succeed(HttpMiddleware.TracerDisabledWhen)((request) => {
  const queryIndex = request.url.indexOf("?");
  const path = queryIndex === -1 ? request.url : request.url.slice(0, queryIndex);
  // Webhook URLs carry their secret token in the path, so they never reach a trace.
  return UNTRACED_REQUEST_PATHS.has(path) || path.startsWith(`${WEBHOOK_ROUTE_PREFIX}/`);
});

export const withUntracedRequests = Layer.provide(layerUntracedRequests);

export const layerAssetRoute = HttpRouter.add(
  "GET",
  `${ASSET_ROUTE_PREFIX}/*`,
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const url = HttpServerRequest.toURL(request);
    if (Option.isNone(url)) {
      return HttpServerResponse.text("Bad Request", { status: 400 });
    }

    const suffix = url.value.pathname.slice(`${ASSET_ROUTE_PREFIX}/`.length);
    const separatorIndex = suffix.indexOf("/");
    if (separatorIndex <= 0) {
      return HttpServerResponse.text("Not Found", { status: 404 });
    }

    const asset = yield* resolveAsset(
      suffix.slice(0, separatorIndex),
      suffix.slice(separatorIndex + 1),
    );
    if (!asset) {
      return HttpServerResponse.text("Not Found", { status: 404 });
    }
    if (asset.kind === "bytes") {
      return HttpServerResponse.uint8Array(asset.bytes, {
        contentType: asset.mimeType,
        headers: { "cache-control": "private, max-age=3600", "x-content-type-options": "nosniff" },
      });
    }
    if (asset.kind === "github-media") {
      return yield* githubMediaResponse(asset, request.headers).pipe(
        Effect.tapError((cause) =>
          Effect.logWarning("Failed to fetch GitHub media.", { url: asset.url, cause }),
        ),
        Effect.orElseSucceed(() =>
          HttpServerResponse.empty({
            status: 502,
            headers: { "cache-control": "private, no-store", "x-content-type-options": "nosniff" },
          }),
        ),
      );
    }
    return yield* assetFileResponse(
      asset,
      request.method === "GET" ? request.headers.range : undefined,
      request.headers["if-range"],
      request.method === "HEAD" ? "HEAD" : "GET",
    ).pipe(
      Effect.orElseSucceed(() => HttpServerResponse.text("Internal Server Error", { status: 500 })),
    );
  }),
);

export const layerAttachmentUploadRoute = HttpRouter.add(
  "POST",
  `${ATTACHMENT_UPLOAD_ROUTE_PREFIX}/*`,
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const url = HttpServerRequest.toURL(request);
    if (Option.isNone(url)) {
      return HttpServerResponse.text("Bad Request", { status: 400 });
    }

    const token = url.value.pathname.slice(`${ATTACHMENT_UPLOAD_ROUTE_PREFIX}/`.length);
    if (!token) {
      return HttpServerResponse.text("Not Found", { status: 404 });
    }
    const claims = yield* validateAttachmentUploadToken(token);
    if (!claims) {
      return HttpServerResponse.text("Not Found", { status: 404 });
    }

    const contentLengthHeader = request.headers["content-length"];
    if (
      contentLengthHeader !== undefined &&
      (!Number.isInteger(Number(contentLengthHeader)) ||
        Number(contentLengthHeader) !== claims.sizeBytes)
    ) {
      return HttpServerResponse.text("Content-Length must match the upload size.", {
        status: 400,
      });
    }

    // Keep the request stream in the route scope until the response is sent.
    const bodyPull = yield* Stream.toPull(request.stream);
    const stored = yield* storeAttachmentUpload(claims, Stream.fromPull(Effect.succeed(bodyPull)));
    return stored.ok
      ? HttpServerResponse.empty({ status: 204 })
      : HttpServerResponse.text(stored.detail, { status: stored.status });
  }),
);

export const layerTerminalExecRoute = HttpRouter.add(
  "POST",
  "/api/terminal/exec",
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const bodyJson = (yield* request.json.pipe(Effect.orElseSucceed(() => ({}) as any))) as {
      command?: string;
      cwd?: string;
      timeoutMs?: number;
    };

    const command = bodyJson?.command?.trim();
    if (!command) {
      return HttpServerResponse.jsonUnsafe({
        ok: false,
        error: "Command is required",
        stdout: "",
        stderr: "Command is required",
        exitCode: 1,
        durationMs: 0,
      });
    }

    const targetCwd =
      bodyJson?.cwd && bodyJson.cwd.trim().length > 0 ? bodyJson.cwd.trim() : process.cwd();
    const timeout = bodyJson?.timeoutMs || 120_000;

    const result = yield* Effect.promise(() => runBashCommandOnHost(command, targetCwd, timeout));
    return HttpServerResponse.jsonUnsafe(result);
  }),
);

export const layerTerminalStreamRoute = HttpRouter.add(
  "POST",
  "/api/terminal/stream",
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const bodyJson = (yield* request.json.pipe(Effect.orElseSucceed(() => ({}) as any))) as {
      command?: string;
      cwd?: string;
      timeoutMs?: number;
      executionId?: string;
    };

    const command = bodyJson?.command?.trim();
    if (!command) {
      return HttpServerResponse.jsonUnsafe(
        {
          ok: false,
          error: "Command is required",
        },
        { status: 400 },
      );
    }

    const targetCwd =
      bodyJson?.cwd && bodyJson.cwd.trim().length > 0 ? bodyJson.cwd.trim() : process.cwd();
    const timeout = bodyJson?.timeoutMs || 300_000;
    const executionId =
      bodyJson?.executionId?.trim() ||
      `exec_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    const eventStream = createTerminalEventStream(executionId, command, targetCwd, timeout);
    return HttpServerResponse.stream(eventStream, {
      contentType: "text/event-stream",
      headers: {
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  }),
);

export const layerTerminalKillRoute = HttpRouter.add(
  "POST",
  "/api/terminal/kill",
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const bodyJson = (yield* request.json.pipe(Effect.orElseSucceed(() => ({}) as any))) as {
      executionId?: string;
    };

    const executionId = bodyJson?.executionId?.trim();
    if (!executionId) {
      return HttpServerResponse.jsonUnsafe(
        { ok: false, error: "executionId is required" },
        { status: 400 },
      );
    }

    const killed = killTerminalProcess(executionId);
    return HttpServerResponse.jsonUnsafe({ ok: true, killed });
  }),
);

export const layerCustomProviderFetchModelsRoute = HttpRouter.add(
  "POST",
  "/api/custom-provider/fetch-models",
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const bodyJson = (yield* request.json.pipe(Effect.orElseSucceed(() => ({}) as any))) as {
      baseUrl?: string;
      apiKey?: string;
      headers?: Array<{ key: string; value: string }>;
    };

    const baseUrl = bodyJson?.baseUrl?.trim();
    if (!baseUrl) {
      return HttpServerResponse.jsonUnsafe({
        ok: false,
        error: "Base URL is required",
        models: [],
      });
    }

    const result = yield* Effect.promise(async () => {
      try {
        if (typeof process !== "undefined" && process.env) {
          process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
        }

        const cleanBase = baseUrl.replace(/\/+$/, "");
        const baseWithoutChat = cleanBase
          .replace(/\/chat\/completions\/?$/i, "")
          .replace(/\/+$/, "");
        const requestHeaders: Record<string, string> = {
          Accept: "application/json",
          "User-Agent": "T3-Code/1.0",
        };

        if (bodyJson.apiKey && bodyJson.apiKey.trim().length > 0) {
          requestHeaders["Authorization"] = `Bearer ${bodyJson.apiKey.trim()}`;
        }

        if (bodyJson.headers && Array.isArray(bodyJson.headers)) {
          for (const h of bodyJson.headers) {
            if (h.key && h.key.trim().length > 0) {
              requestHeaders[h.key.trim()] = h.value.trim();
            }
          }
        }

        const modelsUrl = baseWithoutChat.endsWith("/v1")
          ? `${baseWithoutChat}/models`
          : baseWithoutChat.includes("/v1/")
            ? `${baseWithoutChat}/models`
            : `${baseWithoutChat}/v1/models`;

        const directUrl = `${baseWithoutChat}/models`;
        const urlsToTry = [modelsUrl];
        if (modelsUrl !== directUrl) {
          urlsToTry.push(directUrl);
        }
        if (cleanBase.includes("11434") || cleanBase.toLowerCase().includes("ollama")) {
          const rootUrl = baseWithoutChat.replace(/\/v1$/, "");
          urlsToTry.push(`${rootUrl}/api/tags`);
        }

        let lastError = "Could not connect to provider";

        const fetchFn = (globalThis as unknown as { fetch: typeof fetch })["fetch"];
        for (const url of urlsToTry) {
          try {
            const resp = await fetchFn(url, {
              method: "GET",
              headers: requestHeaders,
              signal: AbortSignal.timeout(10000),
            });

            if (!resp.ok) {
              lastError = `Server responded with ${resp.status} ${resp.statusText}`;
              continue;
            }

            const data = (await resp.json()) as any;

            // Format 1: OpenAI standard: { data: [{ id, name, serviceId }] }
            if (data && Array.isArray(data.data)) {
              const models = data.data
                .filter(
                  (item: any) =>
                    typeof item === "object" &&
                    item !== null &&
                    (item.id || item.serviceId || item.name),
                )
                .map((item: any) => ({
                  id: String(item.id || item.serviceId || item.name),
                  name: typeof item.name === "string" ? item.name : item.displayName || undefined,
                }));
              if (models.length > 0) {
                return { ok: true, models };
              }
            }

            // Format 2: Ollama /api/tags: { models: [...] }
            if (data && Array.isArray(data.models)) {
              const models = data.models
                .filter(
                  (item: any) =>
                    typeof item === "object" &&
                    item !== null &&
                    (item.id || item.serviceId || item.name),
                )
                .map((item: any) => ({
                  id: String(item.id || item.name || item.serviceId),
                  name: typeof item.name === "string" ? item.name : undefined,
                }));
              if (models.length > 0) {
                return { ok: true, models };
              }
            }

            // Format 3: Direct array: [{ id, ... }]
            if (Array.isArray(data)) {
              const models = data
                .filter(
                  (item: any) =>
                    typeof item === "object" &&
                    item !== null &&
                    (item.id || item.serviceId || item.name),
                )
                .map((item: any) => ({
                  id: String(item.id || item.serviceId || item.name),
                  name: typeof item.name === "string" ? item.name : undefined,
                }));
              if (models.length > 0) {
                return { ok: true, models };
              }
            }
          } catch (e: any) {
            lastError = e?.message || String(e);
          }
        }

        return { ok: false, error: lastError, models: [] };
      } catch (err: any) {
        return { ok: false, error: err?.message || String(err), models: [] };
      }
    });

    return HttpServerResponse.jsonUnsafe(result);
  }),
);

export const layerCustomProviderListRoute = HttpRouter.add(
  "GET",
  "/api/custom-provider/list",
  Effect.gen(function* () {
    const config = yield* ServerConfig.ServerConfig;
    const providers = listCustomProviders(config.dbPath);
    return HttpServerResponse.jsonUnsafe({
      ok: true,
      providers,
    });
  }),
);

export const layerCustomProviderSaveRoute = HttpRouter.add(
  "POST",
  "/api/custom-provider/save",
  Effect.gen(function* () {
    const config = yield* ServerConfig.ServerConfig;
    const request = yield* HttpServerRequest.HttpServerRequest;
    const bodyJson = (yield* request.json.pipe(Effect.orElseSucceed(() => ({}) as any))) as {
      id?: string;
      name?: string;
      baseUrl?: string;
      apiKey?: string;
      headers?: Array<{ key: string; value: string }>;
      models?: Array<{ id: string; name?: string }>;
      enabled?: boolean;
      createdAt?: string;
    };

    const nowMs = yield* Clock.currentTimeMillis;
    const rawId = bodyJson?.id || (bodyJson as any)?.instanceId || nowMs;
    const strId = String(rawId);
    const cleanId = strId.startsWith("custom_") ? strId : `custom_${strId}`;
    const nowIso = new Date(nowMs).toISOString();

    const provider: StoredCustomProvider = {
      id: cleanId,
      name: bodyJson?.name ?? (bodyJson as any)?.displayName ?? "Custom Provider",
      baseUrl: bodyJson?.baseUrl ?? "",
      apiKey: bodyJson?.apiKey ?? "",
      headers: bodyJson?.headers ?? [],
      models: bodyJson?.models ?? [],
      enabled: bodyJson?.enabled ?? true,
      createdAt: bodyJson?.createdAt ?? nowIso,
      updatedAt: nowIso,
    };

    saveCustomProvider(config.dbPath, provider);

    registerFallbackCustomProvider({
      instanceId: cleanId,
      displayName: provider.name,
      baseUrl: provider.baseUrl,
      apiKey: provider.apiKey ?? "",
      headers: provider.headers ?? [],
      models: provider.models,
      enabled: provider.enabled,
    });

    return HttpServerResponse.jsonUnsafe({ ok: true, id: cleanId, provider });
  }),
);

export const layerCustomProviderDeleteRoute = HttpRouter.add(
  "POST",
  "/api/custom-provider/delete",
  Effect.gen(function* () {
    const config = yield* ServerConfig.ServerConfig;
    const request = yield* HttpServerRequest.HttpServerRequest;
    const bodyJson = (yield* request.json.pipe(Effect.orElseSucceed(() => ({}) as any))) as {
      id?: string;
    };

    const targetId = bodyJson?.id || (bodyJson as any)?.instanceId;
    if (targetId) {
      const deleteId = String(targetId);
      deleteCustomProvider(config.dbPath, deleteId);
      unregisterFallbackCustomProvider(deleteId);
    }

    return HttpServerResponse.jsonUnsafe({ ok: true });
  }),
);

export const layerCustomProviderSyncRoute = HttpRouter.add(
  "POST",
  "/api/custom-provider/sync",
  Effect.gen(function* () {
    const config = yield* ServerConfig.ServerConfig;
    const request = yield* HttpServerRequest.HttpServerRequest;
    const bodyJson = (yield* request.json.pipe(Effect.orElseSucceed(() => ({}) as any))) as {
      providers?: Array<{
        id?: string;
        name?: string;
        baseUrl?: string;
        apiKey?: string;
        headers?: Array<{ key: string; value: string }>;
        models?: Array<{ id: string; name?: string }>;
        enabled?: boolean;
        createdAt?: string;
        updatedAt?: string;
      }>;
    };

    const nowMs = yield* Clock.currentTimeMillis;
    const nowIso = new Date(nowMs).toISOString();
    if (Array.isArray(bodyJson?.providers)) {
      const storedList: StoredCustomProvider[] = [];
      for (const p of bodyJson.providers) {
        if (!p) continue;
        const rawId = p.id || (p as any).instanceId || nowMs;
        const strId = String(rawId);
        const cleanId = strId.startsWith("custom_") ? strId : `custom_${strId}`;
        const item: StoredCustomProvider = {
          id: cleanId,
          name: p.name ?? (p as any).displayName ?? "Custom Provider",
          baseUrl: p.baseUrl ?? "",
          apiKey: p.apiKey ?? "",
          headers: p.headers ?? [],
          models: p.models ?? [],
          enabled: p.enabled ?? true,
          createdAt: p.createdAt ?? nowIso,
          updatedAt: nowIso,
        };
        storedList.push(item);

        registerFallbackCustomProvider({
          instanceId: cleanId,
          displayName: item.name,
          baseUrl: item.baseUrl,
          apiKey: item.apiKey ?? "",
          headers: item.headers ?? [],
          models: item.models,
          enabled: item.enabled,
        });
      }
      syncCustomProviders(config.dbPath, storedList);
    }

    return HttpServerResponse.jsonUnsafe({
      ok: true,
      count: bodyJson?.providers?.length ?? 0,
    });
  }),
);

export const layerAppSettingsGetRoute = HttpRouter.add(
  "GET",
  "/api/app-settings",
  Effect.gen(function* () {
    const config = yield* ServerConfig.ServerConfig;
    const settings = getAllAppSettings(config.dbPath);
    return HttpServerResponse.jsonUnsafe({
      ok: true,
      settings,
    });
  }),
);

export const layerAppSettingsSaveRoute = HttpRouter.add(
  "POST",
  "/api/app-settings/save",
  Effect.gen(function* () {
    const config = yield* ServerConfig.ServerConfig;
    const request = yield* HttpServerRequest.HttpServerRequest;
    const bodyJson = (yield* request.json.pipe(Effect.orElseSucceed(() => ({}) as any))) as {
      key?: string;
      value?: any;
      settings?: Record<string, any>;
    };

    if (bodyJson?.key && bodyJson.value !== undefined) {
      setAppSetting(config.dbPath, bodyJson.key, bodyJson.value);
    } else if (bodyJson?.settings && typeof bodyJson.settings === "object") {
      for (const [k, v] of Object.entries(bodyJson.settings)) {
        setAppSetting(config.dbPath, k, v);
      }
    }

    return HttpServerResponse.jsonUnsafe({ ok: true });
  }),
);

export const layerCodexCliStatusRoute = HttpRouter.add(
  "GET",
  "/api/codex-cli/status",
  Effect.gen(function* () {
    const config = yield* ServerConfig.ServerConfig;
    const request = yield* HttpServerRequest.HttpServerRequest;
    const url = new URL(request.url, "http://localhost");
    const requestedPath = url.searchParams.get("path")?.trim();

    const homeDir = NodeOs.homedir() || process.env.HOME || "/root";
    const codexHome = process.env.CODEX_HOME || NodePath.join(homeDir, ".codex");
    const codexHomeExists = NodeFs.existsSync(codexHome);
    const authFileExists = NodeFs.existsSync(NodePath.join(codexHome, "auth.json"));
    const configFileExists = NodeFs.existsSync(NodePath.join(codexHome, "config.toml"));
    const extendedPath = [
      NodePath.join(homeDir, ".local", "bin"),
      NodePath.join(homeDir, "all-ai-clis"),
      "/usr/local/bin",
      "/usr/bin",
      "/bin",
      process.env.PATH || "",
    ]
      .filter(Boolean)
      .join(":");

    // If an explicit path was requested, test that exact path
    if (requestedPath) {
      try {
        if (!NodeFs.existsSync(requestedPath)) {
          return HttpServerResponse.jsonUnsafe({
            ok: false,
            available: false,
            path: requestedPath,
            version: null,
            codexHome,
            codexHomeExists,
            authFileExists,
            configFileExists,
            status: "not_found",
            message: `Binary not found at specified path: ${requestedPath}`,
          });
        }
        const out = NodeChildProcess.execSync(`${requestedPath} --version`, {
          encoding: "utf-8",
          timeout: 4000,
          env: {
            ...process.env,
            PATH: extendedPath,
          },
        }).trim();
        return HttpServerResponse.jsonUnsafe({
          ok: true,
          available: true,
          path: requestedPath,
          version: out,
          codexHome,
          codexHomeExists,
          authFileExists,
          configFileExists,
          status: "ready",
        });
      } catch (err: any) {
        return HttpServerResponse.jsonUnsafe({
          ok: false,
          available: false,
          path: requestedPath,
          version: null,
          codexHome,
          codexHomeExists,
          authFileExists,
          configFileExists,
          status: "error",
          message: err?.message || `Execution error testing binary at ${requestedPath}`,
        });
      }
    }

    // Otherwise, auto-probe candidate paths
    const allSettings = getAllAppSettings(config.dbPath);
    const storedPath =
      typeof allSettings?.codex_cli_binary_path === "string"
        ? allSettings.codex_cli_binary_path.trim()
        : "";

    const candidatePaths: string[] = [];
    if (storedPath) {
      candidatePaths.push(storedPath);
    }
    candidatePaths.push(
      NodePath.join(homeDir, ".local", "bin", "codex"),
      NodePath.join(homeDir, "all-ai-clis", "codex"),
      "/usr/local/bin/codex",
      "/usr/bin/codex",
      "codex",
    );

    let resolvedBinary: string | null = null;
    let versionOutput = "";

    for (const bin of candidatePaths) {
      try {
        if (bin !== "codex" && !NodeFs.existsSync(bin)) {
          continue;
        }
        const out = NodeChildProcess.execSync(`${bin} --version`, {
          encoding: "utf-8",
          timeout: 4000,
          env: {
            ...process.env,
            PATH: extendedPath,
          },
        }).trim();
        if (out) {
          if (bin === "codex") {
            try {
              const whichPath = NodeChildProcess.execSync("which codex", {
                encoding: "utf-8",
                timeout: 2000,
                env: { ...process.env, PATH: extendedPath },
              }).trim();
              resolvedBinary = whichPath || bin;
            } catch {
              resolvedBinary = bin;
            }
          } else {
            resolvedBinary = bin;
          }
          versionOutput = out;
          break;
        }
      } catch {
        // try next candidate
      }
    }

    if (resolvedBinary) {
      return HttpServerResponse.jsonUnsafe({
        ok: true,
        available: true,
        path: resolvedBinary,
        version: versionOutput,
        codexHome,
        codexHomeExists,
        authFileExists,
        configFileExists,
        status: "ready",
      });
    }

    return HttpServerResponse.jsonUnsafe({
      ok: true,
      available: false,
      path: null,
      version: null,
      codexHome,
      codexHomeExists,
      authFileExists,
      configFileExists,
      status: "not_found",
      message: "Codex CLI was not found in candidate paths. Specify custom binary path.",
    });
  }),
);

export const layerAiModelLogsRoute = HttpRouter.add(
  "GET",
  "/api/ai-model-logs",
  Effect.gen(function* () {
    return HttpServerResponse.jsonUnsafe({
      ok: true,
      logs: GLOBAL_AI_MODEL_LOGS,
    });
  }),
);

export const layerAiModelLogsClearRoute = HttpRouter.add(
  "POST",
  "/api/ai-model-logs/clear",
  Effect.gen(function* () {
    clearAiModelLogs();
    return HttpServerResponse.jsonUnsafe({
      ok: true,
    });
  }),
);

export const layerDirectProjectCreateRoute = HttpRouter.add(
  "POST",
  "/api/project/create-direct",
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const bodyJson = (yield* request.json.pipe(Effect.orElseSucceed(() => ({}) as any))) as {
      name?: string;
      template?: string;
    };

    const name = bodyJson?.name?.trim();
    if (!name) {
      return HttpServerResponse.jsonUnsafe(
        { ok: false, error: "Project name is required" },
        { status: 400 },
      );
    }

    const managedFolders = yield* ManagedProjectFolders.ManagedProjectFolders;
    const result = yield* managedFolders
      .createNamedProject({
        name,
        template: bodyJson.template,
      })
      .pipe(
        Effect.map((res) => ({
          ok: true as const,
          projectId: res.projectId,
          workspaceRoot: res.workspaceRoot,
          commitError: res.commitError,
        })),
        Effect.catchCause((cause) =>
          Effect.succeed({
            ok: false as const,
            error: Cause.pretty(cause),
          }),
        ),
      );

    return HttpServerResponse.jsonUnsafe(result);
  }).pipe(
    Effect.catchCause((cause) =>
      Effect.succeed(HttpServerResponse.jsonUnsafe({ ok: false, error: Cause.pretty(cause) })),
    ),
  ),
);

export const layerDirectProjectImportZipRoute = HttpRouter.add(
  "POST",
  "/api/project/import-zip-direct",
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const fileSystem = yield* FileSystem.FileSystem;
    const managedFolders = yield* ManagedProjectFolders.ManagedProjectFolders;
    const contentType = (request.headers["content-type"] || "").toLowerCase();
    const url = new URL(request.url, "http://127.0.0.1");

    const headerName = request.headers["x-project-name"]
      ? decodeURIComponent(request.headers["x-project-name"])
      : undefined;
    const queryName = url.searchParams.get("name") || url.searchParams.get("projectName");

    let name = (headerName || queryName || "").trim();

    // Check if this is a streaming binary upload (application/octet-stream or application/zip)
    if (
      contentType.includes("octet-stream") ||
      contentType.includes("zip") ||
      (name.length > 0 && !contentType.includes("application/json"))
    ) {
      if (!name) {
        return HttpServerResponse.jsonUnsafe(
          {
            ok: false,
            error: "Project name is required in X-Project-Name header or name query parameter",
          },
          { status: 400 },
        );
      }

      const tempZipFile = `/tmp/t3_import_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.zip`;
      yield* Stream.run(request.stream, fileSystem.sink(tempZipFile));

      const result = yield* managedFolders
        .importZipProject({
          name,
          zipFilePath: tempZipFile,
        })
        .pipe(
          Effect.map((res) => ({
            ok: true as const,
            projectId: res.projectId,
            workspaceRoot: res.workspaceRoot,
            commitError: res.commitError,
          })),
          Effect.catchCause((cause) =>
            Effect.succeed({
              ok: false as const,
              error: Cause.pretty(cause),
            }),
          ),
        );

      yield* fileSystem.remove(tempZipFile).pipe(Effect.ignore);
      return HttpServerResponse.jsonUnsafe(result);
    }

    // Fallback: JSON body with base64
    const bodyJson = (yield* request.json.pipe(Effect.orElseSucceed(() => ({}) as any))) as {
      name?: string;
      zipBase64?: string;
    };

    name = name || bodyJson?.name?.trim() || "";
    const zipBase64 = bodyJson?.zipBase64;
    if (!name || !zipBase64) {
      return HttpServerResponse.jsonUnsafe(
        { ok: false, error: "Project name and zipBase64 are required" },
        { status: 400 },
      );
    }

    const result = yield* managedFolders
      .importZipProject({
        name,
        zipBase64,
      })
      .pipe(
        Effect.map((res) => ({
          ok: true as const,
          projectId: res.projectId,
          workspaceRoot: res.workspaceRoot,
          commitError: res.commitError,
        })),
        Effect.catchCause((cause) =>
          Effect.succeed({
            ok: false as const,
            error: Cause.pretty(cause),
          }),
        ),
      );

    return HttpServerResponse.jsonUnsafe(result);
  }).pipe(
    Effect.catchCause((cause) =>
      Effect.succeed(HttpServerResponse.jsonUnsafe({ ok: false, error: Cause.pretty(cause) })),
    ),
  ),
);

export const layerDirectProjectImportFilesRoute = HttpRouter.add(
  "POST",
  "/api/project/import-files-direct",
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const bodyJson = (yield* request.json.pipe(Effect.orElseSucceed(() => ({}) as any))) as {
      name?: string;
      files?: ReadonlyArray<{
        relativePath: string;
        content: string;
        encoding?: "utf8" | "base64";
      }>;
    };

    const name = bodyJson?.name?.trim();
    const files = bodyJson?.files;
    if (!name || !Array.isArray(files) || files.length === 0) {
      return HttpServerResponse.jsonUnsafe(
        { ok: false, error: "Project name and files are required" },
        { status: 400 },
      );
    }

    const managedFolders = yield* ManagedProjectFolders.ManagedProjectFolders;
    const result = yield* managedFolders
      .importUploadedProject({
        name,
        files: files.map((f) => ({
          relativePath: f.relativePath,
          content: f.content,
          encoding: f.encoding ?? "utf8",
        })),
      })
      .pipe(
        Effect.map((res) => ({
          ok: true as const,
          projectId: res.projectId,
          workspaceRoot: res.workspaceRoot,
          commitError: res.commitError,
        })),
        Effect.catchCause((cause) =>
          Effect.succeed({
            ok: false as const,
            error: Cause.pretty(cause),
          }),
        ),
      );

    return HttpServerResponse.jsonUnsafe(result);
  }).pipe(
    Effect.catchCause((cause) =>
      Effect.succeed(HttpServerResponse.jsonUnsafe({ ok: false, error: Cause.pretty(cause) })),
    ),
  ),
);

export const layerDirectProjectCloneRoute = HttpRouter.add(
  "POST",
  "/api/project/clone-direct",
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const bodyJson = (yield* request.json.pipe(Effect.orElseSucceed(() => ({}) as any))) as {
      name?: string;
      repoUrl?: string;
    };

    const repoUrl = bodyJson?.repoUrl?.trim();
    if (!repoUrl) {
      return HttpServerResponse.jsonUnsafe(
        { ok: false, error: "Repository URL is required" },
        { status: 400 },
      );
    }

    const rawName =
      bodyJson?.name?.trim() ||
      repoUrl
        .split("/")
        .pop()
        ?.replace(/\.git$/, "") ||
      "cloned-repo";
    const name = rawName.replace(/[^a-zA-Z0-9_-]/g, "-");

    const managedFolders = yield* ManagedProjectFolders.ManagedProjectFolders;
    const created = yield* managedFolders.createNamedProject({ name });
    const targetDir = created.workspaceRoot;

    const cloneResult = yield* Effect.promise(() =>
      runBashCommandOnHost(
        `rm -rf "${targetDir}" && git clone --depth 1 "${repoUrl}" "${targetDir}"`,
        "/tmp",
        120_000,
      ),
    );

    if (cloneResult.exitCode !== 0) {
      return HttpServerResponse.jsonUnsafe({
        ok: false,
        error: cloneResult.stderr || "Git clone failed",
      });
    }

    return HttpServerResponse.jsonUnsafe({
      ok: true,
      projectId: created.projectId,
      workspaceRoot: targetDir,
    });
  }).pipe(
    Effect.catchCause((cause) =>
      Effect.succeed(HttpServerResponse.jsonUnsafe({ ok: false, error: Cause.pretty(cause) })),
    ),
  ),
);

export const layerDirectProjectDeleteRoute = HttpRouter.add(
  "POST",
  "/api/project/delete-direct",
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const bodyJson = (yield* request.json.pipe(Effect.orElseSucceed(() => null))) as {
      readonly projectId?: string;
    } | null;

    const projectId = typeof bodyJson?.projectId === "string" ? bodyJson.projectId.trim() : "";
    if (!projectId) {
      return HttpServerResponse.jsonUnsafe(
        { ok: false, error: "Project ID is required" },
        { status: 400 },
      );
    }

    const projectService = yield* ProjectService.ProjectService;
    const now = yield* Clock.currentTimeMillis;

    yield* projectService
      .delete({
        commandId: CommandId.make(`direct-delete:${projectId}:${now}`),
        projectId: ProjectId.make(projectId),
        force: true,
      })
      .pipe(Effect.ignore);

    return HttpServerResponse.jsonUnsafe({
      ok: true,
      projectId,
    });
  }).pipe(
    Effect.catchCause((cause) =>
      Effect.succeed(HttpServerResponse.jsonUnsafe({ ok: false, error: Cause.pretty(cause) })),
    ),
  ),
);

export const layerPreviewLogsSyncRoute = HttpRouter.add(
  "POST",
  "/api/preview/sync-logs",
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const bodyJson = (yield* request.json.pipe(Effect.orElseSucceed(() => null))) as {
      readonly threadId?: string;
      readonly projectCwd?: string;
      readonly errors?: Array<{ level: string; text: string; timestamp?: string }>;
    } | null;

    if (bodyJson?.threadId && Array.isArray(bodyJson.errors)) {
      for (const err of bodyJson.errors) {
        ServerBrowser.recordPreviewError(bodyJson.threadId, {
          level: err.level || "error",
          text: err.text || "",
          timestamp: err.timestamp || new Date().toISOString(),
        });
      }
    }

    if (bodyJson?.projectCwd && Array.isArray(bodyJson.errors) && bodyJson.errors.length > 0) {
      try {
        const autocodeDir = NodeFs.existsSync(bodyJson.projectCwd)
          ? `${bodyJson.projectCwd}/.autocode`
          : null;
        if (autocodeDir) {
          if (!NodeFs.existsSync(autocodeDir)) {
            NodeFs.mkdirSync(autocodeDir, { recursive: true });
          }
          NodeFs.writeFileSync(
            `${autocodeDir}/preview_logs.json`,
            JSON.stringify(bodyJson.errors, null, 2),
            "utf-8",
          );
        }
      } catch {
        // ignore
      }
    }

    return HttpServerResponse.jsonUnsafe({ ok: true });
  }).pipe(
    Effect.catchCause((cause) =>
      Effect.succeed(HttpServerResponse.jsonUnsafe({ ok: false, error: Cause.pretty(cause) })),
    ),
  ),
);

export const layerProjectDownloadZipRoute = HttpRouter.add(
  "GET",
  "/api/project/download-zip",
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const url = new URL(request.url, "http://127.0.0.1");
    const workspaceRoot = url.searchParams.get("workspaceRoot") || url.searchParams.get("cwd");
    const rawName =
      url.searchParams.get("name") ||
      (workspaceRoot ? workspaceRoot.split("/").filter(Boolean).pop() : "project");

    if (!workspaceRoot || workspaceRoot.trim().length === 0) {
      return HttpServerResponse.jsonUnsafe(
        { ok: false, error: "workspaceRoot parameter is required" },
        { status: 400 },
      );
    }

    const fileSystem = yield* FileSystem.FileSystem;
    const exists = yield* fileSystem.exists(workspaceRoot).pipe(Effect.orElseSucceed(() => false));
    if (!exists) {
      return HttpServerResponse.jsonUnsafe(
        { ok: false, error: `Directory not found: ${workspaceRoot}` },
        { status: 404 },
      );
    }

    const tempZipFile = `/tmp/t3_dl_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.zip`;
    // High-performance pruning zip: skips entering heavy folders (node_modules, .git, etc.) completely
    const zipCmd = `if [ -z "$(find . -mindepth 1 -maxdepth 1 2>/dev/null)" ]; then touch .t3_empty && zip -q "${tempZipFile}" .t3_empty && rm -f .t3_empty; else find . -mindepth 1 -type d \\( -name "node_modules" -o -name ".git" -o -name "dist" -o -name ".next" -o -name "build" -o -name ".cache" -o -name ".turbo" -o -name ".venv" -o -name "__pycache__" -o -name ".t3" -o -name ".autocode" \\) -prune -o -print | zip -q "${tempZipFile}" -@ || ( [ $? -eq 12 ] && touch .t3_empty && zip -q "${tempZipFile}" .t3_empty && rm -f .t3_empty ); fi`;

    const zipResult = yield* Effect.promise(() =>
      runBashCommandOnHost(zipCmd, workspaceRoot, 120_000),
    );
    if (zipResult.exitCode !== 0) {
      return HttpServerResponse.jsonUnsafe(
        { ok: false, error: zipResult.stderr || "Failed to package ZIP archive" },
        { status: 500 },
      );
    }

    const zipBytes = yield* fileSystem.readFile(tempZipFile).pipe(Effect.orElseSucceed(() => null));
    yield* fileSystem.remove(tempZipFile).pipe(Effect.ignore);

    if (!zipBytes) {
      return HttpServerResponse.jsonUnsafe(
        { ok: false, error: "Could not read generated zip file" },
        { status: 500 },
      );
    }

    const safeName = (rawName || "project").replace(/[^a-zA-Z0-9_-]/g, "_");
    return HttpServerResponse.raw(zipBytes, {
      contentType: "application/zip",
      headers: {
        "Content-Disposition": downloadContentDisposition(`${safeName}.zip`),
        "Content-Length": String(zipBytes.byteLength),
      },
    });
  }).pipe(
    Effect.catchCause((cause) =>
      Effect.succeed(HttpServerResponse.jsonUnsafe({ ok: false, error: Cause.pretty(cause) })),
    ),
  ),
);

export const layerProjectExtractZipRoute = HttpRouter.add(
  "POST",
  "/api/project/extract-zip",
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const fileSystem = yield* FileSystem.FileSystem;
    const pathService = yield* Path.Path;
    const contentType = (request.headers["content-type"] || "").toLowerCase();
    const url = new URL(request.url, "http://127.0.0.1");

    const headerTargetCwd = request.headers["x-target-cwd"]
      ? decodeURIComponent(request.headers["x-target-cwd"])
      : undefined;
    const queryTargetCwd = url.searchParams.get("targetCwd") || url.searchParams.get("cwd");
    const zipName =
      url.searchParams.get("zipName") ||
      url.searchParams.get("fileName") ||
      (request.headers["x-zip-name"]
        ? decodeURIComponent(request.headers["x-zip-name"])
        : undefined);

    let targetCwd = (headerTargetCwd || queryTargetCwd || "").trim();

    // 1. Direct binary stream mode (application/octet-stream, zip, or stream with targetCwd)
    if (
      contentType.includes("octet-stream") ||
      contentType.includes("zip") ||
      (targetCwd.length > 0 && !contentType.includes("application/json"))
    ) {
      if (!targetCwd) {
        return HttpServerResponse.jsonUnsafe(
          {
            ok: false,
            error: "targetCwd is required in X-Target-Cwd header or targetCwd query parameter",
          },
          { status: 400 },
        );
      }

      // If zipName is provided, extract into a project subfolder named after the zip
      if (zipName) {
        const folderName = zipName.replace(/\.zip$/i, "").trim();
        if (folderName && !targetCwd.endsWith(`/${folderName}`)) {
          targetCwd = pathService.join(targetCwd, folderName);
        }
      }

      const tempZipFile = `/tmp/t3_ext_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.zip`;
      yield* fileSystem.makeDirectory(targetCwd, { recursive: true }).pipe(Effect.ignore);
      // Stream directly to temporary zip file on disk with zero in-memory buffer overhead
      yield* Stream.run(request.stream, fileSystem.sink(tempZipFile));

      const unzipCmd = `unzip -q -o "${tempZipFile}" -d "${targetCwd}"`;
      const unzipResult = yield* Effect.promise(() =>
        runBashCommandOnHost(unzipCmd, targetCwd, 600_000),
      );
      yield* fileSystem.remove(tempZipFile).pipe(Effect.ignore);

      if (unzipResult.exitCode !== 0) {
        return HttpServerResponse.jsonUnsafe({
          ok: false,
          error: unzipResult.stderr || "Failed to extract ZIP archive",
        });
      }

      return HttpServerResponse.jsonUnsafe({
        ok: true,
        targetCwd,
        message: `Extracted to ${targetCwd}`,
      });
    }

    // 2. JSON mode: could be existing zipPath on disk or zipBase64
    const bodyJson = (yield* request.json.pipe(Effect.orElseSucceed(() => ({}) as any))) as {
      targetCwd?: string;
      zipBase64?: string;
      zipPath?: string;
      extractToSubfolder?: boolean;
    };

    targetCwd = targetCwd || bodyJson?.targetCwd?.trim() || "";

    // Case A: zipPath on server disk (Instant unzip without re-upload)
    if (bodyJson?.zipPath) {
      const resolvedZip = pathService.resolve(bodyJson.zipPath.trim());
      if (!NodeFs.existsSync(resolvedZip)) {
        return HttpServerResponse.jsonUnsafe(
          { ok: false, error: `File not found: ${resolvedZip}` },
          { status: 404 },
        );
      }

      const baseName = pathService.basename(resolvedZip);
      const folderName = baseName.replace(/\.zip$/i, "").trim();

      // If targetCwd is not given, extract to same folder with zip's name
      if (!targetCwd) {
        targetCwd = pathService.join(pathService.dirname(resolvedZip), folderName);
      } else if (bodyJson.extractToSubfolder !== false && !targetCwd.endsWith(`/${folderName}`)) {
        targetCwd = pathService.join(targetCwd, folderName);
      }

      yield* fileSystem.makeDirectory(targetCwd, { recursive: true }).pipe(Effect.ignore);
      const unzipCmd = `unzip -q -o "${resolvedZip}" -d "${targetCwd}"`;
      const unzipResult = yield* Effect.promise(() =>
        runBashCommandOnHost(unzipCmd, targetCwd, 600_000),
      );

      if (unzipResult.exitCode !== 0) {
        return HttpServerResponse.jsonUnsafe({
          ok: false,
          error: unzipResult.stderr || "Failed to extract ZIP archive",
        });
      }

      return HttpServerResponse.jsonUnsafe({
        ok: true,
        targetCwd,
        folderName,
        message: `ZIP extracted into ${targetCwd}`,
      });
    }

    // Case B: Base64 payload
    const zipBase64 = bodyJson?.zipBase64;
    if (!targetCwd || !zipBase64) {
      return HttpServerResponse.jsonUnsafe(
        { ok: false, error: "targetCwd and (zipPath or zipBase64) are required" },
        { status: 400 },
      );
    }

    const tempZipFile = `/tmp/t3_ext_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.zip`;
    yield* fileSystem.makeDirectory(targetCwd, { recursive: true }).pipe(Effect.ignore);
    const zipBuffer = Buffer.from(zipBase64, "base64");
    yield* fileSystem.writeFile(tempZipFile, zipBuffer).pipe(Effect.ignore);

    const unzipCmd = `unzip -q -o "${tempZipFile}" -d "${targetCwd}"`;
    const unzipResult = yield* Effect.promise(() =>
      runBashCommandOnHost(unzipCmd, targetCwd, 600_000),
    );
    yield* fileSystem.remove(tempZipFile).pipe(Effect.ignore);

    if (unzipResult.exitCode !== 0) {
      return HttpServerResponse.jsonUnsafe({
        ok: false,
        error: unzipResult.stderr || "Failed to extract ZIP archive",
      });
    }

    return HttpServerResponse.jsonUnsafe({
      ok: true,
      targetCwd,
      message: "ZIP archive extracted successfully",
    });
  }).pipe(
    Effect.catchCause((cause) =>
      Effect.succeed(HttpServerResponse.jsonUnsafe({ ok: false, error: Cause.pretty(cause) })),
    ),
  ),
);

export const layerFsBrowseRoute = HttpRouter.add(
  "POST",
  "/api/fs/browse",
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const pathService = yield* Path.Path;
    const bodyJson = (yield* request.json.pipe(Effect.orElseSucceed(() => ({}) as any))) as {
      path?: string;
    };

    const homeDir = process.env.HOME || process.env.USERPROFILE || "/";
    let target = bodyJson?.path?.trim() || homeDir;
    if (target.startsWith("~")) {
      target = target.replace(/^~/, homeDir);
    }
    const resolved = pathService.resolve(target);

    const fileSystem = yield* FileSystem.FileSystem;
    const exists = yield* fileSystem.exists(resolved).pipe(Effect.orElseSucceed(() => false));
    if (!exists) {
      return HttpServerResponse.jsonUnsafe({
        ok: true,
        currentPath: resolved,
        exists: false,
        parentPath: pathService.dirname(resolved),
        homePath: homeDir,
        directories: [],
      });
    }

    const entries = yield* fileSystem.readDirectory(resolved).pipe(Effect.orElseSucceed(() => []));
    const directories: string[] = [];
    const files: Array<{ name: string; size: number; mtime: number }> = [];

    for (const entry of entries) {
      if (entry === "." || entry === "..") continue;
      const full = pathService.join(resolved, entry);
      const stat = yield* fileSystem.stat(full).pipe(Effect.option);
      if (Option.isSome(stat)) {
        if (stat.value.type === "Directory") {
          directories.push(entry);
        } else if (stat.value.type === "File") {
          files.push({
            name: entry,
            size: Number(stat.value.size),
            mtime: Option.getOrElse(stat.value.mtime, () => new Date()).getTime(),
          });
        }
      }
    }

    directories.sort((a, b) => a.localeCompare(b));
    files.sort((a, b) => a.name.localeCompare(b.name));

    return HttpServerResponse.jsonUnsafe({
      ok: true,
      currentPath: resolved,
      exists: true,
      parentPath: pathService.dirname(resolved),
      homePath: homeDir,
      directories,
      files,
    });
  }).pipe(
    Effect.catchCause((cause) =>
      Effect.succeed(HttpServerResponse.jsonUnsafe({ ok: false, error: Cause.pretty(cause) })),
    ),
  ),
);

export const layerFsPeekRoute = HttpRouter.add(
  "POST",
  "/api/fs/peek",
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const bodyJson = (yield* request.json.pipe(Effect.orElseSucceed(() => ({}) as any))) as {
      path?: string;
    };
    const targetPath = bodyJson?.path?.trim();
    if (!targetPath) {
      return HttpServerResponse.jsonUnsafe(
        { ok: false, error: "Missing file path" },
        { status: 400 },
      );
    }
    const pathService = yield* Path.Path;
    const resolved = pathService.resolve(targetPath);
    const lower = resolved.toLowerCase();
    if (
      lower.startsWith("/etc/shadow") ||
      lower.startsWith("/etc/sudoers") ||
      lower.includes("/.ssh/id_")
    ) {
      return HttpServerResponse.jsonUnsafe(
        { ok: false, error: "Access denied: Protected file" },
        { status: 403 },
      );
    }
    if (!NodeFs.existsSync(resolved)) {
      return HttpServerResponse.jsonUnsafe({ ok: false, error: "File not found" }, { status: 404 });
    }
    const stat = NodeFs.statSync(resolved);
    if (!stat.isFile()) {
      return HttpServerResponse.jsonUnsafe(
        { ok: false, error: "Path is not a file" },
        { status: 400 },
      );
    }
    const fileSize = stat.size;
    const maxBytes = 256 * 1024;
    const isLarge = fileSize > maxBytes;
    let content = "";
    try {
      if (isLarge) {
        const fd = NodeFs.openSync(resolved, "r");
        const buf = Buffer.alloc(maxBytes);
        const bytesRead = NodeFs.readSync(fd, buf, 0, maxBytes, 0);
        NodeFs.closeSync(fd);
        content = buf.subarray(0, bytesRead).toString("utf-8");
      } else {
        content = NodeFs.readFileSync(resolved, "utf-8");
      }
    } catch (readErr: any) {
      content = `[Unable to read file: ${readErr?.message || String(readErr)}]`;
    }
    return HttpServerResponse.jsonUnsafe({
      ok: true,
      path: resolved,
      filename: pathService.basename(resolved),
      size: fileSize,
      truncated: isLarge,
      content,
    });
  }).pipe(
    Effect.catchCause((cause) =>
      Effect.succeed(HttpServerResponse.jsonUnsafe({ ok: false, error: Cause.pretty(cause) })),
    ),
  ),
);

export const layerFsDownloadRoute = HttpRouter.add(
  "GET",
  "/api/fs/download",
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const url = HttpServerRequest.toURL(request);
    const targetPath = Option.getOrUndefined(url)?.searchParams.get("path")?.trim();
    if (!targetPath) {
      return HttpServerResponse.text("Missing file path parameter", { status: 400 });
    }
    const pathService = yield* Path.Path;
    const resolved = pathService.resolve(targetPath);
    const dlLower = resolved.toLowerCase();
    if (
      dlLower.startsWith("/etc/shadow") ||
      dlLower.startsWith("/etc/sudoers") ||
      dlLower.includes("/.ssh/id_")
    ) {
      return HttpServerResponse.text("Access denied: Protected file", { status: 403 });
    }
    const fileSystem = yield* FileSystem.FileSystem;
    const stat = yield* fileSystem.stat(resolved).pipe(Effect.option);
    if (Option.isNone(stat) || stat.value.type !== "File") {
      return HttpServerResponse.text("File not found or is a directory", { status: 404 });
    }
    const filename = pathService.basename(resolved);
    return yield* HttpServerResponse.file(resolved, {
      headers: {
        "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
      },
    });
  }).pipe(
    Effect.catchCause(() =>
      Effect.succeed(HttpServerResponse.text("Failed to download file", { status: 500 })),
    ),
  ),
);

let prevCpuTimes = { idle: 0, total: 0 };
function getLiveCpuPercent(): number {
  const cpus = NodeOs.cpus();
  let idle = 0;
  let total = 0;
  for (const cpu of cpus) {
    for (const type in cpu.times) {
      total += (cpu.times as any)[type];
    }
    idle += cpu.times.idle;
  }
  if (prevCpuTimes.total === 0) {
    prevCpuTimes = { idle, total };
    const load1m = NodeOs.loadavg()[0] || 0;
    return Math.min(100, Math.max(1, Math.round((load1m / (cpus.length || 1)) * 100)));
  }
  const diffIdle = idle - prevCpuTimes.idle;
  const diffTotal = total - prevCpuTimes.total;
  prevCpuTimes = { idle, total };
  if (diffTotal <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round(((diffTotal - diffIdle) / diffTotal) * 100)));
}

export const layerTerminalQuickStatsRoute = HttpRouter.add(
  "GET",
  "/api/terminal/quick-stats",
  Effect.gen(function* () {
    const totalMem = NodeOs.totalmem();
    const freeMem = NodeOs.freemem();
    const usedMem = totalMem - freeMem;
    const memPercent = Math.round((usedMem / totalMem) * 100);

    let diskFreeGb = "0";
    let diskTotalGb = "0";
    let diskPercent = 0;
    try {
      const stat = NodeFs.statfsSync("/");
      const totalBytes = stat.blocks * stat.bsize;
      const freeBytes = stat.bavail * stat.bsize;
      const usedBytes = totalBytes - freeBytes;
      diskTotalGb = (totalBytes / (1024 * 1024 * 1024)).toFixed(1);
      diskFreeGb = (freeBytes / (1024 * 1024 * 1024)).toFixed(1);
      diskPercent = Math.round((usedBytes / totalBytes) * 100);
    } catch {
      // ignore
    }

    const uptimeSec = NodeOs.uptime();
    const uptimeDays = Math.floor(uptimeSec / 86400);
    const uptimeHours = Math.floor((uptimeSec % 86400) / 3600);
    const uptimeStr = uptimeDays > 0 ? `${uptimeDays}d ${uptimeHours}h` : `${uptimeHours}h`;

    const cpuPercent = getLiveCpuPercent();

    return HttpServerResponse.jsonUnsafe({
      ok: true,
      cpuPercent,
      memPercent,
      memUsedGb: (usedMem / (1024 * 1024 * 1024)).toFixed(1),
      memTotalGb: (totalMem / (1024 * 1024 * 1024)).toFixed(1),
      diskPercent,
      diskFreeGb,
      diskTotalGb,
      uptimeStr,
      cpuCount: NodeOs.cpus().length,
      loadAvg: NodeOs.loadavg()
        .map((n) => n.toFixed(2))
        .join(", "),
    });
  }),
);

class CreateDirectoryError extends Data.TaggedError("CreateDirectoryError")<{
  readonly message: string;
}> {}

export const layerFsEnsureDirRoute = HttpRouter.add(
  "POST",
  "/api/fs/ensure-dir",
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const pathService = yield* Path.Path;
    const bodyJson = (yield* request.json.pipe(Effect.orElseSucceed(() => ({}) as any))) as {
      path?: string;
    };

    const homeDir = process.env.HOME || process.env.USERPROFILE || "/";
    const storageFolderName = "autocode-storage";
    let target = bodyJson?.path?.trim() || pathService.join(homeDir, storageFolderName);
    if (target.startsWith("~")) {
      target = target.replace(/^~/, homeDir);
    }
    let resolved = pathService.resolve(target);
    if (pathService.basename(resolved).toLowerCase() !== storageFolderName.toLowerCase()) {
      resolved = pathService.join(resolved, storageFolderName);
    }

    const fileSystem = yield* FileSystem.FileSystem;
    yield* fileSystem.makeDirectory(resolved, { recursive: true }).pipe(
      Effect.mapError(
        (cause) =>
          new CreateDirectoryError({
            message: `Could not create directory ${resolved}: ${String(cause)}`,
          }),
      ),
    );

    return HttpServerResponse.jsonUnsafe({
      ok: true,
      path: resolved,
    });
  }).pipe(
    Effect.catchCause((cause) =>
      Effect.succeed(HttpServerResponse.jsonUnsafe({ ok: false, error: Cause.pretty(cause) })),
    ),
  ),
);

export const layerFsSaveRoute = HttpRouter.add(
  "POST",
  "/api/fs/save",
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const bodyJson = (yield* request.json.pipe(Effect.orElseSucceed(() => ({}) as any))) as {
      path?: string;
      content?: string;
    };
    const targetPath = bodyJson?.path?.trim();
    if (!targetPath) {
      return HttpServerResponse.jsonUnsafe(
        { ok: false, error: "Missing file path" },
        { status: 400 },
      );
    }
    const pathService = yield* Path.Path;
    const resolved = pathService.resolve(targetPath);
    const rootPath = pathService.resolve("/");
    const forbiddenPrefixes = ["/etc", "/proc", "/sys", "/boot", "/dev", "/bin", "/sbin"];
    if (resolved === rootPath || forbiddenPrefixes.some((p) => resolved.startsWith(p))) {
      return HttpServerResponse.jsonUnsafe(
        { ok: false, error: "Access denied: Cannot write to system directory" },
        { status: 403 },
      );
    }
    const content = bodyJson.content ?? "";
    try {
      NodeFs.writeFileSync(resolved, content, "utf-8");
      return HttpServerResponse.jsonUnsafe({ ok: true, path: resolved });
    } catch (err: any) {
      return HttpServerResponse.jsonUnsafe(
        { ok: false, error: err?.message || String(err) },
        { status: 500 },
      );
    }
  }).pipe(
    Effect.catchCause((cause) =>
      Effect.succeed(HttpServerResponse.jsonUnsafe({ ok: false, error: Cause.pretty(cause) })),
    ),
  ),
);

export const layerFsDeleteRoute = HttpRouter.add(
  "POST",
  "/api/fs/delete",
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const bodyJson = (yield* request.json.pipe(Effect.orElseSucceed(() => ({}) as any))) as {
      path?: string;
    };
    const targetPath = bodyJson?.path?.trim();
    if (!targetPath) {
      return HttpServerResponse.jsonUnsafe({ ok: false, error: "Missing path" }, { status: 400 });
    }
    const pathService = yield* Path.Path;
    const resolved = pathService.resolve(targetPath);
    const rootPath = pathService.resolve("/");
    const forbiddenDirs = new Set([
      rootPath,
      "/home",
      "/etc",
      "/usr",
      "/var",
      "/bin",
      "/sbin",
      "/boot",
      "/sys",
      "/proc",
      "/dev",
      "/lib",
      "/lib64",
    ]);
    if (forbiddenDirs.has(resolved) || resolved === rootPath || resolved.length <= 1) {
      return HttpServerResponse.jsonUnsafe(
        { ok: false, error: "Access denied: Cannot delete root or critical system directory" },
        { status: 403 },
      );
    }
    try {
      if (NodeFs.existsSync(resolved)) {
        NodeFs.rmSync(resolved, { recursive: true, force: true });
      }
      return HttpServerResponse.jsonUnsafe({ ok: true, path: resolved });
    } catch (err: any) {
      return HttpServerResponse.jsonUnsafe(
        { ok: false, error: err?.message || String(err) },
        { status: 500 },
      );
    }
  }).pipe(
    Effect.catchCause((cause) =>
      Effect.succeed(HttpServerResponse.jsonUnsafe({ ok: false, error: Cause.pretty(cause) })),
    ),
  ),
);

export const layerFsCreateRoute = HttpRouter.add(
  "POST",
  "/api/fs/create",
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const bodyJson = (yield* request.json.pipe(Effect.orElseSucceed(() => ({}) as any))) as {
      parentPath?: string;
      name?: string;
      type?: "file" | "directory";
    };
    const parent = bodyJson?.parentPath?.trim();
    const name = bodyJson?.name?.trim();
    const type = bodyJson?.type || "file";
    if (!parent || !name) {
      return HttpServerResponse.jsonUnsafe(
        { ok: false, error: "Missing parentPath or name" },
        { status: 400 },
      );
    }
    const pathService = yield* Path.Path;
    const resolved = pathService.join(pathService.resolve(parent), name);
    try {
      if (type === "directory") {
        NodeFs.mkdirSync(resolved, { recursive: true });
      } else {
        NodeFs.writeFileSync(resolved, "");
      }
      return HttpServerResponse.jsonUnsafe({ ok: true, path: resolved });
    } catch (err: any) {
      return HttpServerResponse.jsonUnsafe(
        { ok: false, error: err?.message || String(err) },
        { status: 500 },
      );
    }
  }).pipe(
    Effect.catchCause((cause) =>
      Effect.succeed(HttpServerResponse.jsonUnsafe({ ok: false, error: Cause.pretty(cause) })),
    ),
  ),
);

export const layerFsUploadRoute = HttpRouter.add(
  "POST",
  "/api/fs/upload",
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const bodyJson = (yield* request.json.pipe(Effect.orElseSucceed(() => ({}) as any))) as {
      targetDir?: string;
      fileName?: string;
      base64?: string;
    };
    const targetDir = bodyJson?.targetDir?.trim();
    const fileName = bodyJson?.fileName?.trim();
    if (!targetDir || !fileName || bodyJson?.base64 === undefined) {
      return HttpServerResponse.jsonUnsafe(
        { ok: false, error: "Missing targetDir, fileName, or base64 data" },
        { status: 400 },
      );
    }
    const pathService = yield* Path.Path;
    const resolvedDir = pathService.resolve(targetDir);
    const resolvedFile = pathService.resolve(resolvedDir, fileName);
    if (!resolvedFile.startsWith(resolvedDir)) {
      return HttpServerResponse.jsonUnsafe(
        { ok: false, error: "Access denied: Path traversal detected" },
        { status: 403 },
      );
    }
    try {
      const parentDir = pathService.dirname(resolvedFile);
      if (!NodeFs.existsSync(parentDir)) {
        NodeFs.mkdirSync(parentDir, { recursive: true });
      }
      const buffer = Buffer.from(bodyJson.base64, "base64");
      NodeFs.writeFileSync(resolvedFile, buffer);
      return HttpServerResponse.jsonUnsafe({
        ok: true,
        path: resolvedFile,
        size: buffer.length,
      });
    } catch (err: any) {
      return HttpServerResponse.jsonUnsafe(
        { ok: false, error: err?.message || String(err) },
        { status: 500 },
      );
    }
  }).pipe(
    Effect.catchCause((cause) =>
      Effect.succeed(HttpServerResponse.jsonUnsafe({ ok: false, error: Cause.pretty(cause) })),
    ),
  ),
);

const decodeBuildManifest = Schema.decodeUnknownEffect(
  Schema.fromJsonString(
    Schema.Record(
      Schema.String,
      Schema.Struct({
        file: Schema.String,
        css: Schema.optional(Schema.Array(Schema.String)),
        assets: Schema.optional(Schema.Array(Schema.String)),
      }),
    ),
  ),
);

const loadImmutableBuildAssets = Effect.gen(function* () {
  const config = yield* ServerConfig.ServerConfig;
  const staticDir = config.staticDir ?? (yield* ServerConfig.resolveStaticDir());
  if (!staticDir) return new Set<string>();
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  return yield* fileSystem.readFileString(path.join(staticDir, ".vite", "manifest.json")).pipe(
    Effect.flatMap(decodeBuildManifest),
    Effect.map(
      (manifest) =>
        new Set(
          Object.values(manifest).flatMap((entry) => [
            entry.file,
            ...(entry.css ?? []),
            ...(entry.assets ?? []),
          ]),
        ),
    ),
    Effect.orElseSucceed(() => new Set<string>()),
  );
});

const openStaticFile = Effect.fn("openStaticFile")(function* (filePath: string) {
  const fileSystem = yield* FileSystem.FileSystem;
  // Reject directories and special files before opening. Response metadata comes from the handle.
  const pathInfo = yield* fileSystem.stat(filePath).pipe(Effect.orElseSucceed(() => null));
  if (pathInfo?.type !== "File") return null;
  const file = yield* fileSystem.open(filePath, { flag: "r" });
  const info = yield* file.stat;
  return info.type === "File" ? { file, info } : null;
});

const streamStaticFile = (file: FileSystem.File, size: bigint) =>
  Stream.unfold(
    0n,
    Effect.fnUntraced(function* (offset: bigint) {
      if (offset >= size) return;
      const remaining = size - offset;
      const bytes = yield* file.readAlloc(Number(remaining < 65_536n ? remaining : 65_536n));
      if (Option.isNone(bytes)) return;
      return [bytes.value, offset + BigInt(bytes.value.byteLength)] as const;
    }),
  );

const handleStaticAndDevRequest = Effect.fn("handleStaticAndDevRequest")(
  function* (immutableBuildAssets: ReadonlySet<string>) {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const url = HttpServerRequest.toURL(request);

    if (Option.isNone(url)) {
      return HttpServerResponse.text("Bad Request", { status: 400 });
    }

    const config = yield* ServerConfig.ServerConfig;
    if (config.devUrl && isDevProxiedPath(url.value.pathname)) {
      return HttpServerResponse.text("Not Found", { status: 404 });
    }

    if (config.devUrl && isLoopbackHostname(url.value.hostname)) {
      return HttpServerResponse.redirect(resolveDevRedirectUrl(config.devUrl, url.value), {
        status: 302,
      });
    }

    const staticDir = config.staticDir ?? (yield* ServerConfig.resolveStaticDir());
    if (!staticDir) {
      return HttpServerResponse.text("No static directory configured and no dev URL set.", {
        status: 503,
      });
    }

    const path = yield* Path.Path;
    const staticRoot = path.resolve(staticDir);
    const staticRequestPath = url.value.pathname === "/" ? "/index.html" : url.value.pathname;
    const rawStaticRelativePath = staticRequestPath.replace(/^[/\\]+/, "");
    const hasRawLeadingParentSegment = rawStaticRelativePath.startsWith("..");
    const staticRelativePath = path.normalize(rawStaticRelativePath).replace(/^[/\\]+/, "");
    const hasPathTraversalSegment = staticRelativePath.startsWith("..");
    if (
      staticRelativePath.length === 0 ||
      hasRawLeadingParentSegment ||
      hasPathTraversalSegment ||
      staticRelativePath.includes("\0")
    ) {
      return HttpServerResponse.text("Invalid static file path", { status: 400 });
    }

    const isWithinStaticRoot = (candidate: string) =>
      candidate === staticRoot ||
      candidate.startsWith(staticRoot.endsWith(path.sep) ? staticRoot : `${staticRoot}${path.sep}`);

    let filePath = path.resolve(staticRoot, staticRelativePath);
    if (!isWithinStaticRoot(filePath)) {
      return HttpServerResponse.text("Invalid static file path", { status: 400 });
    }

    const ext = path.extname(filePath);
    if (!ext) {
      filePath = path.resolve(filePath, "index.html");
      if (!isWithinStaticRoot(filePath)) {
        return HttpServerResponse.text("Invalid static file path", { status: 400 });
      }
    }

    let opened = yield* openStaticFile(filePath);
    if (!opened) {
      filePath = path.resolve(staticRoot, "index.html");
      opened = yield* openStaticFile(filePath);
      if (!opened) {
        return HttpServerResponse.text("Not Found", { status: 404 });
      }
    }
    const fileInfo = opened.info;
    const mimeType = Option.getOrElse(Mime.getType(filePath), () => "application/octet-stream");
    const isHtml = mimeType === "text/html";

    // A hash-like name is not enough: custom static files can use the same naming pattern.
    const relativePath = path.relative(staticRoot, filePath).replaceAll("\\", "/");
    const immutable =
      !isHtml &&
      /^assets\/.+-[\w-]{8}\.[^/]+$/.test(relativePath) &&
      immutableBuildAssets.has(relativePath);
    const headers: Record<string, string> = {
      "Cache-Control": immutable ? "public, max-age=31536000, immutable" : "no-cache",
    };
    // Deployments can preserve HTML size and mtime while changing its bundle URLs.
    const modifiedAt = isHtml ? undefined : Option.getOrUndefined(fileInfo.mtime);
    const etag = modifiedAt
      ? `W/"${fileInfo.size.toString(16)}-${modifiedAt.getTime().toString(16)}"`
      : undefined;
    if (etag !== undefined && modifiedAt !== undefined) {
      headers.ETag = etag;
      headers["Last-Modified"] = modifiedAt.toUTCString();
    }

    // If-None-Match takes precedence over dates and uses weak comparison for
    // GET/HEAD, including when compression changes the transferred bytes.
    const ifNoneMatch = request.headers["if-none-match"];
    const ifModifiedSince = request.headers["if-modified-since"];
    const unchanged =
      ifNoneMatch !== undefined
        ? ifNoneMatch.split(",").some((value) => {
            const candidate = value.trim();
            return (
              candidate === "*" ||
              (etag !== undefined && candidate.replace(/^W\//i, "") === etag.slice(2))
            );
          })
        : ifModifiedSince !== undefined &&
          modifiedAt !== undefined &&
          Date.parse(modifiedAt.toUTCString()) <= Date.parse(ifModifiedSince);
    if (!isHtml && unchanged) {
      return HttpServerResponse.empty({
        status: 304,
        headers: { ...headers, Vary: "Accept-Encoding" },
      });
    }

    const contentType = isHtml ? "text/html; charset=utf-8" : mimeType;
    // The request scope closes the handle for GET, HEAD, 304, errors, and cancellation.
    // HEAD still passes through compression, which selects headers without reading the stream.
    return HttpServerResponse.stream(streamStaticFile(opened.file, fileInfo.size), {
      headers,
      contentType,
      contentLength: Number(fileInfo.size),
    });
  },
  Effect.catchTags({
    PlatformError: () =>
      Effect.succeed(HttpServerResponse.text("Internal Server Error", { status: 500 })),
  }),
);

// Read the installed build's manifest once. Unknown files use revalidation.
export const layerStaticAndDevRoute = Layer.unwrap(
  loadImmutableBuildAssets.pipe(
    Effect.map((assets) => HttpRouter.add("GET", "*", handleStaticAndDevRequest(assets))),
  ),
);
