import { exec } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { promisify } from "node:util";

const execAsync = promisify(exec);

export interface ToolResult {
  ok: boolean;
  output?: string | undefined;
  error?: string | undefined;
}

export async function executeBash(
  command: string,
  cwd?: string,
  timeoutMs = 25000,
): Promise<ToolResult> {
  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd: cwd || process.cwd(),
      timeout: timeoutMs,
      maxBuffer: 1024 * 1024 * 5, // 5MB buffer
    });
    return {
      ok: true,
      output: (stdout || stderr || "Command executed successfully (no output)").trim(),
    };
  } catch (err: any) {
    return {
      ok: false,
      error: err?.message || String(err),
      output: err?.stdout ? String(err.stdout).trim() : undefined,
    };
  }
}

function resolveWithinBase(baseDir: string | undefined, filePath: string, label: string): string {
  const root = path.resolve(baseDir ?? process.cwd());
  const resolved = path.resolve(root, filePath);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new Error(`${label} path escapes allowed directory: ${filePath}`);
  }
  return resolved;
}

export function readProjectFile(filePath: string, baseDir?: string): ToolResult {
  try {
    const resolved = resolveWithinBase(baseDir, filePath, "read");
    if (!fs.existsSync(resolved)) {
      return { ok: false, error: `File not found: ${filePath}` };
    }
    const content = fs.readFileSync(resolved, "utf-8");
    return { ok: true, output: content };
  } catch (err: any) {
    return { ok: false, error: err?.message || String(err) };
  }
}

export function writeProjectFile(filePath: string, content: string, baseDir?: string): ToolResult {
  try {
    const resolved = resolveWithinBase(baseDir, filePath, "write");
    const dir = path.dirname(resolved);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(resolved, content, "utf-8");
    return { ok: true, output: `Successfully wrote ${filePath} (${content.length} chars)` };
  } catch (err: any) {
    return { ok: false, error: err?.message || String(err) };
  }
}

export async function inspectPreviewEndpoint(
  port = 3000,
  pathUri = "/",
): Promise<{ ok: boolean; status?: number; error?: string }> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}${pathUri}`, {
      signal: AbortSignal.timeout(3000),
    });
    return { ok: res.status < 400, status: res.status };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Preview endpoint unreachable" };
  }
}

export interface ResearchMediaLinkArgs {
  url: string;
  query?: string;
}

export interface ResearchMediaLinkResult {
  ok: boolean;
  title?: string;
  transcript: string;
  isYouTube?: boolean;
  summary?: string;
  error?: string;
}

/**
 * Voice Agent Tool: research_media_link
 * Extracts page text from a link. The previous YouTube-transcript backend
 * (apps/server/src/youtubeTranscript.ts) was removed, so this now fails with a
 * clear, actionable message instead of throwing a module-not-found error.
 */
export async function researchMediaLink(
  args: ResearchMediaLinkArgs,
): Promise<ResearchMediaLinkResult> {
  const { url } = args;
  if (!url || !/^https?:\/\//i.test(url.trim())) {
    return { ok: false, transcript: "", error: "A valid http(s) URL is required." };
  }

  const isYouTube = /(?:youtube\.com|youtu\.be)/i.test(url);
  if (isYouTube) {
    return {
      ok: false,
      transcript: "",
      isYouTube: true,
      error:
        "YouTube transcript extraction is not available in this build (the transcript backend was removed). Ask the user to paste the video description or key points.",
    };
  }

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "AutoCode-Bot/1.0" },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      return { ok: false, transcript: "", error: `Fetch failed (HTTP ${res.status})` };
    }
    const html = await res.text();
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/\s+/g, " ")
      .trim();

    const cleanTitle = titleMatch?.[1]?.trim();
    const result: ResearchMediaLinkResult = {
      ok: text.length > 0,
      transcript: text.slice(0, 20000),
      isYouTube: false,
    };
    if (cleanTitle) result.title = cleanTitle;
    if (text.length === 0) result.error = "No readable text found on the page.";
    return result;
  } catch (err: any) {
    return {
      ok: false,
      transcript: "",
      error: err?.message || "Failed to research media link",
    };
  }
}
