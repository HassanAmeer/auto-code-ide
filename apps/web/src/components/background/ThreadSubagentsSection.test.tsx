import type { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock("../../state/entities", () => ({
  useActiveEnvironmentId: () => null,
  useThreadProjection: () => ({
    projection: {
      subagents: [
        {
          id: "projection-agent",
          title: "Projection Agent",
          driver: "researcher",
          status: "running",
        },
      ],
    },
  }),
}));

vi.mock("../../state/environments", () => ({
  usePrimaryEnvironmentId: () => null,
}));

vi.mock("../../state/use-atom-command", () => ({
  useAtomCommand: () => vi.fn().mockResolvedValue({ _tag: "Success" }),
}));

import { BackgroundSubagentsProvider } from "./BackgroundSubagentsProvider";
import { ThreadSubagentsSection } from "./ThreadSubagentsSection";

describe("ThreadSubagentsSection", () => {
  it("shows the shared live subagent list and exposes its stop action", () => {
    const markup = renderToStaticMarkup(
      <BackgroundSubagentsProvider
        environmentId={"environment:test" as EnvironmentId}
        threadId={"thread:test" as ThreadId}
        subagents={[
          {
            id: "shared-agent",
            title: "Shared Agent",
            status: "running",
          },
        ]}
      >
        <ThreadSubagentsSection
          environmentId={"environment:test" as EnvironmentId}
          threadId={"thread:test" as ThreadId}
        />
      </BackgroundSubagentsProvider>,
    );

    expect(markup).toContain("Shared Agent");
    expect(markup).not.toContain("Projection Agent");
    expect(markup).toContain('aria-label="Stop Shared Agent"');
  });
});
