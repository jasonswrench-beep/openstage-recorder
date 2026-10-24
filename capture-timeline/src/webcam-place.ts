// SPDX-License-Identifier: Apache-2.0
/**
 * Where a webcam's small picture sits, as two plain choices: which corner (or the whole picture) and how big. The edit file keeps a rectangle
 * (`placement`, in ten-thousandths of the frame); these are the rectangles worth choosing. No dragging is needed, so it works by keyboard and
 * can be said in words.
 *
 * Without a `placement` the exporter draws a webcam small in the bottom right corner (`DEFAULT_WEBCAM_PLACE` in `openstage-capture-render`),
 * and full frame when nothing else is showing. A choice that is exactly that default clears the placement instead of writing it, so the
 * clip keeps the default's behaviour of filling the frame when it is alone.
 */

import type { Rect } from "../../capture-edit/src/index.ts";

export type WebcamWhere = "bottom-right" | "bottom-left" | "top-right" | "top-left" | "fill";
export type WebcamSize = "small" | "medium" | "large";

export const WEBCAM_WHERES: ReadonlyArray<{ readonly value: WebcamWhere; readonly label: string }> = [
  { value: "bottom-right", label: "Bottom right corner (the default)" },
  { value: "bottom-left", label: "Bottom left corner" },
  { value: "top-right", label: "Top right corner" },
  { value: "top-left", label: "Top left corner" },
  { value: "fill", label: "Fills the whole picture" },
];

/** The width of the small picture as a share of the picture's width, in ten-thousandths. Its height is the same share, so the picture keeps its shape. */
const SIZES: Readonly<Record<WebcamSize, number>> = { small: 1500, medium: 2200, large: 3500 };

export const WEBCAM_SIZES: ReadonlyArray<{ readonly value: WebcamSize; readonly label: string }> = [
  { value: "small", label: "Small, 15 percent of the width" },
  { value: "medium", label: "Medium, 22 percent (the default)" },
  { value: "large", label: "Large, 35 percent" },
];

/** The gap left at the side and at the top or bottom, in ten-thousandths. The same as the default's. */
const SIDE_GAP = 250;
const EDGE_GAP = 450;
const WHOLE = 10000;

/** The rectangle for a choice, or null when the choice is the default (so the placement is taken away rather than written). */
export function webcamRect(where: WebcamWhere, size: WebcamSize): Rect | null {
  if (where === "fill") return { x: 0, y: 0, width: WHOLE, height: WHOLE };
  if (where === "bottom-right" && size === "medium") return null;
  const s = SIZES[size];
  const x = where === "bottom-right" || where === "top-right" ? WHOLE - s - SIDE_GAP : SIDE_GAP;
  const y = where === "bottom-right" || where === "bottom-left" ? WHOLE - s - EDGE_GAP : EDGE_GAP;
  return { x, y, width: s, height: s };
}

/** What a clip's placement says, as the two choices. A place that is none of the choices is `custom` (it was set some other way). */
export function webcamChoice(place: Rect | undefined): { readonly where: WebcamWhere | "custom"; readonly size: WebcamSize | "custom" } {
  if (place === undefined) return { where: "bottom-right", size: "medium" };
  if (place.x === 0 && place.y === 0 && place.width === WHOLE && place.height === WHOLE) return { where: "fill", size: "medium" };
  for (const { value: where } of WEBCAM_WHERES) {
    for (const { value: size } of WEBCAM_SIZES) {
      if (where === "fill") continue;
      // The default is written out for a comparison, because webcamRect gives null for it.
      const rect = webcamRect(where, size) ?? { x: WHOLE - SIZES.medium - SIDE_GAP, y: WHOLE - SIZES.medium - EDGE_GAP, width: SIZES.medium, height: SIZES.medium };
      if (rect.x === place.x && rect.y === place.y && rect.width === place.width && rect.height === place.height) return { where, size };
    }
  }
  return { where: "custom", size: "custom" };
}
