import {
  MessageId,
  NonNegativeInt,
  OrchestrationV2ProviderCapabilities,
  OrchestrationV2ProviderSession,
  OrchestrationV2ProviderThread,
  PositiveInt,
  ProviderDriverKind,
  ProviderInstanceId,
  ProviderSessionId,
  ProviderThreadId,
  ProviderTurnId,
  ServerProvider,
  ServerProviderModel,
  ThreadId,
  TurnItemId,
  TextGenerationError,
} from "@t3tools/contracts";
import * as child_process from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as Cause from "effect/Cause";
import * as Clock from "effect/Clock";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Option from "effect/Option";
import * as Queue from "effect/Queue";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import { FetchHttpClient, HttpClient, HttpClientRequest, HttpClientResponse } from "effect/http";

import { makeProviderFailure } from "@t3tools/provider-core/server/failure";
import { turnScopedSelectionTransition } from "@t3tools/provider-core/server/selectionTransition";
import type {
  ProviderAdapterV2Event,
  ProviderAdapterV2EnsureThreadInput,
  ProviderAdapterV2OpenSessionInput,
  ProviderAdapterV2SessionRuntime,
  ProviderAdapterV2Shape,
  ProviderAdapterV2TurnInput,
} from "@t3tools/provider-core/server/ProviderAdapter";
import {
  defaultProviderContinuationIdentity,
  type ProviderDriver,
  type ProviderDriverCreateInput,
  type ProviderInstance,
} from "@t3tools/provider-core/server/driver";
import type { ServerProviderShape } from "@t3tools/provider-core/server/snapshot";
import type { ProviderTextGeneration } from "@t3tools/provider-core/server/textGeneration";
import { AcpProviderCapabilitiesV2 } from "@t3tools/provider-acp/server/adapter";

// Allow HTTPS requests with IP addresses and self-signed certificates for custom providers
if (typeof process !== "undefined" && process.env) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

const DRIVER = ProviderDriverKind.make("custom");

export interface CustomHeaderConfig {
  readonly key: string;
  readonly value: string;
}

export interface CustomModelConfig {
  readonly id: string;
  readonly name?: string | undefined;
}

export interface AiModelLogEntry {
  readonly id: string;
  readonly timestamp: number;
  readonly timeFormatted: string;
  readonly threadId?: string;
  readonly runId?: string;
  readonly provider: string;
  readonly providerInstanceId: string;
  readonly model: string;
  readonly baseUrl: string;
  readonly endpoint: string;
  readonly requestHeaders: Record<string, string>;
  readonly apiKeyMasked: string;
  readonly userPrompt: string;
  readonly messages: Array<{ role: string; content: string }>;
  status?: number;
  statusText?: string;
  durationMs?: number;
  state: "pending" | "streaming" | "completed" | "error";
  responseBody?: string;
  error?: string;
  errorType?: string;
}

export const GLOBAL_AI_MODEL_LOGS: AiModelLogEntry[] = [];

export function recordAiModelLog(entry: AiModelLogEntry): void {
  const existingIdx = GLOBAL_AI_MODEL_LOGS.findIndex((l) => l.id === entry.id);
  if (existingIdx !== -1) {
    GLOBAL_AI_MODEL_LOGS[existingIdx] = entry;
  } else {
    GLOBAL_AI_MODEL_LOGS.unshift(entry);
    if (GLOBAL_AI_MODEL_LOGS.length > 300) {
      GLOBAL_AI_MODEL_LOGS.pop();
    }
  }
}

export function updateAiModelLog(id: string, updates: Partial<AiModelLogEntry>): void {
  const existing = GLOBAL_AI_MODEL_LOGS.find((l) => l.id === id);
  if (existing) {
    Object.assign(existing, updates);
  }
}

export function clearAiModelLogs(): void {
  GLOBAL_AI_MODEL_LOGS.length = 0;
}

export const CustomDriverSettingsSchema = Schema.Struct({
  baseUrl: Schema.String.pipe(Schema.withDecodingDefault(Effect.succeed(""))),
  apiKey: Schema.String.pipe(Schema.withDecodingDefault(Effect.succeed(""))),
  headers: Schema.Array(
    Schema.Struct({
      key: Schema.String,
      value: Schema.String,
    }),
  ).pipe(Schema.withDecodingDefault(Effect.succeed([]))),
  models: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      name: Schema.optional(Schema.String),
    }),
  ).pipe(Schema.withDecodingDefault(Effect.succeed([]))),
});

export type CustomDriverConfig = typeof CustomDriverSettingsSchema.Type;
const decodeCustomSettings = Schema.decodeSync(CustomDriverSettingsSchema);

const UnknownFromJsonString = Schema.fromJsonString(Schema.Unknown);
const decodeJson = Schema.decodeUnknownOption(UnknownFromJsonString);

export const CustomProviderCapabilitiesV2: OrchestrationV2ProviderCapabilities = {
  ...AcpProviderCapabilitiesV2,
  sessions: {
    ...AcpProviderCapabilitiesV2.sessions,
    supportsModelSwitchInSession: true,
  },
};

function formatCustomModels(
  models?: ReadonlyArray<{ readonly id: string; readonly name?: string | undefined }>,
  defaultName = "Custom Provider",
): ServerProviderModel[] {
  if (models && models.length > 0) {
    return models.map((m) => ({
      slug: m.id,
      name: m.name ?? m.id,
      isCustom: false,
      capabilities: null,
    }));
  }
  return [
    {
      slug: "default",
      name: `${defaultName} (Default)`,
      isCustom: false,
      capabilities: null,
    },
  ];
}

export function makeCustomSnapshot(
  instanceId: ProviderInstanceId,
  displayName: string,
  config: CustomDriverConfig,
  enabled = true,
): ServerProvider {
  const models = formatCustomModels(config.models, displayName);

  return {
    instanceId,
    driver: DRIVER,
    displayName,
    name: displayName,
    enabled,
    installed: true,
    version: null,
    status: enabled ? "ready" : "disabled",
    auth: { status: "authenticated" },
    checkedAt: "2026-01-01T00:00:00.000Z",
    availability: enabled ? "available" : "unavailable",
    models,
    slashCommands: [],
    skills: [],
  } as unknown as ServerProvider;
}

export function makeCustomServerProviderShape(rawSnapshot: ServerProvider): ServerProviderShape {
  return {
    getSnapshot: Effect.succeed(rawSnapshot),
    refresh: Effect.succeed(rawSnapshot),
    streamChanges: Stream.empty,
    resolveMaintenance: () =>
      Effect.succeed({
        provider: DRIVER,
        packageName: null,
        update: null,
      }),
    applyUsageLimits: () => Effect.void,
  };
}

export function makeUnsupportedTextGeneration(): ProviderTextGeneration {
  const fail = (operation: string) =>
    Effect.fail(
      new TextGenerationError({
        operation,
        detail: "Custom provider does not support standalone text generation.",
      }),
    );
  return {
    generateCommitMessage: () => fail("commit-message"),
    generatePrContent: () => fail("pr-content"),
    generateBranchName: () => fail("branch-name"),
    generateThreadTitle: () => fail("thread-title"),
  };
}

