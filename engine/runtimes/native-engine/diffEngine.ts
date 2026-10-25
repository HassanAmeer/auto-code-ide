export interface DiffLine {
  type: "add" | "delete" | "normal";
  content: string;
  lineBefore?: number;
  lineAfter?: number;
}

export function computeUnifiedDiff(
  oldStr: string,
  newStr: string,
  filePath = "file",
): { diffText: string; addedCount: number; deletedCount: number } {
  const oldLines = oldStr.split("\n");
  const newLines = newStr.split("\n");

  let diffText = `--- a/${filePath}\n+++ b/${filePath}\n`;
  let addedCount = 0;
  let deletedCount = 0;

  // Simple clean unified line-diff
  const max = Math.max(oldLines.length, newLines.length);
  for (let i = 0; i < max; i++) {
    const o = oldLines[i];
    const n = newLines[i];
    if (o === n) {
      if (o !== undefined) diffText += ` ${o}\n`;
    } else {
      if (o !== undefined) {
        diffText += `-${o}\n`;
        deletedCount++;
      }
      if (n !== undefined) {
        diffText += `+${n}\n`;
        addedCount++;
      }
    }
  }

  return { diffText, addedCount, deletedCount };
}
