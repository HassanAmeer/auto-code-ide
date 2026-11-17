/**
 * Per-thread pinned assistant responses.
 *
 * Pinned message ids are persisted in localStorage keyed by the scoped thread
 * key so they survive reloads. Navigation state is session-only and lives in
 * the same store so the header widget and the virtualized timeline can share
 * it without prop drilling.
 */

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { resolveStorage } from "./lib/storage";
import { stepPinnedIndex, togglePinnedMessage } from "./components/chat/pinnedMessages.logic";

const PINNED_MESSAGES_STORAGE_KEY = "t3code:pinned-messages:v1";

interface PinnedNavState {
  /** Row indices of the pinned responses currently present in the timeline. */
  rowIndices: number[];
  /** Cursor into `rowIndices`. */
  activeIndex: number;
  /** Incremented by the header arrows to ask the timeline to scroll. */
  jumpSeq: number;
  jumpDirection: 1 | -1;
}

const DEFAULT_NAV_STATE: PinnedNavState = Object.freeze({
  rowIndices: [],
  activeIndex: 0,
  jumpSeq: 0,
  jumpDirection: 1,
});

function createDefaultNavState(): PinnedNavState {
  return { ...DEFAULT_NAV_STATE, rowIndices: [] };
}

function arraysEqual(left: readonly number[], right: readonly number[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

export interface PinnedMessagesState {
  pinnedIdsByThreadKey: Record<string, string[]>;
  navByThreadKey: Record<string, PinnedNavState>;
  togglePin: (threadKey: string, messageId: string) => void;
  isPinned: (threadKey: string, messageId: string) => boolean;
  setPinnedRows: (threadKey: string, rowIndices: number[]) => void;
  requestJump: (threadKey: string, direction: 1 | -1) => void;
}

function createPinnedMessagesStorage() {
  return resolveStorage(typeof window !== "undefined" ? window.localStorage : undefined);
}

function sanitizePinnedIds(value: unknown): Record<string, string[]> {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(
    Object.entries(value).map(([threadKey, ids]) => [
      threadKey,
      Array.isArray(ids)
        ? [...new Set(ids.filter((id): id is string => typeof id === "string" && id.length > 0))]
        : [],
    ]),
  );
}

export const usePinnedMessagesStore = create<PinnedMessagesState>()(
  persist(
    (set, get) => ({
      pinnedIdsByThreadKey: {},
      navByThreadKey: {},

      togglePin: (threadKey, messageId) =>
        set((state) => {
          if (threadKey.length === 0) return state;
          const current = state.pinnedIdsByThreadKey[threadKey] ?? [];
          const next = togglePinnedMessage(current, messageId);
          if (arraysEqualStrings(current, next)) return state;
          return {
            pinnedIdsByThreadKey: {
              ...state.pinnedIdsByThreadKey,
              [threadKey]: next,
            },
          };
        }),

      isPinned: (threadKey, messageId) =>
        (get().pinnedIdsByThreadKey[threadKey] ?? []).includes(messageId),

      setPinnedRows: (threadKey, rowIndices) =>
        set((state) => {
          const current = state.navByThreadKey[threadKey] ?? createDefaultNavState();
          if (arraysEqual(current.rowIndices, rowIndices)) return state;
          return {
            navByThreadKey: {
              ...state.navByThreadKey,
              [threadKey]: {
                ...current,
                rowIndices: [...rowIndices],
                activeIndex: 0,
              },
            },
          };
        }),

      requestJump: (threadKey, direction) =>
        set((state) => {
          const current = state.navByThreadKey[threadKey] ?? createDefaultNavState();
          if (current.rowIndices.length === 0) return state;
          return {
            navByThreadKey: {
              ...state.navByThreadKey,
              [threadKey]: {
                ...current,
                activeIndex: stepPinnedIndex(
                  current.activeIndex,
                  current.rowIndices.length,
                  direction,
                ),
                jumpSeq: current.jumpSeq + 1,
                jumpDirection: direction,
              },
            },
          };
        }),
    }),
    {
      name: PINNED_MESSAGES_STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(createPinnedMessagesStorage),
      partialize: (state) => ({ pinnedIdsByThreadKey: state.pinnedIdsByThreadKey }),
      merge: (persisted, current) => ({
        ...current,
        pinnedIdsByThreadKey: sanitizePinnedIds(
          (persisted as { pinnedIdsByThreadKey?: unknown } | undefined)?.pinnedIdsByThreadKey,
        ),
      }),
    },
  ),
);

function arraysEqualStrings(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

/** Stable empty array to avoid selector re-renders when nothing is pinned. */
const EMPTY_PINNED_IDS: readonly string[] = Object.freeze([]);

export function selectPinnedIds(state: PinnedMessagesState, threadKey: string): readonly string[] {
  return state.pinnedIdsByThreadKey[threadKey] ?? EMPTY_PINNED_IDS;
}

export function selectPinnedNav(state: PinnedMessagesState, threadKey: string): PinnedNavState {
  return state.navByThreadKey[threadKey] ?? DEFAULT_NAV_STATE;
}