export interface ExtractedProjectFile {
  readonly path: string;
  readonly content: string;
}

export function extractFilesFromMarkdown(markdown: string): Array<ExtractedProjectFile> {
  const files: Array<ExtractedProjectFile> = [];
  const seenPaths = new Set<string>();
  const codeBlockRegex = /```([^\n]*)\n([\s\S]*?)(?:```|$)/g;
  let match: RegExpExecArray | null;

  let htmlCount = 0;
  let cssCount = 0;
  let jsCount = 0;
  let pyCount = 0;

  while ((match = codeBlockRegex.exec(markdown)) !== null) {
    const header = match[1]?.trim() || "";
    let content = match[2] || "";
    let detectedPath: string | null = null;

    // 1. Check header for filepath=... or path=... or filename
    const headerMatch =
      header.match(/(?:file|filepath|path)\s*=\s*["']?([^\s"']+)["']?/i) ||
      header.match(/^[a-zA-Z0-9_-]+[:\s]+([a-zA-Z0-9_\-./]+\.[a-zA-Z0-9]+)$/) ||
      header.match(/^([a-zA-Z0-9_\-./]+\.[a-zA-Z0-9]+)$/);

    if (headerMatch && headerMatch[1]) {
      detectedPath = headerMatch[1].trim();
    }

    // 2. Check first 3 lines of block for comment filename
    if (!detectedPath) {
      const lines = content.split("\n");
      for (let i = 0; i < Math.min(3, lines.length); i++) {
        const line = lines[i]?.trim() || "";
        const commentMatch =
          line.match(
            /^(?:\/\/|#|\/\*|<!--)\s*(?:file|filepath|filename|path)\s*[:=]\s*([a-zA-Z0-9_\-./]+\.[a-zA-Z0-9]+)/i,
          ) || line.match(/^(?:\/\/|#)\s*([a-zA-Z0-9_\-./]+\.[a-zA-Z0-9]+)$/);
        if (commentMatch && commentMatch[1]) {
          detectedPath = commentMatch[1].trim();
          lines.splice(i, 1);
          content = lines.join("\n");
          break;
        }
      }
    }

    // 3. Fallback heuristics for common templates (like 2D game or website)
    if (!detectedPath) {
      const lowerHeader = header.toLowerCase();
      const trimmed = content.trim();
      if (
        (lowerHeader.includes("html") ||
          trimmed.startsWith("<!DOCTYPE html") ||
          trimmed.startsWith("<html")) &&
        htmlCount === 0
      ) {
        detectedPath = "index.html";
        htmlCount++;
      } else if (lowerHeader.includes("css") && cssCount === 0) {
        detectedPath = "style.css";
        cssCount++;
      } else if (
        (lowerHeader.includes("javascript") || lowerHeader.includes("js")) &&
        (trimmed.includes("requestAnimationFrame") ||
          trimmed.includes("canvas") ||
          trimmed.includes("addEventListener")) &&
        jsCount === 0
      ) {
        detectedPath = "game.js";
        jsCount++;
      } else if (lowerHeader.includes("python") && pyCount === 0) {
        detectedPath = "main.py";
        pyCount++;
      }
    }

    if (detectedPath) {
      const cleanPath = detectedPath.replace(/^[/\\]+/, "").replace(/\.\./g, "");
      if (cleanPath && !seenPaths.has(cleanPath)) {
        seenPaths.add(cleanPath);
        files.push({ path: cleanPath, content });
      }
    }
  }

  return files;
}

export const GLOBAL_CUSTOM_THREAD_HISTORIES = new Map<
  string,
  Array<{ role: "system" | "user" | "assistant"; content: string }>
>();

export interface InterruptedThreadInfo {
  readonly lastInterruptedText: string;
  readonly model: string;
  readonly timestamp: number;
}
export const GLOBAL_THREAD_INTERRUPTED_STATE = new Map<string, InterruptedThreadInfo>();

export function makeCustomAdapterV2(
  instanceId: ProviderInstanceId,
  config: CustomDriverConfig,
): ProviderAdapterV2Shape {
  return {
    instanceId,
    driver: DRIVER,
    getCapabilities: () => Effect.succeed(CustomProviderCapabilitiesV2),
    planSelectionTransition: () => Effect.succeed(turnScopedSelectionTransition()),
    openSession: (openInput: ProviderAdapterV2OpenSessionInput) =>
      Effect.gen(function* () {
        const sessionId = openInput.providerSessionId;
        const createdAt = yield* DateTime.now;
        const providerSession: OrchestrationV2ProviderSession = {
          id: sessionId,
          driver: DRIVER,
          providerInstanceId: instanceId,
          status: "ready",
          cwd: openInput.runtimePolicy?.cwd ?? "/",
          model: null,
          capabilities: CustomProviderCapabilitiesV2,
          createdAt,
          updatedAt: createdAt,
          lastError: null,
        };

        const eventsQueue = yield* Queue.unbounded<ProviderAdapterV2Event>();
        let currentThread: OrchestrationV2ProviderThread | null = null;
        let currentTurnFiber: Fiber.Fiber<void, unknown> | null = null;

        const runtime: ProviderAdapterV2SessionRuntime = {
          instanceId,
          driver: DRIVER,
          providerSessionId: sessionId,
          providerSession,
          events: Stream.fromEffectRepeat(Queue.take(eventsQueue)),
          ensureThread: (input: ProviderAdapterV2EnsureThreadInput) =>
            Effect.gen(function* () {
              const now = yield* DateTime.now;
              const thId =
                input.existingProviderThread?.id ?? ProviderThreadId.make(`th_${input.threadId}`);
              const nativeId = `native_${input.threadId}`;
              currentThread = {
                id: thId,
                driver: DRIVER,
                providerInstanceId: instanceId,
                providerSessionId: sessionId,
                appThreadId: input.threadId,
                ownerNodeId: null,
                nativeThreadRef: {
                  driver: DRIVER,
                  nativeId,
                  strength: "strong",
                },
                nativeConversationHeadRef: null,
                status: "idle",
                firstRunOrdinal: null,
                lastRunOrdinal: null,
                handoffIds: [],
                forkedFrom: null,
                createdAt: input.existingProviderThread?.createdAt ?? now,
                updatedAt: now,
              };
              return currentThread;
            }),
          resumeThread: (input) =>
            Effect.gen(function* () {
              currentThread = {
                ...input.providerThread,
                nativeThreadRef: input.providerThread.nativeThreadRef ?? {
                  driver: DRIVER,
                  nativeId: `native_${input.threadId}`,
                  strength: "strong",
                },
                status: "idle",
              };
              return currentThread;
            }),
          injectHistory: (args) =>
            Effect.sync(() => {
              const threadKey = String(args.providerThread.appThreadId ?? args.providerThread.id);
              const msgs: Array<{ role: "system" | "user" | "assistant"; content: string }> = [];
              if (args.context && args.context.trim()) {
                msgs.push({ role: "system", content: args.context.trim() });
              }
              for (const msg of args.messages) {
                const text = msg.text?.trim();
                if (!text) continue;
                msgs.push({
                  role: msg.role === "assistant" ? "assistant" : "user",
                  content: text,
                });
              }
              if (msgs.length > 0) {
                GLOBAL_CUSTOM_THREAD_HISTORIES.set(threadKey, msgs);
              }
              return true;
            }),
          startTurn: (turnInput: ProviderAdapterV2TurnInput) =>
            Effect.gen(function* () {
              const turnStartedAt = yield* DateTime.now;
              const providerTurnId = ProviderTurnId.make(`turn_${turnInput.runId}`);
              const assistantTurnItemId = TurnItemId.make(`item_assist_${turnInput.runId}`);
              const reasoningTurnItemId = TurnItemId.make(`item_reason_${turnInput.runId}`);
              const assistantMessageId = MessageId.make(`msg_assist_${turnInput.runId}`);
              const turnOrdinal = PositiveInt.make(
                Math.max(1, turnInput.providerTurnOrdinal ?? turnInput.runOrdinal ?? 1),
              );
              const reasoningOrdinal = NonNegativeInt.make(turnOrdinal * 100);
              const itemOrdinal = NonNegativeInt.make(turnOrdinal * 100 + 1);

              let accumulatedText = "";
              let accumulatedReasoning = "";
              let reasoningActive = false;
              let reasoningCompleted = false;
              let inThinkTag = false;
              let selectedModel =
                turnInput.modelSelection?.model && turnInput.modelSelection.model !== "default"
                  ? turnInput.modelSelection.model
                  : (config.models?.[0]?.id ?? "default");
              let chatUrl = "";
              let cleanBase = "";
              let currentAiLogId: string | null = null;
              let currentStartMs = Date.now();

              const runTurn = Effect.gen(function* () {
                yield* Queue.offer(eventsQueue, {
                  type: "provider_turn.updated",
                  driver: DRIVER,
                  providerTurn: {
                    id: providerTurnId,
                    providerThreadId: turnInput.providerThread.id,
                    nodeId: turnInput.rootNodeId,
                    runAttemptId: turnInput.attemptId,
                    nativeTurnRef: null,
                    ordinal: turnOrdinal,
                    status: "running",
                    startedAt: turnStartedAt,
                    completedAt: null,
                  },
                });

                yield* Queue.offer(eventsQueue, {
                  type: "turn_item.updated",
                  driver: DRIVER,
                  turnItem: {
                    id: assistantTurnItemId,
                    threadId: turnInput.threadId,
                    runId: turnInput.runId,
                    nodeId: turnInput.rootNodeId,
                    providerThreadId: turnInput.providerThread.id,
                    providerTurnId,
                    nativeItemRef: null,
                    parentItemId: null,
                    ordinal: itemOrdinal,
                    status: "running",
                    title: null,
                    startedAt: turnStartedAt,
                    completedAt: null,
                    updatedAt: turnStartedAt,
                    type: "assistant_message",
                    messageId: assistantMessageId,
                    text: "",
                    streaming: true,
                  },
                });

                const rawBase = (config.baseUrl ?? "").trim().replace(/\/+$/, "");
                if (!rawBase) {
                  return yield* Effect.fail(
                    "Custom provider base URL is missing or not configured.",
                  );
                }

                cleanBase = rawBase.replace(/\/chat\/completions\/?$/i, "").replace(/\/+$/, "");
                if (cleanBase.includes("openrouter.ai")) {
                  cleanBase = "https://openrouter.ai/api/v1";
                }

                if (cleanBase.endsWith("/chat/completions")) {
                  chatUrl = cleanBase;
                } else if (cleanBase.endsWith("/v1")) {
                  chatUrl = `${cleanBase}/chat/completions`;
                } else if (cleanBase.includes("/v1/")) {
                  chatUrl = `${cleanBase}/chat/completions`;
                } else {
                  chatUrl = `${cleanBase}/v1/chat/completions`;
                }

                const threadKey = String(
                  turnInput.providerThread.appThreadId ??
                    turnInput.threadId ??
                    turnInput.providerThread.id,
                );
                const history = GLOBAL_CUSTOM_THREAD_HISTORIES.get(threadKey) ?? [];

                const procEnv = (
                  globalThis as { process?: { env?: Record<string, string | undefined> } }
                ).process?.env;
                const userHomeDir = procEnv?.HOME || procEnv?.USERPROFILE || "/root";
                const storageFolderName = "autocode-storage";
                const defaultAutocodeStorageDir = NodePath.resolve(userHomeDir, storageFolderName);

                let projectCwd = turnInput.runtimePolicy?.cwd?.trim() || "";
                if (!projectCwd || projectCwd === "/" || projectCwd === ".") {
                  projectCwd = defaultAutocodeStorageDir;
                }

                try {
                  if (!NodeFS.existsSync(projectCwd)) {
                    NodeFS.mkdirSync(projectCwd, { recursive: true });
                  }
                } catch {
                  // ignore
                }

                let userPrompt = (turnInput.message.text || "Hello").trim();
                if (userPrompt.includes("User message:\n")) {
                  const parts = userPrompt.split("User message:\n");
                  userPrompt = (parts[parts.length - 1] || userPrompt).trim();
                }

                const systemPrompt = `You are AutoCode (AC) AI Developer with integrated Live Preview and Testing capabilities.
Project Workspace Directory: ${projectCwd}

WEB PREVIEW & GAME DEVELOPMENT INSTRUCTIONS:
1. When asked to build games (e.g. 2D canvas, arcade, puzzle, RPG) or websites / web tools:
   - Always create a complete, self-contained \`index.html\` as the primary entrypoint so it immediately runs in the built-in Web Preview!
   - Embed all necessary CSS styles and JavaScript logic directly in \`index.html\` (or properly linked in sibling files like \`style.css\` and \`game.js\`).
   - Implement complete, interactive controls (arrow keys, WASD, mouse clicks, on-screen touch/tap buttons, restart/pause buttons, score tracking).
   - Ensure canvas sizing and game loop (\`requestAnimationFrame\`) work smoothly without runtime errors or uncaught exceptions.
   - Self-verify that all buttons, event listeners, and DOM elements exist and are properly bound.

BUG FIXING & TARGETED EDITS:
2. When asked to fix bugs, solve errors, or modify existing features:
   - Do NOT rewrite or dump the entire project from scratch unnecessarily.
   - Perform targeted, precise edits to the specific problematic functions, event handlers, or sections.
   - Clearly state which function or block is being updated and provide the updated code block with the exact filepath.

FILE CREATION INSTRUCTIONS:
Always clearly specify the file path for each file at the top of each code block using:
\`\`\`<language> filepath=<relative/path>
...content...
\`\`\`
or with a comment on the very first line inside the code block:
\`\`\`<language>
// filepath: <relative/path>
...content...
\`\`\`
or for HTML/web:
\`\`\`html
<!-- filepath: index.html -->
...content...
\`\`\`

All generated files will automatically be saved into the project workspace directory (${projectCwd}) and committed to Git.
Provide full, complete, production-ready code with no placeholders.`;

                // Check if previous turn was interrupted or user is requesting continuation
                const interruptedInfo = GLOBAL_THREAD_INTERRUPTED_STATE.get(threadKey);
                const isContinuationKeyword =
                  /^(continue|carry on|resume|proceed|agay|agay se|keep going|continue generation)\b/i.test(
                    userPrompt.trim(),
                  );
                const isResumeRequest =
                  Boolean(interruptedInfo) &&
                  (isContinuationKeyword ||
                    !userPrompt.trim() ||
                    userPrompt.trim() === "Hello" ||
                    userPrompt.toLowerCase().includes("continue"));

                let effectiveUserPrompt = userPrompt || "Hello";
                if (isResumeRequest && history.length > 0) {
                  const lastAssistantMsg = [...history]
                    .reverse()
                    .find((m) => m.role === "assistant");
                  if (lastAssistantMsg?.content) {
                    const rawLines = lastAssistantMsg.content.trim().split("\n");
                    const tailLines = rawLines.slice(-10).join("\n");
                    effectiveUserPrompt = `[CONTINUATION / RESUME GENERATION REQUEST]:
The previous response was interrupted / cut off mid-stream due to a timeout or token limit.
The previous output ended abruptly with:
"""
${tailLines}
"""

CRITICAL INSTRUCTIONS FOR RESUMING:
1. DO NOT restart the implementation or file from line 1.
2. DO NOT rewrite what you already provided above.
3. Resume immediately from the exact character/point where you stopped.
4. If you were inside a code block or writing a file (e.g. index.html), continue and complete the code block, OR output the complete updated file with its filepath so it can be saved properly.

User prompt:
${userPrompt || "Continue generating from where you were interrupted"}`;
                  }
                }

                // Free/open models on OpenRouter often reject "system" role (returning HTTP 400).
                // Embed system prompt into user message to guarantee 100% compatibility across all models.
                const fullUserPrompt = `${systemPrompt}\n\n[User Request]:\n${effectiveUserPrompt}`;

                const candidateMessages: Array<{
                  role: "system" | "user" | "assistant";
                  content: string;
                }> = [...history, { role: "user" as const, content: fullUserPrompt }];

                // Sanitize messages for OpenAI API compatibility:
                // 1. Filter out empty contents
                // 2. Collapse contiguous same-role messages
                const conversationMessages: Array<{
                  role: "system" | "user" | "assistant";
                  content: string;
                }> = [];
                for (const msg of candidateMessages) {
                  const content = msg.content?.trim();
                  if (!content) continue;
                  const prev = conversationMessages[conversationMessages.length - 1];
                  if (prev && prev.role === msg.role) {
                    prev.content += `\n\n${content}`;
                  } else {
                    conversationMessages.push({ role: msg.role, content });
                  }
                }

                if (
                  conversationMessages.length === 0 ||
                  conversationMessages[0]!.role === "assistant"
                ) {
                  conversationMessages.unshift({ role: "user", content: "Hello" });
                }

                selectedModel =
                  turnInput.modelSelection?.model && turnInput.modelSelection.model !== "default"
                    ? turnInput.modelSelection.model
                    : (config.models?.[0]?.id ?? "default");

                if (
                  (selectedModel === "default" || !selectedModel) &&
                  (rawBase.includes("8377") ||
                    rawBase.includes("antseed") ||
                    rawBase.includes("cheaprouter"))
                ) {
                  selectedModel = "glm-4.5-flash";
                } else if (
                  (selectedModel === "default" || !selectedModel) &&
                  (rawBase.includes("openrouter.ai") || chatUrl.includes("openrouter.ai"))
                ) {
                  selectedModel = "meta-llama/llama-3.3-70b-instruct:free";
                } else if (
                  selectedModel === "default" &&
                  config.models &&
                  config.models.length > 0
                ) {
                  selectedModel = config.models[0]!.id;
                }

                let request = HttpClientRequest.post(chatUrl).pipe(
                  HttpClientRequest.setHeader("Content-Type", "application/json"),
                  HttpClientRequest.setHeader("Accept", "text/event-stream, application/json"),
                  HttpClientRequest.bodyJsonUnsafe({
                    model: selectedModel,
                    messages: conversationMessages,
                    stream: true,
                  }),
                );

                let cleanApiKey = (config.apiKey ?? "").trim();
                if (cleanApiKey.startsWith("Bearer ")) {
                  cleanApiKey = cleanApiKey.slice(7).trim();
                }
                cleanApiKey = cleanApiKey.replace(/^["']|["']$/g, "").trim();

                if (cleanApiKey.length > 0) {
                  request = HttpClientRequest.setHeader(
                    request,
                    "Authorization",
                    `Bearer ${cleanApiKey}`,
                  );
                }

                if (config.headers && Array.isArray(config.headers)) {
                  for (const h of config.headers) {
                    if (h.key && h.key.trim().length > 0) {
                      request = HttpClientRequest.setHeader(request, h.key.trim(), h.value.trim());
                    }
                  }
                }

                // If targeting OpenRouter, guarantee required/recommended headers
                if (chatUrl.includes("openrouter.ai")) {
                  const hasReferer = config.headers?.some(
                    (h) => h.key.toLowerCase() === "http-referer",
                  );
                  const hasTitle = config.headers?.some((h) => h.key.toLowerCase() === "x-title");
                  if (!hasReferer) {
                    request = HttpClientRequest.setHeader(
                      request,
                      "HTTP-Referer",
                      "https://autojobs.tokendeal.cloud",
                    );
                  }
                  if (!hasTitle) {
                    request = HttpClientRequest.setHeader(request, "X-Title", "Jobi Code");
                  }
                }

                currentAiLogId = null;
                currentStartMs = Date.now();
                const timeFormatted = new Date().toLocaleTimeString();

                const reqHeadersRecord: Record<string, string> = {
                  "Content-Type": "application/json",
                  Accept: "text/event-stream, application/json",
                };
                if (cleanApiKey) {
                  reqHeadersRecord["Authorization"] =
                    `Bearer ${cleanApiKey.slice(0, 8)}...${cleanApiKey.slice(-4)}`;
                }
                if (config.headers && Array.isArray(config.headers)) {
                  for (const h of config.headers) {
                    if (h.key) reqHeadersRecord[h.key] = h.value;
                  }
                }
                if (chatUrl.includes("openrouter.ai")) {
                  reqHeadersRecord["HTTP-Referer"] = "https://autojobs.tokendeal.cloud";
                  reqHeadersRecord["X-Title"] = "Jobi Code";
                }

                const maskedKey = cleanApiKey
                  ? `${cleanApiKey.slice(0, 7)}...${cleanApiKey.slice(-4)}`
                  : "(No API key)";

                currentAiLogId = `ai-log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
                recordAiModelLog({
                  id: currentAiLogId,
                  timestamp: currentStartMs,
                  timeFormatted,
                  threadId: turnInput.threadId,
                  runId: turnInput.runId,
                  provider: "Custom Provider",
                  providerInstanceId: String(instanceId),
                  model: selectedModel,
                  baseUrl: cleanBase,
                  endpoint: chatUrl,
                  requestHeaders: reqHeadersRecord,
                  apiKeyMasked: maskedKey,
                  userPrompt: userPrompt || "(Empty message)",
                  messages: conversationMessages,
                  state: "pending",
                });

                const client = yield* HttpClient.HttpClient;
                const rawResponse = yield* client.execute(request).pipe(
                  Effect.timeoutOrElse({
                    duration: "35 seconds",
                    orElse: () =>
                      Effect.fail(
                        new Error(
                          `Connection timed out after 35 seconds while waiting for response from model "${selectedModel}". The upstream model server (${cleanBase}) is unresponsive or taking too long.`,
                        ),
                      ),
                  }),
                );

                if (rawResponse.status < 200 || rawResponse.status >= 300) {
                  const errorBody = yield* rawResponse.text.pipe(Effect.orElseSucceed(() => ""));
                  let detail = "";
                  try {
                    const parsed = JSON.parse(errorBody);
                    detail =
                      parsed?.error?.message ??
                      parsed?.message ??
                      (typeof parsed?.error === "string" ? parsed.error : "") ??
                      (typeof parsed === "string" ? parsed : "");
                  } catch {
                    detail = errorBody.trim();
                  }
                  let statusMsg = `HTTP ${rawResponse.status}${detail ? `: ${detail}` : ""}`;
                  if (
                    rawResponse.status === 401 &&
                    detail.toLowerCase().includes("user not found")
                  ) {
                    statusMsg +=
                      "\n[OpenRouter Explanation]: OpenRouter rejected the API Key: 'User not found.' Please verify that your OpenRouter API Key is correct and active at https://openrouter.ai/settings/keys.";
                  }
                  if (currentAiLogId) {
                    updateAiModelLog(currentAiLogId, {
                      status: rawResponse.status,
                      statusText: String(rawResponse.status),
                      durationMs: Date.now() - currentStartMs,
                      state: "error",
                      error: statusMsg,
                      errorType: `HTTP_${rawResponse.status}`,
                      responseBody: errorBody || statusMsg,
                    });
                  }
                  return yield* Effect.fail(new Error(statusMsg));
                }

                const response = rawResponse;

                accumulatedText = "";
                let lastEmitted = yield* Clock.currentTimeMillis;

                const linesStream = response.stream.pipe(Stream.decodeText(), Stream.splitLines);

                yield* Stream.runForEach(linesStream, (line) =>
                  Effect.gen(function* () {
                    const trimmed = line.trim();
                    if (!trimmed || trimmed.startsWith(":") || trimmed.startsWith("event:")) return;
                    let jsonPayload: string | null = null;
                    if (trimmed.startsWith("data:")) {
                      const dataStr = trimmed.slice(5).trim();
                      if (dataStr === "[DONE]") return;
                      jsonPayload = dataStr;
                    } else if (trimmed.startsWith("{")) {
                      jsonPayload = trimmed;
                    }

                    if (jsonPayload) {
                      const maybeJson = decodeJson(jsonPayload);
                      if (Option.isSome(maybeJson)) {
                        const parsed = maybeJson.value as any;
                        if (parsed.error) {
                          const errorMsg =
                            typeof parsed.error === "object" && parsed.error !== null
                              ? parsed.error.message || JSON.stringify(parsed.error)
                              : String(parsed.error);
                          return yield* Effect.fail(new Error(errorMsg));
                        }
                        const rawDeltaReasoning =
                          parsed.choices?.[0]?.delta?.reasoning_content ??
                          parsed.choices?.[0]?.delta?.reasoning ??
                          parsed.choices?.[0]?.delta?.thought ??
                          "";

                        const rawDeltaContent =
                          parsed.choices?.[0]?.delta?.content ??
                          parsed.choices?.[0]?.message?.content ??
                          parsed.choices?.[0]?.text ??
                          parsed.response ??
                          parsed.message?.content ??
                          "";

                        let hadDelta = false;
                        if (rawDeltaReasoning) {
                          accumulatedReasoning += rawDeltaReasoning;
                          reasoningActive = true;
                          hadDelta = true;
                        }

                        let textPiece = rawDeltaContent;
                        if (textPiece) {
                          if (inThinkTag) {
                            const closeIdx = textPiece.indexOf("</think>");
                            if (closeIdx !== -1) {
                              accumulatedReasoning += textPiece.slice(0, closeIdx);
                              inThinkTag = false;
                              reasoningCompleted = true;
                              reasoningActive = true;
                              hadDelta = true;
                              textPiece = textPiece.slice(closeIdx + 8);
                            } else {
                              accumulatedReasoning += textPiece;
                              reasoningActive = true;
                              hadDelta = true;
                              textPiece = "";
                            }
                          } else {
                            const openIdx = textPiece.indexOf("<think>");
                            if (openIdx !== -1) {
                              const before = textPiece.slice(0, openIdx);
                              if (before) accumulatedText += before;
                              const afterOpen = textPiece.slice(openIdx + 7);
                              const closeIdx = afterOpen.indexOf("</think>");
                              if (closeIdx !== -1) {
                                accumulatedReasoning += afterOpen.slice(0, closeIdx);
                                reasoningActive = true;
                                reasoningCompleted = true;
                                hadDelta = true;
                                textPiece = afterOpen.slice(closeIdx + 8);
                              } else {
                                accumulatedReasoning += afterOpen;
                                inThinkTag = true;
                                reasoningActive = true;
                                hadDelta = true;
                                textPiece = "";
                              }
                            }
                          }

                          if (textPiece) {
                            if (reasoningActive && !reasoningCompleted) {
                              reasoningCompleted = true;
                            }
                            accumulatedText += textPiece;
                            hadDelta = true;
                          }
                        }

                        if (hadDelta) {
                          const nowMs = yield* Clock.currentTimeMillis;
                          if (nowMs - lastEmitted > 40) {
                            lastEmitted = nowMs;
                            if (currentAiLogId) {
                              updateAiModelLog(currentAiLogId, {
                                state: "streaming",
                                responseBody: accumulatedReasoning
                                  ? `[Thinking]\n${accumulatedReasoning}\n\n[Response]\n${accumulatedText}`
                                  : accumulatedText,
                              });
                            }

                            if (reasoningActive) {
                              yield* Queue.offer(eventsQueue, {
                                type: "turn_item.updated",
                                driver: DRIVER,
                                turnItem: {
                                  id: reasoningTurnItemId,
                                  threadId: turnInput.threadId,
                                  runId: turnInput.runId,
                                  nodeId: turnInput.rootNodeId,
                                  providerThreadId: turnInput.providerThread.id,
                                  providerTurnId,
                                  nativeItemRef: null,
                                  parentItemId: null,
                                  ordinal: reasoningOrdinal,
                                  status: reasoningCompleted ? "completed" : "running",
                                  title: "Thinking",
                                  startedAt: turnStartedAt,
                                  completedAt: reasoningCompleted
                                    ? DateTime.makeUnsafe(nowMs)
                                    : null,
                                  updatedAt: DateTime.makeUnsafe(nowMs),
                                  type: "reasoning",
                                  text: accumulatedReasoning,
                                  streaming: !reasoningCompleted,
                                },
                              });
                            }

                            if (accumulatedText) {
                              yield* Queue.offer(eventsQueue, {
                                type: "turn_item.updated",
                                driver: DRIVER,
                                turnItem: {
                                  id: assistantTurnItemId,
                                  threadId: turnInput.threadId,
                                  runId: turnInput.runId,
                                  nodeId: turnInput.rootNodeId,
                                  providerThreadId: turnInput.providerThread.id,
                                  providerTurnId,
                                  nativeItemRef: null,
                                  parentItemId: null,
                                  ordinal: itemOrdinal,
                                  status: "running",
                                  title: null,
                                  startedAt: turnStartedAt,
                                  completedAt: null,
                                  updatedAt: DateTime.makeUnsafe(nowMs),
                                  type: "assistant_message",
                                  messageId: assistantMessageId,
                                  text: accumulatedText,
                                  streaming: true,
                                },
                              });

                              yield* Queue.offer(eventsQueue, {
                                type: "message.updated",
                                driver: DRIVER,
                                message: {
                                  id: assistantMessageId,
                                  threadId: turnInput.threadId,
                                  runId: turnInput.runId,
                                  nodeId: turnInput.rootNodeId,
                                  role: "assistant",
                                  text: accumulatedText,
                                  attachments: [],
                                  streaming: true,
                                  createdBy: "agent",
                                  creationSource: "provider",
                                  createdAt: turnStartedAt,
                                  updatedAt: DateTime.makeUnsafe(nowMs),
                                },
                              });
                            }
                          }
                        }
                      }
                    }
                  }),
                ).pipe(
                  Effect.timeoutOrElse({
                    duration: "240 seconds",
                    orElse: () =>
                      Effect.fail(
                        new Error(
                          `Model "${selectedModel}" streaming timed out after 240 seconds. The connection stalled or upstream provider stopped sending tokens.`,
                        ),
                      ),
                  }),
                );

                if (!accumulatedText.trim() && !accumulatedReasoning.trim()) {
                  return yield* Effect.fail(
                    new Error(
                      `Model "${selectedModel}" returned an empty response. The model may be offline, rate-limited, or overloaded on ${cleanBase}.`,
                    ),
                  );
                }

                const finishedTime = yield* DateTime.now;

                // Automatically extract and save generated project files to disk in projectCwd
                const extractedFiles = extractFilesFromMarkdown(accumulatedText);
                const savedFiles: string[] = [];

                for (const file of extractedFiles) {
                  try {
                    const fullPath = NodePath.resolve(projectCwd, file.path);
                    const rel = NodePath.relative(projectCwd, fullPath);
                    if (!rel.startsWith("..") && !NodePath.isAbsolute(rel)) {
                      const dir = NodePath.dirname(fullPath);
                      if (!NodeFS.existsSync(dir)) {
                        NodeFS.mkdirSync(dir, { recursive: true });
                      }
                      NodeFS.writeFileSync(fullPath, file.content, "utf-8");
                      savedFiles.push(file.path);
                    }
                  } catch (saveErr) {
                    console.error("Failed saving generated file to project:", file.path, saveErr);
                  }
                }

                let finalText = accumulatedText;
                if (savedFiles.length > 0) {
                  try {
                    const gitDir = NodePath.join(projectCwd, ".git");
                    if (!NodeFS.existsSync(gitDir)) {
                      child_process.execSync("git init", { cwd: projectCwd, stdio: "ignore" });
                    }
                    child_process.execSync("git add -A", { cwd: projectCwd, stdio: "ignore" });
                    const commitMsg = `AI generation: ${savedFiles.slice(0, 3).join(", ")}${savedFiles.length > 3 ? "..." : ""}`;
                    child_process.execSync(
                      `git -c user.name="AutoCode AI" -c user.email="autocode@t3.tools" commit -m "${commitMsg.replace(/"/g, '\\"')}" --allow-empty`,
                      { cwd: projectCwd, stdio: "ignore" },
                    );
                  } catch (_gitErr) {
                    // Git tracking best-effort, safe to ignore
                  }

                  finalText +=
                    `\n\n---\n📁 **Saved ${savedFiles.length} file${savedFiles.length > 1 ? "s" : ""} to project (\`${NodePath.basename(projectCwd)}\`):**\n` +
                    savedFiles.map((f) => `- \`${f}\``).join("\n");

                  const hasHtml = savedFiles.some((f) => f.toLowerCase().endsWith(".html"));
                  if (hasHtml) {
                    finalText += `\n\n🎮 **Live Preview Ready**: \`index.html\` is available. Open in Preview to play and test!`;
                  }
                }

                if (reasoningActive && accumulatedReasoning) {
                  yield* Queue.offer(eventsQueue, {
                    type: "turn_item.updated",
                    driver: DRIVER,
                    turnItem: {
                      id: reasoningTurnItemId,
                      threadId: turnInput.threadId,
                      runId: turnInput.runId,
                      nodeId: turnInput.rootNodeId,
                      providerThreadId: turnInput.providerThread.id,
                      providerTurnId,
                      nativeItemRef: null,
                      parentItemId: null,
                      ordinal: reasoningOrdinal,
                      status: "completed",
                      title: "Thinking",
                      startedAt: turnStartedAt,
                      completedAt: finishedTime,
                      updatedAt: finishedTime,
                      type: "reasoning",
                      text: accumulatedReasoning,
                      streaming: false,
                    },
                  });
                }

                yield* Queue.offer(eventsQueue, {
                  type: "message.updated",
                  driver: DRIVER,
                  message: {
                    id: assistantMessageId,
                    threadId: turnInput.threadId,
                    runId: turnInput.runId,
                    nodeId: turnInput.rootNodeId,
                    role: "assistant",
                    text: finalText,
                    attachments: [],
                    streaming: false,
                    createdBy: "agent",
                    creationSource: "provider",
                    createdAt: turnStartedAt,
                    updatedAt: finishedTime,
                  },
                });

                yield* Queue.offer(eventsQueue, {
                  type: "turn_item.updated",
                  driver: DRIVER,
                  turnItem: {
                    id: assistantTurnItemId,
                    threadId: turnInput.threadId,
                    runId: turnInput.runId,
                    nodeId: turnInput.rootNodeId,
                    providerThreadId: turnInput.providerThread.id,
                    providerTurnId,
                    nativeItemRef: null,
                    parentItemId: null,
                    ordinal: itemOrdinal,
                    status: "completed",
                    title: null,
                    startedAt: turnStartedAt,
                    completedAt: finishedTime,
                    updatedAt: finishedTime,
                    type: "assistant_message",
                    messageId: assistantMessageId,
                    text: finalText,
                    streaming: false,
                  },
                });

                yield* Queue.offer(eventsQueue, {
                  type: "provider_turn.updated",
                  driver: DRIVER,
                  providerTurn: {
                    id: providerTurnId,
                    providerThreadId: turnInput.providerThread.id,
                    nodeId: turnInput.rootNodeId,
                    runAttemptId: turnInput.attemptId,
                    nativeTurnRef: null,
                    ordinal: turnOrdinal,
                    status: "completed",
                    startedAt: turnStartedAt,
                    completedAt: finishedTime,
                  },
                });

                yield* Queue.offer(eventsQueue, {
                  type: "turn.terminal",
                  driver: DRIVER,
                  providerThreadId: turnInput.providerThread.id,
                  providerTurnId,
                  runOrdinal: PositiveInt.make(turnInput.runOrdinal),
                  status: "completed",
                  failure: null,
                  threadDisposition: "reusable",
                });

                if (currentAiLogId) {
                  updateAiModelLog(currentAiLogId, {
                    status: rawResponse.status,
                    statusText: "OK",
                    durationMs: Date.now() - currentStartMs,
                    state: "completed",
                    responseBody: finalText,
                  });
                }

                // Save turn to thread history on successful completion
                const updatedHistory: Array<{
                  role: "system" | "user" | "assistant";
                  content: string;
                }> = [
                  ...history,
                  { role: "user" as const, content: userPrompt || "Hello" },
                  {
                    role: "assistant" as const,
                    content: finalText.trim() || "(Response received)",
                  },
                ];
                GLOBAL_CUSTOM_THREAD_HISTORIES.set(threadKey, updatedHistory);
                GLOBAL_THREAD_INTERRUPTED_STATE.delete(threadKey);
              }).pipe(
                Effect.provide(FetchHttpClient.layer),
                Effect.catchCause((cause: unknown) =>
                  Effect.gen(function* () {
                    const squashed = Cause.isCause(cause) ? Cause.squash(cause) : cause;
                    console.error("CUSTOM DRIVER RUN TURN ERROR:", squashed);
                    const message =
                      squashed instanceof Error
                        ? squashed.message
                        : typeof squashed === "object" && squashed !== null && "message" in squashed
                          ? String((squashed as any).message)
                          : String(squashed);
                    const failTime = yield* DateTime.now;

                    if (currentAiLogId) {
                      updateAiModelLog(currentAiLogId, {
                        status: 500,
                        statusText: "Error",
                        durationMs: Date.now() - currentStartMs,
                        state: "error",
                        error: message,
                        errorType: "TurnFailedError",
                        responseBody: message,
                      });
                    }

                    // Preserve partial generated code cleanly without error markdown pollution
                    const cleanPartialText = accumulatedText.trim();
                    if (cleanPartialText) {
                      const updatedHistory: Array<{
                        role: "system" | "user" | "assistant";
                        content: string;
                      }> = [
                        ...history,
                        { role: "user" as const, content: userPrompt || "Hello" },
                        { role: "assistant" as const, content: cleanPartialText },
                      ];
                      GLOBAL_CUSTOM_THREAD_HISTORIES.set(threadKey, updatedHistory);
                      GLOBAL_THREAD_INTERRUPTED_STATE.set(threadKey, {
                        lastInterruptedText: cleanPartialText,
                        model: selectedModel,
                        timestamp: Date.now(),
                      });

                      // Also best-effort extract and save any project files generated so far
                      try {
                        const partialFiles = extractFilesFromMarkdown(cleanPartialText);
                        for (const file of partialFiles) {
                          const fullPath = NodePath.resolve(projectCwd, file.path);
                          const rel = NodePath.relative(projectCwd, fullPath);
                          if (!rel.startsWith("..") && !NodePath.isAbsolute(rel)) {
                            const dir = NodePath.dirname(fullPath);
                            if (!NodeFS.existsSync(dir)) {
                              NodeFS.mkdirSync(dir, { recursive: true });
                            }
                            NodeFS.writeFileSync(fullPath, file.content, "utf-8");
                          }
                        }
                      } catch {
                        // ignore
                      }
                    }

                    yield* Queue.offer(eventsQueue, {
                      type: "message.updated",
                      driver: DRIVER,
                      message: {
                        id: assistantMessageId,
                        threadId: turnInput.threadId,
                        runId: turnInput.runId,
                        nodeId: turnInput.rootNodeId,
                        role: "assistant",
                        text: cleanPartialText,
                        attachments: [],
                        streaming: false,
                        createdBy: "agent",
                        creationSource: "provider",
                        createdAt: turnStartedAt,
                        updatedAt: failTime,
                      },
                    });

                    yield* Queue.offer(eventsQueue, {
                      type: "turn_item.updated",
                      driver: DRIVER,
                      turnItem: {
                        id: assistantTurnItemId,
                        threadId: turnInput.threadId,
                        runId: turnInput.runId,
                        nodeId: turnInput.rootNodeId,
                        providerThreadId: turnInput.providerThread.id,
                        providerTurnId,
                        nativeItemRef: null,
                        parentItemId: null,
                        ordinal: itemOrdinal,
                        status: "completed",
                        title: null,
                        startedAt: turnStartedAt,
                        completedAt: failTime,
                        updatedAt: failTime,
                        type: "assistant_message",
                        messageId: assistantMessageId,
                        text: cleanPartialText,
                        streaming: false,
                      },
                    });

                    yield* Queue.offer(eventsQueue, {
                      type: "provider_turn.updated",
                      driver: DRIVER,
                      providerTurn: {
                        id: providerTurnId,
                        providerThreadId: turnInput.providerThread.id,
                        nodeId: turnInput.rootNodeId,
                        runAttemptId: turnInput.attemptId,
                        nativeTurnRef: null,
                        ordinal: turnOrdinal,
                        status: "failed",
                        startedAt: turnStartedAt,
                        completedAt: failTime,
                      },
                    });

                    yield* Queue.offer(eventsQueue, {
                      type: "turn.terminal",
                      driver: DRIVER,
                      providerThreadId: turnInput.providerThread.id,
                      providerTurnId,
                      runOrdinal: PositiveInt.make(turnInput.runOrdinal),
                      failureItemOrdinal: PositiveInt.make(itemOrdinal + 1),
                      status: "failed",
                      failure: makeProviderFailure({
                        message,
                        class: "provider_error",
                      }),
                      threadDisposition: "reusable",
                    });
                  }),
                ),
              );

              currentTurnFiber = yield* Effect.forkDetach(runTurn);
            }),
          steerTurn: () => Effect.void,
          interruptTurn: () =>
            Effect.gen(function* () {
              if (currentTurnFiber) {
                yield* Fiber.interrupt(currentTurnFiber);
                currentTurnFiber = null;
              }
            }),
          respondToRuntimeRequest: () => Effect.void,
          readThreadSnapshot: (args) =>
            Effect.succeed({
              providerThread: args.providerThread,
              providerTurns: [],
              messages: [],
              runtimeRequests: [],
            }),
          rollbackThread: (args) =>
            Effect.succeed({
              providerThread: args.providerThread,
              providerTurns: [],
              messages: [],
              runtimeRequests: [],
            }),
          forkThread: (args) => Effect.succeed(args.sourceProviderThread),
        };

        return runtime;
      }),
  };
}

