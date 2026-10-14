/**
 * Lightweight ANSI Escape Code to Styled HTML / React Token Parser
 * Converts bash/xterm terminal escape codes (colors, bold, reset) into clean HTML.
 */

const ANSI_COLOR_MAP: Record<number, string> = {
  30: "color: #4b5563;", // black/dim gray
  31: "color: #f87171;", // red
  32: "color: #4ade80;", // green
  33: "color: #facc15;", // yellow
  34: "color: #60a5fa;", // blue
  35: "color: #c084fc;", // purple/magenta
  36: "color: #22d3ee;", // cyan
  37: "color: #e5e7eb;", // white
  90: "color: #6b7280;", // bright black (gray)
  91: "color: #ef4444;", // bright red
  92: "color: #22c55e;", // bright green
  93: "color: #eab308;", // bright yellow
  94: "color: #3b82f6;", // bright blue
  95: "color: #a855f7;", // bright magenta
  96: "color: #06b6d4;", // bright cyan
  97: "color: #ffffff;", // bright white
};

/**
 * Strips non-color terminal control sequences (cursor moves, clears, etc.)
 */
export function stripAnsiCodes(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "").replace(/\x1b\].*?\x07/g, "");
}

/**
 * Parses raw terminal output containing ANSI codes into HTML spans with inline color styles.
 */
export function parseAnsiToHtml(text: string): string {
  if (!text) return "";

  // If text does not contain escape characters, return sanitized text directly
  if (!text.includes("\x1b")) {
    return escapeHtml(text);
  }

  // eslint-disable-next-line no-control-regex
  const regex = /\x1b\[([0-9;]*)m/g;
  let html = "";
  let lastIndex = 0;
  let currentColorStyle = "";
  let isBold = false;
  let isUnderline = false;
  let hasOpenSpan = false;

  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    const textChunk = text.slice(lastIndex, match.index);
    if (textChunk) {
      html += escapeHtml(textChunk);
    }
    lastIndex = regex.lastIndex;

    const rawCodes = match[1] || "0";
    const codes = rawCodes.split(";").map((c) => parseInt(c, 10) || 0);

    for (const code of codes) {
      if (code === 0) {
        // Reset all
        currentColorStyle = "";
        isBold = false;
        isUnderline = false;
      } else if (code === 1) {
        isBold = true;
      } else if (code === 4) {
        isUnderline = true;
      } else if (code === 22) {
        isBold = false;
      } else if (code === 24) {
        isUnderline = false;
      } else if (ANSI_COLOR_MAP[code]) {
        currentColorStyle = ANSI_COLOR_MAP[code]!;
      }
    }

    if (hasOpenSpan) {
      html += "</span>";
      hasOpenSpan = false;
    }

    const styles: string[] = [];
    if (currentColorStyle) styles.push(currentColorStyle);
    if (isBold) styles.push("font-weight: 600;");
    if (isUnderline) styles.push("text-decoration: underline;");

    if (styles.length > 0) {
      html += `<span style="${styles.join(" ")}">`;
      hasOpenSpan = true;
    }
  }

  const remaining = text.slice(lastIndex);
  if (remaining) {
    html += escapeHtml(remaining);
  }

  if (hasOpenSpan) {
    html += "</span>";
  }

  return html;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
