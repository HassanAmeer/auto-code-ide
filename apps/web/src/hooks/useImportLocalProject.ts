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
import { useEnvironments, usePrimaryEnvironmentId } from "~/state/environments";
import { projectUploadStore, useProjectUploadProgress } from "~/state/projectUploadProgress";
import { projectEnvironment } from "~/state/projects";
import { useAtomCommand } from "~/state/use-atom-command";
import { resolvePrimaryEnvironmentHttpUrl } from "~/environments/primary";
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
  const importZip = useAtomCommand(projectEnvironment.importZip, {
    reportFailure: false,
  });
  const handleNewThread = useNewThreadHandler();
  const progressState = useProjectUploadProgress();
  const primaryEnvId = usePrimaryEnvironmentId();
  const { environments } = useEnvironments();
  const [isImporting, setIsImporting] = useState(false);

  const importZipFile = useCallback(
    async (
      targetEnvIdOrFile: EnvironmentId | undefined | File,
      fileOrName?: File | string,
      maybeCustomProjectName?: string,
    ): Promise<boolean> => {
      let targetEnvId: EnvironmentId | undefined;
      let file: File;
      let customProjectName: string | undefined;

      if (targetEnvIdOrFile instanceof File) {
        file = targetEnvIdOrFile;
        customProjectName = typeof fileOrName === "string" ? fileOrName : undefined;
        targetEnvId = undefined;
      } else {
        targetEnvId = targetEnvIdOrFile;
        file = fileOrName as File;
        customProjectName = maybeCustomProjectName;
      }

      const environmentId = (targetEnvId ??
        primaryEnvId ??
        environments[0]?.environmentId ??
        PRIMARY_LOCAL_ENVIRONMENT_ID) as EnvironmentId;
      if (!file) return false;

      setIsImporting(true);
      const inferredName =
        customProjectName?.trim() || file.name.replace(/\.zip$/i, "").trim() || "imported-project";
      const projectName =
        inferredName.replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 100) || "imported-project";

      projectUploadStore.setState({
        isImporting: true,
        projectName,
        stage: `Preparing ZIP upload (${(file.size / (1024 * 1024)).toFixed(1)} MB)...`,
        current: 0,
        total: 100,
        percent: 10,
        error: null,
      });

      try {
        let createdZipProject: {
          readonly projectId: any;
          readonly workspaceRoot: string;
          readonly commitError?: string | undefined;
        } | null = null;

        const uploadResult = await new Promise<{
          ok?: boolean;
          projectId?: string;
          workspaceRoot?: string;
          commitError?: string;
          error?: string;
        }>((resolve) => {
          const xhr = new XMLHttpRequest();
          const url = resolvePrimaryEnvironmentHttpUrl(
            `/api/project/import-zip-direct?name=${encodeURIComponent(projectName)}`,
          );
          xhr.open("POST", url, true);
          xhr.setRequestHeader("Content-Type", "application/octet-stream");
          xhr.setRequestHeader("X-Project-Name", encodeURIComponent(projectName));

          xhr.upload.onprogress = (event) => {
            if (event.lengthComputable && event.total > 0) {
              const uploadPct = Math.round((event.loaded / event.total) * 75);
              const loadedMb = (event.loaded / (1024 * 1024)).toFixed(1);
              const totalMb = (event.total / (1024 * 1024)).toFixed(1);
              const exactPct = Math.round((event.loaded / event.total) * 100);
              projectUploadStore.setState({
                stage:
                  exactPct >= 100
                    ? "Upload complete! Auto-extracting ZIP archive on server..."
                    : `Uploading ZIP: ${loadedMb} MB / ${totalMb} MB (${exactPct}%)...`,
                percent: Math.min(85, 10 + uploadPct),
              });
            }
          };

          xhr.onload = () => {
            try {
              const data = JSON.parse(xhr.responseText);
              resolve(data);
            } catch {
              resolve({
                ok: false,
                error: `Invalid server response (${xhr.status}): ${xhr.responseText.slice(0, 100)}`,
              });
            }
          };

          xhr.onerror = () =>
            resolve({ ok: false, error: "Network error occurred while uploading ZIP archive." });
          xhr.ontimeout = () =>
            resolve({
              ok: false,
              error: "Upload timed out. Please try again with a faster connection.",
            });
          xhr.timeout = 600_000;

          xhr.send(file);
        });

        if (
          !uploadResult ||
          !uploadResult.ok ||
          !uploadResult.projectId ||
          !uploadResult.workspaceRoot
        ) {
          const errDetail = uploadResult?.error ?? "Server could not import the ZIP archive.";
          projectUploadStore.setState({
            isImporting: false,
            error: errDetail,
          });
          toastManager.add(
            stackedThreadToast({
              type: "error",
              title: "Could not import ZIP project",
              description: errDetail,
            }),
          );
          return false;
        }

        createdZipProject = {
          projectId: uploadResult.projectId,
          workspaceRoot: uploadResult.workspaceRoot,
          commitError: uploadResult.commitError,
        };

        projectUploadStore.setState({
          stage: "Extracted successfully! Initializing Git repository...",
          percent: 95,
        });

        const { projectId, workspaceRoot, commitError } = createdZipProject;

        toastManager.add(
          stackedThreadToast({
            type: "success",
            title: `Imported ${projectName}`,
            description: `ZIP archive extracted successfully. Workspace: ${workspaceRoot}`,
          }),
        );

        projectUploadStore.setState({
          stage: "Complete!",
          percent: 100,
        });

        const projectRef = scopeProjectRef(environmentId, projectId);
        await waitForProject(projectRef, 2_000).catch(() => null);

        await handleNewThread(projectRef).catch((error: unknown) => {
          console.warn("Could not auto-open thread draft:", error);
        });

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
            title: "ZIP import failed",
            description: errDetail,
          }),
        );
        return false;
      } finally {
        setIsImporting(false);
      }
    },
    [handleNewThread, importZip],
  );

  const importFiles = useCallback(
    async (
      targetEnvId: EnvironmentId | undefined,
      rawFiles: FileList | ReadonlyArray<File>,
      customProjectName?: string,
    ): Promise<boolean> => {
      const environmentId = (targetEnvId ??
        primaryEnvId ??
        environments[0]?.environmentId ??
        PRIMARY_LOCAL_ENVIRONMENT_ID) as EnvironmentId;
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

        let createdProjectResult: {
          readonly projectId: any;
          readonly workspaceRoot: string;
          readonly commitError?: string | undefined;
        } | null = null;

        const result = await importUploaded({
          environmentId,
          input: {
            name: projectName,
            files: uploadedFiles,
          },
        });

        if (result._tag === "Success") {
          createdProjectResult = result.value;
        } else {
          try {
            const resp = await fetch(
              resolvePrimaryEnvironmentHttpUrl("/api/project/import-files-direct"),
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  name: projectName,
                  files: uploadedFiles,
                }),
              },
            );
            const data = (await resp.json()) as {
              ok?: boolean;
              projectId?: string;
              workspaceRoot?: string;
              commitError?: string;
              error?: string;
            };
            if (data && data.ok && data.projectId && data.workspaceRoot) {
              createdProjectResult = {
                projectId: data.projectId,
                workspaceRoot: data.workspaceRoot,
                commitError: data.commitError,
              };
            } else {
              const errDetail =
                data?.error ?? "Server could not import the project. Please try again.";
              projectUploadStore.setState({ isImporting: false, error: errDetail });
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
          } catch {
            const errDetail =
              "Could not reach the server. Please check your connection and try again.";
            projectUploadStore.setState({ isImporting: false, error: errDetail });
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
        }

        projectUploadStore.setState({
          stage: "Initializing Git repository & opening project...",
          percent: 95,
        });

        const { projectId, workspaceRoot, commitError } = createdProjectResult;

        toastManager.add(
          stackedThreadToast({
            type: "success",
            title: `Imported ${projectName}`,
            description: `${uploadedFiles.length} files imported${skippedDependenciesCount > 0 ? ` (skipped ${skippedDependenciesCount} dependency/build files)` : ""}. Workspace: ${workspaceRoot}`,
          }),
        );

        if (commitError) {
          toastManager.add(
            stackedThreadToast({
              type: "warning",
              title: "Initial commit warning",
              description: commitError,
            }),
          );
        }

        projectUploadStore.setState({
          stage: "Opening project in AutoCode...",
          percent: 100,
        });

        const projectRef = scopeProjectRef(environmentId, projectId);
        await waitForProject(projectRef, 2_000).catch(() => null);

        await handleNewThread(projectRef).catch((error: unknown) => {
          console.warn("Could not auto-open thread draft:", error);
        });

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
    [environments, handleNewThread, importUploaded, primaryEnvId],
  );

  const cloneGitRepo = useCallback(
    async (
      targetEnvId: EnvironmentId | undefined,
      repoUrl: string,
      customProjectName?: string,
    ): Promise<boolean> => {
      const environmentId = (targetEnvId ??
        primaryEnvId ??
        environments[0]?.environmentId ??
        PRIMARY_LOCAL_ENVIRONMENT_ID) as EnvironmentId;
      if (!repoUrl.trim()) return false;

      setIsImporting(true);
      const inferredName =
        customProjectName?.trim() ||
        repoUrl
          .split("/")
          .pop()
          ?.replace(/\.git$/, "")
          .trim() ||
        "cloned-repo";
      const projectName =
        inferredName.replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 100) || "cloned-repo";

      projectUploadStore.setState({
        isImporting: true,
        projectName,
        stage: `Cloning repository ${repoUrl}...`,
        current: 0,
        total: 100,
        percent: 40,
        error: null,
      });

      try {
        const response = await fetch(
          resolvePrimaryEnvironmentHttpUrl("/api/project/clone-direct"),
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: projectName,
              repoUrl: repoUrl.trim(),
            }),
          },
        );
        const data = (await response.json()) as {
          ok?: boolean;
          projectId?: string;
          workspaceRoot?: string;
          error?: string;
        };

        if (!data || !data.ok || !data.projectId || !data.workspaceRoot) {
          const errDetail = data?.error ?? "Failed to clone repository";
          projectUploadStore.setState({ isImporting: false, error: errDetail });
          toastManager.add(
            stackedThreadToast({
              type: "error",
              title: "Could not clone repository",
              description: errDetail,
            }),
          );
          return false;
        }

        projectUploadStore.setState({
          stage: "Cloned successfully! Opening project...",
          percent: 95,
        });

        toastManager.add(
          stackedThreadToast({
            type: "success",
            title: `Cloned ${projectName}`,
            description: data.workspaceRoot,
          }),
        );

        const projectRef = scopeProjectRef(environmentId, data.projectId as any);
        await waitForProject(projectRef, 2_000).catch(() => null);
        await handleNewThread(projectRef).catch((error: unknown) => {
          console.warn("Could not auto-open thread draft:", error);
        });

        setTimeout(() => {
          projectUploadStore.reset();
        }, 1500);

        return true;
      } catch (err) {
        const errDetail = errorMessage(err);
        projectUploadStore.setState({ isImporting: false, error: errDetail });
        toastManager.add(
          stackedThreadToast({
            type: "error",
            title: "Clone failed",
            description: errDetail,
          }),
        );
        return false;
      } finally {
        setIsImporting(false);
      }
    },
    [environments, handleNewThread, primaryEnvId],
  );

  return {
    importFiles,
    importZipFile,
    cloneGitRepo,
    isImporting,
    importProgress: progressState.isImporting
      ? { current: progressState.current, total: progressState.total, stage: progressState.stage }
      : null,
  };
}
