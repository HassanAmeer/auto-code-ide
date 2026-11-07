export {
  appendBrowsePathSegment,
  canNavigateUp,
  ensureBrowseDirectoryPath,
  findProjectByPath,
  getBrowseDirectoryPath,
  getBrowseLeafPathSegment,
  getBrowseParentPath,
  hasTrailingPathSeparator,
  inferProjectTitleFromPath,
  isExplicitRelativeProjectPath,
  isFilesystemBrowseQuery,
  isUnsupportedWindowsProjectPath,
  normalizeProjectPathForComparison,
  normalizeProjectPathForDispatch,
  resolveProjectPathForDispatch,
} from "@t3tools/client-runtime/state/projects";

const STORAGE_FOLDER_NAME = "autocode-storage";

/**
 * Mirror of the server's storage-root resolver (see ManagedProjectFolders):
 * the path chosen in Settings -> Storage is treated as the parent directory,
 * unless it already ends in `autocode-storage`. The folder that actually
 * holds projects, uploads and clones is returned.
 */
export function resolveStorageRootPath(targetPath: string): string {
  const trimmed = targetPath.trim().replace(/[\\/]+$/, "");
  if (!trimmed) {
    return "";
  }
  const segments = trimmed.split(/[\\/]+/);
  const last = segments[segments.length - 1] ?? "";
  if (last.toLowerCase() === STORAGE_FOLDER_NAME) {
    return trimmed;
  }
  const separator = trimmed.includes("\\") && !trimmed.includes("/") ? "\\" : "/";
  return `${trimmed}${separator}${STORAGE_FOLDER_NAME}`;
}
