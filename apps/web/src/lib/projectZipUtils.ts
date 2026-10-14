import { resolvePrimaryEnvironmentHttpUrl } from "~/environments/primary";

/**
 * Downloads the project as a clean .zip archive (excluding node_modules, .git, etc.)
 */
export function downloadProjectZip(workspaceRoot: string, projectName?: string): void {
  if (!workspaceRoot) return;
  const safeName = projectName || workspaceRoot.split("/").filter(Boolean).pop() || "project";
  const url = resolvePrimaryEnvironmentHttpUrl(
    `/api/project/download-zip?workspaceRoot=${encodeURIComponent(workspaceRoot)}&name=${encodeURIComponent(safeName)}`,
  );

  // Trigger browser download via invisible link
  const link = document.createElement("a");
  link.href = url;
  link.download = `${safeName}.zip`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Reads a File object as base64 string
 */
export function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === "string") {
        const base64 = result.includes(",") ? result.split(",")[1]! : result;
        resolve(base64);
      } else if (result instanceof ArrayBuffer) {
        const bytes = new Uint8Array(result);
        let binary = "";
        for (let i = 0; i < bytes.byteLength; i++) {
          binary += String.fromCharCode(bytes[i]!);
        }
        resolve(btoa(binary));
      } else {
        reject(new Error("Failed to read file as base64"));
      }
    };
    reader.onerror = () => reject(reader.error || new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

/**
 * Extracts an uploaded zip file into the specified target directory on the server
 */
export async function extractZipToProject(
  file: File,
  targetCwd: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const zipBase64 = await readFileAsBase64(file);
    const response = await fetch(resolvePrimaryEnvironmentHttpUrl("/api/project/extract-zip"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        targetCwd,
        zipBase64,
      }),
    });

    const data = (await response.json()) as { ok?: boolean; error?: string; message?: string };
    if (!response.ok || !data.ok) {
      return { ok: false, error: data.error || `Server responded with status ${response.status}` };
    }

    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Failed to extract ZIP archive" };
  }
}
