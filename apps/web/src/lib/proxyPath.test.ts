import { describe, expect, it, vi } from "vite-plus/test";

import { getProxyPathPrefix } from "./proxyPath";

describe("getProxyPathPrefix", () => {
  it("detects code-server /proxy/<port> prefix", () => {
    vi.stubGlobal("window", {
      location: { pathname: "/proxy/20128/login" },
    });
    expect(getProxyPathPrefix()).toBe("/proxy/20128");

    vi.stubGlobal("window", {
      location: { pathname: "/proxy/5733/" },
    });
    expect(getProxyPathPrefix()).toBe("/proxy/5733");
  });

  it("detects absproxy prefix", () => {
    vi.stubGlobal("window", {
      location: { pathname: "/absproxy/3000/settings" },
    });
    expect(getProxyPathPrefix()).toBe("/absproxy/3000");
  });

  it("detects generic reverse proxy subpath before known routes", () => {
    vi.stubGlobal("window", {
      location: { pathname: "/my-app/pair" },
    });
    expect(getProxyPathPrefix()).toBe("/my-app");
  });

  it("returns empty string when running on standard root", () => {
    vi.stubGlobal("window", {
      location: { pathname: "/login" },
    });
    expect(getProxyPathPrefix()).toBe("");

    vi.stubGlobal("window", {
      location: { pathname: "/" },
    });
    expect(getProxyPathPrefix()).toBe("");
  });

  it("handles missing pathname safely", () => {
    vi.stubGlobal("window", {
      location: {},
    });
    expect(getProxyPathPrefix()).toBe("");
  });
});
