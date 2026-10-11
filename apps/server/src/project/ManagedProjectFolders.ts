/**
 * ManagedProjectFolders - the project folders T3 Code makes for the user under
 * its data dir, rather than ones the user picks:
 *
 * - `<baseDir>/scratch`: the Scratch project ("No project"), with a folder of
 *   its own for each thread;
 * - `<baseDir>/projects/<slug>`: projects started from just a name, each a new
 *   Git repository with a README, an icon, and a first commit.
 *
 * @module ManagedProjectFolders
 */
import { CommandId, ProjectId, type ThreadId, type ProjectUploadedFile } from "@t3tools/contracts";
import { newProjectFolderName } from "@t3tools/shared/path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as Cause from "effect/Cause";
import * as Context from "effect/Context";
import * as Crypto from "effect/Crypto";
import * as DateTime from "effect/DateTime";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as PlatformError from "effect/PlatformError";
import * as Schema from "effect/Schema";

import * as ServerConfig from "../config.ts";
import * as GitWorkflow from "../git/GitWorkflowService.ts";
import * as GitVcsDriver from "../vcs/GitVcsDriver.ts";
import * as ProjectService from "./ProjectService.ts";

export class ScratchUnavailableError extends Schema.TaggedError<ScratchUnavailableError>()(
  "ScratchUnavailableError",
  {},
) {
  override get message(): string {
    return "Threads without a project are not available on this environment.";
  }
}

export class ScratchFolderError extends Schema.TaggedError<ScratchFolderError>()(
  "ScratchFolderError",
  {
    folder: Schema.String,
    cause: Schema.Defect(),
  },
) {
  override get message(): string {
    return "Failed to create the folder for threads without a project.";
  }
}

export class ScratchProjectError extends Schema.TaggedError<ScratchProjectError>()(
  "ScratchProjectError",
  {
    workspaceRoot: Schema.String,
    cause: Schema.Defect(),
  },
) {
  override get message(): string {
    return "Failed to create the project for threads without a project.";
  }
}

export type ScratchError = ScratchUnavailableError | ScratchFolderError | ScratchProjectError;

export class NamedProjectFolderError extends Schema.TaggedError<NamedProjectFolderError>()(
  "NamedProjectFolderError",
  {
    folder: Schema.String,
    cause: Schema.Defect(),
  },
) {
  override get message(): string {
    return "Failed to create the project folder.";
  }
}

export class NamedProjectCreateError extends Schema.TaggedError<NamedProjectCreateError>()(
  "NamedProjectCreateError",
  {
    workspaceRoot: Schema.String,
    cause: Schema.Defect(),
  },
) {
  override get message(): string {
    return "Failed to create the project.";
  }
}

export type NamedProjectError = NamedProjectFolderError | NamedProjectCreateError;

export class ManagedProjectFolders extends Context.Service<
  ManagedProjectFolders,
  {
    /** The Scratch folder, or None when this environment does not offer one. */
    readonly scratchRoot: Effect.Effect<Option.Option<string>>;
    /** Finds or creates the Scratch project and (re)creates its folder. */
    readonly ensureScratchProject: Effect.Effect<{ readonly projectId: ProjectId }, ScratchError>;
    /**
     * Claims a fresh folder for a new thread in the Scratch project, named from
     * the date, its first message, and its id. None for every other project.
     */
    readonly folderForThread: (input: {
      readonly projectId: ProjectId;
      readonly threadId: ThreadId;
      readonly text: string;
    }) => Effect.Effect<Option.Option<string>, ScratchFolderError>;
    /** The folder that holds projects started from just a name. */
    readonly namedProjectsRoot: string;
    /**
     * Starts a project from just a name: claims `<namedProjectsRoot>/<slug>`
     * (adding `-2`, `-3`, ... when taken), makes it a Git repository with a
     * README, an icon, and a first commit, then creates the project. A failed
     * commit (no Git identity, a signing prompt) keeps the project and returns
     * why in `commitError`. The folder is removed when the create fails or is
     * cancelled before the project exists, never once another project owns it.
     */
    readonly createNamedProject: (input: {
      readonly name: string;
      readonly template?: string | undefined;
    }) => Effect.Effect<
      {
        readonly projectId: ProjectId;
        readonly workspaceRoot: string;
        readonly commitError?: string;
      },
      NamedProjectError
    >;
    readonly importUploadedProject: (input: {
      readonly name: string;
      readonly files: ReadonlyArray<ProjectUploadedFile>;
    }) => Effect.Effect<
      {
        readonly projectId: ProjectId;
        readonly workspaceRoot: string;
        readonly commitError?: string;
      },
      NamedProjectError
    >;
    readonly importZipProject: (input: {
      readonly name: string;
      readonly zipBase64: string;
    }) => Effect.Effect<
      {
        readonly projectId: ProjectId;
        readonly workspaceRoot: string;
        readonly commitError?: string;
      },
      NamedProjectError
    >;
  }
