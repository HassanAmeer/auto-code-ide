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

const DRIVER = ProviderDriverKind.make("custom");

export interface CustomHeaderConfig {
  readonly key: string;
  readonly value: string;
}

export interface CustomModelConfig {
  readonly id: string;
  readonly name?: string | undefined;
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
        const threadHistory: Array<{ role: "user" | "assistant"; text: string }> = [];
        let currentTurnFiber: Fiber.Fiber<void, unknown> | null = null;

        const runtime: ProviderAdapterV2SessionRuntime = {
          instanceId,
          driver: DRIVER,
          providerSessionId: sessionId,
          providerSession,
          events: Stream.fromQueue(eventsQueue),
          ensureThread: (input: ProviderAdapterV2EnsureThreadInput) =>
            Effect.gen(function* () {
              const now = yield* DateTime.now;
              const thId =
                input.existingProviderThread?.id ?? ProviderThreadId.make(`th_${input.threadId}`);
              currentThread = {
                id: thId,
                driver: DRIVER,
                providerInstanceId: instanceId,
                providerSessionId: sessionId,
                appThreadId: input.threadId,
                ownerNodeId: null,
                nativeThreadRef: null,
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
              currentThread = input.providerThread;
              return currentThread;
            }),
          injectHistory: (args) =>
            Effect.sync(() => {
              for (const msg of args.messages) {
                threadHistory.push({
                  role: msg.role === "assistant" ? "assistant" : "user",
                  text: msg.text,
                });
              }
              return true;
            }),
          startTurn: (turnInput: ProviderAdapterV2TurnInput) =>
            Effect.gen(function* () {
              const turnStartedAt = yield* DateTime.now;
              const providerTurnId = ProviderTurnId.make(`turn_${turnInput.runId}`);
              const assistantTurnItemId = TurnItemId.make(`item_assist_${turnInput.runId}`);
              const assistantMessageId = MessageId.make(`msg_assist_${turnInput.runId}`);

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
                    ordinal: PositiveInt.make(1),
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
                    ordinal: NonNegativeInt.make(1),
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

                const cleanBase = (config.baseUrl ?? "").trim().replace(/\/+$/, "");
                if (!cleanBase) {
                  return yield* Effect.fail(
                    "Custom provider base URL is missing or not configured.",
                  );
                }

                const chatUrl = cleanBase.endsWith("/v1")
                  ? `${cleanBase}/chat/completions`
                  : cleanBase.includes("/v1/")
                    ? `${cleanBase}/chat/completions`
                    : `${cleanBase}/v1/chat/completions`;

                const conversationMessages = [
                  ...threadHistory.map((m) => ({ role: m.role, content: m.text })),
                  { role: "user", content: turnInput.message.text || "Hello" },
                ];

                const selectedModel =
                  turnInput.modelSelection?.model && turnInput.modelSelection.model !== "default"
                    ? turnInput.modelSelection.model
                    : (config.models?.[0]?.id ?? "default");

                let request = HttpClientRequest.post(chatUrl).pipe(
                  HttpClientRequest.setHeader("Content-Type", "application/json"),
                  HttpClientRequest.setHeader("Accept", "text/event-stream, application/json"),
                  HttpClientRequest.bodyJsonUnsafe({
                    model: selectedModel,
                    messages: conversationMessages,
                    stream: true,
                  }),
                );

                if (config.apiKey && config.apiKey.trim().length > 0) {
                  request = HttpClientRequest.setHeader(
                    request,
                    "Authorization",
                    `Bearer ${config.apiKey.trim()}`,
                  );
                }

                if (config.headers && Array.isArray(config.headers)) {
                  for (const h of config.headers) {
                    if (h.key && h.key.trim().length > 0) {
                      request = HttpClientRequest.setHeader(request, h.key.trim(), h.value.trim());
                    }
                  }
                }

                const client = yield* HttpClient.HttpClient;
                const response = yield* client
                  .execute(request)
                  .pipe(Effect.flatMap(HttpClientResponse.filterStatusOk));

                let accumulatedText = "";
                let lastEmitted = yield* Clock.currentTimeMillis;

                const linesStream = response.stream.pipe(Stream.decodeText(), Stream.splitLines);

                yield* Stream.runForEach(linesStream, (line) =>
                  Effect.gen(function* () {
                    const trimmed = line.trim();
                    if (!trimmed || trimmed.startsWith(":") || trimmed.startsWith("event:")) return;
                    if (trimmed.startsWith("data:")) {
                      const dataStr = trimmed.slice(5).trim();
                      if (dataStr === "[DONE]") return;
                      const maybeJson = decodeJson(dataStr);
                      if (Option.isSome(maybeJson)) {
                        const parsed = maybeJson.value as {
                          choices?: Array<{
                            delta?: { content?: string };
                            text?: string;
                          }>;
                        };
                        const delta =
                          parsed.choices?.[0]?.delta?.content ?? parsed.choices?.[0]?.text ?? "";
                        if (delta) {
                          accumulatedText += delta;
                          const nowMs = yield* Clock.currentTimeMillis;
                          if (nowMs - lastEmitted > 40) {
                            lastEmitted = nowMs;
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
                                ordinal: NonNegativeInt.make(1),
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
                          }
                        }
                      }
                    }
                  }),
                );

                const finishedTime = yield* DateTime.now;
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
                    ordinal: NonNegativeInt.make(1),
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
                  type: "turn.terminal",
                  driver: DRIVER,
                  providerThreadId: turnInput.providerThread.id,
                  providerTurnId,
                  runOrdinal: PositiveInt.make(turnInput.runOrdinal),
                  status: "completed",
                  failure: null,
                  threadDisposition: "reusable",
                });

                threadHistory.push({
                  role: "user",
                  text: turnInput.message.text || "",
                });
                threadHistory.push({ role: "assistant", text: accumulatedText });
              }).pipe(
                Effect.provide(FetchHttpClient.layer),
                Effect.catch((err: unknown) =>
                  Effect.gen(function* () {
                    const message =
                      typeof err === "object" && err !== null && "message" in err
                        ? String((err as any).message)
                        : String(err);
                    const failTime = yield* DateTime.now;
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
                        ordinal: NonNegativeInt.make(1),
                        status: "failed",
                        title: null,
                        startedAt: turnStartedAt,
                        completedAt: failTime,
                        updatedAt: failTime,
                        type: "assistant_message",
                        messageId: assistantMessageId,
                        text: `Error connecting to custom provider: ${message}`,
                        streaming: false,
                      },
                    });
                    yield* Queue.offer(eventsQueue, {
                      type: "turn.terminal",
                      driver: DRIVER,
                      providerThreadId: turnInput.providerThread.id,
                      providerTurnId,
                      runOrdinal: PositiveInt.make(turnInput.runOrdinal),
                      failureItemOrdinal: PositiveInt.make(1),
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

export function registerFallbackCustomProvider(params: {
  instanceId: string;
  displayName?: string;
  baseUrl: string;
  apiKey?: string;
  headers?: Array<CustomHeaderConfig>;
  models?: Array<CustomModelConfig>;
  enabled?: boolean;
}): ProviderInstance {
  const cleanId = params.instanceId.startsWith("custom_")
    ? params.instanceId
    : `custom_${params.instanceId}`;
  const instanceId = ProviderInstanceId.make(cleanId);
  const instance = createCustomProviderInstance({
    instanceId,
    displayName: params.displayName ?? "Custom Provider",
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
  fallbackInstances.set(params.instanceId, instance);
  return instance;
}

export function unregisterFallbackCustomProvider(id: string): void {
  const cleanId = id.startsWith("custom_") ? id : `custom_${id}`;
  fallbackInstances.delete(cleanId);
  fallbackInstances.delete(id);
}

export function getFallbackCustomInstance(
  instanceId: ProviderInstanceId | string,
): ProviderInstance | undefined {
  return fallbackInstances.get(String(instanceId));
}

export function listFallbackCustomInstanceIds(): string[] {
  return Array.from(fallbackInstances.keys()).filter((k) => k.startsWith("custom_"));
}

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
