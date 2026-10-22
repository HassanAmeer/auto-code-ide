// @effect-diagnostics nodeBuiltinImport:off globalConsole:off globalConsoleInEffect:off globalDate:off globalDateInEffect:off globalRandomInEffect:off globalErrorInEffectFailure:off preferSchemaOverJson:off globalFetchInEffect:off anyUnknownInErrorContext:off globalFetch:off
/**
 * OpenCode Free Lane — Client Fingerprint Headers
 *
 * Yeh woh exact headers hain jo OpenCode v2 upstream gate fingerprint check
 * karta hai. Agar koi bhi header ya User-Agent ghalat ho to 403 FreeTierError
 * milta hai.
 *
 * Reference: https://github.com/Ebony-Vinyl/dsh-our-free-model (src/upstream.js)
 *
 * ⚠️  Yeh file sirf tab active hoti hai jab `OPENCODE_BYPASS_ENABLED = true` ho.
 *
 * @module provider-opencode/opencode-bypass-setup/fingerprint
 */

import { mintSession, canonicalizeSession } from "./session.ts";

// @effect-diagnostics nodeBuiltinImport:off globalConsole:off globalConsoleInEffect:off globalDate:off globalDateInEffect:off globalRandomInEffect:off globalErrorInEffectFailure:off preferSchemaOverJson:off globalFetchInEffect:off anyUnknownInErrorContext:off globalFetch:off
/**
 * v2 gate ka exact User-Agent string.
 * ⚠️  Is string me kuch bhi add/change mat karo — gate exact match karta hai.
 *     Major version 2+ hona zaroori hai; purana `opencode/1.x` 403 deta hai.
 */
export const CLIENT_UA = "opencode/latest/2.0.26/cli";

// @effect-diagnostics nodeBuiltinImport:off globalConsole:off globalConsoleInEffect:off globalDate:off globalDateInEffect:off globalRandomInEffect:off globalErrorInEffectFailure:off preferSchemaOverJson:off globalFetchInEffect:off anyUnknownInErrorContext:off globalFetch:off
/**
 * Upstream base URL — free lane.
 * Env variable se override ho sakta hai testing ke liye.
 */
export const UPSTREAM_BASE = process.env.OUR_FREE_MODEL_BASE ?? "https://opencode.ai";

// @effect-diagnostics nodeBuiltinImport:off globalConsole:off globalConsoleInEffect:off globalDate:off globalDateInEffect:off globalRandomInEffect:off globalErrorInEffectFailure:off preferSchemaOverJson:off globalFetchInEffect:off anyUnknownInErrorContext:off globalFetch:off
/**
 * v2 gate ke liye required tool fingerprints.
 *
 * ⚠️  Yeh definitions **verbatim** OpenCode v2.0.26 CLI se li gayi hain.
 *     Description ya schema mein ek word bhi badloge to 403 milega.
 *     `tool_choice: "none"` kabhi mat bhejna — woh bhi 403 hai.
 */
