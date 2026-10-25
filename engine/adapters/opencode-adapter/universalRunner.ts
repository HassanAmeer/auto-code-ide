import { createOpencodeClient } from "@opencode-ai/sdk/v2";

export interface UniversalPromptOptions {
  readonly model: string;
  readonly prompt: string;
  readonly projectCwd: string;
  readonly opencodeUrl?: string;
  readonly onChunk?: (chunkText: string, reasoningText?: string) => void;
}

export interface UniversalPromptResult {
  readonly success: boolean;
  readonly text: string;
  readonly error?: string;
}

/**
 * Universal execution runner powered by OpenCode Engine Copy.
 * Executes any model through the full agent loop (tools, edit, multi-step).
 */
export async function runUniversalEnginePrompt(
  options: UniversalPromptOptions,
): Promise<UniversalPromptResult> {
  const opencodeUrl = options.opencodeUrl || "http://127.0.0.1:4099";
  const client = createOpencodeClient({ baseUrl: opencodeUrl });

  try {
    // 1. Create a session pinned to the target project directory
    const sessionResp = await client.session.create({
      title: "Universal Engine Run",
      directory: options.projectCwd,
      permission: { "*": "allow" } as any,
    });

    const sessionID = sessionResp.data?.id;
    if (!sessionID) {
      throw new Error(
        `Failed to create OpenCode session: ${JSON.stringify(sessionResp.error || "unknown error")}`,
      );
    }

    // 2. Resolve model ID for OpenCode engine
    let providerID = "cheaprouter";
    let modelID = options.model;

    if (modelID.startsWith("cheaprouter/")) {
      modelID = modelID.replace(/^cheaprouter\//, "");
    }

    // 3. Subscribe to real-time events for streaming output
    let accumulatedText = "";
    let accumulatedReasoning = "";

    try {
      const eventSubscription = await client.event.subscribe();
      if (eventSubscription && (eventSubscription as any).stream) {
        (async () => {
          try {
            for await (const event of (eventSubscription as any).stream) {
              if (event?.sessionID === sessionID || event?.data?.sessionID === sessionID) {
                if (event.type === "session.text.chunk" || event.type === "text") {
                  const chunk = event.data?.text || event.text || "";
                  if (chunk) {
                    accumulatedText += chunk;
                    options.onChunk?.(chunk, undefined);
                  }
                } else if (event.type === "session.reasoning.chunk" || event.type === "reasoning") {
                  const rChunk = event.data?.text || event.text || "";
                  if (rChunk) {
                    accumulatedReasoning += rChunk;
                    options.onChunk?.(undefined, rChunk);
                  }
                }
              }
            }
          } catch {
            // Stream ended
          }
        })();
      }
    } catch {
      // Event subscription fallback
    }

    // 4. Send the prompt to the OpenCode engine agent loop
    const promptResp = await client.session.prompt({
      sessionID,
      directory: options.projectCwd,
      model: {
        providerID,
        modelID,
      },
      parts: [{ type: "text", text: options.prompt }],
    });

    // 5. Gather final textual output from parts if streaming didn't catch it
    if (!accumulatedText && promptResp.data?.parts) {
      for (const part of promptResp.data.parts) {
        if (part.type === "text" && (part as any).text) {
          accumulatedText += (part as any).text + "\n";
        }
      }
    }

    return {
      success: true,
      text: accumulatedText.trim() || "Tasks completed successfully.",
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      text: "",
      error: errorMsg,
    };
  }
}
