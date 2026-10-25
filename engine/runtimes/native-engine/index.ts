import { readProjectFile, writeProjectFile, editProjectFile, listProjectFiles } from "./fileTools";
import { executeBash } from "./bashTool";
import { computeUnifiedDiff } from "./diffEngine";

export class NativeCodingEngine {
  readonly name = "native-engine";
  readonly type = "standalone-runtime";

  async readFile(projectDir: string, relativePath: string) {
    return await readProjectFile(projectDir, relativePath);
  }

  async writeFile(projectDir: string, relativePath: string, content: string) {
    return await writeProjectFile(projectDir, relativePath, content);
  }

  async editFile(projectDir: string, relativePath: string, target: string, replacement: string) {
    return await editProjectFile(projectDir, relativePath, target, replacement);
  }

  async listFiles(projectDir: string) {
    return await listProjectFiles(projectDir);
  }

  async runBash(command: string, projectDir: string) {
    return await executeBash(command, projectDir);
  }

  diff(oldText: string, newText: string, filePath?: string) {
    return computeUnifiedDiff(oldText, newText, filePath);
  }
}

export const nativeCodingEngine = new NativeCodingEngine();
