import { resolvePrimaryEnvironmentHttpUrl } from "~/environments/primary";

/**
 * Database Schema & Query Inspector Service (opencode db)
 *
 * Provides native SQLite introspection, Prisma schema inspection,
 * safe read-only queries, and formatted reports for AI models.
 */

export interface DbInspectColumn {
  cid: number;
  name: string;
  type: string;
  notnull: boolean;
  pk: boolean;
}

export interface DbInspectTable {
  name: string;
  columns: DbInspectColumn[];
  rowCount: number;
}

export interface DbInspectResponse {
  ok: boolean;
  dialect?: "sqlite" | "prisma" | "env_connection";
  dbPath?: string;
  schemaFile?: string;
  provider?: string;
  connectionUrl?: string;
  tables?: DbInspectTable[];
  sampleRows?: any[];
  customQueryResult?: any;
  error?: string;
}

export function isDbInspectCommand(text: string): boolean {
  return /^\/db(?:\s|$)/i.test(text.trim());
}

export function parseDbInspectCommand(text: string): {
  isDb: boolean;
  argument?: string | undefined;
} {
  const trimmed = text.trim();
  const match = /^\/db(?:\s+(.+))?$/i.exec(trimmed);
  if (!match) {
    return { isDb: false };
  }
  return {
    isDb: true,
    argument: match[1]?.trim() || undefined,
  };
}

export async function inspectDatabase(
  cwd?: string,
  tableOrQuery?: string,
): Promise<{ success: boolean; markdown: string }> {
  try {
    const payload: {
      cwd?: string | undefined;
      table?: string | undefined;
      query?: string | undefined;
    } = {
      cwd: cwd || undefined,
    };

    let userQuestion: string | undefined;
    if (tableOrQuery && tableOrQuery.trim()) {
      const arg = tableOrQuery.trim();
      if (/^select\b/i.test(arg)) {
        payload.query = arg;
      } else if (/^[a-zA-Z0-9_]+$/.test(arg)) {
        payload.table = arg;
      } else {
        userQuestion = arg;
      }
    }

    const res = await fetch(resolvePrimaryEnvironmentHttpUrl("/api/db/inspect"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      return {
        success: false,
        markdown: `[🗄️ Database Inspector (opencode db)]\n⚠️ Server returned HTTP ${res.status} while inspecting database schema.`,
      };
    }

    const data = (await res.json()) as DbInspectResponse;

    if (!data.ok) {
      return {
        success: false,
        markdown: `[🗄️ Database Inspector (opencode db)]\n⚠️ Database Inspection Notice:\n${data.error || "No database detected in workspace."}\n\nTips:\n- Ensure an SQLite database file (*.db, *.sqlite), Prisma schema (prisma/schema.prisma), or .env DATABASE_URL exists in the project workspace.`,
      };
    }

    const sections: string[] = [];
    sections.push(`[🗄️ Database Inspector (opencode db)]`);
    sections.push(`- **Dialect:** ${data.dialect?.toUpperCase() ?? "UNKNOWN"}`);
    if (data.dbPath) sections.push(`- **Database File:** \`${data.dbPath}\``);
    if (data.schemaFile) sections.push(`- **Schema File:** \`${data.schemaFile}\``);
    if (data.provider) sections.push(`- **Provider:** ${data.provider}`);
    if (data.connectionUrl) sections.push(`- **Connection:** \`${data.connectionUrl}\``);

    if (data.tables && data.tables.length > 0) {
      sections.push(`\n### 📊 Schema Tables (${data.tables.length} tables found)`);
      for (const table of data.tables) {
        const rowCountLabel = table.rowCount >= 0 ? ` (~${table.rowCount} rows)` : "";
        sections.push(`\n#### Table: \`${table.name}\`${rowCountLabel}`);
        if (table.columns && table.columns.length > 0) {
          sections.push(`| Column | Type | Nullable | Key |`);
          sections.push(`| :--- | :--- | :--- | :--- |`);
          for (const col of table.columns) {
            const nullable = col.notnull ? "NOT NULL" : "NULLABLE";
            const pk = col.pk ? "🔑 PRIMARY KEY" : "-";
            sections.push(`| \`${col.name}\` | \`${col.type}\` | ${nullable} | ${pk} |`);
          }
        }
      }
    } else {
      sections.push(`\n*No tables discovered or schema is empty.*`);
    }

    if (data.sampleRows && data.sampleRows.length > 0) {
      sections.push(`\n### 📋 Sample Records (Table: \`${payload.table}\`)`);
      sections.push("```json\n" + JSON.stringify(data.sampleRows, null, 2) + "\n```");
    }

    if (data.customQueryResult) {
      sections.push(`\n### ⚡ Query Result: \`${payload.query}\``);
      sections.push("```json\n" + JSON.stringify(data.customQueryResult, null, 2) + "\n```");
    }

    if (userQuestion) {
      sections.push(`\n### 💬 User Question / Directive:\n${userQuestion}`);
    }

    sections.push(
      `\nDirectives for AI Assistant:\n- Use this live database schema to accurately answer user questions, write queries, or propose migrations.\n- Provide code explanations and summaries in Roman Urdu.`,
    );

    return {
      success: true,
      markdown: sections.join("\n"),
    };
  } catch (err: any) {
    return {
      success: false,
      markdown: `[🗄️ Database Inspector (opencode db)]\n⚠️ Failed to connect to Database Inspector: ${err?.message || String(err)}`,
    };
  }
}
