// @effect-diagnostics nodeBuiltinImport:off globalConsole:off
/**
 * Repo-root shim for the skills manager.
 *
 * The Skills settings page shells out to `node --experimental-strip-types
 * scripts/skills-manager.ts <command>`. The server runs with the repo root as
 * its cwd, so this shim forwards straight to the real implementation at
 * `apps/server/scripts/skills-manager.ts` (which is what the agents and the
 * engine read anyway). It exists so the relative path the web app uses is
 * valid from the repository root; keep the real logic there, not here.
 */
import "../apps/server/scripts/skills-manager.ts";
