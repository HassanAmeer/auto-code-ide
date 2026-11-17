/**
 * Pure helpers for pinning individual assistant responses in a thread.
 *
 * Kept free of React so the toggle/navigation rules can be unit tested.
 * Message ids are opaque strings; ordering always follows the timeline order,
 * not the order in which the user pinned them.
 */

function clampPinnedIndex(index: number, total: number): number {
  if (total <= 0 || !Number.isFinite(index) || index < 0) return 0;
  return Math.min(Math.trunc(index), total - 1);
}

/** Move between pinned responses with wrap-around, like find-in-thread. */
export function stepPinnedIndex(index: number, total: number, delta: number): number {
  if (total <= 0) return 0;
  const clamped = clampPinnedIndex(index, total);
  return (((clamped + delta) % total) + total) % total;
}

/** Compact `active/total` label shown above the pin icon in the header. */
export function formatPinnedCount(index: number, total: number): string {
  return total <= 0 ? "0/0" : `${clampPinnedIndex(index, total) + 1}/${total}`;
}

/** Toggle a message id, preserving insertion order and removing duplicates. */
export function togglePinnedMessage(ids: readonly string[], messageId: string): string[] {
  const uniqueIds = [...new Set(ids.filter((candidate) => candidate.length > 0))];
  const id = messageId.trim();
  if (id.length === 0) return uniqueIds;
  if (uniqueIds.includes(id)) return uniqueIds.filter((candidate) => candidate !== id);
  return [...uniqueIds, id];
}

export interface PinnableRow {
  readonly messageId: string | null;
  readonly isAssistant: boolean;
}

/**
 * Map pinned message ids to the current virtualized row indices. Only
 * assistant message rows are pinnable, and only ids present in this timeline
 * produce a row (pinned ids from trimmed history are ignored).
 */
export function resolvePinnedRowIndices(
  rows: readonly PinnableRow[],
  pinnedIds: ReadonlySet<string>,
): number[] {
  if (pinnedIds.size === 0) return [];
  const indices: number[] = [];
  rows.forEach((row, index) => {
    if (row.isAssistant && row.messageId && pinnedIds.has(row.messageId)) {
      indices.push(index);
    }
  });
  return indices;
}
