import { useSyncExternalStore } from "react";
import { networkLogger, type RequestLogEntry, type AiModelLogEntry } from "../../lib/networkLogger";

export function useNetworkLogs(): readonly RequestLogEntry[] {
  return useSyncExternalStore(
    (onStoreChange) => networkLogger.subscribe(onStoreChange),
    () => networkLogger.getLogs(),
    () => [],
  );
}

export function useAiModelLogs(): readonly AiModelLogEntry[] {
  return useSyncExternalStore(
    (onStoreChange) => networkLogger.subscribe(onStoreChange),
    () => networkLogger.getAiLogs(),
    () => [],
  );
}
