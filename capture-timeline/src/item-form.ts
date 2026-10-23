// SPDX-License-Identifier: Apache-2.0
/**
 * The form for the chosen overlay or zoom: its words, where it is on the picture, its colours, and what a screen reader
 * is told about it. It is the keyboard (and screen reader) way to do everything that dragging on the picture does, and it
 * asks for the things the edit needs (a zoom's description, a shape's alt text) so they are not forgotten.
 *
 * Place is written as a percentage of the picture: Left and Top from the left and top edges, Width and Height as shares of the
 * picture's width and height. A zoom keeps the picture's shape, so it has one Size.
 *
 * Colours are chosen from a short list of names (a colour that is already used but is not on the list is kept as it is, and
 * shown by its code). Nothing here changes the edit except through the session, so every change is one undo step and says a sentence.
 */

import type { Item, Rect } from "../../capture-edit/src/index.ts";
import { Announcer } from "./announcer.ts";
import { h, nextId } from "./dom.ts";
import type { EditSession, Outcome } from "./session.ts";

export interface ItemFormPanel {
  readonly element: HTMLElement;
  /** Put keyboard focus on the first box of the form. Returns false if there is no form to show. */
  focus(): boolean;
  destroy(): void;
}

/** A description worked out for a shape or arrow that the author has not approved: what it says, and what it was worked out from. */
export interface AltSuggestionText {
  text: string;
  basis: string;
}

export interface ItemFormOptions {
  announcer: Announcer;
  /**
   * Something that can suggest alt text for a shape or arrow (for example from the name of what was clicked at that moment in the recording). The form shows the answer beside the
   * alt text box with the button that uses it. It is only a suggestion: nothing is put in the edit until the author presses the button. May answer later; null means no suggestion.
   */
  suggestAlt?: (item: Item) => Promise<AltSuggestionText | null> | AltSuggestionText | null;
  /** Where focus goes when Escape is pressed in an unchanged box: back to the list of rows. */
  leave?: () => void;
}

const COLOURS: readonly (readonly [string, string])[] = [
  ["White", "#FFFFFF"],
  ["Black", "#000000"],
  ["Yellow", "#FFD400"],
  ["Red", "#E02020"],
  ["Orange", "#FF8000"],
  ["Green", "#1E9E3A"],
  ["Blue", "#1F5FD0"],
  ["Pink", "#FF4FA3"],
  ["Grey", "#808080"],
];

/** A share of the picture, typed as a percentage ("12", "12.5", "12%"), as ten-thousandths. */
export function parsePercent(text: string): { ok: true; bp: number } | { ok: false; message: string } {
  const how = "Type a percentage from 0 to 100, such as 25 or 12.5.";
  const trimmed = text.trim().replace(/%$/, "").trim();
  if (trimmed === "") return { ok: false, message: `Nothing was typed. ${how}` };
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return { ok: false, message: `"${text.trim()}" is not a percentage. ${how}` };
  const value = Number(trimmed);
  if (value > 100) return { ok: false, message: `${value} is more than 100. ${how}` };
  return { ok: true, bp: Math.round(value * 100) };
}