>()("t3/project/ManagedProjectFolders") {}

// Only [a-z0-9] reaches a folder name, so it stays one path segment, and the
// words are capped so a pasted blob cannot outgrow a file name.
const folderWords = (text: string) =>
  text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .slice(0, 5)
    .join("-")
    .slice(0, 48)
    .replace(/-+$/, "");

// Tailwind 600 shades: dark enough for white initials on every hue.
const ICON_BACKGROUNDS = [
  "#dc2626",
  "#ea580c",
  "#d97706",
  "#16a34a",
  "#059669",
  "#0d9488",
  "#0891b2",
  "#0284c7",
  "#2563eb",
  "#4f46e5",
  "#7c3aed",
  "#9333ea",
  "#c026d3",
  "#db2777",
  "#e11d48",
] as const;

const MAX_NAMED_FOLDER_ATTEMPTS = 100;

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/**
 * A rounded square with the name's initials, colored by a hash of the name.
 * It lives at `assets/icon.svg`, a path ProjectFaviconResolver already checks,
 * so every machine that clones the project shows the same icon.
 */
function namedProjectIconSvg(name: string): string {
  const words = name.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const initials =
    words
      .slice(0, 2)
      .map((word) => Array.from(word)[0] ?? "")
      .join("")
      .toUpperCase() ||
    Array.from(name.trim())[0] ||
    "?";
  let hash = 0;
  for (const char of name) hash = (hash * 31 + (char.codePointAt(0) ?? 0)) >>> 0;
  const background = ICON_BACKGROUNDS[hash % ICON_BACKGROUNDS.length];
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">`,
    `  <rect width="64" height="64" rx="14" fill="${background}"/>`,
    `  <text x="32" y="32" dy="0.35em" text-anchor="middle" font-family="ui-sans-serif, system-ui, -apple-system, sans-serif" font-size="${initials.length > 1 ? 26 : 32}" font-weight="600" fill="#ffffff">${escapeXml(initials)}</text>`,
    `</svg>`,
    "",
  ].join("\n");
}

function namedProjectReadme(name: string): string {
  return [
    `<img src="assets/icon.svg" width="64" height="64" alt="">`,
    "",
    `# ${name}`,
    "",
    "Created in [T3 Code](https://t3.codes).",
    "",
  ].join("\n");
}

// Git's own identity message runs several lines; say what to do instead.
// Otherwise its last line ("error: gpg failed to sign the data") says enough.
function describeCommitFailure(stderr: string): string {
  if (/identity unknown|tell me who you are|no (name|email) was given/i.test(stderr)) {
    return "Git has no name or email on this machine. Set user.name and user.email, then commit.";
  }
  const lines = stderr
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.at(-1) ?? "Git could not make the first commit.";
}

