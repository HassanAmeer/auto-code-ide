import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import type { EnvironmentId, ThreadId } from "@t3tools/contracts";
import type { EnvironmentThread } from "@t3tools/client-runtime/state/shell";

import { useActiveEnvironmentId, useThreadProjection } from "../../state/entities";
import { usePrimaryEnvironmentId } from "../../state/environments";
import { threadEnvironment } from "../../state/threads";
import { useAtomCommand } from "../../state/use-atom-command";
import { stackedThreadToast, toastManager } from "../ui/toast";

export interface SubagentItem {
  readonly id: string;
  readonly title: string;
  readonly role?: string;
  readonly status?: string;
  readonly completedAt?: number | undefined;
  readonly error?: string | undefined;
  readonly goal?: string | undefined;
  readonly model?: string | undefined;
  readonly childThreadId?: ThreadId | undefined;
}

interface BackgroundSubagentsController {
  readonly subagents: ReadonlyArray<SubagentItem>;
  readonly workersError: string | null;
  readonly stoppingSubagentId: string | null;
  readonly stopSubagent: (agent: SubagentItem) => Promise<void>;
  readonly threadProjection: EnvironmentThread | null;
}

interface BackgroundSubagentsProviderProps {
  readonly children: ReactNode;
  readonly environmentId?: EnvironmentId | null | undefined;
  readonly threadId?: ThreadId | null | undefined;
  readonly scope?: "all" | "project" | undefined;
  readonly projectName?: string | undefined;
  readonly subagents?: ReadonlyArray<SubagentItem>;
}

const BackgroundSubagentsContext = createContext<BackgroundSubagentsController | null>(null);

export function mergeSubagentStatus(previous: SubagentItem, incoming: SubagentItem): SubagentItem {
  const terminal = (status?: string) =>
    status === "completed" || status === "failed" || status === "error" || status === "cancelled";
  const keepPreviousTerminal =
    terminal(previous.status) &&
    !terminal(incoming.status) &&
    (incoming.completedAt ?? 0) <= (previous.completedAt ?? 0);
  return {
    ...previous,
    ...incoming,
    ...(keepPreviousTerminal ? { status: previous.status, completedAt: previous.completedAt } : {}),
    childThreadId: incoming.childThreadId ?? previous.childThreadId,
  };
}

function readStoredWorkers(): SubagentItem[] {
  if (typeof window === "undefined" || !window.localStorage) return [];
  try {
    const raw =
      window.localStorage.getItem("super_agent_workers") ||
      window.localStorage.getItem("active_subagents") ||
      window.localStorage.getItem("t3_active_subagents");
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.map((item, idx) => ({
        id: item.id || `stored-worker-${idx}`,
        title: item.title || item.name || item.agentRole || item.role || "Specialist Worker",
        role: item.role || item.agentRole,
        status: item.status || "running",
        completedAt: typeof item.completedAt === "number" ? item.completedAt : undefined,
      }));
    }
  } catch (error) {
    console.warn("Failed to read stored telemetry, ignoring:", error);
  }
  return [];
}

