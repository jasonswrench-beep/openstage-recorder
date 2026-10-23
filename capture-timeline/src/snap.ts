// SPDX-License-Identifier: Apache-2.0
/**
 * Snapping: when a dragged edge comes close to a time that matters (the playhead, the start or end of another clip,
 * the beginning or the end of the edit, a mark for a stretch), it jumps to exactly that time, so a clip can be put
 * against another with the mouse and no gap or overlap is left by a hair. Pure arithmetic, tested without a screen.
 */

export interface SnapInput {
  /** Where the dragged value would be if nothing snapped. */
  readonly ms: number;
  /**
   * Where the edges that can snap are, counted from `ms`: 0 for the value itself (the start of a clip being moved, or
   * the grip being dragged), and the clip's length for its far end when it is moved whole.
   */
  readonly edges: readonly number[];
  /** The times it can snap to. */
  readonly targets: readonly number[];
  /** How close an edge has to come, in milliseconds. Nothing snaps when this is zero or less. */
  readonly withinMs: number;
}

export interface SnapResult {
  /** The value to use: moved so the nearest edge lands on its target, or `ms` itself when nothing was close enough. */
  readonly ms: number;
  /** The time snapped to, for drawing a guide line, or undefined when nothing snapped. */
  readonly target: number | undefined;
}

export function snapTo(input: SnapInput): SnapResult {
  if (!(input.withinMs > 0)) return { ms: input.ms, target: undefined };
  let best: { readonly distance: number; readonly ms: number; readonly target: number } | undefined;
  for (const edge of input.edges) {
    for (const target of input.targets) {
      const distance = Math.abs(input.ms + edge - target);
      if (distance > input.withinMs) continue;
      if (best === undefined || distance < best.distance || (distance === best.distance && target < best.target)) {
        best = { distance, ms: target - edge, target };
      }
    }
  }
  return best === undefined ? { ms: input.ms, target: undefined } : { ms: best.ms, target: best.target };
}

/** The times worth snapping to: the start and end of every row that is not being dragged, and the extra times given. */
export function snapTargets(
  rows: readonly { readonly clipId: string; readonly startMs: number; readonly endMs: number }[],
  dragged: ReadonlySet<string>,
  extra: readonly (number | undefined)[],
): readonly number[] {
  const times = new Set<number>();
  for (const row of rows) {
    if (dragged.has(row.clipId)) continue;
    times.add(row.startMs);
    times.add(row.endMs);
  }
  for (const time of extra) if (time !== undefined) times.add(time);
  return [...times];
}