export function showPercent(bp: number): string {
  const value = bp / 100;
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

/** A length of time in seconds, as typed in the move-time box ("0.5", "1"). */
function parseSeconds(text: string): { ok: true; ms: number } | { ok: false; message: string } {
  const how = "Type a number of seconds, such as 0.5 or 1.";
  const trimmed = text.trim().replace(/\s*s(ec(onds?)?)?$/i, "");
  if (trimmed === "") return { ok: false, message: `Nothing was typed. ${how}` };
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return { ok: false, message: `"${text.trim()}" is not a number of seconds. ${how}` };
  return { ok: true, ms: Math.round(Number(trimmed) * 1000) };
}

function showSeconds(ms: number): string {
  return String(ms / 1000);
}

interface Control {
  readonly element: HTMLElement;
  readonly input: HTMLElement;
  /** Show the item's value, unless the author is in the control. */
  sync(item: Item): void;
}

export function mountItemForm(container: HTMLElement, session: EditSession, options: ItemFormOptions): ItemFormPanel {
  const id = nextId("os-if");
  const { announcer } = options;
  const title = h("h3", { id: `${id}-title`, class: "os-cl-subtitle" }, "Chosen overlay or zoom");
  const error = h("p", { class: "os-if-error", id: `${id}-error` });
  const body = h("div", { class: "os-if-fields" });
  const form = h("form", { class: "os-cl-form os-if", "aria-labelledby": `${id}-title`, novalidate: true }, title, body, error);
  form.addEventListener("submit", (e) => e.preventDefault());
  form.hidden = true;
  container.append(form);

  let controls: Control[] = [];
  let shownFor = "";
  let counter = 0;

  function say(outcome: Outcome, input?: HTMLElement): void {
    announcer.say(outcome.message);
    if (outcome.ok) {
      error.textContent = "";
      input?.removeAttribute("aria-invalid");
      input?.removeAttribute("aria-errormessage");
    } else {
      error.textContent = outcome.message;
      input?.setAttribute("aria-invalid", "true");
      input?.setAttribute("aria-errormessage", error.id);
    }
  }

  function wrap(label: string, input: HTMLElement, hint?: string): HTMLElement {
    counter += 1;
    const inputId = `${id}-f${counter}`;
    input.id = inputId;
    const parts: (Node | string)[] = [h("label", { for: inputId }, label), input];
    if (hint !== undefined) {
      const hintId = `${inputId}-hint`;
      input.setAttribute("aria-describedby", hintId);
      parts.push(h("p", { class: "os-cl-hint", id: hintId }, hint));
    }
    return h("div", { class: "os-cl-field" }, ...parts);
  }

  /** A box of text that is entered when the author presses Enter (or leaves the box). Escape puts it back. */
  function textBox(label: string, get: (item: Item) => string, apply: (text: string) => Outcome, boxOptions: { multiline?: boolean; hint?: string } = {}): Control {
    const input: HTMLInputElement | HTMLTextAreaElement = boxOptions.multiline === true ? h("textarea", { class: "os-cl-input", rows: 3 }) : h("input", { type: "text", class: "os-cl-input", autocomplete: "off", spellcheck: "false" });
    let shown = "";
    let baseline = "";
    let tried: string | undefined;
    const commit = (): void => {
      const text = input.value;
      if (text === baseline || text === shown || text === tried) return;
      const outcome = apply(text);
      if (!outcome.ok) tried = text;
      else tried = undefined;
      say(outcome, input);
      if (outcome.ok) {
        const item = session.item;
        if (item !== undefined) {
          shown = get(item);
          input.value = shown;
          baseline = shown;
        }
      }
    };
    input.addEventListener("focus", () => {
      baseline = input.value;
    });
    input.addEventListener("input", () => {
      tried = undefined;
    });
    input.addEventListener("change", commit);
    (input as HTMLElement).addEventListener("keydown", (e) => {
      const multiline = boxOptions.multiline === true;
      if (e.key === "Enter" && (!multiline || e.ctrlKey)) {
        e.preventDefault();
        commit();
      } else if (e.key === "Escape") {
        e.preventDefault();
        if (input.value !== shown) {
          input.value = shown;
          baseline = shown;
          tried = undefined;
          input.removeAttribute("aria-invalid");
          error.textContent = "";
          announcer.say("Put back as it was.");
        } else {
          options.leave?.();
        }
      }
    });
    return {
      element: wrap(label, input, boxOptions.hint),
      input,
      sync(item) {
        shown = get(item);
        if (document.activeElement !== input) {
          input.value = shown;
          baseline = shown;
          input.removeAttribute("aria-invalid");
        }
      },
    };
  }

  function checkBox(label: string, get: (item: Item) => boolean, apply: (checked: boolean) => Outcome): Control {
    counter += 1;
    const inputId = `${id}-f${counter}`;
    const input = h("input", { type: "checkbox", id: inputId });
    input.addEventListener("change", () => say(apply(input.checked), input));
    return {
      element: h("div", { class: "os-cl-field" }, h("label", { class: "os-cl-check", for: inputId }, input, ` ${label}`)),
      input,
      sync(item) {
        input.checked = get(item);
      },
    };
  }

  function choice(label: string, options: readonly (readonly [string, string])[], get: (item: Item) => string, apply: (value: string) => Outcome, hint?: string): Control {
    const input = h("select", { class: "os-cl-input" });
    input.addEventListener("change", () => say(apply(input.value), input));
    return {
      element: wrap(label, input, hint),
      input,
      sync(item) {
        const value = get(item);
        const list = options.some(([v]) => v === value) || value === "" ? options : [...options, [value, `Custom ${value}`] as const];
        input.replaceChildren(...list.map(([v, name]) => h("option", { value: v, ...(v === value ? { selected: true } : {}) }, name)));
        input.value = value;
      },
    };
  }

  function colour(label: string, get: (item: Item) => string | null, apply: (hex: string | null) => Outcome, none?: string): Control {
    const base = COLOURS.map(([name, hex]) => [hex, name] as const);
    const list = none === undefined ? base : [["", none] as const, ...base];
    return choice(
      label,
      list,
      (item) => (get(item) ?? "").toUpperCase(),
      (value) => apply(value === "" ? null : value),
    );
  }

  const rectOf = (item: Item): Rect | undefined => ("rect" in item ? item.rect : undefined);

  function placeControls(item: Item): Control[] {
    const rect = rectOf(item);
    if (rect === undefined) return [];
    const make = (label: string, get: (r: Rect) => number, set: (r: Rect, bp: number) => Rect): Control =>
      textBox(
        label,
        (i) => showPercent(get(rectOf(i) ?? rect)),
        (text) => {
          const parsed = parsePercent(text);
          if (!parsed.ok) return { ok: false, message: parsed.message };
          const now = session.item === undefined ? undefined : rectOf(session.item);
          return now === undefined ? { ok: false, message: "Nothing is chosen." } : session.setItemPlace(set(now, parsed.bp));
        },
      );
    const hint = h("p", { class: "os-cl-hint" }, "Place, as a percentage of the picture. You can also drag the frame on the picture, or move it with the arrow keys when it has focus.");
    const out: Control[] = [{ element: hint, input: hint, sync() {} }];
    out.push(make("Left (%)", (r) => r.x, (r, bp) => ({ ...r, x: bp })));
    out.push(make("Top (%)", (r) => r.y, (r, bp) => ({ ...r, y: bp })));
    if (item.kind === "zoom") {
      out.push(make("Size (%)", (r) => r.width, (r, bp) => ({ ...r, width: bp, height: bp })));
    } else {
      out.push(make("Width (%)", (r) => r.width, (r, bp) => ({ ...r, width: bp })));
      out.push(make("Height (%)", (r) => r.height, (r, bp) => ({ ...r, height: bp })));
    }
    return out;
  }

  /** The suggested description, with what it came from and a button to use it. It is hidden when there is none, or when the shape has alt text or is only decoration. */
  function suggestionControl(): Control {
    const words = h("p", { class: "os-if-suggest-text" });
    const basis = h("p", { class: "os-cl-hint" });
    const use = h("button", { type: "button", class: "os-cl-button" }, "Use this description");
    const box = h("div", { class: "os-cl-field os-if-suggest", role: "group" }, h("p", { class: "os-if-suggest-title" }, "A description has been suggested, and not checked yet"), words, basis, use);
    box.hidden = true;
    let ticket = 0;
    let current: AltSuggestionText | null = null;
    const show = (s: AltSuggestionText | null): void => {
      current = s;
      box.hidden = s === null;
      if (s !== null) {
        words.textContent = s.text;
        basis.textContent = `Worked out from: ${s.basis} It is only a suggestion: nothing is changed until you press the button. Read it against the picture first.`;
      }
    };
    use.addEventListener("click", () => {
      if (current === null) return;
      // Focus is on this button (a click does that in most browsers, a key press always), so the alt text box is not "being typed in" and takes the new words.
      use.focus();
      const outcome = session.setItemAlt({ altText: current.text, decorative: false });
      say(outcome, use);
      show(null);
      // The boxes are brought up to date before focus moves into one: a box the author is in is left as it is, so it would keep showing nothing.
      const now = session.item;
      if (now !== undefined) for (const c of controls) c.sync(now);
      controls.find((c) => (c.element.querySelector("label")?.textContent ?? "").startsWith("What it points out"))?.input.focus();
    });
    return {
      element: box,
      input: use,
      sync(item) {
        const mine = ++ticket;
        const needs = (item.kind === "shape" || item.kind === "arrow") && item.decorative !== true && (item.altText ?? "").trim() === "";
        if (!needs || options.suggestAlt === undefined) {
          show(null);
          return;
        }
        Promise.resolve(options.suggestAlt(item)).then(
          (s) => { if (mine === ticket) show(s); },
          () => { if (mine === ticket) show(null); },
        );
      },
    };
  }

  function altControls(): Control[] {
    return [
      textBox(
        "What it points out (alt text)",
        (i) => (i.kind === "shape" || i.kind === "arrow" ? (i.altText ?? "") : ""),
        (text) => session.setItemAlt({ altText: text }),
        { hint: "Said to someone who cannot see the picture, such as: The Save button. Needed unless this is only decoration." },
      ),
      suggestionControl(),
      checkBox("Only decoration (nothing to say about it)", (i) => (i.kind === "shape" || i.kind === "arrow" ? i.decorative === true : false), (checked) => session.setItemAlt({ decorative: checked })),
    ];
  }

  function build(item: Item): Control[] {
    const list: Control[] = [
      textBox("Name", (i) => i.name, (text) => session.rename(text)),
    ];
    switch (item.kind) {
      case "text":
        list.push(
          textBox("Words", (i) => (i.kind === "text" ? i.text : ""), (text) => session.setItemWords(text), { multiline: true, hint: "Press Ctrl+Enter or leave the box to enter the words." }),
          textBox(
            "Size (% of the picture's height)",
            (i) => (i.kind === "text" ? showPercent(i.fontSizeBp) : ""),
            (text) => {
              const parsed = parsePercent(text);
              return parsed.ok ? session.setItemTextLook({ fontSizeBp: parsed.bp }) : { ok: false, message: parsed.message };
            },
          ),
          colour("Text colour", (i) => (i.kind === "text" ? i.color : null), (hex) => session.setItemTextLook(hex === null ? {} : { color: hex })),
          colour("Behind the text", (i) => (i.kind === "text" ? i.background : null), (hex) => session.setItemTextLook({ background: hex }), "No colour"),
          checkBox("Bold", (i) => (i.kind === "text" ? i.bold : false), (checked) => session.setItemTextLook({ bold: checked })),
          choice(
            "Line up",
            [["left", "Left"], ["center", "Centre"], ["right", "Right"]],
            (i) => (i.kind === "text" ? i.align : "left"),
            (value) => session.setItemTextLook({ align: value === "center" ? "center" : value === "right" ? "right" : "left" }),
          ),
        );
        break;
      case "shape":
        list.push(
          choice("Shape", [["rectangle", "Rectangle"], ["ellipse", "Circle or oval"]], (i) => (i.kind === "shape" ? i.shape : "rectangle"), (value) => session.setItemShapeLook({ shape: value === "ellipse" ? "ellipse" : "rectangle" })),
          colour("Line colour", (i) => (i.kind === "shape" ? i.outline : null), (hex) => session.setItemShapeLook(hex === null ? {} : { outline: hex })),
          colour("Inside colour", (i) => (i.kind === "shape" ? i.fill : null), (hex) => session.setItemShapeLook({ fill: hex }), "No colour"),
          ...altControls(),
        );
        break;
      case "arrow": {
        const end = (label: string, which: "from" | "to", axis: "x" | "y"): Control =>
          textBox(
            label,
            (i) => (i.kind === "arrow" ? showPercent(i[which][axis]) : ""),
            (text) => {
              const parsed = parsePercent(text);
              const now = session.item;
              if (!parsed.ok) return { ok: false, message: parsed.message };
              if (now?.kind !== "arrow") return { ok: false, message: "No arrow is chosen." };
              const point = { ...now[which], [axis]: parsed.bp };
              return session.setArrowPlace(which === "from" ? point : now.from, which === "to" ? point : now.to);
            },
          );
        list.push({ element: h("p", { class: "os-cl-hint" }, "Where the arrow starts and where its point is, as a percentage across and down the picture."), input: form, sync() {} });
        list.push(end("Starts, across (%)", "from", "x"), end("Starts, down (%)", "from", "y"), end("Points to, across (%)", "to", "x"), end("Points to, down (%)", "to", "y"));
        list.push(colour("Colour", (i) => (i.kind === "arrow" ? i.color : null), (hex) => session.setItemArrowLook(hex === null ? {} : { color: hex })));
        list.push(...altControls());
        break;
      }
      case "redact":
        list.push(colour("Cover colour", (i) => (i.kind === "redact" ? i.color : null), (hex) => session.setItemCoverColor(hex ?? "#000000")));
        break;
      case "blur":
        break;
      case "zoom":
        list.push(
          textBox("What the zoom shows", (i) => (i.kind === "zoom" ? i.description : ""), (text) => session.setItemZoom({ description: text }), {
            multiline: true,
            hint: "Said to someone who cannot see the picture, such as: The toolbar at the top. Needed for every zoom. Press Ctrl+Enter or leave the box to enter it.",
          }),
          textBox(
            "Time to move in and out (seconds)",
            (i) => (i.kind === "zoom" ? showSeconds(i.transitionMs) : ""),
            (text) => {
              const parsed = parseSeconds(text);
              return parsed.ok ? session.setItemZoom({ transitionMs: parsed.ms }) : { ok: false, message: parsed.message };
            },
          ),
        );
        break;
    }
    list.push(...placeControls(item));
    return list;
  }

  function sync(): void {
    const item = session.singleChoice && session.selectionCount === 1 ? session.item : undefined;
    form.hidden = item === undefined;
    if (item === undefined) {
      shownFor = "";
      return;
    }
    const signature = `${item.id}:${item.kind}:${item.kind === "shape" ? item.shape : ""}`;
    const focusedInside = form.contains(document.activeElement);
    if (signature !== shownFor && !(focusedInside && shownFor.startsWith(`${item.id}:`))) {
      shownFor = signature;
      counter = 0;
      controls = build(item);
      body.replaceChildren(...controls.map((c) => c.element));
      title.textContent = `Chosen ${item.kind === "zoom" ? "zoom" : "overlay"}: ${item.name}`;
      error.textContent = "";
    }
    title.textContent = `Chosen ${item.kind === "zoom" ? "zoom" : "overlay"}: ${item.name}`;
    for (const control of controls) control.sync(item);
  }

  const stop = session.subscribe((kind) => {
    if (kind === "model" || kind === "selection") sync();
  });
  sync();

  return {
    element: form,
    focus(): boolean {
      sync();
      if (form.hidden) return false;
      const first = controls.find((c) => c.input instanceof HTMLInputElement || c.input instanceof HTMLTextAreaElement || c.input instanceof HTMLSelectElement);
      if (first === undefined) return false;
      // The first useful box: the words of a text, the description of a zoom, the alt text of a shape; else the name.
      const item = session.item;
      const wanted = controls.find((c) => {
        const label = c.element.querySelector("label")?.textContent ?? "";
        if (item?.kind === "text") return label === "Words";
        if (item?.kind === "zoom") return label === "What the zoom shows";
        if (item?.kind === "shape" || item?.kind === "arrow") return label.startsWith("What it points out");
        return false;
      });
      (wanted ?? first).input.focus();
      return true;
    },
    destroy(): void {
      stop();
      form.remove();
    },
  };
}

