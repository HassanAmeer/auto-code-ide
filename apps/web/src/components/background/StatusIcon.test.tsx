import { describe, expect, it } from "vite-plus/test";
import { renderToStaticMarkup } from "react-dom/server";

import {
  CancelledCircleIcon,
  DeleteIconButton,
  normalizeStatus,
  StatusIcon,
  StopIconButton,
} from "./StatusIcon";

describe("StatusIcon — one status language across Goals, Subagents and Watchdog", () => {
  it("maps every status string onto one of five kinds", () => {
    expect(normalizeStatus("completed")).toBe("completed");
    expect(normalizeStatus("done")).toBe("completed");
    expect(normalizeStatus("failed")).toBe("failed");
    expect(normalizeStatus("error")).toBe("failed");
    expect(normalizeStatus("cancelled")).toBe("cancelled");
    expect(normalizeStatus("stopped")).toBe("cancelled");
    expect(normalizeStatus("aborted")).toBe("cancelled");
    expect(normalizeStatus("pending")).toBe("pending");
    expect(normalizeStatus("queued")).toBe("pending");
    expect(normalizeStatus("running")).toBe("running");
    expect(normalizeStatus("reviewing")).toBe("running");
    expect(normalizeStatus("building")).toBe("running");
    expect(normalizeStatus("testing")).toBe("running");
  });

  it("renders a check for completed, a warning for failed, a cancel circle for cancelled and a clock for pending", () => {
    expect(renderToStaticMarkup(<StatusIcon status="completed" />)).toContain("lucide-circle-check");
    expect(renderToStaticMarkup(<StatusIcon status="failed" />)).toContain("lucide-circle-alert");
    expect(renderToStaticMarkup(<StatusIcon status="cancelled" />)).toContain("<circle");
    expect(renderToStaticMarkup(<StatusIcon status="pending" />)).toContain("lucide-clock");
  });

  it("renders a spinner for every in-flight status", () => {
    for (const status of ["running", "watching", "reviewing", "building", "testing"]) {
      expect(renderToStaticMarkup(<StatusIcon status={status} />)).toContain("animate-spin");
    }
  });

  it("gives completed a muted colour but keeps failed in danger colour", () => {
    expect(renderToStaticMarkup(<StatusIcon status="completed" />)).toContain("text-muted-foreground");
    expect(renderToStaticMarkup(<StatusIcon status="failed" />)).toContain("text-rose-400");
  });

  it("renders icon-only stop/delete controls with tooltip labels and no text", () => {
    const stop = renderToStaticMarkup(<StopIconButton onClick={() => {}} label="Stop goal" />);
    expect(stop).toContain('title="Stop goal"');
    expect(stop).toContain('aria-label="Stop goal"');
    expect(stop).toContain("lucide-square");
    expect(stop).not.toContain(">Stop<");

    const del = renderToStaticMarkup(<DeleteIconButton onClick={() => {}} label="Delete goal" />);
    expect(del).toContain('title="Delete goal"');
    expect(del).toContain('aria-label="Delete goal"');
    expect(del).toContain("lucide-x");
    expect(del).not.toContain(">Delete<");
  });

  it("exposes the shared cancel-circle glyph", () => {
    expect(renderToStaticMarkup(<CancelledCircleIcon />)).toContain("<circle");
  });
});
