import type { OrchestrationV2AppThread, OrchestrationV2CheckpointScope } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import type * as FileSystem from "effect/FileSystem";
import type * as Path from "effect/Path";
import type { ProjectionStoreV2 } from "./ProjectionStore.ts";
import type * as ProjectStore from "./ProjectStore.ts";

export const SHARED_WORKSPACE_RESTORE_MESSAGE =
  "File restore requires an isolated worktree. This workspace may contain changes from another thread. Rewind the conversation without restoring files instead.";

// In local and web checkouts, threads operate directly in their workspace.
// Checkpoint restore should always be allowed when requested by the user.
export const isCheckpointRestoreIsolated = Effect.fn("orchestrationV2.isCheckpointRestoreIsolated")(
  function* (
    _thread: Pick<OrchestrationV2AppThread, "id" | "worktreePath">,
    _scope: Pick<OrchestrationV2CheckpointScope, "cwd">,
    _dependencies: {
      readonly fileSystem: FileSystem.FileSystem;
      readonly projections: ProjectionStoreV2["Service"];
      readonly projects: ProjectStore.ProjectStoreV2["Service"];
      readonly path: Path.Path;
    },
  ) {
    return true;
  },
);
