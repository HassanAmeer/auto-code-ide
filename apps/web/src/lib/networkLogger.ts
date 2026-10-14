// Runtime in-memory network & request logger
// Captures fetch, XMLHttpRequest, and WebSocket activity without persistence

export interface RequestLogEntry {
  id: string;
  timestamp: number;
  timeFormatted: string;
  type: "fetch" | "xhr" | "ws" | "error";
  method: string;
  url: string;
  status?: number;
  statusText?: string;
  durationMs?: number;
  requestHeaders?: Record<string, string>;
  requestBody?: string | null;
  responseHeaders?: Record<string, string>;
  responseBody?: string | null;
  error?: string | null;
  state: "pending" | "completed" | "error";
}

export interface AiModelLogEntry {
  readonly id: string;
  readonly timestamp: number;
  readonly timeFormatted: string;
  readonly threadId?: string;
  readonly runId?: string;
  readonly provider: string;
  readonly providerInstanceId: string;
  readonly model: string;
  readonly baseUrl: string;
  readonly endpoint: string;
  readonly requestHeaders: Record<string, string>;
  readonly apiKeyMasked: string;
  readonly userPrompt: string;
  readonly messages: Array<{ role: string; content: string }>;
  status?: number;
  statusText?: string;
  durationMs?: number;
  state: "pending" | "streaming" | "completed" | "error";
  responseBody?: string;
  error?: string;
  errorType?: string;
}

type Listener = () => void;

class NetworkLoggerService {
  private logs: RequestLogEntry[] = [];
  private aiLogs: AiModelLogEntry[] = [];
  private listeners: Set<Listener> = new Set();
  private maxLogs = 300;
  private isInitialized = false;

  constructor() {
    if (typeof window !== "undefined") {
      this.initInterceptors();
      this.fetchAiModelLogs();
    }
  }

  public getLogs(): readonly RequestLogEntry[] {
    return this.logs;
  }

  public getAiLogs(): readonly AiModelLogEntry[] {
    return this.aiLogs;
  }

  public async fetchAiModelLogs(): Promise<void> {
    try {
      const res = await fetch("/api/ai-model-logs");
      if (res.ok) {
        const json = await res.json();
        if (Array.isArray(json?.logs)) {
          this.aiLogs = json.logs;
          this.notify();
        }
      }
    } catch {
      // ignore
    }
  }

  public async clearAiModelLogs(): Promise<void> {
    try {
      await fetch("/api/ai-model-logs/clear", { method: "POST" });
    } catch {}
    this.aiLogs = [];
    this.notify();
  }

  public clear(): void {
    this.logs = [];
    this.notify();
  }

