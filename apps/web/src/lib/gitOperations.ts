import { toastManager } from "~/components/ui/toast";
import { executeTerminalCommand } from "~/components/chat/terminal/terminalClient";

export interface GitOperationOptions {
  cwd: string;
  projectName: string;
  customCommitMessage?: string;
}

export function generateSmartCommitMessage(statusOutput: string): string {
  const lines = statusOutput
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return "chore: update project files";
  }

  const filesWithStatus = lines.map((line) => {
    const status = line.slice(0, 2).trim();
    const filePath = line.replace(/^[MADRCU?! ]+\s+/, "").trim();
    const fileName = filePath.split("/").pop() || filePath;
    return { status, filePath, fileName };
  });

  const fileNames = filesWithStatus.map((f) => f.fileName);
  const firstFile = fileNames[0] || "project files";

  // Heuristic based on file extensions and status
  const hasOnlyDocs = filesWithStatus.every((f) => /\.(md|txt|doc|pdf)$/i.test(f.filePath));
  const hasOnlyStyles = filesWithStatus.every((f) => /\.(css|scss|less|sass)$/i.test(f.filePath));
  const hasOnlyTests = filesWithStatus.every((f) => /(test|spec)\.[jt]sx?$/i.test(f.filePath));
  const hasFix = filesWithStatus.some((f) => /(fix|bug|patch|error)/i.test(f.filePath));

  const prefix = hasOnlyDocs
    ? "docs"
    : hasOnlyStyles
      ? "style"
      : hasOnlyTests
        ? "test"
        : hasFix
          ? "fix"
          : "feat";

  if (fileNames.length === 1) {
    return `${prefix}: update ${firstFile}`;
  } else if (fileNames.length <= 3) {
    return `${prefix}: update ${fileNames.join(", ")}`;
  } else {
    return `${prefix}: update ${firstFile} and ${fileNames.length - 1} other files`;
  }
}

/**
 * 1-Click Auto Commit & Push:
 * Stages all changes (git add .), creates an intelligent commit message, commits,
 * and pushes to the remote repository with upstream and non-fast-forward rebase handling.
 */
