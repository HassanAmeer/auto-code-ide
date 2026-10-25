// @effect-diagnostics nodeBuiltinImport:off globalConsole:off globalConsoleInEffect:off globalDate:off globalDateInEffect:off globalRandomInEffect:off globalErrorInEffectFailure:off preferSchemaOverJson:off globalFetchInEffect:off anyUnknownInErrorContext:off globalFetch:off
import {
  type ServerProviderModel,
  ProviderDriverKind,
  type ProviderInstanceId,
  type ServerProvider,
  ProviderThreadId,
  ProviderTurnId,
  TurnItemId,
  MessageId,
  PositiveInt,
  NonNegativeInt,
  type OrchestrationV2ProviderCapabilities,
  type OrchestrationV2ProviderSession,
  type OrchestrationV2ProviderThread,
  type OrchestrationV2ProviderTurn,
} from "@t3tools/contracts";
import { OpenCodeBypassSetupSettings } from "../settings.ts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Queue from "effect/Queue";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";

import type * as ProviderHost from "@t3tools/provider-core/server/ProviderHost";
import type { ServerProviderShape } from "@t3tools/provider-core/server/snapshot";
import {
  defaultProviderContinuationIdentity,
  type ProviderDriver,
  type ProviderInstance,
} from "@t3tools/provider-core/server/driver";
import { makeManualOnlyProviderMaintenanceCapabilities } from "@t3tools/provider-core/server/maintenanceResolver";
import { turnScopedSelectionTransition } from "@t3tools/provider-core/server/selectionTransition";
import type * as ProviderAdapter from "@t3tools/provider-core/server/ProviderAdapter";
import * as TextGenerationOperations from "@t3tools/provider-core/server/textGenerationOperations";
import { TextGenerationError } from "@t3tools/contracts";
import {
  createAiModelLogId,
  formatAiModelLogTime,
  recordAiModelLog,
  updateAiModelLog,
} from "@t3tools/provider-core/server/aiModelLog";
import { buildInvokedSkillInstructions, discoverCustomSkills } from "@t3tools/shared/agentSkills";
import { providerMessageTextWithAttachmentPaths } from "@t3tools/provider-core/server/attachmentPrompt";
import {
  bypassChat,
  bypassChatStream,
  resolveChatEndpoint,
  type BypassChatMessage,
} from "./bypass/client.ts";
import {
  getActiveEngineSystemPrompt,
  executeActiveEnginePipeline,
  getBypassThreadHistory,
  saveBypassThreadHistory,
} from "./engineBridge.ts";

const DRIVER_KIND = ProviderDriverKind.make("opencodebypasssetup");
const decodeSettings = Schema.decodeSync(OpenCodeBypassSetupSettings);

const PRESENTATION = {
  displayName: "OpenCode Bypass Setup",
} as const;

/**
 * The bypass provider talks to a plain OpenAI-compatible chat completions
 * endpoint. It has no native thread/turn/item identities, no tool loop, and no
 * approval channel, so every capability below reports what the driver can
 * actually do rather than what a full provider runtime would expose.
 */
