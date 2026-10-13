import { useSyncExternalStore } from "react";
import { networkLogger, type RequestLogEntry } from "../../lib/networkLogger";

export function useNetworkLogs(): readonly RequestLogEntry[] {
  return useSyncExternalStore(
    (onStoreChange) => networkLogger.subscribe(onStoreChange),
    () => networkLogger.getLogs(),
    () => [],
  );
}
