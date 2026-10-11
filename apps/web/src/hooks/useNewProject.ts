import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import { getNewProjectGitHubRepository } from "@t3tools/client-runtime/operations/projects";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import type { EnvironmentId, ProjectTemplateType } from "@t3tools/contracts";
import { useCallback } from "react";

import { stackedThreadToast, toastManager } from "~/components/ui/toast";
import { waitForProject } from "~/state/entities";
import { projectUploadStore } from "~/state/projectUploadProgress";
import { projectEnvironment } from "~/state/projects";
import { sourceControlEnvironment } from "~/state/sourceControl";
import { useAtomCommand } from "~/state/use-atom-command";
import { useNewThreadHandler } from "./useHandleNewThread";

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message.trim().length > 0
    ? error.message
    : "An error occurred.";
}

/**
 * Starts a project from just a name. The server makes a folder under its
 * `newProjectsRoot` with a README, an icon, and a first commit; this then
 * opens a new thread draft in it. With `github`, it also publishes the
 * repository as private, without holding up the draft.
 *
 * Resolves to whether the project was created.
 */
export function useNewProject() {
  const createNew = useAtomCommand(projectEnvironment.createNew, { reportFailure: false });
  const publishRepository = useAtomCommand(sourceControlEnvironment.publishRepository, {
    reportFailure: false,
  });
  const handleNewThread = useNewThreadHandler();

  const publishToGitHub = useCallback(
    async (input: {
      readonly environmentId: EnvironmentId;
      readonly workspaceRoot: string;
      readonly account: string | null;
    }) => {
      const result = await publishRepository({
        environmentId: input.environmentId,
        input: {
          cwd: input.workspaceRoot,
          provider: "github",
          repository: getNewProjectGitHubRepository(input, input.workspaceRoot),
          visibility: "private",
        },
      });
      if (result._tag === "Failure") {
        if (!isAtomCommandInterrupted(result)) {
          toastManager.add(
            stackedThreadToast({
              type: "error",
              title: "Could not create the GitHub repository",
              description: `${errorMessage(squashAtomCommandFailure(result))} Use Publish Repository in the Git menu to try again.`,
            }),
          );
        }
        return;
      }
      toastManager.add(
        stackedThreadToast({
          type: "success",
          title: "Published to GitHub",
          description: result.value.repository.nameWithOwner,
        }),
      );
    },
    [publishRepository],
  );

  return useCallback(
    async (input: {
      readonly environmentId: EnvironmentId;
      readonly name: string;
      readonly template?: ProjectTemplateType | undefined;
      readonly github?: { readonly account: string | null } | null | undefined;
    }): Promise<boolean> => {
      let createdProject: {
        readonly projectId: any;
        readonly workspaceRoot: string;
        readonly commitError?: string | undefined;
      } | null = null;

      projectUploadStore.setState({
        isImporting: true,
        projectName: input.name,
        stage: "Setting up workspace template...",
        current: 1,
        total: 4,
        percent: 25,
        error: null,
      });

      const result = await createNew({
        environmentId: input.environmentId,
        input: {
          name: input.name,
          ...(input.template ? { template: input.template } : {}),
        },
      });

      if (result._tag === "Success") {
        createdProject = result.value;
      } else {
        // Direct HTTP fallback for standalone web / VPS environment
        try {
          const response = await fetch("/api/project/create-direct", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: input.name,
              template: input.template,
            }),
          });
          const data = (await response.json()) as {
            ok?: boolean;
            projectId?: string;
            workspaceRoot?: string;
            commitError?: string;
            error?: string;
          };
          if (data && data.ok && data.projectId && data.workspaceRoot) {
            createdProject = {
              projectId: data.projectId,
              workspaceRoot: data.workspaceRoot,
              commitError: data.commitError,
            };
          } else {
            const err = data?.error ?? errorMessage(squashAtomCommandFailure(result));
            projectUploadStore.setState({
              isImporting: false,
              error: err,
            });
            if (!isAtomCommandInterrupted(result)) {
              toastManager.add(
                stackedThreadToast({
                  type: "error",
                  title: "Could not create the project",
                  description: err,
                }),
              );
            }
            return false;
          }
        } catch (httpError) {
          const err = errorMessage(squashAtomCommandFailure(result));
          projectUploadStore.setState({
            isImporting: false,
            error: err,
          });
          if (!isAtomCommandInterrupted(result)) {
            toastManager.add(
              stackedThreadToast({
                type: "error",
                title: "Could not create the project",
                description: err,
              }),
            );
          }
          return false;
        }
      }

      projectUploadStore.setState({
        stage: "Initializing repository...",
        current: 2,
        total: 4,
        percent: 65,
      });

      const { projectId, workspaceRoot, commitError } = createdProject;
      // The folder sits in T3 Code's data directory, so always say where.
      toastManager.add(
        stackedThreadToast(
          commitError === undefined
            ? { type: "success", title: `Created ${input.name}`, description: workspaceRoot }
            : {
                type: "warning",
                title: `Created ${input.name} without a first commit`,
                description: `${commitError} The project is in ${workspaceRoot}.`,
              },
        ),
      );
      if (input.github) {
        void publishToGitHub({
          environmentId: input.environmentId,
          workspaceRoot,
          account: input.github.account,
        });
      }

      const projectRef = scopeProjectRef(input.environmentId, projectId);

      projectUploadStore.setState({
        stage: "Opening workspace thread...",
        current: 3,
        total: 4,
        percent: 90,
      });

      // Quick check if already in store (2s max), never failing or showing error toast if still propagating
      await waitForProject(projectRef, 2_000).catch(() => null);

      projectUploadStore.setState({
        stage: "Ready!",
        current: 4,
        total: 4,
        percent: 100,
      });

      // Open new thread draft directly without error toast
      await handleNewThread(projectRef).catch((error: unknown) => {
        console.warn("Could not auto-open thread draft:", error);
      });

      setTimeout(() => {
        projectUploadStore.reset();
      }, 1200);

      return true;
    },
    [createNew, handleNewThread, publishToGitHub],
  );
}
