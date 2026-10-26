/**
 * Detects any reverse proxy subpath prefix (such as code-server /proxy/<port>,
 * /absproxy/<port>, Gitpod, GitHub Codespaces, or other reverse proxy subpaths).
 */
export function getProxyPathPrefix(): string {
  if (
    typeof window === "undefined" ||
    !window.location ||
    typeof window.location.pathname !== "string"
  ) {
    return "";
  }
  const pathname = window.location.pathname;
  if (!pathname) {
    return "";
  }
  // 1. Matches code-server / gitpod / codespaces proxy prefixes: /proxy/1234 or /absproxy/1234
  const proxyMatch = pathname.match(/^(\/(?:abs)?proxy\/\d+)/i);
  if (proxyMatch && proxyMatch[1]) {
    return proxyMatch[1];
  }

  // 2. Generic subpath detection: if path ends with or contains a known app route
  const routeMatch = pathname.match(
    /^(.*?)(?:\/(?:login|pair|welcome|settings|usage|connect|ai-terminal|call-assistant|projects))(?:\/|$)/i,
  );
  if (routeMatch && routeMatch[1]) {
    return routeMatch[1].replace(/\/$/, "");
  }

  return "";
}