export function createCustomProviderInstance(
  input: ProviderDriverCreateInput<CustomDriverConfig>,
): ProviderInstance {
  const continuationIdentity = defaultProviderContinuationIdentity({
    driverKind: DRIVER,
    instanceId: input.instanceId,
  });
  const displayName = input.displayName ?? "Custom Provider";
  const rawSnapshot = makeCustomSnapshot(
    input.instanceId,
    displayName,
    input.config,
    input.enabled,
  );
  const snapshot = makeCustomServerProviderShape(rawSnapshot);
  const orchestrationAdapter = makeCustomAdapterV2(input.instanceId, input.config);
  const textGeneration = makeUnsupportedTextGeneration();

  return {
    instanceId: input.instanceId,
    driverKind: DRIVER,
    continuationIdentity,
    displayName,
    accentColor: input.accentColor,
    enabled: input.enabled,
    snapshot,
    orchestrationAdapter,
    textGeneration,
  } satisfies ProviderInstance;
}

// In-memory fallback registry for custom provider instances
const fallbackInstances = new Map<string, ProviderInstance>();
const fallbackParams = new Map<string, any>();

function getCustomProvidersFilePath(): string {
  const procEnv = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
    ?.env;
  let baseDir = procEnv?.T3CODE_HOME;
  if (!baseDir) {
    try {
      if (NodeFS.existsSync("/root/autojobs/data")) {
        NodeFS.accessSync("/root/autojobs/data", NodeFS.constants.W_OK);
        baseDir = "/root/autojobs/data";
      }
    } catch {}
  }
  if (!baseDir) {
    baseDir = NodePath.join(NodeOS.homedir(), ".autojobs/data");
  }
  const userDir = NodePath.resolve(baseDir, "userdata");
  try {
    if (!NodeFS.existsSync(userDir)) {
      NodeFS.mkdirSync(userDir, { recursive: true });
    }
  } catch {}
  return NodePath.resolve(userDir, "custom-providers-cache.json");
}

