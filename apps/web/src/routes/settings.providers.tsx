import { createFileRoute } from "@tanstack/react-router";
import { EnvironmentId, ProviderInstanceId } from "@t3tools/contracts";

import { ProviderSettingsPanel } from "../components/settings/ProviderSettingsPanel";
import { useSettingsScope } from "../components/settings/SettingsScopeContext";

/**
 * Providers are machine state, so the page shows one environment at a time:
 * the chosen one from the settings scope selector.
 * A project crumb narrows candidates to where that project is registered.
 */
import { useEnvironments, usePrimaryEnvironmentId } from "../state/environments";

function SettingsProvidersRoute() {
  const target = Route.useSearch();
  const { environment } = useSettingsScope();
  const { environments } = useEnvironments();
  const primaryEnvironmentId = usePrimaryEnvironmentId();

  const activeEnvironmentId =
    target.environmentId ??
    environment?.environmentId ??
    primaryEnvironmentId ??
    environments[0]?.environmentId;

  return (
    <ProviderSettingsPanel
      {...(activeEnvironmentId ? { environmentId: activeEnvironmentId } : {})}
      {...(target.instanceId ? { instanceId: target.instanceId } : {})}
    />
  );
}

export const Route = createFileRoute("/settings/providers")({
  validateSearch: (raw: Record<string, unknown>) => ({
    ...(typeof raw.environmentId === "string" && raw.environmentId.trim()
      ? { environmentId: EnvironmentId.make(raw.environmentId) }
      : {}),
    ...(typeof raw.instanceId === "string" && raw.instanceId.trim()
      ? { instanceId: ProviderInstanceId.make(raw.instanceId) }
      : {}),
  }),
  component: SettingsProvidersRoute,
});