export function BackgroundSubagentsProvider({
  children,
  environmentId: propEnvironmentId,
  threadId,
  scope = "all",
  projectName,
  subagents: propSubagents,
}: BackgroundSubagentsProviderProps) {
  const activeEnvironmentId = useActiveEnvironmentId();
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const environmentId = propEnvironmentId ?? activeEnvironmentId ?? primaryEnvironmentId;
  const interruptTurn = useAtomCommand(threadEnvironment.interruptTurn, {
    label: "stop subagent from background services",
  });

  const seenSubagentsRef = useRef<Map<string, SubagentItem>>(new Map());
  /** Consecutive polls in which a still-"running" row vanished from the server. */
  const missingWorkerPollsRef = useRef<Map<string, number>>(new Map());
  /** Worker ids the server has reported at least once — only these can go stale. */
  const seenLiveWorkerIdsRef = useRef<Set<string>>(new Set());
  /**
   * When the workers endpoint last answered successfully.
   *
   * The stale-row heuristic below must only fire while the server is actually
   * reachable: a failing/blocked request (or a slow one) also produces "the
   * worker is missing from this list", and treating that as a finished run is
   * what painted live workers red.
   */
  const lastWorkersOkAtRef = useRef<number>(0);
  const [storedWorkers, setStoredWorkers] = useState<SubagentItem[]>(() => readStoredWorkers());
  const [apiWorkers, setApiWorkers] = useState<SubagentItem[]>([]);
  const [workersError, setWorkersError] = useState<string | null>(null);
  const [stoppingSubagentId, setStoppingSubagentId] = useState<string | null>(null);

  useEffect(() => {
    const handleUpdate = () => setStoredWorkers(readStoredWorkers());
    window.addEventListener("storage", handleUpdate);
    window.addEventListener("super-agent-state-updated", handleUpdate);
    window.addEventListener("t3-subagents-changed", handleUpdate);
    return () => {
      window.removeEventListener("storage", handleUpdate);
      window.removeEventListener("super-agent-state-updated", handleUpdate);
      window.removeEventListener("t3-subagents-changed", handleUpdate);
    };
  }, []);

  useEffect(() => {
    if (scope === "project" && !projectName) {
      setApiWorkers([]);
      setWorkersError(null);
      return;
    }
    let cancelled = false;
    const controller = new AbortController();
    const params = new URLSearchParams();
    if (projectName) params.set("projectName", projectName);
    const url =
      params.size > 0
        ? `/api/super-agent/workers?${params.toString()}`
        : "/api/super-agent/workers";

    async function fetchWorkers() {
      try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) throw new Error(`Workers API returned ${response.status}`);
        const data = await response.json();
        if (cancelled) return;
        const workers = Array.isArray(data)
          ? data
          : Array.isArray(data?.workers)
            ? data.workers
            : [];
        setWorkersError(null);
        lastWorkersOkAtRef.current = Date.now();
        setApiWorkers(
          workers.map((worker: Record<string, unknown>, idx: number) => ({
            id: String(worker.id || `api-worker-${idx}`),
            title: String(
              worker.title || worker.name || worker.agentRole || worker.role || "Specialist Worker",
            ),
            role: typeof worker.role === "string" ? worker.role : undefined,
            status: typeof worker.status === "string" ? worker.status : "running",
            completedAt: typeof worker.completedAt === "number" ? worker.completedAt : undefined,
            error: typeof worker.error === "string" ? worker.error : undefined,
            goal: typeof worker.goal === "string" ? worker.goal : undefined,
            model: typeof worker.model === "string" ? worker.model : undefined,
          })),
        );
      } catch {
        if (!cancelled) setWorkersError("Workers API unreachable");
      }
    }

    void fetchWorkers();
    // Live supervision needs a fast tick; the sidebar must not show a worker
    // as "running" for 15s after it already finished (or was stopped).
    const intervalId = window.setInterval(() => {
      void fetchWorkers();
    }, 3000);
    const onUpdate = () => void fetchWorkers();
    window.addEventListener("super-agent-state-updated", onUpdate);
    window.addEventListener("t3-subagents-changed", onUpdate);
    return () => {
      cancelled = true;
      controller.abort();
      window.clearInterval(intervalId);
      window.removeEventListener("super-agent-state-updated", onUpdate);
      window.removeEventListener("t3-subagents-changed", onUpdate);
    };
  }, [projectName, scope]);

  const threadRef = useMemo(
    () => (environmentId && threadId ? scopeThreadRef(environmentId, threadId) : null),
    [environmentId, threadId],
  );
  const threadDetails = useThreadProjection(threadRef);
  const projectionSubagents = useMemo<SubagentItem[]>(
    () =>
      (threadDetails?.projection?.subagents ?? []).map((agent) => ({
        id: agent.id,
        title: agent.title || agent.driver || "Subagent",
        role: agent.driver,
        status: agent.status || "running",
        childThreadId: agent.childThreadId ?? undefined,
      })),
    [threadDetails],
  );

  const subagents = useMemo<SubagentItem[]>(() => {
    if (propSubagents && propSubagents.length > 0) return [...propSubagents];
    const map = new Map<string, SubagentItem>(seenSubagentsRef.current);
    for (const item of storedWorkers) {
      const previous = map.get(item.id);
      map.set(item.id, previous ? mergeSubagentStatus(previous, item) : item);
    }
    for (const item of apiWorkers) {
      const previous = map.get(item.id);
      map.set(item.id, previous ? mergeSubagentStatus(previous, item) : item);
    }
    for (const item of projectionSubagents) {
      const previous = map.get(item.id);
      map.set(item.id, previous ? mergeSubagentStatus(previous, item) : item);
    }

    // A worker that the server stops reporting is gone: the server restarted,
    // the run was cleaned up, or the row is a leftover from an older build.
    // Left alone it would spin forever, so a row the server previously DID
    // report, and now silently dropped, is closed out with a real reason.
    // Rows the server never reported (still starting) are never touched.
    //
    // This is a guess, so it must be a conservative one:
    //   - only while the workers endpoint is healthy (a failed/slow poll also
    //     "loses" every row, which used to fail live workers in ~18s);
    //   - only after ~60s of silence (20 polls at the 3s tick), because a
    //     watchdog worker can legitimately be invisible for a whole build;
    //   - never when the server reports no workers at all: an empty list means
    //     "restarted/cleared", not "every row finished", and failing a whole
    //     batch on it was the loudest false positive.
    const workersEndpointHealthy =
      !workersError && Date.now() - lastWorkersOkAtRef.current < 15_000;
    const liveIds = new Set<string>([
      ...apiWorkers.map((item) => item.id),
      ...projectionSubagents.map((item) => item.id),
    ]);
    const seenLive = seenLiveWorkerIdsRef.current;
    for (const id of liveIds) seenLive.add(id);
    const missingPolls = missingWorkerPollsRef.current;
    const anyWorkerStillReported = liveIds.size > 0;
    for (const [id, item] of map) {
      if (
        item.status !== "running" ||
        liveIds.has(id) ||
        !seenLive.has(id) ||
        !workersEndpointHealthy ||
        !anyWorkerStillReported
      ) {
        missingPolls.delete(id);
        continue;
      }
      const misses = (missingPolls.get(id) ?? 0) + 1;
      missingPolls.set(id, misses);
      // ~60s of continuous silence while the endpoint keeps answering.
      if (misses >= 20) {
        map.set(id, {
          ...item,
          status: "failed",
          error:
            item.error ??
            "Server ne is worker ki reporting band kar di (run khatam ya server restart).",
          completedAt: item.completedAt ?? Date.now(),
        });
        missingPolls.delete(id);
      }
    }
    for (const id of missingPolls.keys()) {
      if (!map.has(id)) missingPolls.delete(id);
    }

    seenSubagentsRef.current = new Map(map);

    const statusRank = (status?: string) =>
      status === "running" ? 2 : status === "failed" || status === "error" ? 1 : 0;
    const byTitle = new Map<string, SubagentItem>();
    for (const item of map.values()) {
      const key = `${String(item.title ?? "")
        .toLowerCase()
        .trim()}|${String(item.role ?? "")
        .toLowerCase()
        .trim()}`;
      const previous = byTitle.get(key);
      if (!previous) {
        byTitle.set(key, item);
      } else if (statusRank(item.status) > statusRank(previous.status)) {
        byTitle.set(key, item);
      } else if (
        statusRank(item.status) === statusRank(previous.status) &&
        (item.completedAt ?? 0) > (previous.completedAt ?? 0)
      ) {
        byTitle.set(key, item);
      }
    }
    return [...byTitle.values()].sort((a, b) => {
      const runningRank = (status?: string) => (status === "running" ? 1 : 0);
      if (runningRank(a.status) !== runningRank(b.status)) {
        return runningRank(b.status) - runningRank(a.status);
      }
      return (b.completedAt ?? 0) - (a.completedAt ?? 0);
    });
  }, [apiWorkers, projectionSubagents, propSubagents, storedWorkers, workersError]);

  const stopSubagent = useCallback(
    async (agent: SubagentItem) => {
      if (stoppingSubagentId === agent.id) return;
      setStoppingSubagentId(agent.id);
      try {
        if (agent.childThreadId) {
          if (!environmentId) {
            toastManager.add({
              type: "error",
              title: "No environment selected — cannot stop this subagent",
            });
            return;
          }
          const result = await interruptTurn({
            environmentId,
            input: { threadId: agent.childThreadId },
          });
          if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
            toastManager.add({
              type: "error",
              title: "Could not stop subagent",
              description: String(squashAtomCommandFailure(result)),
            });
            return;
          }
          window.dispatchEvent(new CustomEvent("t3-subagents-changed"));
          window.dispatchEvent(new CustomEvent("super-agent-state-updated"));
          return;
        }

        const response = await fetch("/api/super-agent/workers/stop", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workerId: agent.id }),
        });
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as { error?: string } | null;
          toastManager.add({
            type: "error",
            title: body?.error ?? "Could not stop this subagent",
          });
          return;
        }
        setApiWorkers((previous) =>
          previous.map((worker) =>
            worker.id === agent.id
              ? { ...worker, status: "cancelled", completedAt: Date.now() }
              : worker,
          ),
        );
        window.dispatchEvent(new CustomEvent("super-agent-state-updated"));
        window.dispatchEvent(new CustomEvent("t3-subagents-changed"));
      } catch {
        toastManager.add({ type: "error", title: "Could not stop this subagent" });
      } finally {
        setStoppingSubagentId(null);
      }
    },
    [environmentId, interruptTurn, stoppingSubagentId],
  );

  const controller = useMemo<BackgroundSubagentsController>(
    () => ({
      subagents,
      workersError,
      stoppingSubagentId,
      stopSubagent,
      threadProjection: threadDetails,
    }),
    [stopSubagent, stoppingSubagentId, subagents, threadDetails, workersError],
  );

  return (
    <BackgroundSubagentsContext.Provider value={controller}>
      {children}
    </BackgroundSubagentsContext.Provider>
  );
}

export function useBackgroundSubagents(): BackgroundSubagentsController {
  const controller = useContext(BackgroundSubagentsContext);
  if (!controller) {
    throw new Error("useBackgroundSubagents must be used inside BackgroundSubagentsProvider");
  }
  return controller;
}

export function useOptionalBackgroundSubagents(): BackgroundSubagentsController | null {
  return useContext(BackgroundSubagentsContext);
}
