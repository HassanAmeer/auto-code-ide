// @effect-diagnostics nodeBuiltinImport:off globalConsole:off globalConsoleInEffect:off globalDate:off globalDateInEffect:off globalRandomInEffect:off globalErrorInEffectFailure:off preferSchemaOverJson:off globalFetchInEffect:off anyUnknownInErrorContext:off globalFetch:off globalTimers:off
/**
 * OpenCode Free Lane — Main Bypass Client
 *
 * Yeh lightweight fetch-based client hai jo OpenCode ke upstream free gate ko
 * directly hit karta hai — bina heavy OpenCode CLI ke, bina login ke, bina
 * API key ke.
 *
 * Reference: https://github.com/Ebony-Vinyl/dsh-our-free-model
 *
 * @module provider-opencodebypasssetup/server/bypass/client
 */

import { buildBypassHeaders, injectFingerprintTools, UPSTREAM_BASE } from "./fingerprint.ts";
import { mintSession } from "./session.ts";
import { getBypassDispatcher } from "./proxy.ts";
import { resolveCustomRoute } from "./modelRoute.ts";
import { fetch as undiciFetch } from "undici";

export const OPENCODE_BYPASS_ENABLED: boolean = process.env.OPENCODE_BYPASS_ENABLED !== "false";

/** Free lane me default models — synced with live opencode.ai/inference/v1/models */
export const FREE_MODELS = [
  "beam-free",
  "big-pickle",
  "deepseek-v4.1-flash-free",
  "kimi-k3",
  "flint-40b-free",
  "mimo-v2.6-flash-free",
] as const;

export interface BypassChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface BypassRequestOptions {
  model: string;
  baseUrl?: string | undefined;
  messages: BypassChatMessage[];
  /** Default: false */
  stream?: boolean | undefined;
  /** Default: 8192 */
  maxTokens?: number | undefined;
  sessionId?: string | undefined;
  _isRetry?: boolean | undefined;
  /**
   * Cooperative cancellation from the caller (e.g. the Watchdog Stop button).
   * Aborting it cancels the in-flight upstream request immediately instead of
   * waiting for the model to finish streaming.
   */
  signal?: AbortSignal | undefined;
}

export interface BypassResponse {
  id: string;
  model: string;
  content: string;
  sessionId: string;
  usage?:
    | {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
      }
    | undefined;
}

export function resolveChatEndpoint(baseUrl?: string): string {
  const base = (baseUrl || UPSTREAM_BASE || "https://opencode.ai").trim().replace(/\/+$/, "");
  if (base.endsWith("/chat/completions")) {
    return base;
  }
  if (base.endsWith("/v1")) {
    return `${base}/chat/completions`;
  }
  if (base.includes("/v1/")) {
    return `${base}/chat/completions`;
  }
  return `${base}/inference/openai/v1/chat/completions`;
}

/**
 * OpenCode free lane se chat completion lao (non-streaming).
 * Free lane streaming expect karti hai, isliye stream karke content collect karte hain.
 */
export async function bypassChat(options: BypassRequestOptions): Promise<BypassResponse> {
  const sessionId = options.sessionId ?? mintSession();
  let content = "";
  await bypassChatStream({ ...options, sessionId }, (chunk) => {
    content += chunk;
  });
  return {
    id: `chatcmpl-${sessionId}`,
    model: options.model,
    content,
    sessionId,
  };
}

/**
 * OpenCode free lane se streaming chat completion lao (SSE).
 * Har chunk callback me milega.
 */