const OpenCodeBypassCapabilitiesV2 = {
  sessions: {
    // One driver instance owns a single provider thread at a time.
    supportsMultipleProviderThreadsPerSession: false,
    // The model is read from the turn's selection, so it can change per turn.
    supportsModelSwitchInSession: true,
    supportsProviderSwitchingViaHandoff: false,
    supportsRuntimeModeSwitchInSession: false,
    pendingRequestsSurviveRestart: false,
  },
  threads: {
    canCreateEmptyThread: true,
    canReadThreadSnapshot: true,
    canRollbackThread: true,
    canForkThread: false,
    canForkFromTurn: false,
    canForkFromSubagentThread: false,
    exposesNativeThreadId: true,
  },
  turns: {
    exposesNativeTurnId: false,
    emitsTurnStarted: true,
    emitsTurnCompleted: true,
    supportsInterrupt: true,
    // steerTurn is a no-op, so a steered message would be silently dropped.
    supportsActiveSteering: false,
    supportsSteeringByInterruptRestart: false,
    supportsQueuedMessages: false,
    terminalStatusQuality: "strong",
  },
  streaming: {
    streamsAssistantText: true,
    streamsReasoning: false,
    streamsToolOutput: false,
    streamsPlanText: false,
    emitsMessageCompleted: true,
  },
  tools: {
    exposesToolItemIds: false,
    emitsToolStarted: false,
    emitsToolCompleted: false,
    emitsToolOutput: false,
    supportsMcpTools: false,
    supportsDynamicToolCallbacks: false,
  },
  approvals: {
    supportsCommandApproval: false,
    supportsFileReadApproval: false,
    supportsFileChangeApproval: false,
    supportsApplyPatchApproval: false,
    approvalsHaveNativeRequestIds: false,
    approvalCallbacksAreLiveOnly: false,
    approvalsCanOriginateFromSubagents: false,
  },
  planning: {
    emitsPlanUpdated: false,
    emitsTodoList: false,
    emitsProposedPlan: false,
    supportsStructuredQuestions: false,
    planDeltasHaveItemIds: false,
  },
  subagents: {
    supportsSubagents: false,
    exposesSubagentThreadIds: false,
    emitsSubagentLifecycle: false,
    canWaitForSubagents: false,
    canCloseSubagents: false,
    canForkSubagentThread: false,
  },
  context: {
    acceptsSystemContext: false,
    acceptsDeveloperContext: false,
    acceptsSyntheticUserContext: false,
    canGenerateSummaries: false,
    canConsumeHandoffSummaries: false,
    supportsDeltaHandoff: false,
    supportsFullThreadHandoff: false,
    maxRecommendedHandoffChars: null,
  },
  checkpointing: {
    appCanCheckpointFilesystem: true,
    supportsNestedCheckpointScopes: false,
    providerCanRollbackConversation: true,
    providerRollbackReturnsSnapshot: true,
    providerCanReadConversationSnapshot: true,
  },
  identity: {
    nativeThreadIds: "strong",
    nativeTurnIds: "none",
    nativeItemIds: "none",
    nativeRequestIds: "none",
  },
  // The bypass runs no sandboxed work of its own; runtime policy is applied
  // only where T3 mediates it.
  runtimePolicy: {
    enforcement: "client-boundary",
  },
} satisfies OrchestrationV2ProviderCapabilities;

/** Fallback free models strictly adhering to ServerProviderModel */
export const FALLBACK_FREE_MODELS: ReadonlyArray<ServerProviderModel> = [
  {
    slug: "deepseek-v4.1-flash-free",
    name: "DeepSeek V4.1 Flash (Free)",
    isCustom: false,
    capabilities: null,
  },
  {
    slug: "kimi-k3",
    name: "Kimi K3 (Free)",
    isCustom: false,
    capabilities: null,
  },
  {
    slug: "glm-5.3-flash-free",
    name: "GLM 5.3 Flash (Free)",
    isCustom: false,
    capabilities: null,
  },
  {
    slug: "minimax-m3.1-flash-free",
    name: "MiniMax M3.1 Flash (Free)",
    isCustom: false,
    capabilities: null,
  },
];

/** Fetch live available models directly from the upstream endpoint */
export function fetchRemoteModels(
  baseUrl: string,
): Effect.Effect<ReadonlyArray<ServerProviderModel>> {
  return Effect.promise(async (): Promise<ReadonlyArray<ServerProviderModel>> => {
    try {
      const url = `${baseUrl.replace(/\/+$/, "")}/models`;
      const res = await fetch(url, {
        headers: {
          "User-Agent": "opencode/latest/2.0.26/cli",
          Authorization: "Bearer public",
        },
        signal: AbortSignal.timeout(6000),
      });
      if (!res.ok) {
        return FALLBACK_FREE_MODELS;
      }
      const json = (await res.json()) as { data?: Array<{ id: string }> };
      if (!Array.isArray(json.data) || json.data.length === 0) {
        return FALLBACK_FREE_MODELS;
      }

      // Filter free models or show available models
      const freeOnly = json.data.filter((m) => m.id.endsWith("-free") || m.id.includes("free"));
      const targetList = freeOnly.length > 0 ? freeOnly : json.data.slice(0, 20);

      return targetList.map((m) => {
        const cleanName = m.id
          .replace(/-free$/, "")
          .split("-")
          .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
          .join(" ");

        return {
          slug: m.id,
          name: `${cleanName} (Free)`,
          isCustom: false,
          capabilities: null,
        };
      });
    } catch {
      return FALLBACK_FREE_MODELS;
    }
  });
}

