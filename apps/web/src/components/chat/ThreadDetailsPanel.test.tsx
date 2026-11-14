import type { EnvironmentId, T3ProjectFileScript, ThreadId } from "@t3tools/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { PopoverCreateHandle } from "../ui/popover";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const testState = vi.hoisted(() => ({
  useT3ProjectFileScripts: vi.fn(),
  projectScriptsControl: vi.fn(),
  backgroundServicesControl: vi.fn(),
  density: "full" as "full" | "compact" | "essential",
}));

vi.mock("../../hooks/useT3ProjectFileScripts", () => ({
  useT3ProjectFileScripts: (...args: ReadonlyArray<unknown>) =>
    testState.useT3ProjectFileScripts(...args),
}));
vi.mock("../BranchToolbar", () => ({
  BranchToolbar: () => null,
}));
vi.mock("../ProjectScriptsControl", () => ({
  default: (props: unknown) => {
    testState.projectScriptsControl(props);
    return null;
  },
}));
vi.mock("./ThreadAutomationsPanel", () => ({
  ThreadAutomationsPanel: () => <div data-thread-automations-mock />,
}));
vi.mock("./ThreadRelationshipsControl", () => ({
  ThreadRelationshipsPanel: () => <div data-thread-relationships-mock />,
}));
vi.mock("../background/BackgroundServicesWidget", () => ({
  BackgroundServicesWidget: (props: unknown) => {
    testState.backgroundServicesControl(props);
    return <div data-background-services-mock />;
  },
}));
vi.mock("../background/ThreadSubagentsSection", () => ({
  ThreadSubagentsSection: () => <div data-thread-subagents-mock>🤖 Subagents</div>,
}));
vi.mock("../background/WatchdogCard", () => ({
  WatchdogCard: () => <div data-watchdog-card-mock>🐕 Watchdog</div>,
}));
vi.mock("./ThreadDetailsSection", () => ({
  ThreadDetailsSection: ({
    separated,
    children,
    title,
  }: {
    separated?: boolean;
    children: React.ReactNode;
    title: string;
  }) => (
    <section data-section-title={title} data-separated={separated ? "true" : "false"}>
      {children}
    </section>
  ),
}));
vi.mock("./ThreadDetailsCard", () => ({
  ThreadDetailsCard: ({
    children,
  }: {
    children: (density: "full" | "compact" | "essential") => React.ReactNode;
  }) => children(testState.density),
}));

import { ThreadDetailsPanel, type ThreadDetailsPanelProps } from "./ThreadDetailsPanel";

