import { describe, expect, it } from "vite-plus/test";

import { detectSshHost, loopbackRedirectPort, sshTunnelCommand } from "./remoteTunnel";

describe("loopbackRedirectPort", () => {
  it("extracts the agent's loopback port from an Antigravity sign-in URL", () => {
    const url =
      "https://accounts.google.com/o/oauth2/v2/auth?client_id=abc&redirect_uri=" +
      encodeURIComponent("http://127.0.0.1:38482/") +
      "&state=xyz";
    expect(loopbackRedirectPort(url)).toBe(38482);
  });

  it("accepts localhost redirect URIs", () => {
    const url =
      "https://accounts.google.com/o/oauth2/v2/auth?redirect_uri=" +
      encodeURIComponent("http://localhost:45123/");
    expect(loopbackRedirectPort(url)).toBe(45123);
  });

  it("returns null for public https redirect URIs", () => {
    const url =
      "https://accounts.google.com/o/oauth2/v2/auth?redirect_uri=" +
      encodeURIComponent("https://example.com/callback");
    expect(loopbackRedirectPort(url)).toBeNull();
  });

  it("returns null for missing or malformed redirect_uri values", () => {
    expect(loopbackRedirectPort("https://accounts.google.com/o/oauth2/v2/auth")).toBeNull();
    expect(
      loopbackRedirectPort(
        `https://accounts.google.com/o/oauth2/v2/auth?redirect_uri=${encodeURIComponent("not-a-url")}`,
      ),
    ).toBeNull();
    expect(loopbackRedirectPort("::not a url::")).toBeNull();
    expect(loopbackRedirectPort(null)).toBeNull();
    expect(loopbackRedirectPort(undefined)).toBeNull();
  });

  it("rejects well-known and out-of-range ports", () => {
    for (const port of ["80", "1023", "65536", "0"]) {
      const url =
        "https://accounts.google.com/o/oauth2/v2/auth?redirect_uri=" +
        encodeURIComponent(`http://127.0.0.1:${port}/`);
      expect(loopbackRedirectPort(url)).toBeNull();
    }
  });

  it("rejects non-loopback hosts even on loopback-looking schemes", () => {
    const url =
      "https://accounts.google.com/o/oauth2/v2/auth?redirect_uri=" +
      encodeURIComponent("http://192.168.1.10:38482/");
    expect(loopbackRedirectPort(url)).toBeNull();
  });
});

describe("sshTunnelCommand", () => {
  it("forwards the exact agent port to the laptop", () => {
    expect(sshTunnelCommand(38482, "201.18.218.29")).toBe(
      "ssh -L 38482:127.0.0.1:38482 root@201.18.218.29",
    );
  });
});

describe("detectSshHost", () => {
  it("returns the default VPS host when window is unavailable", () => {
    // Node environment has no window — SSR-safe fallback must stay routable.
    expect(detectSshHost()).toBe("201.18.218.29");
  });
});