export async function pushToGithub(options: GitOperationOptions): Promise<boolean> {
  const { cwd, projectName, customCommitMessage } = options;

  // 1. Verify Git repository
  const gitCheck = await executeTerminalCommand("git rev-parse --is-inside-work-tree", cwd);
  if (!gitCheck.ok || gitCheck.stdout.trim() !== "true") {
    toastManager.add({
      type: "error",
      title: "Git not initialized",
      description: `Git is not initialized in "${projectName}". Please initialize Git first.`,
    });
    return false;
  }

  // 2. Identify Git remote
  let remoteName = "origin";
  const remoteCheck = await executeTerminalCommand("git remote get-url origin", cwd);
  if (!remoteCheck.ok || !remoteCheck.stdout.trim()) {
    const anyRemote = await executeTerminalCommand("git remote", cwd);
    const remotes = anyRemote.ok ? anyRemote.stdout.trim().split("\n").filter(Boolean) : [];
    if (remotes.length > 0) {
      remoteName = remotes[0]!;
    } else {
      toastManager.add({
        type: "error",
        title: "No Git Remote Found",
        description: `No remote repository found for "${projectName}". Please configure a Git remote (e.g. git remote add origin <url>).`,
      });
      return false;
    }
  }

  // 3. Resolve active branch
  const branchCheck = await executeTerminalCommand("git rev-parse --abbrev-ref HEAD", cwd);
  const currentBranch = branchCheck.ok ? branchCheck.stdout.trim() : "main";

  const progressToastId = toastManager.add({
    type: "info",
    title: "Pushing to GitHub...",
    description: `Checking changes for "${projectName}" on branch "${currentBranch}"...`,
  });

  try {
    // 4. Check for uncommitted working tree changes
    const statusCheck = await executeTerminalCommand("git status --porcelain", cwd);
    const statusOutput = statusCheck.ok ? statusCheck.stdout.trim() : "";

    if (statusOutput.length > 0) {
      // Stage all changes
      const addResult = await executeTerminalCommand("git add .", cwd);
      if (!addResult.ok) {
        toastManager.close(progressToastId);
        toastManager.add({
          type: "error",
          title: "Git Add Failed",
          description: addResult.stderr || "Failed to stage changes with git add .",
        });
        return false;
      }

      // Generate smart commit message
      const commitMsg = customCommitMessage?.trim() || generateSmartCommitMessage(statusOutput);

      let commitResult = await executeTerminalCommand(
        `git commit -m ${JSON.stringify(commitMsg)}`,
        cwd,
      );

      // Handle author identity missing
      if (
        !commitResult.ok &&
        (commitResult.stderr.includes("Please tell me who you are") ||
          commitResult.stdout.includes("Please tell me who you are") ||
          commitResult.stderr.includes("Author identity unknown"))
      ) {
        await executeTerminalCommand('git config user.name "AutoCode User"', cwd);
        await executeTerminalCommand('git config user.email "user@autocode.local"', cwd);
        commitResult = await executeTerminalCommand(
          `git commit -m ${JSON.stringify(commitMsg)}`,
          cwd,
        );
      }

      if (
        !commitResult.ok &&
        !commitResult.stdout.includes("nothing to commit") &&
        !commitResult.stderr.includes("nothing to commit")
      ) {
        toastManager.close(progressToastId);
        toastManager.add({
          type: "error",
          title: "Git Commit Failed",
          description: commitResult.stderr || commitResult.stdout || "Failed to commit changes.",
        });
        return false;
      }
    }

    // 5. Push to remote
    let pushResult = await executeTerminalCommand(`git push ${remoteName} ${currentBranch}`, cwd);
    if (!pushResult.ok) {
      if (
        pushResult.stderr.includes("no upstream branch") ||
        pushResult.stderr.includes("set-upstream") ||
        pushResult.stderr.includes("The current branch")
      ) {
        pushResult = await executeTerminalCommand(
          `git push -u ${remoteName} ${currentBranch}`,
          cwd,
        );
      } else if (
        pushResult.stderr.includes("fetch first") ||
        pushResult.stderr.includes("non-fast-forward") ||
        pushResult.stderr.includes("Updates were rejected")
      ) {
        // Automatically attempt git pull --rebase then push again
        const rebaseResult = await executeTerminalCommand(
          `git pull --rebase ${remoteName} ${currentBranch}`,
          cwd,
        );
        if (rebaseResult.ok) {
          pushResult = await executeTerminalCommand(`git push ${remoteName} ${currentBranch}`, cwd);
        } else {
          // Revert rebase if failed to avoid leaving dirty rebase state
          await executeTerminalCommand("git rebase --abort", cwd);
        }
      }
    }

    toastManager.close(progressToastId);

    if (pushResult.ok) {
      toastManager.add({
        type: "success",
        title: "Pushed to GitHub",
        description: `Successfully committed & pushed "${projectName}" to ${remoteName}/${currentBranch}.`,
      });
      return true;
    } else {
      let desc = pushResult.stderr || pushResult.error || "Failed to push to GitHub.";
      if (desc.includes("Permission denied") || desc.includes("Could not read from remote")) {
        desc += " Check your SSH key or GitHub credentials.";
      }
      toastManager.add({
        type: "error",
        title: "Git Push Failed",
        description: desc,
      });
      return false;
    }
  } catch (err) {
    toastManager.close(progressToastId);
    const errMsg = err instanceof Error ? err.message : String(err);
    toastManager.add({
      type: "error",
      title: "Push to GitHub Failed",
      description: errMsg,
    });
    return false;
  }
}

/**
 * Git Pull:
 * Pulls latest commits from remote, with fallback to tracking origin HEAD.
 */
export async function gitPull(cwd: string, projectName: string): Promise<boolean> {
  const gitCheck = await executeTerminalCommand("git rev-parse --is-inside-work-tree", cwd);
  if (!gitCheck.ok || gitCheck.stdout.trim() !== "true") {
    toastManager.add({
      type: "error",
      title: "Git not initialized",
      description: `Git is not initialized in "${projectName}".`,
    });
    return false;
  }

  const progressToastId = toastManager.add({
    type: "info",
    title: "Git Pull...",
    description: `Pulling latest changes for "${projectName}"...`,
  });

  try {
    let pullResult = await executeTerminalCommand("git pull", cwd);
    if (
      !pullResult.ok &&
      (pullResult.stderr.includes("no tracking information") ||
        pullResult.stderr.includes("set-upstream") ||
        pullResult.stderr.includes("There is no tracking information"))
    ) {
      pullResult = await executeTerminalCommand("git pull origin HEAD", cwd);
    }

    toastManager.close(progressToastId);

    if (pullResult.ok) {
      toastManager.add({
        type: "success",
        title: "Git Pull Successful",
        description: pullResult.stdout.trim() || `Pulled latest changes for "${projectName}".`,
      });
      return true;
    } else {
      let desc = pullResult.stderr || pullResult.error || "Failed to pull changes.";
      if (desc.includes("overwritten by merge")) {
        desc =
          "Local files me uncommitted changes hain jo overwrite ho sakti hain. Pehle 'Push to GitHub' karein ya 'Force Pull' karein.";
      }
      toastManager.add({
        type: "error",
        title: "Git Pull Failed",
        description: desc,
      });
      return false;
    }
  } catch (err) {
    toastManager.close(progressToastId);
    const errMsg = err instanceof Error ? err.message : String(err);
    toastManager.add({
      type: "error",
      title: "Git Pull Failed",
      description: errMsg,
    });
    return false;
  }
}