export function buildOpenCodeBypassSnapshot(
  instanceId: ProviderInstanceId,
  displayName: string | undefined,
  settings: OpenCodeBypassSetupSettings,
  enabled: boolean,
): Effect.Effect<ServerProvider> {
  return Effect.gen(function* () {
    const now = yield* DateTime.now;
    const checkedAt = DateTime.formatIso(now);
    const effectiveBaseUrl = settings.baseUrl || "https://opencode.ai/inference/v1";

    let models = FALLBACK_FREE_MODELS;
    if (enabled) {
      models = yield* fetchRemoteModels(effectiveBaseUrl);
    }

    const customModels: ServerProviderModel[] = (settings.customModels ?? []).map((entry) => {
      if (typeof entry === "string") {
        return {
          slug: entry,
          name: entry,
          isCustom: true,
          capabilities: null,
        };
      }
      return {
        slug: entry.slug,
        name: entry.name ?? entry.slug,
        isCustom: true,
        capabilities: entry.capabilities ?? null,
      };
    });

    const allModels = [...models, ...customModels];

    const snapshot: ServerProvider = {
      instanceId,
      driver: DRIVER_KIND,
      displayName: displayName ?? PRESENTATION.displayName,
      name: displayName ?? PRESENTATION.displayName,
      enabled,
      installed: true,
      version: "2.0.26",
      status: enabled ? "ready" : "disabled",
      auth: {
        status: enabled ? "authenticated" : "unauthenticated",
        detail: enabled
          ? `Free Lane: ${effectiveBaseUrl} · ${allModels.length} models auto-loaded`
          : "Disabled. Switch ON to auto-load free OpenCode models.",
      },
      checkedAt,
      availability: "available",
      models: allModels,
      slashCommands: [],
      skills: [],
      continuation: {
        groupKey: `${DRIVER_KIND}:instance:${instanceId}`,
      },
    } as unknown as ServerProvider;

    return snapshot;
  });
}

export function makeOpenCodeBypassServerProviderShape(
  instanceId: ProviderInstanceId,
  displayName: string | undefined,
  settings: OpenCodeBypassSetupSettings,
  enabled: boolean,
): ServerProviderShape {
  const getSnapshot = buildOpenCodeBypassSnapshot(instanceId, displayName, settings, enabled);
  return {
    getSnapshot,
    refresh: getSnapshot,
    streamChanges: Stream.empty,
    resolveMaintenance: () =>
      Effect.succeed(
        makeManualOnlyProviderMaintenanceCapabilities({
          provider: DRIVER_KIND,
          packageName: "opencode-bypass-setup",
        }),
      ),
    applyUsageLimits: () => Effect.void,
  };
}

export type OpenCodeBypassSetupDriverEnv = ProviderHost.ProviderHost;

export const OpenCodeBypassSetupDriver: ProviderDriver<
  OpenCodeBypassSetupSettings,
  OpenCodeBypassSetupDriverEnv