function saveCustomProvidersToDisk(): void {
  try {
    const filePath = getCustomProvidersFilePath();
    const list = Array.from(fallbackParams.values()).map((p) => {
      const rawId = p.instanceId || p.id || `custom_${Date.now()}`;
      const strId = String(rawId);
      const cleanId = strId.startsWith("custom_") ? strId : `custom_${strId}`;
      const name = p.name || p.displayName || "Custom Provider";
      return {
        ...p,
        instanceId: cleanId,
        id: cleanId,
        displayName: name,
        name,
      };
    });
    NodeFS.writeFileSync(filePath, JSON.stringify(list, null, 2), "utf-8");
  } catch (err) {
    console.error("Failed saving custom providers to disk:", err);
  }
}

function loadPersistedCustomProviders(): void {
  try {
    const filePath = getCustomProvidersFilePath();
    if (NodeFS.existsSync(filePath)) {
      const content = NodeFS.readFileSync(filePath, "utf-8");
      const list = JSON.parse(content);
      if (Array.isArray(list)) {
        for (const p of list) {
          if (p && (p.instanceId || p.id)) {
            registerFallbackCustomProvider(
              {
                instanceId: p.instanceId || p.id,
                displayName: p.displayName || p.name,
                baseUrl: p.baseUrl || "",
                apiKey: p.apiKey,
                headers: p.headers,
                models: p.models,
                enabled: p.enabled,
              },
              false,
            );
          }
        }
      }
    }
  } catch (err) {
    console.error("Failed loading persisted custom providers:", err);
  }
}