  public subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch (err) {
        console.error("NetworkLogger listener error:", err);
      }
    }
  }

  private addEntry(entry: RequestLogEntry): void {
    this.logs.unshift(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs.pop();
    }
    this.notify();
  }

  private updateEntry(id: string, updates: Partial<RequestLogEntry>): void {
    const entry = this.logs.find((l) => l.id === id);
    if (entry) {
      Object.assign(entry, updates);
      this.notify();
    }
  }

  private formatTime(date: Date): string {
    const pad = (n: number, z = 2) => String(n).padStart(z, "0");
    return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`;
  }

  private safeStringify(data: unknown): string {
    if (data === null || data === undefined) return "";
    if (typeof data === "string") {
      try {
        const parsed = JSON.parse(data);
        return JSON.stringify(parsed, null, 2);
      } catch {
        return data;
      }
    }
    try {
      return JSON.stringify(data, null, 2);
    } catch {
      return String(data);
    }
  }

  public initInterceptors(): void {
    if (this.isInitialized || typeof window === "undefined") return;
    this.isInitialized = true;

    this.interceptFetch();
    this.interceptXhr();
    this.interceptWebSocket();
    this.interceptErrors();
  }

  private interceptFetch(): void {
    const originalFetch = window.fetch;
    if (!originalFetch) return;

    const self = this;

    window.fetch = async function (...args: Parameters<typeof fetch>): Promise<Response> {
      const [input, init] = args;
      const startTime = performance.now();
      const date = new Date();
      const id = "fetch-" + Math.random().toString(36).slice(2, 10);

      let url = "";
      let method = init?.method ?? "GET";
      const requestHeaders: Record<string, string> = {};
      let requestBody: string | null = null;

      try {
        if (typeof input === "string") {
          url = input;
        } else if (input instanceof URL) {
          url = input.toString();
        } else if (input instanceof Request) {
          url = input.url;
          method = input.method || method;
          input.headers.forEach((value, key) => {
            requestHeaders[key] = value;
          });
        }

        if (init?.headers) {
          if (init.headers instanceof Headers) {
            init.headers.forEach((value, key) => {
              requestHeaders[key] = value;
            });
          } else if (Array.isArray(init.headers)) {
            for (const [key, value] of init.headers) {
              requestHeaders[key] = value;
            }
          } else if (typeof init.headers === "object") {
            Object.assign(requestHeaders, init.headers);
          }
        }

        if (init?.body) {
          if (typeof init.body === "string") {
            requestBody = self.safeStringify(init.body);
          } else if (init.body instanceof FormData) {
            requestBody = "[FormData]";
          } else if (init.body instanceof Blob) {
            requestBody = `[Blob ${init.body.size} bytes]`;
          } else {
            requestBody = String(init.body);
          }
        }
      } catch (err) {
        console.warn("Failed parsing fetch request details:", err);
      }

      self.addEntry({
        id,
        timestamp: date.getTime(),
        timeFormatted: self.formatTime(date),
        type: "fetch",
        method: method.toUpperCase(),
        url,
        requestHeaders,
        requestBody,
        state: "pending",
      });

      try {
        const response = await originalFetch.apply(this, args);
        const durationMs = Math.round(performance.now() - startTime);

        const responseHeaders: Record<string, string> = {};
        try {
          response.headers.forEach((value, key) => {
            responseHeaders[key] = value;
          });
        } catch {
          // ignore
        }

        let responseBody: string | null = null;
        try {
          const clone = response.clone();
          const contentType = response.headers.get("content-type") || "";
          if (
            contentType.includes("json") ||
            contentType.includes("text") ||
            contentType.includes("xml") ||
            contentType.includes("html")
          ) {
            // Read response asynchronously
            clone
              .text()
              .then((text) => {
                responseBody = self.safeStringify(text);
                self.updateEntry(id, {
                  status: response.status,
                  statusText: response.statusText,
                  durationMs,
                  responseHeaders,
                  responseBody,
                  state: response.ok ? "completed" : "error",
                });
              })
              .catch(() => {
                self.updateEntry(id, {
                  status: response.status,
                  statusText: response.statusText,
                  durationMs,
                  responseHeaders,
                  responseBody: "[Stream / unreadable]",
                  state: response.ok ? "completed" : "error",
                });
              });
          } else {
            responseBody = `[Binary / ${contentType || "unknown"}]`;
          }
        } catch {
          responseBody = "[Stream body]";
        }

        self.updateEntry(id, {
          status: response.status,
          statusText: response.statusText,
          durationMs,
          responseHeaders,
          responseBody: responseBody ?? "[Reading response...]",
          state: response.ok ? "completed" : "error",
        });

        return response;
      } catch (err: unknown) {
        const durationMs = Math.round(performance.now() - startTime);
        const errorMsg = err instanceof Error ? err.message : String(err);
        self.updateEntry(id, {
          durationMs,
          error: errorMsg,
          state: "error",
        });
        throw err;
      }
    };
  }

  private interceptXhr(): void {
    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;
    const originalSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;
    const self = this;

    XMLHttpRequest.prototype.open = function (
      method: string,
      url: string | URL,
      async: boolean = true,
      username?: string | null,
      password?: string | null,
    ) {
      const xhrInfo = {
        id: "xhr-" + Math.random().toString(36).slice(2, 10),
        method: method.toUpperCase(),
        url: typeof url === "string" ? url : url.toString(),
        requestHeaders: {} as Record<string, string>,
        startTime: 0,
      };
      (this as any).__xhrInfo = xhrInfo;

      return originalOpen.call(this, method, url, async, username, password);
    };

    XMLHttpRequest.prototype.setRequestHeader = function (name: string, value: string) {
      if ((this as any).__xhrInfo) {
        (this as any).__xhrInfo.requestHeaders[name] = value;
      }
      return originalSetRequestHeader.call(this, name, value);
    };

    XMLHttpRequest.prototype.send = function (body?: Document | XMLHttpRequestBodyInit | null) {
      const xhrInfo = (this as any).__xhrInfo;
      if (xhrInfo) {
        xhrInfo.startTime = performance.now();
        const date = new Date();
        let requestBody: string | null = null;
        if (typeof body === "string") {
          requestBody = self.safeStringify(body);
        }

        self.addEntry({
          id: xhrInfo.id,
          timestamp: date.getTime(),
          timeFormatted: self.formatTime(date),
          type: "xhr",
          method: xhrInfo.method,
          url: xhrInfo.url,
          requestHeaders: xhrInfo.requestHeaders,
          requestBody,
          state: "pending",
        });

        this.addEventListener("loadend", () => {
          const durationMs = Math.round(performance.now() - xhrInfo.startTime);
          let responseBody: string | null = null;
          try {
            responseBody = self.safeStringify(this.responseText);
          } catch {
            responseBody = "[Binary / unreadable]";
          }

          const responseHeaders: Record<string, string> = {};
          try {
            const rawHeaders = this.getAllResponseHeaders();
            rawHeaders
              .trim()
              .split(/[\r\n]+/)
              .forEach((line) => {
                const parts = line.split(": ");
                const header = parts.shift();
                const value = parts.join(": ");
                if (header) responseHeaders[header] = value;
              });
          } catch {
            // ignore
          }

          self.updateEntry(xhrInfo.id, {
            status: this.status,
            statusText: this.statusText,
            durationMs,
            responseHeaders,
            responseBody,
            state: this.status >= 200 && this.status < 400 ? "completed" : "error",
          });
        });

        this.addEventListener("error", () => {
          const durationMs = Math.round(performance.now() - xhrInfo.startTime);
          self.updateEntry(xhrInfo.id, {
            durationMs,
            error: "XHR Network Error",
            state: "error",
          });
        });
      }

      return originalSend.call(this, body);
    };
  }

  private interceptWebSocket(): void {
    if (typeof WebSocket === "undefined") return;
    const self = this;
    const OriginalWebSocket = window.WebSocket;

    const originalSend = OriginalWebSocket.prototype.send;
    OriginalWebSocket.prototype.send = function (data: any) {
      try {
        const date = new Date();
        const id = "ws-" + Math.random().toString(36).slice(2, 10);
        let bodyText: string | null = null;
        if (typeof data === "string") {
          bodyText = self.safeStringify(data);
        } else {
          bodyText = "[Binary WebSocket Frame]";
        }

        self.addEntry({
          id,
          timestamp: date.getTime(),
          timeFormatted: self.formatTime(date),
          type: "ws",
          method: "WS ↗ SEND",
          url: this.url || "WebSocket",
          requestBody: bodyText,
          state: "completed",
          durationMs: 0,
          status: 101,
          statusText: "Switching Protocols",
        });
      } catch (e) {
        console.warn("Error logging WS send:", e);
      }
      return originalSend.call(this, data);
    };

    const attachSocketListeners = (ws: WebSocket) => {
      try {
        OriginalWebSocket.prototype.addEventListener.call(ws, "message", function (event: any) {
          try {
            const date = new Date();
            const id = "ws-" + Math.random().toString(36).slice(2, 10);
            let bodyText: string | null = null;
            let isError = false;
            if (typeof event.data === "string") {
              bodyText = self.safeStringify(event.data);
              if (
                bodyText.includes('"error"') ||
                bodyText.includes('"failed"') ||
                bodyText.includes('"failure"')
              ) {
                isError = true;
              }
            } else {
              bodyText = "[Binary WebSocket Message]";
            }

            self.addEntry({
              id,
              timestamp: date.getTime(),
              timeFormatted: self.formatTime(date),
              type: "ws",
              method: isError ? "WS ↘ ERROR" : "WS ↘ RECV",
              url: ws.url || "WebSocket",
              responseBody: bodyText,
              state: isError ? "error" : "completed",
              durationMs: 0,
              status: isError ? 500 : 101,
              statusText: isError ? "Internal Error Frame" : "Switching Protocols",
              error: isError ? "Received error in WebSocket payload" : null,
            });
          } catch (e) {
            console.warn("Error logging WS recv:", e);
          }
        });

        OriginalWebSocket.prototype.addEventListener.call(ws, "error", function () {
          const date = new Date();
          self.addEntry({
            id: "ws-err-" + Math.random().toString(36).slice(2, 10),
            timestamp: date.getTime(),
            timeFormatted: self.formatTime(date),
            type: "ws",
            method: "WS ERROR",
            url: ws.url || "WebSocket",
            state: "error",
            durationMs: 0,
            status: 500,
            statusText: "WebSocket Error",
            error: "WebSocket encountered network/transport error event",
          });
        });

        OriginalWebSocket.prototype.addEventListener.call(ws, "close", function (event: any) {
          if (event.code !== 1000 && event.code !== 1005) {
            const date = new Date();
            self.addEntry({
              id: "ws-close-" + Math.random().toString(36).slice(2, 10),
              timestamp: date.getTime(),
              timeFormatted: self.formatTime(date),
              type: "ws",
              method: "WS CLOSE",
              url: ws.url || "WebSocket",
              state: "error",
              durationMs: 0,
              status: event.code,
              statusText: `Closed: ${event.reason || "Abnormal"}`,
              error: `WebSocket connection closed abnormally (code ${event.code}: ${event.reason || "no reason provided"})`,
            });
          }
        });
      } catch {
        // ignore
      }
    };

    // Intercept constructor
    const PatchedWebSocket = function (
      this: WebSocket,
      url: string | URL,
      protocols?: string | string[],
    ) {
      const ws =
        protocols !== undefined
          ? new OriginalWebSocket(url, protocols)
          : new OriginalWebSocket(url);
      attachSocketListeners(ws);
      return ws;
    } as any;

    PatchedWebSocket.prototype = OriginalWebSocket.prototype;
    PatchedWebSocket.CONNECTING = OriginalWebSocket.CONNECTING;
    PatchedWebSocket.OPEN = OriginalWebSocket.OPEN;
    PatchedWebSocket.CLOSING = OriginalWebSocket.CLOSING;
    PatchedWebSocket.CLOSED = OriginalWebSocket.CLOSED;
    (window as any).WebSocket = PatchedWebSocket;
  }

  private interceptErrors(): void {
    if (typeof window === "undefined") return;
    const self = this;

    const originalConsoleError = console.error;
    console.error = function (...args: any[]) {
      try {
        const date = new Date();
        const errorText = args
          .map((arg) =>
            typeof arg === "object" && arg !== null ? self.safeStringify(arg) : String(arg),
          )
          .join(" ");

        self.addEntry({
          id: "err-" + Math.random().toString(36).slice(2, 10),
          timestamp: date.getTime(),
          timeFormatted: self.formatTime(date),
          type: "error",
          method: "CONSOLE ERROR",
          url: "client://console.error",
          state: "error",
          durationMs: 0,
          status: 500,
          statusText: "Error Logged",
          error: errorText,
          responseBody: errorText,
        });
      } catch {
        // ignore
      }
      return originalConsoleError.apply(this, args);
    };

    window.addEventListener("error", (event: ErrorEvent) => {
      try {
        const date = new Date();
        const errorMsg = event.message || (event.error ? String(event.error) : "Uncaught Error");
        self.addEntry({
          id: "win-err-" + Math.random().toString(36).slice(2, 10),
          timestamp: date.getTime(),
          timeFormatted: self.formatTime(date),
          type: "error",
          method: "WINDOW ERROR",
          url: event.filename ? `${event.filename}:${event.lineno}` : "client://window.error",
          state: "error",
          status: 500,
          statusText: "Uncaught Error",
          error: errorMsg,
          responseBody: event.error?.stack || errorMsg,
        });
      } catch {
        // ignore
      }
    });

    window.addEventListener("unhandledrejection", (event: PromiseRejectionEvent) => {
      try {
        const date = new Date();
        const reason = event.reason;
        const msg = reason instanceof Error ? reason.message : self.safeStringify(reason);
        self.addEntry({
          id: "rejection-" + Math.random().toString(36).slice(2, 10),
          timestamp: date.getTime(),
          timeFormatted: self.formatTime(date),
          type: "error",
          method: "UNHANDLED REJECTION",
          url: "client://promise-rejection",
          state: "error",
          status: 500,
          statusText: "Unhandled Promise Rejection",
          error: msg,
          responseBody: reason?.stack || msg,
        });
      } catch {
        // ignore
      }
    });
  }
}

export const networkLogger = new NetworkLoggerService();

export function formatCurlCommand(entry: RequestLogEntry): string {
  if (entry.type === "ws") {
    return `# WebSocket Frame: ${entry.method}\nwscat -c "${entry.url}"`;
  }

  let curl = `curl -X ${entry.method} "${entry.url}"`;
  if (entry.requestHeaders) {
    for (const [key, value] of Object.entries(entry.requestHeaders)) {
      curl += ` \\\n  -H "${key}: ${value}"`;
    }
  }
  if (entry.requestBody && entry.method !== "GET" && entry.method !== "HEAD") {
    const escaped = entry.requestBody.replace(/'/g, `'\\''`);
    curl += ` \\\n  --data '${escaped}'`;
  }
  return curl;
}

export function formatAiCurlCommand(entry: AiModelLogEntry): string {
  let curl = `curl -X POST "${entry.endpoint}"`;
  for (const [key, value] of Object.entries(entry.requestHeaders)) {
    curl += ` \\\n  -H "${key}: ${value}"`;
  }
  const payload = {
    model: entry.model,
    messages:
      entry.messages && entry.messages.length > 0
        ? entry.messages
        : [{ role: "user", content: entry.userPrompt }],
    stream: true,
  };
  const escaped = JSON.stringify(payload, null, 2).replace(/'/g, `'\\''`);
  curl += ` \\\n  --data '${escaped}'`;
  return curl;
}
