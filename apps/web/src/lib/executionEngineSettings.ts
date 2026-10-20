import { useState, useEffect, useCallback } from "react";
import { saveServerSetting, fetchServerAppSettings } from "./serverSettingsSync";

export type ExecutionEngineMode = "custom" | "codex";

export interface ExecutionEngineSettings {
  mode: ExecutionEngineMode;
  codexBinaryPath: string;
}

export interface CodexCliStatus {
  ok: boolean;
  available: boolean;
  path: string | null;
  version: string | null;
  codexHome: string;
  codexHomeExists: boolean;
  authFileExists: boolean;
  configFileExists: boolean;
  status: "ready" | "not_found" | "error";
  message?: string;
}

const STORAGE_KEY = "t3_execution_engine_settings";
const EVENT_NAME = "t3:execution-engine-changed";

export const DEFAULT_EXECUTION_ENGINE_SETTINGS: ExecutionEngineSettings = {
  mode: "custom",
  codexBinaryPath: "codex",
};

export function loadExecutionEngineSettings(): ExecutionEngineSettings {
  if (typeof window === "undefined") {
    return { ...DEFAULT_EXECUTION_ENGINE_SETTINGS };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const rawPath =
        typeof parsed?.codexBinaryPath === "string" ? parsed.codexBinaryPath.trim() : "";
      const sanitizedPath =
        rawPath && !rawPath.startsWith("/home/hasan")
          ? rawPath
          : DEFAULT_EXECUTION_ENGINE_SETTINGS.codexBinaryPath;

      return {
        mode: parsed?.mode === "codex" ? "codex" : "custom",
        codexBinaryPath: sanitizedPath || DEFAULT_EXECUTION_ENGINE_SETTINGS.codexBinaryPath,
      };
    }
  } catch (err) {
    console.warn("Failed to parse execution engine settings from localStorage", err);
  }
  return { ...DEFAULT_EXECUTION_ENGINE_SETTINGS };
}

export function saveExecutionEngineSettings(
  patch: Partial<ExecutionEngineSettings>,
): ExecutionEngineSettings {
  const current = loadExecutionEngineSettings();
  const next: ExecutionEngineSettings = {
    mode: patch.mode !== undefined ? patch.mode : current.mode,
    codexBinaryPath:
      patch.codexBinaryPath !== undefined
        ? patch.codexBinaryPath.trim() || DEFAULT_EXECUTION_ENGINE_SETTINGS.codexBinaryPath
        : current.codexBinaryPath,
  };

  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: next }));
    } catch (err) {
      console.warn("Failed to save execution engine settings to localStorage", err);
    }
  }

  // Persist to server SQLite
  void saveServerSetting("execution_engine", next);
  if (next.codexBinaryPath) {
    void saveServerSetting("codex_cli_binary_path", next.codexBinaryPath);
  }

  return next;
}

export function useExecutionEngineSettings(): [
  ExecutionEngineSettings,
  (patch: Partial<ExecutionEngineSettings>) => void,
] {
  const [settings, setSettings] = useState<ExecutionEngineSettings>(() =>
    loadExecutionEngineSettings(),
  );

  useEffect(() => {
    // Initial sync with server in case it was updated on another client/session
    void fetchServerAppSettings().then((appSettings) => {
      if (appSettings?.execution_engine && typeof appSettings.execution_engine === "object") {
        const serverEngine = appSettings.execution_engine;
        const rawServerPath =
          typeof serverEngine.codexBinaryPath === "string"
            ? serverEngine.codexBinaryPath.trim()
            : "";
        const cleanServerPath =
          rawServerPath && !rawServerPath.startsWith("/home/hasan") ? rawServerPath : "";

        setSettings((prev) => {
          const updated: ExecutionEngineSettings = {
            mode: serverEngine.mode === "codex" ? "codex" : "custom",
            codexBinaryPath: cleanServerPath || prev.codexBinaryPath,
          };
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
          } catch {
            // ignore
          }
          return updated;
        });
      }
    });

    // Auto-probe server codex status to discover the actual installed binary path
    void fetchCodexCliStatus().then((status) => {
      if (status.available && typeof status.path === "string" && status.path) {
        const resolvedPath = status.path;
        setSettings((prev) => {
          if (
            !prev.codexBinaryPath ||
            prev.codexBinaryPath === "codex" ||
            prev.codexBinaryPath.startsWith("/home/hasan")
          ) {
            const updated: ExecutionEngineSettings = {
              ...prev,
              codexBinaryPath: resolvedPath,
            };
            try {
              localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
            } catch {
              // ignore
            }
            return updated;
          }
          return prev;
        });
      }
    });

    const handleUpdate = (e: Event) => {
      const customEvent = e as CustomEvent<ExecutionEngineSettings>;
      if (customEvent.detail) {
        setSettings(customEvent.detail);
      } else {
        setSettings(loadExecutionEngineSettings());
      }
    };

    window.addEventListener(EVENT_NAME, handleUpdate);
    window.addEventListener("storage", handleUpdate);
    return () => {
      window.removeEventListener(EVENT_NAME, handleUpdate);
      window.removeEventListener("storage", handleUpdate);
    };
  }, []);

  const update = useCallback((patch: Partial<ExecutionEngineSettings>) => {
    const updated = saveExecutionEngineSettings(patch);
    setSettings(updated);
  }, []);

  return [settings, update];
}

export async function fetchCodexCliStatus(customPath?: string): Promise<CodexCliStatus> {
  const query = customPath ? `?path=${encodeURIComponent(customPath.trim())}` : "";
  try {
    const res = await fetch(`/api/codex-cli/status${query}`);
    if (!res.ok) {
      return {
        ok: false,
        available: false,
        path: customPath || null,
        version: null,
        codexHome: "~/.codex",
        codexHomeExists: false,
        authFileExists: false,
        configFileExists: false,
        status: "error",
        message: `HTTP ${res.status}: ${res.statusText}`,
      };
    }
    return (await res.json()) as CodexCliStatus;
  } catch (err: any) {
    return {
      ok: false,
      available: false,
      path: customPath || null,
      version: null,
      codexHome: "~/.codex",
      codexHomeExists: false,
      authFileExists: false,
      configFileExists: false,
      status: "error",
      message: err?.message || "Failed to connect to backend",
    };
  }
}
