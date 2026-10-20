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
  type OrchestrationV2ProviderSession,
  type OrchestrationV2ProviderThread,
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
import type * as ProviderAdapter from "@t3tools/provider-core/server/ProviderAdapter";
import type { ProviderTextGeneration } from "@t3tools/provider-core/server/textGeneration";
import { bypassChatStream, type BypassChatMessage } from "./bypass/client.ts";

const DRIVER_KIND = ProviderDriverKind.make("opencodebypasssetup");
const decodeSettings = Schema.decodeSync(OpenCodeBypassSetupSettings);

const PRESENTATION = {
  displayName: "OpenCode Bypass Setup",
} as const;

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
        getCapabilities: () =>
          Effect.succeed({
            interactionModes: ["chat"],
            supportsStreaming: true,
            supportsPlanMode: false,
          } as any),
        planSelectionTransition: () =>
          Effect.succeed({
            plan: "none",
          } as any),
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
              capabilities: {
                interactionModes: ["chat"],
                supportsStreaming: true,
                supportsPlanMode: false,
              } as any,
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
                  const itemOrdinal = NonNegativeInt.make(turnOrdinal * 100 + 1);

                  let accumulatedText = "";

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

                    const rawMessages: any[] = (turnInput as any).messages ?? [];
                    const chatMessages: BypassChatMessage[] = rawMessages.map((m: any) => ({
                      role: (m.role === "assistant" ? "assistant" : "user") as
                        | "user"
                        | "assistant"
                        | "system",
                      content: m.text || "",
                    }));

                    if (chatMessages.length === 0) {
                      chatMessages.push({ role: "user", content: "Hello" });
                    }

                    let lastEmitted = Date.now();

                    yield* Effect.promise(async () => {
                      try {
                        await bypassChatStream(
                          {
                            model: selectedModel,
                            baseUrl: config.baseUrl,
                            messages: chatMessages,
                          },
                          (chunkText) => {
                            accumulatedText += chunkText;
                            const nowMs = Date.now();
                            if (nowMs - lastEmitted > 40) {
                              lastEmitted = nowMs;
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
                                  text: accumulatedText,
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
                      } catch (err) {
                        const errorMsg = err instanceof Error ? err.message : String(err);
                        accumulatedText += `\n[Error: ${errorMsg}]`;
                      }
                    });

                    const finishedTime = yield* DateTime.now;

                    yield* Queue.offer(eventsQueue, {
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
                        text: accumulatedText,
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

      const textGeneration: ProviderTextGeneration = {
        generateCommitMessage: () =>
          Effect.fail({
            _tag: "TextGenerationError" as const,
            operation: "generateCommitMessage",
            detail: "Not implemented",
          } as any),
        generatePrContent: () =>
          Effect.fail({
            _tag: "TextGenerationError" as const,
            operation: "generatePrContent",
            detail: "Not implemented",
          } as any),
        generateBranchName: () =>
          Effect.fail({
            _tag: "TextGenerationError" as const,
            operation: "generateBranchName",
            detail: "Not implemented",
          } as any),
        generateThreadTitle: () =>
          Effect.fail({
            _tag: "TextGenerationError" as const,
            operation: "generateThreadTitle",
            detail: "Not implemented",
          } as any),
      };

      const instance: ProviderInstance = {
        instanceId,
        driverKind: DRIVER_KIND,
        continuationIdentity,
        displayName: displayName ?? PRESENTATION.displayName,
        accentColor,
        enabled,
        snapshot,
        orchestrationAdapter,
        textGeneration,
      };

      return instance;
    }),
};
