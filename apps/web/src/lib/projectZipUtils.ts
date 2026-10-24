import { resolvePrimaryEnvironmentHttpUrl } from "~/environments/primary";
import { toastManager } from "~/components/ui/toast";

/**
 * Downloads the project as a clean .zip archive (excluding node_modules, .git, etc.)
 */
export function downloadProjectZip(workspaceRoot: string, projectName?: string): void {
  if (!workspaceRoot) return;
  const safeName = projectName || workspaceRoot.split("/").filter(Boolean).pop() || "project";
  const url = resolvePrimaryEnvironmentHttpUrl("/api/project/download-zip", {
    workspaceRoot,
    name: safeName,
  });

  toastManager.add({
    type: "info",
    title: "Packaging ZIP",
    description: `Preparing clean ${safeName}.zip without hidden/dot files...`,
  });

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

export interface ZipUploadProgress {
  loaded: number;
  total: number;
  percent: number;
  speedBytesPerSec?: number | undefined;
}

/**
 * Extracts an uploaded zip file into the specified target directory on the server.
 * Streams the raw binary payload directly to disk with zero base64 memory overhead
 * and emits real-time progress events.
 */
export function extractZipToProject(
  file: File,
  targetCwd: string,
  onProgress?: (progress: ZipUploadProgress) => void,
): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    try {
      const xhr = new XMLHttpRequest();
      const url = resolvePrimaryEnvironmentHttpUrl(
        `/api/project/extract-zip?targetCwd=${encodeURIComponent(targetCwd)}`,
      );

      xhr.open("POST", url, true);
      xhr.setRequestHeader("Content-Type", "application/octet-stream");
      xhr.setRequestHeader("X-Target-Cwd", encodeURIComponent(targetCwd));

      let lastTime = Date.now();
      let lastLoaded = 0;

      if (xhr.upload && onProgress) {
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable && event.total > 0) {
            const currentTime = Date.now();
            const timeDiff = (currentTime - lastTime) / 1000;
            let speedBytesPerSec: number | undefined;
            if (timeDiff >= 0.5) {
              speedBytesPerSec = (event.loaded - lastLoaded) / timeDiff;
              lastTime = currentTime;
              lastLoaded = event.loaded;
            }
            const percent = Math.min(100, Math.round((event.loaded / event.total) * 100));
            onProgress({
              loaded: event.loaded,
              total: event.total,
              percent,
              speedBytesPerSec,
            });
          }
        };
      }

      xhr.onload = () => {
        try {
          const data = JSON.parse(xhr.responseText) as {
            ok?: boolean;
            error?: string;
            message?: string;
          };
          if (xhr.status >= 200 && xhr.status < 300 && data.ok) {
            resolve({ ok: true });
          } else {
            resolve({
              ok: false,
              error: data.error || `Server returned error (${xhr.status})`,
            });
          }
        } catch {
          resolve({
            ok: false,
            error: `Failed to parse response (${xhr.status}): ${xhr.responseText.slice(0, 100)}`,
          });
        }
      };

      xhr.onerror = () => {
        resolve({
          ok: false,
          error: "Network error occurred while uploading ZIP archive.",
        });
      };

      xhr.ontimeout = () => {
        resolve({
          ok: false,
          error: "Upload timed out. Please try again with a faster connection.",
        });
      };

      // 10 minutes timeout for large files (100MB+)
      xhr.timeout = 600_000;

      // Send the file directly as binary stream without reading into memory
      xhr.send(file);
    } catch (err: any) {
      resolve({ ok: false, error: err?.message || "Failed to initiate ZIP upload" });
    }
  });
}
