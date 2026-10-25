/**
 * OpenCode CLI Adapter
 * Connects to external OpenCode CLI (opencode serve) running on localhost.
 *
 * Note: Requires OpenCode CLI installed on the system (e.g. /usr/local/bin/opencode).
 */

export interface OpenCodeAdapterConfig {
  readonly opencodeUrl?: string;
  readonly defaultPort?: number;
}

export interface OpenCodeSessionOptions {
  readonly directory: string;
  readonly title?: string;
}

export class OpenCodeAdapter {
  readonly name = "opencode-adapter";
  readonly type = "external-cli";
  private baseUrl: string;

  constructor(config?: OpenCodeAdapterConfig) {
    this.baseUrl = config?.opencodeUrl || `http://127.0.0.1:${config?.defaultPort || 4099}`;
  }

  async healthCheck(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/health`, { method: "GET" });
      return res.ok;
    } catch {
      return false;
    }
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }
}

export const opencodeAdapter = new OpenCodeAdapter();
