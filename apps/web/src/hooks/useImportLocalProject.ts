import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import {
  PRIMARY_LOCAL_ENVIRONMENT_ID,
  type EnvironmentId,
  type ProjectUploadedFile,
} from "@t3tools/contracts";
import { useCallback, useState } from "react";

import { stackedThreadToast, toastManager } from "~/components/ui/toast";
import { waitForProject } from "~/state/entities";
import { projectUploadStore, useProjectUploadProgress } from "~/state/projectUploadProgress";
import { projectEnvironment } from "~/state/projects";
import { useAtomCommand } from "~/state/use-atom-command";
import { useNewThreadHandler } from "./useHandleNewThread";

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message.trim().length > 0
    ? error.message
    : "An error occurred.";
}

const IGNORED_DIR_REGEX =
  /(^|[\\/])(node_modules|\.git|dist|build|out|\.next|\.nuxt|\.turbo|\.output|coverage|\.cache|target|bin|obj|vendor|venv|\.venv|__pycache__|\.parcel-cache|\.svelte-kit)([\\/]|$)/i;

const IGNORED_FILE_REGEX = /(^|[\\/])(\.DS_Store|Thumbs\.db|\.gitkeep|\.env\.local)$/i;

const BINARY_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "ico",
  "bmp",
  "tiff",
  "wasm",
  "pdf",
  "zip",
  "gz",
  "tar",
  "7z",
  "rar",
  "mp3",
  "mp4",
  "wav",
  "ogg",
  "mov",
  "webm",
  "woff",
  "woff2",
  "ttf",
  "eot",
  "otf",
]);