describe("ThreadDetailsPanel", () => {
  beforeEach(() => {
    testState.useT3ProjectFileScripts.mockReset();
    testState.projectScriptsControl.mockReset();
    testState.backgroundServicesControl.mockReset();
    testState.density = "full";
  });

  it("keeps lower detail sections rendered when the card switches to essential density", () => {
    testState.density = "essential";
    const props: ThreadDetailsPanelProps = {
      anchor: { current: null },
      handle: PopoverCreateHandle(),
      onPresentationChange: vi.fn(),
      environmentId: "environment:thread-details" as EnvironmentId,
      threadId: "thread:thread-details" as ThreadId,
      activeProjectName: "thread-details",
      activeProjectScripts: [],
      preferredScriptId: null,
      keybindings: [],
      availableEditors: [],
      showOpenInPicker: false,
      gitCwd: "/tmp/thread-details-project",
      isGitRepo: true,
      envLocked: false,
      availableEnvironments: [],
      onEnvironmentChange: vi.fn(),
      onEnvModeChange: vi.fn(),
      envMode: "local",
      startFromOrigin: false,
      onStartFromOriginChange: vi.fn(),
      onComposerFocusRequest: vi.fn(),
      onRunProjectScript: vi.fn(),
      onAddProjectScript: vi.fn() as ThreadDetailsPanelProps["onAddProjectScript"],
      onUpdateProjectScript: vi.fn() as ThreadDetailsPanelProps["onUpdateProjectScript"],
      onDeleteProjectScript: vi.fn() as ThreadDetailsPanelProps["onDeleteProjectScript"],
    };

    const markup = renderToStaticMarkup(<ThreadDetailsPanel {...props} />);

    expect(markup).toContain("data-background-services-mock");
    expect(markup).toContain("data-thread-automations-mock");
    expect(markup).toContain("data-thread-relationships-mock");
    expect(markup).toContain('data-section-title="Version Control" data-separated="true"');
    expect(markup).toContain('data-section-title="Background Services" data-separated="true"');
  });

  it("keeps dedicated compact watchdog and subagents sections mounted", () => {
    testState.density = "compact";
    const props: ThreadDetailsPanelProps = {
      anchor: { current: null },
      handle: PopoverCreateHandle(),
      onPresentationChange: vi.fn(),
      environmentId: "environment:thread-details" as EnvironmentId,
      threadId: "thread:thread-details" as ThreadId,
      activeProjectName: "thread-details",
      activeProjectScripts: [],
      preferredScriptId: null,
      keybindings: [],
      availableEditors: [],
      showOpenInPicker: false,
      gitCwd: "/tmp/thread-details-project",
      isGitRepo: true,
      envLocked: false,
      availableEnvironments: [],
      onEnvironmentChange: vi.fn(),
      onEnvModeChange: vi.fn(),
      envMode: "local",
      startFromOrigin: false,
      onStartFromOriginChange: vi.fn(),
      onComposerFocusRequest: vi.fn(),
      onRunProjectScript: vi.fn(),
      onAddProjectScript: vi.fn() as ThreadDetailsPanelProps["onAddProjectScript"],
      onUpdateProjectScript: vi.fn() as ThreadDetailsPanelProps["onUpdateProjectScript"],
      onDeleteProjectScript: vi.fn() as ThreadDetailsPanelProps["onDeleteProjectScript"],
    };

    const markup = renderToStaticMarkup(<ThreadDetailsPanel {...props} />);

    expect(markup).toContain('data-section-title="Watchdog" data-separated="true"');
    expect(markup).toContain('data-section-title="Subagents" data-separated="true"');
    expect(markup).toContain("🐕");
    expect(markup).toContain("🤖");
    expect(testState.backgroundServicesControl).toHaveBeenCalledWith(
      expect.objectContaining({
        compact: true,
        showWatchdog: false,
        showSubagents: false,
      }),
    );
  });

  it("passes checked-in t3.json scripts to the project scripts control", () => {
    const environmentId = "environment:thread-details" as EnvironmentId;
    const gitCwd = "/tmp/thread-details-project";
    const fileScripts = [
      {
        name: "Check project",
        command: "vp check",
        icon: "test",
      },
    ] satisfies ReadonlyArray<T3ProjectFileScript>;
    testState.useT3ProjectFileScripts.mockReturnValue(fileScripts);

    const props: ThreadDetailsPanelProps = {
      anchor: { current: null },
      handle: PopoverCreateHandle(),
      onPresentationChange: vi.fn(),
      environmentId,
      threadId: "thread:thread-details" as ThreadId,
      activeProjectName: undefined,
      activeProjectScripts: [],
      preferredScriptId: null,
      keybindings: [],
      availableEditors: [],
      showOpenInPicker: false,
      gitCwd,
      isGitRepo: false,
      envLocked: false,
      availableEnvironments: [],
      onEnvironmentChange: vi.fn(),
      onEnvModeChange: vi.fn(),
      envMode: "local",
      startFromOrigin: false,
      onStartFromOriginChange: vi.fn(),
      onComposerFocusRequest: vi.fn(),
      onRunProjectScript: vi.fn(),
      onAddProjectScript: vi.fn() as ThreadDetailsPanelProps["onAddProjectScript"],
      onUpdateProjectScript: vi.fn() as ThreadDetailsPanelProps["onUpdateProjectScript"],
      onDeleteProjectScript: vi.fn() as ThreadDetailsPanelProps["onDeleteProjectScript"],
    };

    renderToStaticMarkup(<ThreadDetailsPanel {...props} />);

    expect(testState.useT3ProjectFileScripts).toHaveBeenCalledWith(environmentId, gitCwd);
    expect(testState.projectScriptsControl).toHaveBeenCalledWith(
      expect.objectContaining({
        displayMode: "panel",
        scripts: [],
        fileScripts,
      }),
    );
  });
});