export const FINGERPRINT_TOOL_DEFINITIONS = {
  read: {
    description:
      "Read the contents of a file or directory. Supports text files, images, and PDFs. Images and PDFs are presented directly to the model. Each text line is prefixed by its 1-based line number as <line>: <content>. The prefix is for reference and is not part of the file content. Directory entries are returned one per line. Use offset and limit to read large files or directories in sections. Prefer one larger read over many small slices, and use grep to find specific content in large files.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "File or directory to read" },
        offset: {
          type: "integer",
          minimum: 0,
          description: "The line or directory entry to start reading from (1-based)",
        },
        limit: {
          type: "integer",
          minimum: 0,
          description:
            "The maximum number of lines or directory entries to read (defaults to and capped at 2000)",
        },
      },
      required: ["path"],
      additionalProperties: false,
    },
  },
  shell: {
    description:
      "Execute a shell command and return its output. Commands run on Linux using bash. Quote file paths containing spaces or special characters. Prefer dedicated tools over shell commands when possible. When output is large, the full result is saved to a file and a truncated preview is returned. Rely on automatic truncation unless filtering the output is more useful. Commands accept an optional timeout, background commands have no timeout by default. Background commands return immediately, and you will be notified when they complete.",
    parameters: {
      type: "object",
      properties: {
        command: {
          type: "string",
          description: "Shell command string to execute",
        },
        workdir: {
          type: "string",
          description:
            "Working directory to execute the command in. Defaults to the current working directory. When possible, avoid changing directories in the command and set the working directory here instead.",
        },
        timeout: {
          type: "integer",
          minimum: 0,
          description:
            "Timeout in milliseconds. Set to 0 to disable the timeout. Defaults to 120000 for foreground commands. Background commands have no timeout by default.",
        },
        background: {
          type: "boolean",
          description:
            "Run the command in the background and return immediately (useful for dev servers and long-running builds). You do not need to use '&' at the end of the command when using this parameter. You will be notified when it completes. DO NOT poll for completion.",
        },
      },
      required: ["command"],
      additionalProperties: false,
    },
  },
} as const;

export const FINGERPRINT_TOOLS = ["read", "shell"] as const;

// @effect-diagnostics nodeBuiltinImport:off globalConsole:off globalConsoleInEffect:off globalDate:off globalDateInEffect:off globalRandomInEffect:off globalErrorInEffectFailure:off preferSchemaOverJson:off globalFetchInEffect:off anyUnknownInErrorContext:off globalFetch:off
/**
 * Diye gaye existingSessionId ke sath bypass request headers banao.
 * Agar session nahi diya to naya mint hoga.
 */
export function buildBypassHeaders(
  existingSessionId?: string,
  options: { stream?: boolean } = {},
): Record<string, string> {
  const session = existingSessionId ? canonicalizeSession(existingSessionId) : mintSession();

  return {
    "content-type": "application/json",
    authorization: "Bearer public",
    "user-agent": CLIENT_UA,
    "x-opencode-client": "cli",
    "x-opencode-session": session,
    "x-opencode-session-id": session,
    "x-session-affinity": session,
    "x-session-id": session,
    "x-opencode-project": "global",
    accept: options.stream ? "text/event-stream" : "*/*",
  };
}

// @effect-diagnostics nodeBuiltinImport:off globalConsole:off globalConsoleInEffect:off globalDate:off globalDateInEffect:off globalRandomInEffect:off globalErrorInEffectFailure:off preferSchemaOverJson:off globalFetchInEffect:off anyUnknownInErrorContext:off globalFetch:off
/**
 * Existing tools list me fingerprint tools inject karo agar pehle se nahi hain.
 * Returns: { tools, injectedNames, placeholderNote }
 */
export function injectFingerprintTools(
  existingTools: Array<{ name: string; [k: string]: unknown }> = [],
): {
  tools: Array<{ name: string; description: string; parameters: unknown }>;
  injectedNames: string[];
  placeholderNote: string | null;
} {
  const existingNames = new Set(existingTools.map((t) => t.name));
  const injectedNames: string[] = [];

  const allTools = [...existingTools] as Array<{
    name: string;
    description: string;
    parameters: unknown;
  }>;

  for (const toolName of FINGERPRINT_TOOLS) {
    if (!existingNames.has(toolName)) {
      allTools.push({
        name: toolName,
        ...FINGERPRINT_TOOL_DEFINITIONS[toolName],
      });
      injectedNames.push(toolName);
    }
  }

  // Strong system instruction to output direct code/text instead of triggering placeholder tools
  const placeholderNote =
    "IMPORTANT: You are in direct conversational code generation mode. Do NOT invoke any tools (like `read` or `shell`). Instead, write and present the complete code, solution and explanations directly in your text response.";

  return { tools: allTools, injectedNames, placeholderNote };
}
