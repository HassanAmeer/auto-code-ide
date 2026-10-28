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

export function readProjectFile(filePath: string, baseDir?: string): ToolResult {
  try {
    const resolved = baseDir ? path.resolve(baseDir, filePath) : path.resolve(filePath);
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
    const resolved = baseDir ? path.resolve(baseDir, filePath) : path.resolve(filePath);
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
 * Extracts transcripts from YouTube videos or text from web articles without API keys.
 */
export async function researchMediaLink(
  args: ResearchMediaLinkArgs,
): Promise<ResearchMediaLinkResult> {
  const { url, query } = args;
  try {
    const { researchMediaLink: executeResearch } = await import(
      "../../apps/server/src/youtubeTranscript.ts" as string
    );
    const res = await executeResearch(url, query);
    return {
      ok: res.ok,
      title: res.title,
      transcript: res.transcript,
      isYouTube: res.isYouTube,
      error: res.error,
    };
  } catch (err: any) {
    return {
      ok: false,
      transcript: "",
      error: err?.message || "Failed to research media link",
    };
  }
}