function isBinaryFile(file: File): boolean {
  if (
    file.type &&
    !file.type.startsWith("text/") &&
    !file.type.includes("json") &&
    !file.type.includes("xml") &&
    !file.type.includes("javascript") &&
    !file.type.includes("typescript")
  ) {
    return true;
  }
  const ext = file.name.split(".").pop()?.toLowerCase();
  return ext ? BINARY_EXTENSIONS.has(ext) : false;
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.split(",")[1] ?? "";
      resolve(base64);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function useImportLocalProject() {
  const importUploaded = useAtomCommand(projectEnvironment.importUploaded, {
    reportFailure: false,
  });
  const handleNewThread = useNewThreadHandler();
  const progressState = useProjectUploadProgress();
  const [isImporting, setIsImporting] = useState(false);

  const importFiles = useCallback(
    async (
      targetEnvId: EnvironmentId | undefined,
      rawFiles: FileList | ReadonlyArray<File>,
      customProjectName?: string,
    ): Promise<boolean> => {
      const environmentId = (targetEnvId ?? PRIMARY_LOCAL_ENVIRONMENT_ID) as EnvironmentId;
      const filesArray = Array.from(rawFiles);
      if (filesArray.length === 0) {
        toastManager.add(
          stackedThreadToast({
            type: "warning",
            title: "No files selected",
            description: "Please select a folder containing your project files.",
          }),
        );
        return false;
      }

      setIsImporting(true);

      // Determine root project name
      let inferredName = customProjectName?.trim() || "";
      if (!inferredName) {
        const firstPath = filesArray[0]?.webkitRelativePath || "";
        const firstSegment = firstPath.split(/[\/\\]/)[0]?.trim();
        inferredName = firstSegment || "imported-project";
      }
      const projectName =
        inferredName.replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 100) || "imported-project";

      projectUploadStore.setState({
        isImporting: true,
        projectName,
        stage: "Filtering files (ignoring dependencies)...",
        current: 0,
        total: filesArray.length,
        percent: 5,
        error: null,
      });

      try {
        const validFiles: File[] = [];
        let skippedDependenciesCount = 0;

        for (const file of filesArray) {
          const path = file.webkitRelativePath || file.name;
          if (IGNORED_DIR_REGEX.test(path) || IGNORED_FILE_REGEX.test(path)) {
            skippedDependenciesCount++;
            continue;
          }
          // Skip excessively large individual files (> 30MB)
          if (file.size > 30 * 1024 * 1024) {
            skippedDependenciesCount++;
            continue;
          }
          validFiles.push(file);
        }

        if (validFiles.length === 0) {
          const err =
            "All files in this folder were ignored (dependencies, build outputs, or empty).";
          projectUploadStore.setState({ isImporting: false, error: err });
          toastManager.add(
            stackedThreadToast({
              type: "warning",
              title: "No valid source files found",
              description: err,
            }),
          );
          setIsImporting(false);
          return false;
        }

        projectUploadStore.setState({
          stage: `Reading files (0/${validFiles.length})...`,
          current: 0,
          total: validFiles.length,
          percent: 10,
        });

        const rootPrefix = filesArray[0]?.webkitRelativePath
          ? `${filesArray[0].webkitRelativePath.split(/[\/\\]/)[0]}/`
          : "";

        const uploadedFiles: ProjectUploadedFile[] = [];

        // Read files in batches of 40 to keep browser responsive
        const BATCH_SIZE = 40;
        for (let i = 0; i < validFiles.length; i += BATCH_SIZE) {
          const batch = validFiles.slice(i, i + BATCH_SIZE);
          await Promise.all(
            batch.map(async (file) => {
              try {
                let relativePath = file.webkitRelativePath || file.name;
                if (rootPrefix && relativePath.startsWith(rootPrefix)) {
                  relativePath = relativePath.slice(rootPrefix.length);
                }
                if (!relativePath || relativePath.startsWith("..")) {
                  return;
                }

                const binary = isBinaryFile(file);
                if (binary) {
                  const base64Content = await readFileAsBase64(file);
                  uploadedFiles.push({
                    relativePath,
                    content: base64Content,
                    encoding: "base64",
                  });
                } else {
                  const textContent = await file.text();
                  uploadedFiles.push({
                    relativePath,
                    content: textContent,
                    encoding: "utf8",
                  });
                }
              } catch (readErr) {
                console.warn("Skipped unreadable file:", file.name, readErr);
              }
            }),
          );

          const processedCount = Math.min(i + BATCH_SIZE, validFiles.length);
          const percent = 10 + Math.round((processedCount / validFiles.length) * 60);
          projectUploadStore.setState({
            stage: `Reading files (${processedCount}/${validFiles.length})...`,
            current: processedCount,
            total: validFiles.length,
            percent,
          });
        }

        projectUploadStore.setState({
          stage: `Uploading ${uploadedFiles.length} files to server...`,
          current: uploadedFiles.length,
          total: uploadedFiles.length,
          percent: 75,
        });

        const result = await importUploaded({
          environmentId,
          input: {
            name: projectName,
            files: uploadedFiles,
          },
        });

        if (result._tag === "Failure") {
          const errDetail = errorMessage(squashAtomCommandFailure(result));
          projectUploadStore.setState({
            isImporting: false,
            error: errDetail,
          });
          if (!isAtomCommandInterrupted(result)) {
            toastManager.add(
              stackedThreadToast({
                type: "error",
                title: "Could not import the project",
                description: errDetail,
              }),
            );
          }
          return false;
        }

        projectUploadStore.setState({
          stage: "Initializing Git repository & opening project...",
          percent: 95,
        });

        const { projectId, workspaceRoot, commitError } = result.value;

        toastManager.add(
          stackedThreadToast({
            type: "success",
            title: `Imported ${projectName}`,
            description: `${uploadedFiles.length} files imported${skippedDependenciesCount > 0 ? ` (skipped ${skippedDependenciesCount} dependency/build files)` : ""}. Workspace: ${workspaceRoot}`,
          }),
        );

        projectUploadStore.setState({
          stage: "Complete!",
          percent: 100,
        });

        const projectRef = scopeProjectRef(environmentId, projectId);
        const project = await waitForProject(projectRef).catch(() => null);

        if (project !== null) {
          await handleNewThread(projectRef).catch((error: unknown) => {
            console.warn("Could not auto-open thread draft:", error);
          });
        }

        // Keep 100% visible briefly for smooth transition
        setTimeout(() => {
          projectUploadStore.reset();
        }, 1500);

        return true;
      } catch (error) {
        const errDetail = errorMessage(error);
        projectUploadStore.setState({
          isImporting: false,
          error: errDetail,
        });
        toastManager.add(
          stackedThreadToast({
            type: "error",
            title: "Project import failed",
            description: errDetail,
          }),
        );
        return false;
      } finally {
        setIsImporting(false);
      }
    },
    [handleNewThread, importUploaded],
  );

  return {
    importFiles,
    isImporting,
    importProgress: progressState.isImporting
      ? { current: progressState.current, total: progressState.total, stage: progressState.stage }
      : null,
  };
}
