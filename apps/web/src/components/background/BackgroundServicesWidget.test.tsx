import { describe, expect, it } from "vite-plus/test";
import { renderToStaticMarkup } from "react-dom/server";
import { BackgroundServicesWidget, SleekSpinnerRing } from "./BackgroundServicesWidget";

describe("BackgroundServicesWidget", () => {
  it("renders exact card design matching user screenshot layout", () => {
    const html = renderToStaticMarkup(
      <BackgroundServicesWidget
        overview={true}
        subagents={[
          { id: "sub-1", title: "Server & Deployment Specialist", status: "running" },
          { id: "sub-2", title: "Android Native Specialist", status: "running" },
          { id: "sub-3", title: "Web UI & Signaling Specialist", status: "running" },
        ]}
        goals={[
          {
            id: "goal-1",
            text: "please parallel worker chala k kar lo jaldi ...",
            status: "active",
          },
        ]}
      />,
    );

    // 1. Overview Section
    expect(html).toContain("Overview");
    expect(html).toContain("Review");
    expect(html).toContain("Files");
    expect(html).toContain("Terminal");
    expect(html).toContain("Plugins");

    // 2. Subagents Section
    expect(html).toContain("Subagents");
    expect(html).toContain("3");
    expect(html).toContain("Server &amp; Deployment Specialist");
    expect(html).toContain("Android Native Specialist");
    expect(html).toContain("Web UI &amp; Signaling Specialist");

    // 3. Background Tasks Section
    expect(html).toContain("Background Tasks");

    // 4. Goals Section
    expect(html).toContain("Goals");
    expect(html).toContain("1");
    expect(html).toContain("please parallel worker chala k kar lo jaldi ...");
  });

  it("renders SleekSpinnerRing with circular arc", () => {
    const html = renderToStaticMarkup(<SleekSpinnerRing />);
    expect(html).toContain("<svg");
    expect(html).toContain("animate-spin");
    expect(html).toContain('d="M12 3a9 9 0 1 0 9 9"');
  });
});