export async function bypassChatStream(
  options: BypassRequestOptions,
  onChunk: (text: string, reasoning?: string) => void,
  onDone?: (sessionId: string) => void,
): Promise<void> {
  const sessionId = options.sessionId ?? mintSession();
  const headers = buildBypassHeaders(sessionId, { stream: true });
  // If the selected model belongs to a configured custom provider, route there
  // instead of the opencode.ai free lane (the thread may still be bound to
  // opencodebypasssetup even after the user picked another provider's model).
  const customRoute = resolveCustomRoute(options.model);
  if (customRoute) {
    headers.authorization = `Bearer ${customRoute.apiKey}`;
    for (const [k, v] of Object.entries(customRoute.headers)) headers[k] = v;
  }

  // FIX: Strip "opencode/" prefix for free lane (upstream returns 400 on prefixed slugs).
  // Only strip when routing to free lane; custom providers may have "/" in their slugs.
  const resolvedModel = customRoute
    ? options.model
    : options.model.replace(/^opencode\//i, "").trim() || "beam-free";
  const { tools, placeholderNote } = injectFingerprintTools([]);

  const messages = [...options.messages];
  if (placeholderNote) {
    const first = messages[0];
    if (first?.role === "system") {
      messages[0] = {
        role: "system",
        content: `${first.content}\n\n${placeholderNote}`,
      };
    } else {
      messages.unshift({
        role: "system",
        content: placeholderNote,
      });
    }
  }

  const body = {
    model: customRoute ? customRoute.model : resolvedModel,
    max_tokens: options.maxTokens ?? 8192,
    messages,
    stream: true,
    tools: tools.map((t) => ({
      type: "function",
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    })),
  };

  const endpoint = customRoute
    ? `${customRoute.baseUrl.replace(/\/+$/, "")}/chat/completions`
    : resolveChatEndpoint(options.baseUrl);

  // If WARP/Privoxy is running, attach dispatcher to bypass datacenter IP 429
  const dispatcher = await getBypassDispatcher();

  const controller = new AbortController();
  let timer: NodeJS.Timeout | null = null;
  let hasReceivedAnyChunk = false;

  // Caller cancellation (the Watchdog Stop button) must kill the upstream
  // request instantly. Without this, "Stop" only set a flag and the model kept
  // streaming for minutes, burning quota and blocking the worker row.
  const callerSignal = options.signal;
  const abortFromCaller = () => controller.abort(new Error("Stopped by user"));
  if (callerSignal) {
    if (callerSignal.aborted) abortFromCaller();
    else callerSignal.addEventListener("abort", abortFromCaller, { once: true });
  }

  const resetTimeout = (ms: number, reason: string) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      controller.abort(new Error(reason));
    }, ms);
  };

  // Initial connection timeout: If upstream server doesn't respond with headers within 25 seconds, abort.
  resetTimeout(
    25_000,
    `[opencode-bypass] HTTP 408 Request Timeout: Model '${options.model}' ke upstream server ne 25 seconds mein response shuru nahi kiya. Upstream server busy ya model queue mein atka hua hai. Settings me ja kar IP Rotate karein ya koi doosra model chunein.`,
  );

  const fetchOptions: any = {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: controller.signal,
  };

  let res: any;
  try {
    if (dispatcher) {
      // When using undici ProxyAgent, we must use undiciFetch so the dispatcher is respected
      fetchOptions.dispatcher = dispatcher;
      res = await undiciFetch(endpoint, fetchOptions);
    } else {
      res = await globalThis.fetch(endpoint, fetchOptions);
    }
  } catch (fetchErr: any) {
    if (timer) clearTimeout(timer);
    if (controller.signal.aborted) {
      const abortReason =
        (controller.signal.reason as any)?.message || String(controller.signal.reason);
      throw new Error(abortReason);
    }
    throw fetchErr;
  }

  if (!res.ok) {
    if (timer) clearTimeout(timer);
    const rawText = await res.text().catch(() => "");
    let errorDetail = rawText.trim();
    try {
      const parsed = JSON.parse(rawText);
      errorDetail = parsed?.message || parsed?.error?.message || parsed?.error || rawText.trim();
    } catch {}

    const retryAfter = res.headers?.get?.("retry-after") || res.headers?.get?.("x-ratelimit-reset");
    const resetInfo = retryAfter ? ` (Reset after: ${retryAfter}s)` : "";

    if (res.status === 429) {
      if (!options._isRetry) {
        try {
          const { rotateAllIpRotation } = await import("./ipRotationState.ts");
          const { isWarpProxyAvailable } = await import("./proxy.ts");
          const rotateResult = await rotateAllIpRotation();
          const warpUp = await isWarpProxyAvailable(true);
          // Only retry if WARP up and IP actually changed — avoid looping on same blocked IP
          if (warpUp && rotateResult.newIp && rotateResult.newIp !== rotateResult.oldIp) {
            console.log(`[opencode-bypass] 429 HTTP → IP rotated ${rotateResult.oldIp} → ${rotateResult.newIp}, retrying...`);
            return await bypassChatStream({ ...options, _isRetry: true }, onChunk, onDone);
          }
          if (!warpUp) {
            throw new Error(
              `[opencode-bypass] WARP/Privoxy nahi chal raha. IP rotation se limit reset nahi ho sakti — doosra model chunein ya WARP start karein.`,
            );
          }
          console.warn("[opencode-bypass] 429: IP same raha rotation ke baad, retry skip.");
        } catch (retryErr: any) {
          if (retryErr?.message?.startsWith("[opencode-bypass]")) throw retryErr;
          console.warn("[opencode-bypass] Auto-retry on 429 encountered error:", retryErr);
        }
      }
      throw new Error(
        `[opencode-bypass] HTTP 429 Rate Limit Exceeded (Limit Full)${resetInfo}: Model '${resolvedModel}' ki free limit/quota full ho chuki hai.\n\nUpstream Raw Response:\n${errorDetail}`,
      );
    }
    if (res.status === 502 || res.status === 503 || res.status === 504) {
      throw new Error(
        `[opencode-bypass] HTTP ${res.status} Service Unavailable: Upstream server busy ya overloaded hai.\n\nUpstream Response:\n${errorDetail}`,
      );
    }
    throw new Error(`[opencode-bypass] HTTP ${res.status}: ${errorDetail}`);
  }

  // Once headers are received ok, set streaming idle heartbeat timeout (60 seconds before first token)
  resetTimeout(
    60_000,
    `[opencode-bypass] HTTP 408 Request Timeout: Model '${options.model}' ka stream stall ho gaya (60s se koi token receive nahi hua). Upstream server busy ya limit hit ho sakti hai.`,
  );

  const decoder = new TextDecoder();
  let buffer = "";

  try {
    // Handle both WHATWG ReadableStream and Node/undici ReadableStream
    if (res.body && typeof (res.body as any).getReader === "function") {
      const reader = (res.body as any).getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        // Reset idle timer on every incoming chunk (allow up to 120s between chunks for thinking models)
        hasReceivedAnyChunk = true;
        resetTimeout(
          120_000,
          `[opencode-bypass] HTTP 408 Request Timeout: Model '${options.model}' ka stream stall ho gaya (120s se koi token receive nahi hua). Upstream server busy ya limit hit ho sakti hai.`,
        );

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith("data:")) continue;
          const data = trimmed.slice(5).trim();
          if (data === "[DONE]") {
            if (timer) clearTimeout(timer);
            onDone?.(sessionId);
            return;
          }
          try {
            const chunk = JSON.parse(data) as any;
            if (chunk?.error) {
              const errObj = chunk.error;
              const errMsg = errObj?.message || JSON.stringify(errObj);
              const errCode = errObj?.code || errObj?.type || "429";
              // SSE-stream 429/rate-limit: rotate and retry if no content emitted yet
              const isRateLimit = /429|FreeUsage|rate.?limit|quota|limit.?full|too.?many/i.test(errMsg + errCode);
              if (isRateLimit && !hasReceivedAnyChunk && !options._isRetry) {
                if (timer) clearTimeout(timer);
                try {
                  const { rotateAllIpRotation } = await import("./ipRotationState.ts");
                  const { isWarpProxyAvailable } = await import("./proxy.ts");
                  const rotateResult = await rotateAllIpRotation();
                  const warpUp = await isWarpProxyAvailable(true);
                  if (warpUp && rotateResult.newIp && rotateResult.newIp !== rotateResult.oldIp) {
                    return await bypassChatStream({ ...options, _isRetry: true }, onChunk, onDone);
                  }
                } catch {}
              }
              throw new Error(
                `[opencode-bypass] HTTP ${errCode} (Limit Full / Stream Error): ${errMsg}`,
              );
            }
            const delta = chunk.choices?.[0]?.delta;
            const text = delta?.content ?? chunk.choices?.[0]?.text ?? "";
            const reasoning = delta?.reasoning_content ?? delta?.reasoning ?? delta?.thought;
            if (text || reasoning) {
              onChunk(text, reasoning);
            }
          } catch (jsonErr: any) {
            if (jsonErr?.message?.startsWith("[opencode-bypass]")) {
              throw jsonErr;
            }
            // malformed chunk — skip
          }
        }
      }
    } else if (res.body && typeof (res.body as any)[Symbol.asyncIterator] === "function") {
      for await (const chunk of res.body as any) {
        hasReceivedAnyChunk = true;
        resetTimeout(
          120_000,
          `[opencode-bypass] HTTP 408 Request Timeout: Model '${options.model}' ka stream stall ho gaya (120s se koi token receive nahi hua). Upstream server busy ya limit hit ho sakti hai.`,
        );

        buffer += typeof chunk === "string" ? chunk : decoder.decode(chunk, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith("data:")) continue;
          const data = trimmed.slice(5).trim();
          if (data === "[DONE]") {
            if (timer) clearTimeout(timer);
            onDone?.(sessionId);
            return;
          }
          try {
            const parsed = JSON.parse(data) as any;
            if (parsed?.error) {
              const errObj = parsed.error;
              const errMsg = errObj?.message || JSON.stringify(errObj);
              const errCode = errObj?.code || errObj?.type || "429";
              // SSE-stream 429/rate-limit: rotate and retry if no content emitted yet
              const isRateLimit = /429|FreeUsage|rate.?limit|quota|limit.?full|too.?many/i.test(errMsg + errCode);
              if (isRateLimit && !hasReceivedAnyChunk && !options._isRetry) {
                if (timer) clearTimeout(timer);
                try {
                  const { rotateAllIpRotation } = await import("./ipRotationState.ts");
                  const { isWarpProxyAvailable } = await import("./proxy.ts");
                  const rotateResult = await rotateAllIpRotation();
                  const warpUp = await isWarpProxyAvailable(true);
                  if (warpUp && rotateResult.newIp && rotateResult.newIp !== rotateResult.oldIp) {
                    return await bypassChatStream({ ...options, _isRetry: true }, onChunk, onDone);
                  }
                } catch {}
              }
              throw new Error(
                `[opencode-bypass] HTTP ${errCode} (Limit Full / Stream Error): ${errMsg}`,
              );
            }
            const delta = parsed.choices?.[0]?.delta;
            const text = delta?.content ?? parsed.choices?.[0]?.text ?? "";
            const reasoning = delta?.reasoning_content ?? delta?.reasoning ?? delta?.thought;
            if (text || reasoning) {
              onChunk(text, reasoning);
            }
          } catch (jsonErr: any) {
            if (jsonErr?.message?.startsWith("[opencode-bypass]")) {
              throw jsonErr;
            }
            // malformed chunk — skip
          }
        }
      }
    } else {
      throw new Error("[opencode-bypass] No response body");
    }
  } catch (streamErr: any) {
    if (timer) clearTimeout(timer);
    if (controller.signal.aborted) {
      const abortReason =
        (controller.signal.reason as any)?.message || String(controller.signal.reason);
      throw new Error(abortReason);
    }
    throw streamErr;
  } finally {
    if (timer) clearTimeout(timer);
    if (callerSignal) callerSignal.removeEventListener("abort", abortFromCaller);
  }

  onDone?.(sessionId);
}
