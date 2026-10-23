/**
 * MCP (Model Context Protocol) Server Management
 * Manages external MCP tools (Database, GitHub, Brave Search, Figma, etc.)
 */

export interface McpHeader {
  key: string;
  value: string;
}

export interface McpServerConfig {
  id: string;
  name: string;
  type: "remote" | "local";
  url?: string;
  command?: string;
  headers?: McpHeader[];
  enabled: boolean;
  toolsCount?: number;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export interface McpTemplate {
  name: string;
  type: "remote" | "local";
  url?: string;
  command?: string;
  description: string;
  headers?: McpHeader[];
}

export const MCP_POPULAR_TEMPLATES: McpTemplate[] = [
  {
    name: "GitHub Search & PRs",
    type: "local",
    command: "npx -y @modelcontextprotocol/server-github",
    description: "Search repos, inspect pull requests, and manage issues directly from AI.",
    headers: [{ key: "GITHUB_PERSONAL_ACCESS_TOKEN", value: "" }],
  },
  {
    name: "Brave Web Search",
    type: "local",
    command: "npx -y @modelcontextprotocol/server-brave-search",
    description: "High-speed live web searching and URL fact checking.",
    headers: [{ key: "BRAVE_API_KEY", value: "" }],
  },
  {
    name: "PostgreSQL Database Inspector",
    type: "local",
    command: "npx -y @modelcontextprotocol/server-postgres postgresql://localhost/mydb",
    description: "Read schemas, run SQL queries, and inspect database tables.",
  },
  {
    name: "Figma Design Context",
    type: "remote",
    url: "https://api.figma.com/mcp",
    description: "Inspect Figma UI design nodes, layout dimensions, and tokens.",
    headers: [{ key: "X-Figma-Token", value: "" }],
  },
  {
    name: "SQLite Local Database",
    type: "local",
    command: "npx -y @modelcontextprotocol/server-sqlite --db-path ./database.sqlite",
    description: "Direct read & write queries on local SQLite database files.",
  },
  {
    name: "Puppeteer Web Automation",
    type: "local",
    command: "npx -y @modelcontextprotocol/server-puppeteer",
    description: "Headless browser navigation, taking screenshots, and interacting with pages.",
  },
];

const STORAGE_KEY = "t3_mcp_servers_v1";
const EVENT_KEY = "t3_mcp_servers_updated";

export function getMcpServers(): McpServerConfig[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error("Failed to load MCP servers:", err);
    return [];
  }
}

export function saveMcpServers(servers: McpServerConfig[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(servers));
    window.dispatchEvent(new CustomEvent(EVENT_KEY, { detail: servers }));

    // Sync with backend / opencode.json if available
    void fetch("/api/mcp/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ servers }),
    }).catch(() => {});
  } catch (err) {
    console.error("Failed to save MCP servers:", err);
  }
}

export function saveMcpServer(
  server: Omit<McpServerConfig, "id" | "createdAt" | "updatedAt"> & { id?: string },
): McpServerConfig {
  const servers = getMcpServers();
  const now = new Date().toISOString();

  let target: McpServerConfig;
  if (server.id) {
    const idx = servers.findIndex((s) => s.id === server.id);
    if (idx !== -1) {
      const existing = servers[idx]!;
      target = {
        ...existing,
        ...server,
        id: existing.id,
        createdAt: existing.createdAt,
        updatedAt: now,
      };
      servers[idx] = target;
    } else {
      target = {
        ...server,
        id: server.id,
        createdAt: now,
        updatedAt: now,
      };
      servers.push(target);
    }
  } else {
    target = {
      ...server,
      id: `mcp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      createdAt: now,
      updatedAt: now,
    };
    servers.push(target);
  }

  saveMcpServers(servers);
  return target;
}

export function deleteMcpServer(id: string): void {
  const servers = getMcpServers().filter((s) => s.id !== id);
  saveMcpServers(servers);
}

export function toggleMcpServer(id: string): void {
  const servers = getMcpServers().map((s) => {
    if (s.id === id) {
      return { ...s, enabled: !s.enabled, updatedAt: new Date().toISOString() };
    }
    return s;
  });
  saveMcpServers(servers);
}

export function subscribeMcpServers(callback: (servers: McpServerConfig[]) => void): () => void {
  const handler = (e: Event) => {
    const custom = e as CustomEvent<McpServerConfig[]>;
    if (custom.detail) {
      callback(custom.detail);
    } else {
      callback(getMcpServers());
    }
  };

  window.addEventListener(EVENT_KEY, handler);
  window.addEventListener("storage", (e) => {
    if (e.key === STORAGE_KEY) {
      callback(getMcpServers());
    }
  });

  return () => {
    window.removeEventListener(EVENT_KEY, handler);
  };
}