export function registerFallbackCustomProvider(
  params: {
    instanceId: string;
    displayName?: string | undefined;
    baseUrl: string;
    apiKey?: string | undefined;
    headers?: Array<CustomHeaderConfig> | undefined;
    models?: Array<CustomModelConfig> | undefined;
    enabled?: boolean | undefined;
  },
  shouldPersist = true,
): ProviderInstance {
  const rawId = params.instanceId || (params as any).id || `custom_${Date.now()}`;
  const strId = String(rawId);
  const cleanId = strId.startsWith("custom_") ? strId : `custom_${strId}`;
  const displayName = params.displayName ?? (params as any).name ?? "Custom Provider";
  const instanceId = ProviderInstanceId.make(cleanId);
  const instance = createCustomProviderInstance({
    instanceId,
    displayName,
    enabled: params.enabled ?? true,
    environment: [],
    config: {
      baseUrl: params.baseUrl,
      apiKey: params.apiKey ?? "",
      headers: params.headers ?? [],
      models: params.models ?? [],
    },
  });
  fallbackInstances.set(cleanId, instance);
  fallbackInstances.set(strId, instance);
  fallbackParams.set(cleanId, {
    ...params,
    instanceId: cleanId,
    id: cleanId,
    displayName,
    name: displayName,
  });

  if (shouldPersist) {
    saveCustomProvidersToDisk();
  }

  return instance;
}

