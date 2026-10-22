// @effect-diagnostics nodeBuiltinImport:off globalConsole:off globalConsoleInEffect:off globalDate:off globalDateInEffect:off globalRandomInEffect:off globalErrorInEffectFailure:off preferSchemaOverJson:off globalFetchInEffect:off anyUnknownInErrorContext:off globalFetch:off
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
import { fetch as undiciFetch } from "undici";

export const OPENCODE_BYPASS_ENABLED: boolean = process.env.OPENCODE_BYPASS_ENABLED !== "false";

/** Free lane me default models */
export const FREE_MODELS = [
  "deepseek-v4.1-flash-free",
  "kimi-k3",
  "glm-5.3-flash-free",
  "minimax-m3.1-flash-free",
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
  return `${base}/inference/v1/chat/completions`;
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
    model: options.model,
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

  const endpoint = resolveChatEndpoint(options.baseUrl);

  // If WARP/Privoxy is running, attach dispatcher to bypass datacenter IP 429
  const dispatcher = await getBypassDispatcher();

  const fetchOptions: any = {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  };

  let res: any;
  if (dispatcher) {
    // When using undici ProxyAgent, we must use undiciFetch so the dispatcher is respected
    fetchOptions.dispatcher = dispatcher;
    res = await undiciFetch(endpoint, fetchOptions);
  } else {
    res = await globalThis.fetch(endpoint, fetchOptions);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`[opencode-bypass] HTTP ${res.status}: ${text.slice(0, 300)}`);
  }

  const decoder = new TextDecoder();
  let buffer = "";

  // Handle both WHATWG ReadableStream and Node/undici ReadableStream
  if (res.body && typeof (res.body as any).getReader === "function") {
    const reader = (res.body as any).getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data:")) continue;
        const data = trimmed.slice(5).trim();
        if (data === "[DONE]") {
          onDone?.(sessionId);
          return;
        }
        try {
          const chunk = JSON.parse(data) as {
            choices?: Array<{
              delta?: {
                content?: string;
                reasoning_content?: string;
                reasoning?: string;
                thought?: string;
              };
              text?: string;
            }>;
          };
          const delta = chunk.choices?.[0]?.delta;
          const text = delta?.content ?? chunk.choices?.[0]?.text ?? "";
          const reasoning = delta?.reasoning_content ?? delta?.reasoning ?? delta?.thought;
          if (text || reasoning) {
            onChunk(text, reasoning);
          }
        } catch {
          // malformed chunk — skip
        }
      }
    }
  } else if (res.body && typeof (res.body as any)[Symbol.asyncIterator] === "function") {
    for await (const chunk of res.body as any) {
      buffer += typeof chunk === "string" ? chunk : decoder.decode(chunk, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data:")) continue;
        const data = trimmed.slice(5).trim();
        if (data === "[DONE]") {
          onDone?.(sessionId);
          return;
        }
        try {
          const parsed = JSON.parse(data) as {
            choices?: Array<{
              delta?: {
                content?: string;
                reasoning_content?: string;
                reasoning?: string;
                thought?: string;
              };
              text?: string;
            }>;
          };
          const delta = parsed.choices?.[0]?.delta;
          const text = delta?.content ?? parsed.choices?.[0]?.text ?? "";
          const reasoning = delta?.reasoning_content ?? delta?.reasoning ?? delta?.thought;
          if (text || reasoning) {
            onChunk(text, reasoning);
          }
        } catch {
          // malformed chunk — skip
        }
      }
    }
  } else {
    throw new Error("[opencode-bypass] No response body");
  }

  onDone?.(sessionId);
}
