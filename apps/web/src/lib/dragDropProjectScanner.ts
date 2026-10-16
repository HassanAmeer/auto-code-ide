/**
 * Robust utility to recursively scan files and directories from Drag and Drop events.
 * Handles single files, .zip archives, and nested directory trees with proper relative paths.
 */

export interface ScannedDragResult {
  readonly isZip: boolean;
  readonly isFolder: boolean;
  readonly zipFile: File | null;
  readonly folderName: string;
  readonly files: File[];
  readonly totalSizeBytes: number;
}

/**
 * Recursively reads all entries from a FileSystemDirectoryEntry.
 * Chrome's readEntries only yields up to 100 items per call, so we loop until empty.
 */
async function readAllDirectoryEntries(
  dirEntry: FileSystemDirectoryEntry,
): Promise<FileSystemEntry[]> {
  const reader = dirEntry.createReader();
  const entries: FileSystemEntry[] = [];

  const readBatch = (): Promise<FileSystemEntry[]> =>
    new Promise((resolve) => {
      reader.readEntries(
        (batch) => resolve(batch),
        () => resolve([]),
      );
    });

  let batch: FileSystemEntry[];
  do {
    batch = await readBatch();
    entries.push(...batch);
  } while (batch.length > 0);

  return entries;
}

/**
 * Recursively traverses a FileSystemEntry tree, collecting all files with relative paths.
 */
async function traverseEntry(
  entry: FileSystemEntry,
  pathPrefix = "",
): Promise<{ file: File; relativePath: string }[]> {
  if (entry.isFile) {
    const fileEntry = entry as FileSystemFileEntry;
    return new Promise((resolve) => {
      fileEntry.file(
        (file) => {
          const relativePath = pathPrefix ? `${pathPrefix}/${file.name}` : file.name;
          // Attach relative path for downstream upload consumers
          try {
            Object.defineProperty(file, "webkitRelativePath", {
              value: relativePath,
              writable: false,
              configurable: true,
            });
          } catch {
            // Ignore if already non-configurable
          }
          resolve([{ file, relativePath }]);
        },
        () => resolve([]),
      );
    });
  }

  if (entry.isDirectory) {
    const dirEntry = entry as FileSystemDirectoryEntry;
    const currentPath = pathPrefix ? `${pathPrefix}/${dirEntry.name}` : dirEntry.name;
    const childEntries = await readAllDirectoryEntries(dirEntry);
    const results: { file: File; relativePath: string }[] = [];

    for (const child of childEntries) {
      const subFiles = await traverseEntry(child, currentPath);
      results.push(...subFiles);
    }
    return results;
  }

  return [];
}

/**
 * Scans a DragEvent's dataTransfer items or files.
 */
export async function scanDroppedItems(dataTransfer: DataTransfer): Promise<ScannedDragResult> {
  const items = dataTransfer.items ? Array.from(dataTransfer.items) : [];

  // Check if any item is a directory
  const hasDirectory = items.some(
    (item) => item.kind === "file" && item.webkitGetAsEntry?.()?.isDirectory,
  );

  // If there's a directory, traverse all items recursively
  if (hasDirectory) {
    const allFilesWithPaths: { file: File; relativePath: string }[] = [];
    let rootFolderName = "";

    for (const item of items) {
      if (item.kind !== "file") continue;
      const entry = item.webkitGetAsEntry?.();
      if (!entry) continue;

      if (!rootFolderName && entry.isDirectory) {
        rootFolderName = entry.name;
      }
      const collected = await traverseEntry(entry);
      allFilesWithPaths.push(...collected);
    }

    const files = allFilesWithPaths.map((item) => item.file);
    const totalSizeBytes = files.reduce((acc, f) => acc + (f.size || 0), 0);

    return {
      isZip: false,
      isFolder: true,
      zipFile: null,
      folderName: rootFolderName || "imported-project",
      files,
      totalSizeBytes,
    };
  }

  // Not a directory: check files
  const rawFiles = Array.from(dataTransfer.files || []);
  if (rawFiles.length === 1 && rawFiles[0]?.name.toLowerCase().endsWith(".zip")) {
    const zip = rawFiles[0];
    return {
      isZip: true,
      isFolder: false,
      zipFile: zip,
      folderName: zip.name.replace(/\.zip$/i, ""),
      files: [zip],
      totalSizeBytes: zip.size || 0,
    };
  }

  // Check if multiple files contain a zip
  const firstZip = rawFiles.find((f) => f.name.toLowerCase().endsWith(".zip"));
  if (firstZip && rawFiles.length === 1) {
    return {
      isZip: true,
      isFolder: false,
      zipFile: firstZip,
      folderName: firstZip.name.replace(/\.zip$/i, ""),
      files: [firstZip],
      totalSizeBytes: firstZip.size || 0,
    };
  }

  // Multiple normal files dropped
  const totalSizeBytes = rawFiles.reduce((acc, f) => acc + (f.size || 0), 0);
  return {
    isZip: false,
    isFolder: false,
    zipFile: null,
    folderName: "uploaded-files",
    files: rawFiles,
    totalSizeBytes,
  };
}