export function unregisterFallbackCustomProvider(id: string): void {
  if (!id) return;
  const strId = String(id);
  const cleanId = strId.startsWith("custom_") ? strId : `custom_${strId}`;
  fallbackInstances.delete(cleanId);
  fallbackInstances.delete(strId);
  fallbackParams.delete(cleanId);
  fallbackParams.delete(strId);
  saveCustomProvidersToDisk();
}

export function getFallbackCustomInstance(
  instanceId: ProviderInstanceId | string,
): ProviderInstance | undefined {
  return fallbackInstances.get(String(instanceId));
}

export function listFallbackCustomInstanceIds(): string[] {
  return Array.from(fallbackInstances.keys()).filter((k) => k.startsWith("custom_"));
}

// Load persisted custom providers on startup
loadPersistedCustomProviders();

export const CustomDriver: ProviderDriver<CustomDriverConfig, never> = {
  driverKind: DRIVER,
  metadata: { displayName: "Custom Provider", supportsMultipleInstances: true },
  configSchema: CustomDriverSettingsSchema,
  defaultConfig: () => decodeCustomSettings({}),
  create: (input) =>
    Effect.sync(() => {
      const instance = createCustomProviderInstance(input);
      fallbackInstances.set(String(input.instanceId), instance);
      return instance;
    }),
};
