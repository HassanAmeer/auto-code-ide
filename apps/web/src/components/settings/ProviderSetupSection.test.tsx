import { cloneElement, isValidElement, type FunctionComponent, type ReactElement } from "react";
import {
  EnvironmentId,
  ProviderDriverKind,
  ProviderInstanceId,
  type ProviderAuthState,
  type ServerProvider,
} from "@t3tools/contracts";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { visitElements } from "../../test/reactElementTree";
import { reactHookHarness as hooks } from "../../test/reactHookHarness";

const setup = vi.hoisted(() => ({
  auth: null as ProviderAuthState | null,
  installation: null as unknown,
  authState: vi.fn(() => "auth"),
  installState: vi.fn(() => "installation"),
  startAuth: vi.fn(),
  completeAuth: vi.fn(),
  respondAuth: vi.fn(),
  cancelAuth: vi.fn(),
  logoutAuth: vi.fn(),
  startInstall: vi.fn(),
  cancelInstall: vi.fn(),
  removeInstall: vi.fn(),
  confirm: vi.fn(),
  refreshProviders: vi.fn(),
  fetch: vi.fn(),
  windowOpen: vi.fn(),
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  const { reactHookHarness } = await import("../../test/reactHookHarness");
  return {
    ...actual,
    useRef: reactHookHarness.useRef,
    useState: reactHookHarness.useState,
  };
});

vi.mock("react/compiler-runtime", async () => {
  const { reactHookHarness } = await import("../../test/reactHookHarness");
  return { c: reactHookHarness.useMemoCache };
});

vi.mock("../../state/server", () => ({
  serverEnvironment: {
    providerAuthState: setup.authState,
    providerInstallState: setup.installState,
    startProviderAuth: setup.startAuth,
    completeProviderAuth: setup.completeAuth,
    respondProviderAuth: setup.respondAuth,
    cancelProviderAuth: setup.cancelAuth,
    logoutProviderAuth: setup.logoutAuth,
    startProviderInstall: setup.startInstall,
    cancelProviderInstall: setup.cancelInstall,
    removeProviderInstallation: setup.removeInstall,
    refreshProviders: setup.refreshProviders,
  },
}));

vi.mock("../../state/use-atom-command", () => ({
  useAtomCommand: (command: unknown) => command,
}));

vi.mock("../../state/query", () => ({
  useEnvironmentQuery: (atom: string) => ({
    data: atom === "auth" ? setup.auth : setup.installation,
    error: null,
    isPending: false,
    refresh: vi.fn(),
  }),
}));

vi.mock("../../localApi", () => ({
  ensureLocalApi: () => ({ dialogs: { confirm: setup.confirm } }),
}));

vi.stubGlobal("fetch", setup.fetch);
vi.stubGlobal("window", { open: setup.windowOpen, location: { hostname: "localhost" } });

import { AntigravityWebConnect } from "./AntigravityWebConnect";
import { ProviderSetupSection } from "./ProviderSetupSection";

const environmentId = EnvironmentId.make("remote-google");
const instanceId = ProviderInstanceId.make("antigravity_work");
const provider: ServerProvider = {
  instanceId,
  driver: ProviderDriverKind.make("antigravity"),
  installed: true,
  enabled: true,
  version: "test-version",
  status: "error",
  auth: { status: "unauthenticated" },
  checkedAt: "2026-09-02T00:00:00.000Z",
  models: [],
  skills: [],
  slashCommands: [],
  setup: { canAuthenticate: true, canInstall: true },
};

function installState(patch: Record<string, unknown> = {}) {
  return {
    driver: ProviderDriverKind.make("antigravity"),
    operationId: null,
    phase: "idle",
    downloadedBytes: 0,
    totalBytes: null,
    version: null,
    installedVersion: null,
    canRemove: false,
    message: null,
    ...patch,
  };
}

function renderSetup(
  options: {
    readOnly?: boolean;
    provider?: ServerProvider;
    enabled?: boolean;
    binaryPath?: string;
  } = {},
) {
  hooks.beginRender();
  const view = ProviderSetupSection({
    environmentId,
    environmentLabel: "Remote Google device",
    instanceId,
    provider: options.provider ?? provider,
    binaryPath: options.binaryPath,
    enabled: options.enabled ?? true,
    readOnly: options.readOnly ?? false,
    onEnable: vi.fn(),
  });
  const actions = visitElements(
    view,
    (element) =>
      typeof element.type === "function" &&
      element.props.environmentId === environmentId &&
      element.props.instanceId === instanceId,
  );
  if (!actions) return view;
  const Actions = actions.type as FunctionComponent<Record<string, unknown>>;
  function expand(node: unknown): unknown {
    if (Array.isArray(node)) return node.map(expand);
    if (!isValidElement<Record<string, unknown>>(node)) return node;
    if (node.type === AntigravityWebConnect)
      return AntigravityWebConnect(node.props as Parameters<typeof AntigravityWebConnect>[0]);
    return cloneElement(
      node,
      Object.fromEntries(Object.entries(node.props).map(([key, value]) => [key, expand(value)])),
    );
  }
  return expand(Actions(actions.props));
}

function button(view: unknown, label: string) {
  return visitElements(
    view,
    (element) =>
      (element.props.children === label || element.props["aria-label"] === label) &&
      typeof element.props.onClick === "function",
  );
}

function countElements(
  node: unknown,
  predicate: (element: ReactElement<Record<string, unknown>>) => boolean,
): number {
  if (Array.isArray(node)) {
    return node.reduce((total, child) => total + countElements(child, predicate), 0);
  }
  if (!isValidElement<Record<string, unknown>>(node)) return 0;
  return (
    Number(predicate(node)) +
    Object.values(node.props).reduce<number>(
      (total, value) => total + countElements(value, predicate),
      0,
    )
  );
}

function click(view: unknown, label: string) {
  const target = button(view, label);
  if (!target) throw new Error(`Missing button: ${label}`);
  if (target.props.disabled) throw new Error(`Button is disabled: ${label}`);
  (target.props.onClick as () => void)();
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

const startOk = {
  url: "https://accounts.google.com/o/oauth2/v2/auth?state=state-1",
  state: "state-1",
};
const statusSucceeded = () => ({ status: "succeeded", message: "Signed in as user@example.com" });

describe("Antigravity setup", () => {
  beforeEach(() => {
    hooks.reset();
    vi.clearAllMocks();
    setup.auth = null;
    setup.installation = installState();
    for (const command of [
      setup.startAuth,
      setup.completeAuth,
      setup.cancelAuth,
      setup.logoutAuth,
      setup.startInstall,
      setup.cancelInstall,
      setup.removeInstall,
      setup.refreshProviders,
    ]) {
      command.mockReset().mockResolvedValue({ _tag: "Success", value: undefined });
    }
    setup.confirm.mockReset().mockResolvedValue(false);
    setup.fetch.mockReset().mockRejectedValue(new Error("fetch not stubbed"));
    setup.windowOpen.mockReset();
  });

  it("signs in through the permanent web connect and refreshes models", async () => {
    setup.fetch
      .mockResolvedValueOnce({ ok: true, json: async () => startOk })
      .mockResolvedValue({ ok: true, json: async () => statusSucceeded() });
    const view = renderSetup();
    click(view, "Sign in with Google");
    await flushPromises();
    await flushPromises();

    expect(setup.fetch).toHaveBeenCalledWith("/api/antigravity-connect/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ instanceId }),
    });
    expect(setup.windowOpen).toHaveBeenCalledWith(
      startOk.url,
      "antigravity_connect",
      "noopener,noreferrer",
    );
    expect(setup.refreshProviders).toHaveBeenCalledWith({
      environmentId,
      input: { instanceId, refreshModels: true },
    });
  });

  it("disables the sign-in button while start is pending", async () => {
    let resolveStart: (value: unknown) => void = () => {
      throw new Error("Missing resolver.");
    };
    const pending = new Promise<unknown>((resolve) => {
      resolveStart = resolve;
    });
    setup.fetch.mockReturnValueOnce(pending);
    const view = renderSetup();
    click(view, "Sign in with Google");

    expect(setup.fetch).toHaveBeenCalledTimes(1);
    expect(button(renderSetup(), "Sign in with Google")?.props.disabled).toBe(true);
    resolveStart({ ok: true, json: async () => startOk });
    await flushPromises();
  });

  it("offers sign-in again after Google reports a failure", async () => {
    setup.fetch
      .mockResolvedValueOnce({ ok: true, json: async () => startOk })
      .mockResolvedValue({
        ok: true,
        json: async () => ({ status: "failed", message: "Google sign-in failed: access_denied" }),
      });
    const view = renderSetup();
    click(view, "Sign in with Google");
    await flushPromises();
    await flushPromises();

    expect(button(renderSetup(), "Retry sign-in")).not.toBeNull();
  });

  it("shows the signed-in account actions and hides the sign-in button", () => {
    const authenticated = { ...provider, auth: { status: "authenticated" as const } };
    const view = renderSetup({ provider: authenticated });
    expect(button(view, "Change account")).not.toBeNull();
    expect(button(view, "Sign out")).not.toBeNull();
    expect(button(view, "Sign in with Google")).toBeNull();
  });

  it.each(["unauthenticated", "unknown"] as const)(
    "does not offer sign-out for an unverified %s account",
    (status) => {
      const view = renderSetup({
        provider: { ...provider, auth: { status, canLogout: true } },
      });
      expect(button(view, "Sign in with Google")).not.toBeNull();
      expect(button(view, "Sign out")).toBeNull();
      expect(button(view, "Change account")).toBeNull();
    },
  );

  it.each([true, false])(
    "can sign out a verified account when its instance is enabled=%s",
    async (enabled) => {
      setup.confirm.mockResolvedValue(true);
      const view = renderSetup({
        enabled,
        provider: {
          ...provider,
          enabled,
          installed: false,
          status: enabled ? "warning" : "disabled",
          auth: { status: "authenticated" },
        },
      });
      click(view, "Sign out");
      await flushPromises();
      expect(setup.logoutAuth).toHaveBeenCalledWith({ environmentId, input: { instanceId } });
    },
  );

  it("shows a repeated runtime status message only once", () => {
    setup.installation = installState({
      operationId: "install-1",
      phase: "verifying",
      message: "Checking the downloaded runtime.",
    });

    const view = renderSetup();
    expect(
      countElements(
        view,
        (element) => element.props.children === "Checking the downloaded runtime.",
      ),
    ).toBe(1);
  });

  it("removes an owned damaged runtime only after confirmation", async () => {
    setup.installation = installState({
      phase: "failed",
      canRemove: true,
      installedVersion: null,
    });
    const view = renderSetup();
    click(view, "Remove downloaded runtime");
    await flushPromises();
    expect(setup.removeInstall).not.toHaveBeenCalled();

    setup.confirm.mockResolvedValue(true);
    click(view, "Remove downloaded runtime");
    await flushPromises();
    expect(setup.removeInstall).toHaveBeenCalledWith({ environmentId, input: { instanceId } });
  });

  it("does not enable sign-in before the runtime is installed", () => {
    const view = renderSetup({
      provider: { ...provider, installed: false },
      binaryPath: "/missing/antigravity",
    });
    expect(button(view, "Sign in with Google")?.props.disabled).toBe(true);
    expect(setup.startAuth).not.toHaveBeenCalled();
  });

  it.each(["read-only", "older-server"] as const)(
    "does not open private setup subscriptions for a %s view",
    (mode) => {
      const { setup: _setup, ...olderProvider } = provider;
      renderSetup(mode === "read-only" ? { readOnly: true } : { provider: olderProvider });
      expect(setup.authState).not.toHaveBeenCalled();
      expect(setup.installState).not.toHaveBeenCalled();
      expect(setup.startAuth).not.toHaveBeenCalled();
    },
  );
});