> = {
  driverKind: DRIVER_KIND,
  metadata: {
    displayName: PRESENTATION.displayName,
    supportsMultipleInstances: false,
    hasDefaultInstance: true,
  },
  configSchema: OpenCodeBypassSetupSettings,
  defaultConfig: () => decodeSettings({}),
  create: ({ instanceId, displayName, accentColor, enabled, config }) =>
    Effect.sync(() => {
      const continuationIdentity = defaultProviderContinuationIdentity({
        driverKind: DRIVER_KIND,
        instanceId,
      });

      const snapshot = makeOpenCodeBypassServerProviderShape(
        instanceId,
        displayName,
        config,
        enabled,
      );

      const orchestrationAdapter: ProviderAdapter.ProviderAdapterV2Shape = {
        instanceId,
        driver: DRIVER_KIND,
        getCapabilities: () => Effect.succeed(OpenCodeBypassCapabilitiesV2),
        planSelectionTransition: () => Effect.succeed(turnScopedSelectionTransition()),
        openSession: (openInput: ProviderAdapter.ProviderAdapterV2OpenSessionInput) =>
          Effect.gen(function* () {
            const sessionId = openInput.providerSessionId;
            const createdAt = yield* DateTime.now;
            const providerSession: OrchestrationV2ProviderSession = {
              id: sessionId,
              driver: DRIVER_KIND,
              providerInstanceId: instanceId,
              status: "ready",
              cwd: openInput.runtimePolicy?.cwd ?? "/",
              model: null,
              capabilities: OpenCodeBypassCapabilitiesV2,
              createdAt,
              updatedAt: createdAt,
              lastError: null,
            };

            const eventsQueue = yield* Queue.unbounded<ProviderAdapter.ProviderAdapterV2Event>();
            let currentThread: OrchestrationV2ProviderThread | null = null;
            let currentTurnFiber: Fiber.Fiber<void, unknown> | null = null;

            const runtime: ProviderAdapter.ProviderAdapterV2SessionRuntime = {
              instanceId,
              driver: DRIVER_KIND,
              providerSessionId: sessionId,
              providerSession,
              events: Stream.fromEffectRepeat(Queue.take(eventsQueue)),
              ensureThread: (input: ProviderAdapter.ProviderAdapterV2EnsureThreadInput) =>
                Effect.gen(function* () {
                  const now = yield* DateTime.now;
                  const thId =
                    input.existingProviderThread?.id ??
                    ProviderThreadId.make(`th_${input.threadId}`);
                  currentThread = {
                    id: thId,
                    driver: DRIVER_KIND,
                    providerInstanceId: instanceId,
                    providerSessionId: sessionId,
                    appThreadId: input.threadId,
                    ownerNodeId: null,
                    nativeThreadRef: {
                      driver: DRIVER_KIND,
                      nativeId: `native_${input.threadId}`,
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
                    status: "idle",
                  };
                  return currentThread;
                }),
              injectHistory: () => Effect.succeed(true),
              startTurn: (turnInput: ProviderAdapter.ProviderAdapterV2TurnInput) =>
                Effect.gen(function* () {
                  const turnStartedAt = yield* DateTime.now;
                  const providerTurnId = ProviderTurnId.make(`turn_${turnInput.runId}`);
                  const assistantTurnItemId = TurnItemId.make(`item_assist_${turnInput.runId}`);
                  const assistantMessageId = MessageId.make(`msg_assist_${turnInput.runId}`);
                  const turnOrdinal = PositiveInt.make(
                    Math.max(1, turnInput.providerTurnOrdinal ?? turnInput.runOrdinal ?? 1),
                  );
                  const reasoningTurnItemId = TurnItemId.make(
                    `bypass-item-reasoning-${turnInput.threadId}-${turnInput.runId}-${turnInput.attemptId}`,
                  );
                  const reasoningOrdinal = NonNegativeInt.make(turnOrdinal * 100);
                  const itemOrdinal = NonNegativeInt.make(turnOrdinal * 100 + 1);

                  let accumulatedText = "";
                  let accumulatedReasoning = "";
                  let hasEmittedReasoning = false;

                  const runTurn: Effect.Effect<void, never, never> = Effect.gen(function* () {
                    yield* Queue.offer(eventsQueue, {
                      type: "provider_turn.updated",
                      driver: DRIVER_KIND,
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
                      driver: DRIVER_KIND,
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

                    const selectedModel =
                      turnInput.modelSelection?.model &&
                      turnInput.modelSelection.model !== "default"
                        ? turnInput.modelSelection.model
                        : config.customModels?.[0]
                          ? typeof config.customModels[0] === "string"
                            ? config.customModels[0]
                            : config.customModels[0].slug
                          : "deepseek-v4.1-flash-free";

                    let promptText = turnInput.message.text || "Hello";

                    // If user attached files/images, include their paths and details in the prompt
                    if (turnInput.message.attachments && turnInput.message.attachments.length > 0) {
                      promptText = providerMessageTextWithAttachmentPaths({
                        text: promptText,
                        attachments: turnInput.message.attachments,
                        resolveAttachmentPath: (att) => {
                          // Try resolving from attachment store or relative path
                          const attId = att.id;
                          return attId ? `(attachment: ${att.name || attId})` : null;
                        },
                      });

                      // Also append a helpful summary of attached files
                      const attSummary = turnInput.message.attachments
                        .map(
                          (a) => `[File Attached: ${a.name} (${a.mimeType}, ${a.sizeBytes} bytes)]`,
                        )
                        .join("\n");
                      promptText = `${promptText}\n\n${attSummary}`;
                    }

                    // A `$skill` mention has no native expansion on this lane,
                    // so the skill body rides along as an instruction block.
                    const skillInstructions = buildInvokedSkillInstructions(
                      promptText,
                      turnInput.runtimePolicy?.cwd ?? undefined,
                    );
                    const projectCwd = turnInput.runtimePolicy?.cwd ?? "";
                    const engineSystemPrompt = projectCwd
                      ? getActiveEngineSystemPrompt(projectCwd)
                      : "";

                    const threadKey = String(turnInput.threadId ?? "");
                    const previousThreadHistory = threadKey
                      ? getBypassThreadHistory(threadKey, projectCwd)
                      : [];

                    const chatMessages: BypassChatMessage[] = [
                      ...(engineSystemPrompt
                        ? [{ role: "system" as const, content: engineSystemPrompt }]
                        : []),
                      ...(skillInstructions
                        ? [{ role: "system" as const, content: skillInstructions }]
                        : []),
                      ...previousThreadHistory,
                      { role: "user", content: promptText },
                    ];

                    const aiLogId = createAiModelLogId();
                    const aiLogStartedAt = Date.now();
                    let aiLogError: string | null = null;
                    recordAiModelLog({
                      id: aiLogId,
                      timestamp: aiLogStartedAt,
                      timeFormatted: formatAiModelLogTime(new Date(aiLogStartedAt)),
                      threadId: turnInput.threadId,
                      runId: turnInput.runId,
                      provider: "OpenCode Bypass",
                      providerInstanceId: instanceId,
                      model: selectedModel,
                      baseUrl: config.baseUrl ?? "",
                      endpoint: resolveChatEndpoint(config.baseUrl),
                      requestHeaders: { "Content-Type": "application/json" },
                      apiKeyMasked: "(free lane)",
                      userPrompt: promptText,
                      messages: chatMessages,
                      state: "pending",
                    });

                    console.log(
                      `[OpenCodeBypass] 🚀 startTurn running: model=${selectedModel}, prompt="${promptText}"`,
                    );

                    let lastEmitted = Date.now();

                    yield* Effect.promise(async () => {
                      try {
                        console.log(`[OpenCodeBypass] Calling bypassChatStream...`);
                        await bypassChatStream(
                          {
                            model: selectedModel,
                            baseUrl: config.baseUrl,
                            messages: chatMessages,
                          },
                          (chunkText, reasoningText) => {
                            if (reasoningText) {
                              accumulatedReasoning += reasoningText;
                              hasEmittedReasoning = true;
                            }
                            if (chunkText) {
                              accumulatedText += chunkText;
                            }
                            const nowMs = Date.now();
                            if (nowMs - lastEmitted > 40) {
                              lastEmitted = nowMs;

                              // If the model is outputting reasoning / thinking tokens
                              if (hasEmittedReasoning) {
                                const reasoningDone = accumulatedText.length > 0;
                                Queue.offerUnsafe(eventsQueue, {
                                  type: "turn_item.updated",
                                  driver: DRIVER_KIND,
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
                                    status: reasoningDone ? "completed" : "running",
                                    title: "Thinking",
                                    startedAt: turnStartedAt,
                                    completedAt: reasoningDone ? DateTime.makeUnsafe(nowMs) : null,
                                    updatedAt: DateTime.makeUnsafe(nowMs),
                                    type: "reasoning",
                                    text: accumulatedReasoning,
                                    streaming: !reasoningDone,
                                  },
                                });
                              }

                              // Output assistant message
                              Queue.offerUnsafe(eventsQueue, {
                                type: "turn_item.updated",
                                driver: DRIVER_KIND,
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
                                  text:
                                    accumulatedText ||
                                    (hasEmittedReasoning && !accumulatedText ? "" : ""),
                                  streaming: true,
                                },
                              });
                              Queue.offerUnsafe(eventsQueue, {
                                type: "message.updated",
                                driver: DRIVER_KIND,
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
                              Queue.flushUnsafe(eventsQueue);
                            }
                          },
                        );
                        console.log(
                          `[OpenCodeBypass] ✅ bypassChatStream done, length=${accumulatedText.length}`,
                        );
                      } catch (err) {
                        const errorMsg = err instanceof Error ? err.message : String(err);
                        aiLogError = errorMsg;
                        console.error(`[OpenCodeBypass] ❌ bypassChatStream error:`, errorMsg);
                      }
                    });

                    const isUsageLimit =
                      aiLogError !== null &&
                      /429|rate limit|quota|limit full|too many requests/i.test(aiLogError);
                    const isTimeout =
                      aiLogError !== null && /timeout|408|timed out|stalled/i.test(aiLogError);
                    const errorCode = isUsageLimit ? "429" : isTimeout ? "408" : "500";
                    const errorStatusCode = isUsageLimit ? 429 : isTimeout ? 408 : 500;

                    updateAiModelLog(aiLogId, {
                      status: aiLogError === null ? 200 : errorStatusCode,
                      statusText:
                        aiLogError === null
                          ? "completed"
                          : isUsageLimit
                            ? "Rate Limit Exceeded (Limit Full)"
                            : isTimeout
                              ? "Request Timeout"
                              : "error",
                      durationMs: Date.now() - aiLogStartedAt,
                      state: aiLogError === null ? "completed" : "error",
                      responseBody: accumulatedText || aiLogError || "",
                      ...(aiLogError === null
                        ? {}
                        : {
                            error: aiLogError,
                            errorType: isUsageLimit
                              ? "rate_limit"
                              : isTimeout
                                ? "timeout"
                                : "stream_error",
                          }),
                    });

                    const finishedTime = yield* DateTime.now;

                    // If stream encountered an error, mark turn as failed and emit error card
                    if (aiLogError !== null) {
                      // 1. Immediately complete reasoning item so it never hangs in "Thinking..."
                      yield* Queue.offer(eventsQueue, {
                        type: "turn_item.updated",
                        driver: DRIVER_KIND,
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
                          text:
                            accumulatedReasoning ||
                            "Turn stopped due to upstream provider response.",
                          streaming: false,
                        },
                      });

                      // 2. Finalize assistant message with clear formatted error notice
                      const errorNotice = `⚠️ **Provider Error (HTTP ${errorCode})**\n> **Model:** \`${selectedModel}\`\n> **Issue:** ${isUsageLimit ? "Usage Limit Reached (Limit Full)" : isTimeout ? "Request Timeout" : "Provider Error"}\n\n${aiLogError}`;
                      const finalText =
                        accumulatedText.trim().length > 0
                          ? `${accumulatedText}\n\n${errorNotice}`
                          : errorNotice;

                      yield* Queue.offer(eventsQueue, {
                        type: "message.updated",
                        driver: DRIVER_KIND,
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
                        driver: DRIVER_KIND,
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

                      // 3. Mark provider turn as failed
                      yield* Queue.offer(eventsQueue, {
                        type: "provider_turn.updated",
                        driver: DRIVER_KIND,
                        providerTurn: {
                          id: providerTurnId,
                          providerThreadId: turnInput.providerThread.id,
                          nodeId: turnInput.rootNodeId,
                          runAttemptId: turnInput.attemptId,
                          nativeTurnRef: null,
                          ordinal: turnOrdinal,
                          status: "failed",
                          startedAt: turnStartedAt,
                          completedAt: finishedTime,
                        },
                      });

                      // 4. Emit terminal failure event so server creates first-class error card
                      yield* Queue.offer(eventsQueue, {
                        type: "turn.terminal",
                        driver: DRIVER_KIND,
                        providerThreadId: turnInput.providerThread.id,
                        providerTurnId,
                        runOrdinal: PositiveInt.make(turnInput.runOrdinal),
                        status: "failed",
                        failure: {
                          class: isUsageLimit
                            ? "usage_limit"
                            : isTimeout
                              ? "transport_error"
                              : "provider_error",
                          message: aiLogError,
                          code: errorCode,
                          retryable: isUsageLimit || isTimeout,
                        },
                        failureItemOrdinal: NonNegativeInt.make(turnOrdinal * 100 + 2),
                        threadDisposition: "reusable",
                      });
                      Queue.flushUnsafe(eventsQueue);
                      return;
                    }

                    // Execute Active Engine Pipeline (Custom Engine or Codex CLI)
                    // Automatically extracts generated files, writes them to disk in projectCwd,
                    // runs git auto-commit, and links Live Preview.
                    const rawFinalText = accumulatedText || accumulatedReasoning;
                    let finalText = rawFinalText;

                    if (projectCwd && (accumulatedText || accumulatedReasoning)) {
                      try {
                        const engineResult = executeActiveEnginePipeline(
                          accumulatedText,
                          accumulatedReasoning,
                          projectCwd,
                        );
                        finalText = engineResult.finalText;
                      } catch (pipelineErr) {
                        console.error(
                          "[OpenCodeBypass] Active engine pipeline error:",
                          pipelineErr,
                        );
                      }
                    }

                    // Save multi-turn conversation history for this thread
                    if (threadKey) {
                      const updatedHistory = [
                        ...previousThreadHistory,
                        { role: "user" as const, content: promptText },
                        { role: "assistant" as const, content: finalText },
                      ];
                      saveBypassThreadHistory(threadKey, updatedHistory, projectCwd);
                    }

                    if (hasEmittedReasoning) {
                      yield* Queue.offer(eventsQueue, {
                        type: "turn_item.updated",
                        driver: DRIVER_KIND,
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
                      driver: DRIVER_KIND,
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
                      driver: DRIVER_KIND,
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
                      driver: DRIVER_KIND,
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
                      driver: DRIVER_KIND,
                      providerThreadId: turnInput.providerThread.id,
                      providerTurnId,
                      runOrdinal: PositiveInt.make(turnInput.runOrdinal),
                      status: "completed",
                      failure: null,
                      threadDisposition: "reusable",
                    });
                  });

                  currentTurnFiber = yield* Effect.forkDetach(runTurn);
                  const providerTurn: OrchestrationV2ProviderTurn = {
                    id: providerTurnId,
                    providerThreadId: turnInput.providerThread.id,
                    nodeId: turnInput.rootNodeId,
                    runAttemptId: turnInput.attemptId,
                    nativeTurnRef: null,
                    ordinal: turnOrdinal,
                    status: "running",
                    startedAt: turnStartedAt,
                    completedAt: null,
                  };
                  return providerTurn;
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

      const runBypassJson: TextGenerationOperations.Runner = (request) =>
        Effect.tryPromise({
          try: () =>
            bypassChat({
              model: request.modelSelection.model,
              baseUrl: config.baseUrl,
              messages: [
                {
                  role: "system",
                  content: "Return only the requested JSON object, with no prose or markdown.",
                },
                { role: "user", content: request.prompt },
              ],
            }),
          catch: (cause) =>
            new TextGenerationError({
              operation: request.operation,
              detail: "OpenCode bypass text generation failed.",
              cause,
            }),
        }).pipe(
          Effect.flatMap((response) =>
            TextGenerationOperations.decodeJsonReply(request, "OpenCode Bypass", response.content),
          ),
        );
      const textGeneration = TextGenerationOperations.fromRunner(
        "OpenCodeBypassTextGeneration",
        runBypassJson,
      );

      const instance: ProviderInstance = {
        instanceId,
        driverKind: DRIVER_KIND,
        continuationIdentity,
        displayName: displayName ?? PRESENTATION.displayName,
        accentColor,
        enabled,
        snapshot,
        // The free lane has no skill runtime of its own, so the workspace
        // snapshot carries the skills T3 discovered on disk. The composer lists
        // them and a `$name` mention dispatches through the request builder.
        snapshotForCwd: (cwd: string) =>
          Effect.gen(function* () {
            const machineSnapshot = yield* buildOpenCodeBypassSnapshot(
              instanceId,
              displayName,
              config,
              enabled,
            );
            return { ...machineSnapshot, skills: discoverCustomSkills(cwd) };
          }),
        orchestrationAdapter,
        textGeneration,
      };

      return instance;
    }),
};
