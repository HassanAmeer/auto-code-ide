// @effect-diagnostics nodeBuiltinImport:off globalConsole:off globalConsoleInEffect:off globalDate:off globalDateInEffect:off globalRandomInEffect:off globalErrorInEffectFailure:off preferSchemaOverJson:off globalFetchInEffect:off anyUnknownInErrorContext:off globalFetch:off
export {
  bypassChat,
  bypassChatStream,
  OPENCODE_BYPASS_ENABLED,
  FREE_MODELS,
  resolveChatEndpoint,
} from "./client.ts";
export type { BypassChatMessage, BypassRequestOptions, BypassResponse } from "./client.ts";

export {
  mintSession,
  canonicalizeSession,
  isCanonicalSession,
  SESSION_RE,
  SESSION_DESCENDING_RE,
} from "./session.ts";

export {
  CLIENT_UA,
  UPSTREAM_BASE,
  FINGERPRINT_TOOL_DEFINITIONS,
  FINGERPRINT_TOOLS,
  buildBypassHeaders,
  injectFingerprintTools,
} from "./fingerprint.ts";