const make = Effect.gen(function* () {
  const config = yield* ServerConfig.ServerConfig;
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const gitWorkflow = yield* GitWorkflow.GitWorkflowService;
  const git = yield* GitVcsDriver.GitVcsDriver;
  const projects = yield* ProjectService.ProjectService;
  const crypto = yield* Crypto.Crypto;

  /**
   * Claims the first free folder among `folderFor(1)`, `folderFor(2)`, ...,
   * stopping with None when `folderFor` runs out of names. Each folder is
   * created without `recursive`, so creating it is the claim: of two racers
   * for one name, one gets AlreadyExists and moves on to the next. Scratch
   * thread folders and named projects both claim through this, so no two
   * threads or projects ever share a folder.
   */
  const claimFreeFolder = Effect.fnUntraced(function* <E>(
    folderFor: (attempt: number) => Effect.Effect<Option.Option<string>, E>,
    onError: (folder: string, cause: PlatformError.PlatformError) => E,
  ) {
    for (let attempt = 1; ; attempt++) {
      const folder = yield* folderFor(attempt);
      if (Option.isNone(folder)) return folder;
      const claimed = yield* fileSystem.makeDirectory(folder.value).pipe(
        Effect.as(true),
        Effect.catchIf(
          (error) => error.reason._tag === "AlreadyExists",
          () => Effect.succeed(false),
        ),
        Effect.mapError((cause) => onError(folder.value, cause)),
      );
      if (claimed) return folder;
    }
  });

  // Inside a checkout (a dev worktree's .t3, a dotfiles home) the folder would
  // inherit the repo's git status and checkpoints, so Scratch is offered only
  // when the data dir is outside any work tree. Probed once; detection
  // failures hide Scratch rather than failing callers. An interrupted probe
  // invalidates the cache so the next caller probes again.
  const [probe, invalidate] = yield* Effect.cachedInvalidateWithTTL(
    gitWorkflow.isRepository(config.baseDir).pipe(
      Effect.map((isRepository) =>
        isRepository ? Option.none<string>() : Option.some(path.resolve(config.baseDir, "scratch")),
      ),
      Effect.catchCause((cause) =>
        Cause.hasInterrupts(cause) ? Effect.interrupt : Effect.succeed(Option.none<string>()),
      ),
    ),
    Duration.infinity,
  );
  const scratchRoot = probe.pipe(Effect.onInterrupt(() => invalidate));

  const makeScratchFolder = (folder: string) =>
    fileSystem
      .makeDirectory(folder, { recursive: true })
      .pipe(Effect.mapError((cause) => new ScratchFolderError({ folder, cause })));

  const ensureScratchProject: ManagedProjectFolders["Service"]["ensureScratchProject"] = Effect.gen(
    function* () {
      const workspaceRoot = yield* scratchRoot.pipe(
        Effect.flatMap(
          Option.match({
            onNone: () => Effect.fail(new ScratchUnavailableError()),
            onSome: Effect.succeed,
          }),
        ),
      );
      // Re-made on every call, so a deleted Scratch folder still runs threads.
      yield* makeScratchFolder(workspaceRoot);
      const id = yield* crypto.randomUUIDv4.pipe(
        Effect.mapError((cause) => new ScratchProjectError({ workspaceRoot, cause })),
      );
      const bootstrapped = yield* projects
        .bootstrap({
          commandId: CommandId.make(`scratch-project:${id}`),
          projectId: ProjectId.make(id),
          title: "No project",
          workspaceRoot,
        })
        .pipe(
          // bootstrap looks the root up before taking the workspace lock, so a
          // racing create loses with a conflict that names the winner.
          Effect.catchTags({
            ProjectConflictError: (conflict) =>
              Effect.succeed({
                project: { id: conflict.conflictingProjectId },
                created: false,
              }),
          }),
          Effect.mapError((cause) => new ScratchProjectError({ workspaceRoot, cause })),
        );
      if (bootstrapped.created) {
        // A dashed chat bubble in neutral gray marks Scratch. Set once at
        // create, so a user's own icon choice is never overwritten.
        yield* projects
          .update({
            commandId: CommandId.make(`scratch-project-icon:${id}`),
            projectId: bootstrapped.project.id,
            projectIcon: { kind: "lucide", name: "message-square-dashed", color: "gray" },
          })
          .pipe(Effect.mapError((cause) => new ScratchProjectError({ workspaceRoot, cause })));
      }
      return { projectId: bootstrapped.project.id };
    },
  );

  const isScratchProject = (projectId: ProjectId, root: string) =>
    projects.getById(projectId).pipe(
      Effect.map(
        Option.exists((project) => path.resolve(project.workspaceRoot) === path.resolve(root)),
      ),
      // An unreadable project is not Scratch; the launch reports its own
      // project lookup failure.
      Effect.orElseSucceed(() => false),
    );

  const folderForThread: ManagedProjectFolders["Service"]["folderForThread"] = Effect.fn(
    "ManagedProjectFolders.folderForThread",
  )(function* (input) {
    const root = yield* scratchRoot;
    if (Option.isNone(root)) return Option.none();
    if (!(yield* isScratchProject(input.projectId, root.value))) return Option.none();
    const date = DateTime.formatIso(yield* DateTime.now).slice(0, 10);
    const words = folderWords(input.text);
    const id = input.threadId.toLowerCase().replace(/[^a-z0-9]/g, "");
    const folderFor = (idPart: string) =>
      path.join(root.value, [date, words, idPart].filter(Boolean).join("-"));
    yield* makeScratchFolder(root.value);
    const fullFolder = folderFor(id);
    // Thread ids often share a prefix ("thread:..."), so the first name uses
    // the id's tail. A taken short name falls back to the full id, which only
    // this thread holds. Ids that normalize alike, or a launch retried without
    // its receipt, can find the full name taken too, so later attempts add a
    // fresh random suffix; the names never run out.
    return yield* claimFreeFolder(
      (attempt) =>
        attempt === 1
          ? Effect.succeed(Option.some(folderFor(id.slice(-8))))
          : attempt === 2
            ? Effect.succeed(Option.some(fullFolder))
            : crypto.randomUUIDv4.pipe(
                Effect.map((uuid) => Option.some(`${fullFolder}-${uuid.slice(0, 8)}`)),
                Effect.mapError((cause) => new ScratchFolderError({ folder: fullFolder, cause })),
              ),
      (folder, cause) => new ScratchFolderError({ folder, cause }),
    );
  });

  // Projects started from just a name live beside Scratch and worktrees, away
  // from folders the user organizes by hand. A nested repository is fine here
  // (unlike Scratch) because each project gets its own `git init`.
  const procEnv = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
    ?.env;
  const namedProjectsRoot = procEnv?.T3CODE_PROJECTS_DIR
    ? path.resolve(procEnv.T3CODE_PROJECTS_DIR)
    : procEnv?.WORKSPACE_DIR
      ? path.resolve(procEnv.WORKSPACE_DIR)
      : path.resolve(config.baseDir, "projects");

  const claimNamedFolder = Effect.fn("ManagedProjectFolders.claimNamedFolder")(function* (
    name: string,
  ) {
    yield* fileSystem
      .makeDirectory(namedProjectsRoot, { recursive: true })
      .pipe(
        Effect.mapError(
          (cause) => new NamedProjectFolderError({ folder: namedProjectsRoot, cause }),
        ),
      );
    const folderName = newProjectFolderName(name) || "project";
    const claimed = yield* claimFreeFolder(
      (attempt) =>
        Effect.succeed(
          attempt > MAX_NAMED_FOLDER_ATTEMPTS
            ? Option.none()
            : Option.some(
                path.join(
                  namedProjectsRoot,
                  attempt === 1 ? folderName : `${folderName}-${attempt}`,
                ),
              ),
        ),
      (folder, cause) => new NamedProjectFolderError({ folder, cause }),
    );
    if (Option.isSome(claimed)) return claimed.value;
    return yield* new NamedProjectFolderError({
      folder: path.join(namedProjectsRoot, folderName),
      cause: `Every folder name for "${folderName}" is taken.`,
    });
  });

  // git init, the starter files, and the first commit. Only the commit may
  // fail softly; everything before it fails the create.
  const scaffoldRepository = Effect.fn("ManagedProjectFolders.scaffoldRepository")(function* (
    cwd: string,
    name: string,
    template?: string | undefined,
  ) {
    const branch =
      (yield* git
        .readConfigValue(cwd, "init.defaultBranch")
        .pipe(Effect.orElseSucceed(() => null))) ?? "main";
    yield* git.execute({
      operation: "ManagedProjectFolders.init",
      cwd,
      args: ["init", `--initial-branch=${branch}`],
      timeoutMs: 10_000,
    });

    if (template === "react") {
      const slug = name.toLowerCase().replace(/[^a-z0-9_-]/g, "-") || "react-app";
      yield* fileSystem.writeFileString(
        path.join(cwd, "package.json"),
        JSON.stringify(
          {
            name: slug,
            private: true,
            version: "0.1.0",
            type: "module",
            scripts: {
              dev: "vite",
              build: "vite build",
              preview: "vite preview",
            },
            dependencies: {
              react: "^19.0.0",
              "react-dom": "^19.0.0",
            },
            devDependencies: {
              "@vitejs/plugin-react": "^4.3.4",
              vite: "^6.0.0",
            },
          },
          null,
          2,
        ),
      );
      yield* fileSystem.writeFileString(
        path.join(cwd, "index.html"),
        `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${name}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>\n`,
      );
      yield* fileSystem.writeFileString(
        path.join(cwd, "vite.config.js"),
        `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
});\n`,
      );
      const srcDir = path.join(cwd, "src");
      yield* fileSystem.makeDirectory(srcDir, { recursive: true });
      yield* fileSystem.writeFileString(
        path.join(srcDir, "main.jsx"),
        `import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);\n`,
      );
      yield* fileSystem.writeFileString(
        path.join(srcDir, "App.jsx"),
        `import React, { useState } from 'react';

export default function App() {
  const [count, setCount] = useState(0);

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', padding: '3rem', textAlign: 'center' }}>
      <h1>Welcome to ${name}</h1>
      <p style={{ color: '#94a3b8' }}>Built with React + Vite & Autodesk Code AI</p>
      <div style={{ marginTop: '2rem' }}>
        <button
          onClick={() => setCount((c) => c + 1)}
          style={{
            padding: '0.6rem 1.4rem',
            borderRadius: '8px',
            border: 'none',
            background: '#3b82f6',
            color: '#fff',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Count is {count}
        </button>
      </div>
    </div>
  );
}\n`,
      );
      yield* fileSystem.writeFileString(
        path.join(srcDir, "index.css"),
        `body {
  margin: 0;
  background-color: #0f172a;
  color: #f8fafc;
}\n`,
      );
      yield* fileSystem.writeFileString(
        path.join(cwd, ".gitignore"),
        `node_modules/\ndist/\n.env\n.env.local\n`,
      );
      yield* fileSystem.writeFileString(
        path.join(cwd, "README.md"),
        `# ${name}\n\nReact + Vite project initialized with Autodesk Code (ADC).\n\n## Getting Started\n\`\`\`bash\nnpm install\nnpm run dev\n\`\`\`\n`,
      );
    } else if (template === "nextjs") {
      const slug = name.toLowerCase().replace(/[^a-z0-9_-]/g, "-") || "nextjs-app";
      yield* fileSystem.writeFileString(
        path.join(cwd, "package.json"),
        JSON.stringify(
          {
            name: slug,
            private: true,
            version: "0.1.0",
            scripts: {
              dev: "next dev",
              build: "next build",
              start: "next start",
            },
            dependencies: {
              next: "^15.0.0",
              react: "^19.0.0",
              "react-dom": "^19.0.0",
            },
          },
          null,
          2,
        ),
      );
      const appDir = path.join(cwd, "app");
      yield* fileSystem.makeDirectory(appDir, { recursive: true });
      yield* fileSystem.writeFileString(
        path.join(appDir, "layout.jsx"),
        `export const metadata = {
  title: "${name}",
  description: "Created with Autodesk Code (ADC) AI",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif', background: '#0b0f19', color: '#f1f5f9' }}>
        {children}
      </body>
    </html>
  );
}\n`,
      );
      yield* fileSystem.writeFileString(
        path.join(appDir, "page.jsx"),
        `export default function HomePage() {
  return (
    <main style={{ padding: '3rem', textAlign: 'center' }}>
      <h1>${name}</h1>
      <p style={{ color: '#94a3b8' }}>Next.js starter ready for fullstack AI development.</p>
    </main>
  );
}\n`,
      );
      yield* fileSystem.writeFileString(
        path.join(cwd, ".gitignore"),
        `node_modules/\n.next/\nout/\n.env*.local\n`,
      );
      yield* fileSystem.writeFileString(
        path.join(cwd, "README.md"),
        `# ${name}\n\nNext.js project initialized with Autodesk Code (ADC).\n\n\`\`\`bash\nnpm install\nnpm run dev\n\`\`\`\n`,
      );
    } else if (template === "node") {
      const slug = name.toLowerCase().replace(/[^a-z0-9_-]/g, "-") || "node-app";
      yield* fileSystem.writeFileString(
        path.join(cwd, "package.json"),
        JSON.stringify(
          {
            name: slug,
            private: true,
            version: "0.1.0",
            type: "module",
            scripts: {
              start: "node index.js",
              dev: "node --watch index.js",
            },
            dependencies: {
              express: "^4.21.0",
            },
          },
          null,
          2,
        ),
      );
      yield* fileSystem.writeFileString(
        path.join(cwd, "index.js"),
        `import express from "express";

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

app.get("/", (req, res) => {
  res.json({ message: "Hello from ${name} API!", time: new Date().toISOString() });
});

app.listen(port, () => {
  console.log(\`Server running at http://localhost:\${port}\`);
});\n`,
      );
      yield* fileSystem.writeFileString(path.join(cwd, ".gitignore"), `node_modules/\n.env\n`);
      yield* fileSystem.writeFileString(
        path.join(cwd, "README.md"),
        `# ${name}\n\nNode.js API project initialized with Autodesk Code (ADC).\n\n\`\`\`bash\nnpm install\nnpm run dev\n\`\`\`\n`,
      );
    } else if (template === "python") {
      yield* fileSystem.writeFileString(
        path.join(cwd, "main.py"),
        `"""${name} - Python Application"""

def main():
    print("Welcome to ${name}!")

if __name__ == "__main__":
    main()
\n`,
      );
      yield* fileSystem.writeFileString(
        path.join(cwd, "requirements.txt"),
        `# Add your dependencies here\n`,
      );
      yield* fileSystem.writeFileString(
        path.join(cwd, ".gitignore"),
        `__pycache__/\n*.pyc\nvenv/\n.venv/\n.env\n`,
      );
      yield* fileSystem.writeFileString(
        path.join(cwd, "README.md"),
        `# ${name}\n\nPython project initialized with Autodesk Code (ADC).\n\n\`\`\`bash\npython main.py\n\`\`\`\n`,
      );
    } else if (template === "php") {
      yield* fileSystem.writeFileString(
        path.join(cwd, "index.php"),
        `<?php
/**
 * ${name} - PHP Application
 */
header('Content-Type: text/html; charset=utf-8');
?>
<!DOCTYPE html>
<html>
<head>
    <title>${name}</title>
    <style>body { font-family: sans-serif; padding: 2rem; background: #0f172a; color: #f8fafc; text-align: center; }</style>
</head>
<body>
    <h1><?= htmlspecialchars("${name}") ?></h1>
    <p>PHP Application initialized with Autodesk Code (ADC).</p>
</body>
</html>\n`,
      );
      yield* fileSystem.writeFileString(path.join(cwd, ".gitignore"), `vendor/\n.env\n`);
      yield* fileSystem.writeFileString(
        path.join(cwd, "README.md"),
        `# ${name}\n\nPHP project initialized with Autodesk Code (ADC).\n\n\`\`\`bash\nphp -S localhost:8000\n\`\`\`\n`,
      );
    } else {
      yield* fileSystem.writeFileString(path.join(cwd, "README.md"), namedProjectReadme(name));
      yield* fileSystem.makeDirectory(path.join(cwd, "assets"));
      yield* fileSystem.writeFileString(
        path.join(cwd, "assets", "icon.svg"),
        namedProjectIconSvg(name),
      );
      yield* fileSystem.writeFileString(
        path.join(cwd, ".gitignore"),
        `node_modules/\n.env\n.DS_Store\n`,
      );
    }

    yield* git.execute({
      operation: "ManagedProjectFolders.add",
      cwd,
      args: ["add", "-A"],
      timeoutMs: 15_000,
    });
    return yield* git
      .execute({
        operation: "ManagedProjectFolders.commit",
        cwd,
        args: ["commit", "--message", `Initial commit for ${name}`],
        allowNonZeroExit: true,
        timeoutMs: 30_000,
      })
      .pipe(
        Effect.map((result) =>
          result.exitCode === 0 ? undefined : describeCommitFailure(result.stderr),
        ),
        Effect.catch((error) => Effect.succeed(error.message)),
      );
  });

  const createNamedProject: ManagedProjectFolders["Service"]["createNamedProject"] = Effect.fn(
    "ManagedProjectFolders.createNamedProject",
  )(function* (input) {
    const workspaceRoot = yield* claimNamedFolder(input.name);
    const removeFolder = fileSystem.remove(workspaceRoot, { recursive: true }).pipe(Effect.ignore);
    // Until the create is dispatched nothing else can use the folder, so any
    // exit but success removes it, an interrupt included.
    const prepared = yield* Effect.all([
      scaffoldRepository(workspaceRoot, input.name, input.template).pipe(
        Effect.mapError((cause) => new NamedProjectFolderError({ folder: workspaceRoot, cause })),
      ),
      crypto.randomUUIDv4.pipe(
        Effect.mapError((cause) => new NamedProjectCreateError({ workspaceRoot, cause })),
      ),
    ]).pipe(Effect.onExit((exit) => (Exit.isSuccess(exit) ? Effect.void : removeFolder)));
    const [commitError, id] = prepared;
    const project = yield* projects
      .create({
        commandId: CommandId.make(`named-project:${id}`),
        projectId: ProjectId.make(id),
        title: input.name,
        workspaceRoot,
      })
      .pipe(
        // A rejected create leaves the folder unused, so remove it. An
        // interrupt can land after the create is committed, and a conflict
        // means another project owns the folder, so it stays then; the owner
        // is checked again first, since deleting another project's files is
        // never acceptable.
        Effect.tapError((error) =>
          error._tag === "ProjectConflictError"
            ? Effect.void
            : projects.getByWorkspaceRoot(workspaceRoot).pipe(
                Effect.flatMap((owner) => (Option.isNone(owner) ? removeFolder : Effect.void)),
                Effect.ignore,
              ),
        ),
        Effect.mapError((cause) => new NamedProjectCreateError({ workspaceRoot, cause })),
      );
    return {
      projectId: project.id,
      workspaceRoot,
      ...(commitError === undefined ? {} : { commitError }),
    };
  });

  const importUploadedProject: ManagedProjectFolders["Service"]["importUploadedProject"] =
    Effect.fn("ManagedProjectFolders.importUploadedProject")(function* (input) {
      const workspaceRoot = yield* claimNamedFolder(input.name);
      const removeFolder = fileSystem
        .remove(workspaceRoot, { recursive: true })
        .pipe(Effect.ignore);

      for (const file of input.files) {
        const rel = file.relativePath.replace(/^(\.\.[\/\\])+/, "").trim();
        if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) continue;
        const targetPath = path.resolve(workspaceRoot, rel);
        if (!targetPath.startsWith(workspaceRoot)) continue;

        const parentDir = path.dirname(targetPath);
        yield* fileSystem
          .makeDirectory(parentDir, { recursive: true })
          .pipe(
            Effect.mapError((cause) => new NamedProjectFolderError({ folder: parentDir, cause })),
          );
        if (file.encoding === "base64") {
          const buffer = Buffer.from(file.content, "base64");
          yield* fileSystem
            .writeFile(targetPath, buffer)
            .pipe(
              Effect.mapError(
                (cause) => new NamedProjectFolderError({ folder: targetPath, cause }),
              ),
            );
        } else {
          yield* fileSystem
            .writeFileString(targetPath, file.content)
            .pipe(
              Effect.mapError(
                (cause) => new NamedProjectFolderError({ folder: targetPath, cause }),
              ),
            );
        }
      }

      const branch =
        (yield* git
          .readConfigValue(workspaceRoot, "init.defaultBranch")
          .pipe(Effect.orElseSucceed(() => null))) ?? "main";
      yield* git
        .execute({
          operation: "ManagedProjectFolders.init",
          cwd: workspaceRoot,
          args: ["init", `--initial-branch=${branch}`],
          timeoutMs: 10_000,
        })
        .pipe(
          Effect.mapError((cause) => new NamedProjectFolderError({ folder: workspaceRoot, cause })),
        );
      yield* git
        .execute({
          operation: "ManagedProjectFolders.add",
          cwd: workspaceRoot,
          args: ["add", "-A"],
          timeoutMs: 30_000,
        })
        .pipe(
          Effect.mapError((cause) => new NamedProjectFolderError({ folder: workspaceRoot, cause })),
        );
      const commitError = yield* git
        .execute({
          operation: "ManagedProjectFolders.commit",
          cwd: workspaceRoot,
          args: ["commit", "--message", "Initial commit from imported project"],
          allowNonZeroExit: true,
          timeoutMs: 30_000,
        })
        .pipe(
          Effect.map((result) =>
            result.exitCode === 0 ? undefined : describeCommitFailure(result.stderr),
          ),
          Effect.catch((error) => Effect.succeed(error.message)),
        );

      const id = yield* crypto.randomUUIDv4.pipe(
        Effect.mapError((cause) => new NamedProjectCreateError({ workspaceRoot, cause })),
      );

      const project = yield* projects
        .create({
          commandId: CommandId.make(`imported-project:${id}`),
          projectId: ProjectId.make(id),
          title: input.name,
          workspaceRoot,
        })
        .pipe(
          Effect.tapError((error) =>
            error._tag === "ProjectConflictError"
              ? Effect.void
              : projects.getByWorkspaceRoot(workspaceRoot).pipe(
                  Effect.flatMap((owner) => (Option.isNone(owner) ? removeFolder : Effect.void)),
                  Effect.ignore,
                ),
          ),
          Effect.mapError((cause) => new NamedProjectCreateError({ workspaceRoot, cause })),
        );

      return {
        projectId: project.id,
        workspaceRoot,
        ...(commitError === undefined ? {} : { commitError }),
      };
    });

  const importZipProject: ManagedProjectFolders["Service"]["importZipProject"] = Effect.fn(
    "ManagedProjectFolders.importZipProject",
  )(function* (input) {
    const workspaceRoot = yield* claimNamedFolder(input.name);
    const removeFolder = fileSystem.remove(workspaceRoot, { recursive: true }).pipe(Effect.ignore);

    const tempZipFile = path.join(workspaceRoot, "__temp_upload.zip");
    const zipBuffer = Buffer.from(input.zipBase64, "base64");
    yield* fileSystem
      .writeFile(tempZipFile, zipBuffer)
      .pipe(
        Effect.mapError((cause) => new NamedProjectFolderError({ folder: tempZipFile, cause })),
      );

    // Unzip excluding node_modules, .git, and common build artifacts
    yield* Effect.tryPromise({
      try: () => {
        const execAsync = promisify(execFile);
        return execAsync("unzip", [
          "-q",
          "-o",
          tempZipFile,
          "-d",
          workspaceRoot,
          "-x",
          "*/node_modules/*",
          "*/.git/*",
          "*/dist/*",
          "*/.next/*",
          "*/build/*",
          "*/.cache/*",
        ]);
      },
      catch: (cause) => cause,
    }).pipe(Effect.ignore);

    // Remove the temporary zip
    yield* fileSystem.remove(tempZipFile).pipe(Effect.ignore);

    // If all extracted files were nested under a single top-level directory, flatten them
    const rootChildren = yield* fileSystem
      .readDirectory(workspaceRoot)
      .pipe(Effect.orElseSucceed(() => []));
    if (rootChildren.length === 1) {
      const singleDir = path.join(workspaceRoot, rootChildren[0]!);
      const isDir = yield* fileSystem
        .isDirectory(singleDir)
        .pipe(Effect.orElseSucceed(() => false));
      if (isDir) {
        const subItems = yield* fileSystem
          .readDirectory(singleDir)
          .pipe(Effect.orElseSucceed(() => []));
        for (const item of subItems) {
          const from = path.join(singleDir, item);
          const to = path.join(workspaceRoot, item);
          yield* fileSystem.move(from, to).pipe(Effect.ignore);
        }
        yield* fileSystem.remove(singleDir, { recursive: true }).pipe(Effect.ignore);
      }
    }

    const branch =
      (yield* git
        .readConfigValue(workspaceRoot, "init.defaultBranch")
        .pipe(Effect.orElseSucceed(() => null))) ?? "main";
    yield* git
      .execute({
        operation: "ManagedProjectFolders.init",
        cwd: workspaceRoot,
        args: ["init", `--initial-branch=${branch}`],
        timeoutMs: 10_000,
      })
      .pipe(
        Effect.mapError((cause) => new NamedProjectFolderError({ folder: workspaceRoot, cause })),
      );
    yield* git
      .execute({
        operation: "ManagedProjectFolders.add",
        cwd: workspaceRoot,
        args: ["add", "-A"],
        timeoutMs: 30_000,
      })
      .pipe(
        Effect.mapError((cause) => new NamedProjectFolderError({ folder: workspaceRoot, cause })),
      );
    const commitError = yield* git
      .execute({
        operation: "ManagedProjectFolders.commit",
        cwd: workspaceRoot,
        args: ["commit", "--message", "Initial commit from imported ZIP"],
        allowNonZeroExit: true,
        timeoutMs: 30_000,
      })
      .pipe(
        Effect.map((result) =>
          result.exitCode === 0 ? undefined : describeCommitFailure(result.stderr),
        ),
        Effect.catch((error) => Effect.succeed(error.message)),
      );

    const id = yield* crypto.randomUUIDv4.pipe(
      Effect.mapError((cause) => new NamedProjectCreateError({ workspaceRoot, cause })),
    );

    const project = yield* projects
      .create({
        commandId: CommandId.make(`imported-zip-project:${id}`),
        projectId: ProjectId.make(id),
        title: input.name,
        workspaceRoot,
      })
      .pipe(
        Effect.tapError((error) =>
          error._tag === "ProjectConflictError"
            ? Effect.void
            : projects.getByWorkspaceRoot(workspaceRoot).pipe(
                Effect.flatMap((owner) => (Option.isNone(owner) ? removeFolder : Effect.void)),
                Effect.ignore,
              ),
        ),
        Effect.mapError((cause) => new NamedProjectCreateError({ workspaceRoot, cause })),
      );

    return {
      projectId: project.id,
      workspaceRoot,
      ...(commitError === undefined ? {} : { commitError }),
    };
  });

  return ManagedProjectFolders.of({
    scratchRoot,
    ensureScratchProject,
    folderForThread,
    namedProjectsRoot,
    createNamedProject,
    importUploadedProject,
    importZipProject,
  });
});

export const layer = Layer.effect(ManagedProjectFolders, make);
