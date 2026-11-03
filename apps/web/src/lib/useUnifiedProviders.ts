import { useState, useEffect, useMemo } from "react";
import type { ServerProvider } from "@t3tools/contracts";
import {
  getCustomProviders,
  fetchCustomProviders,
  subscribeCustomProviders,
  customProviderToServerProvider,
  type CustomProvider,
} from "./customProviders";

/**
 * Single Unified Hook for all AI Providers across the entire app.
 * Automatically synchronizes with local storage, server database, and real-time custom provider update events.
 * Guarantees that any provider added or updated appears instantly in all picker sheets, settings, and chat screens.
 */
export function useUnifiedProviders(rawServerProviders: ReadonlyArray<ServerProvider> = []): {
  serverProviders: ServerProvider[];
  customProvidersList: CustomProvider[];
} {
  const [customProvidersList, setCustomProvidersList] = useState<CustomProvider[]>(() =>
    getCustomProviders(),
  );

  useEffect(() => {
    fetchCustomProviders().then((list) => {
      if (Array.isArray(list)) {
        setCustomProvidersList(list);
      }
    });
    return subscribeCustomProviders((list) => {
      if (Array.isArray(list)) {
        setCustomProvidersList(list);
      }
    });
  }, []);

  const serverProviders = useMemo(() => {
    const nonCustomRaw = (rawServerProviders || []).filter(
      (p) => p.driver !== "custom" && p.instanceId !== "custom",
    );
    if (!Array.isArray(customProvidersList) || customProvidersList.length === 0) {
      return nonCustomRaw as ServerProvider[];
    }
    const customStatuses = customProvidersList
      .filter((cp): cp is CustomProvider =>
        Boolean(cp && typeof cp === "object" && cp.enabled !== false),
      )
      .map(customProviderToServerProvider)
      .filter(Boolean);
    return [...nonCustomRaw, ...customStatuses];
  }, [rawServerProviders, customProvidersList]);

  return { serverProviders, customProvidersList };
}