/**
 * Git Fetch:
 * Fetches all remote branches and tags with pruning.
 */
export async function gitFetch(cwd: string, projectName: string): Promise<boolean> {
  const gitCheck = await executeTerminalCommand("git rev-parse --is-inside-work-tree", cwd);
  if (!gitCheck.ok || gitCheck.stdout.trim() !== "true") {
    toastManager.add({
      type: "error",
      title: "Git not initialized",
      description: `Git is not initialized in "${projectName}".`,
    });
    return false;
  }

  const progressToastId = toastManager.add({
    type: "info",
    title: "Git Fetch...",
    description: `Fetching remote branches for "${projectName}"...`,
  });

  try {
    const fetchResult = await executeTerminalCommand("git fetch --all --prune", cwd);
    toastManager.close(progressToastId);

    if (fetchResult.ok) {
      toastManager.add({
        type: "success",
        title: "Git Fetch Successful",
        description:
          fetchResult.stdout.trim() || `Fetched all remote branches for "${projectName}".`,
      });
      return true;
    } else {
      toastManager.add({
        type: "error",
        title: "Git Fetch Failed",
        description: fetchResult.stderr || fetchResult.error || "Failed to fetch from remote.",
      });
      return false;
    }
  } catch (err) {
    toastManager.close(progressToastId);
    const errMsg = err instanceof Error ? err.message : String(err);
    toastManager.add({
      type: "error",
      title: "Git Fetch Failed",
      description: errMsg,
    });
    return false;
  }
}

/**
 * Force Pull (Reset Hard):
 * Resets local working tree and branch to match origin/<branch> exactly.
 */
export async function forcePull(cwd: string, projectName: string): Promise<boolean> {
  const gitCheck = await executeTerminalCommand("git rev-parse --is-inside-work-tree", cwd);
  if (!gitCheck.ok || gitCheck.stdout.trim() !== "true") {
    toastManager.add({
      type: "error",
      title: "Git not initialized",
      description: `Git is not initialized in "${projectName}".`,
    });
    return false;
  }

  const progressToastId = toastManager.add({
    type: "info",
    title: "Force Pull...",
    description: `Forcefully resetting "${projectName}" to remote origin...`,
  });

  try {
    const fetchResult = await executeTerminalCommand("git fetch --all", cwd);
    if (!fetchResult.ok) {
      toastManager.close(progressToastId);
      toastManager.add({
        type: "error",
        title: "Git Fetch Failed",
        description: fetchResult.stderr || "Failed to fetch from remote.",
      });
      return false;
    }

    const branchResult = await executeTerminalCommand("git rev-parse --abbrev-ref HEAD", cwd);
    const currentBranch = branchResult.ok ? branchResult.stdout.trim() : "main";

    const resetResult = await executeTerminalCommand(
      `git reset --hard origin/${currentBranch}`,
      cwd,
    );
    toastManager.close(progressToastId);

    if (resetResult.ok) {
      toastManager.add({
        type: "success",
        title: "Force Pull Completed",
        description: `Reset branch "${currentBranch}" to origin/${currentBranch}.`,
      });
      return true;
    } else {
      toastManager.add({
        type: "error",
        title: "Force Pull Failed",
        description: resetResult.stderr || resetResult.error || "Failed to reset to remote branch.",
      });
      return false;
    }
  } catch (err) {
    toastManager.close(progressToastId);
    const errMsg = err instanceof Error ? err.message : String(err);
    toastManager.add({
      type: "error",
      title: "Force Pull Failed",
      description: errMsg,
    });
    return false;
  }
}
