/**
 * A deliberately tiny markup for event descriptions: bold and three text sizes.
 *
 * Descriptions are written by community members and rendered in everyone else's
 * app, so no HTML is ever stored or injected. The text is parsed into plain
 * data here and rendered as React elements, which means an unrecognised or
 * malformed tag can only ever come out as literal text.
 */

export type TextSize = "sm" | "md" | "lg";

/** The only sizes accepted; anything else is treated as literal text. */
export const TEXT_SIZES: TextSize[] = ["sm", "md", "lg"];

export type RichSpan = {
  text: string;
  bold: boolean;
  size: TextSize;
};

/** One line of spans. Blank lines survive as empty arrays. */
export type RichLine = RichSpan[];

const TOKEN = /\*\*|\[size=(sm|md|lg)\]|\[\/size\]/g;

/**
 * Parses the markup into lines of styled spans. Unclosed markers simply stay
 * open to the end of the text rather than failing — a half-typed description
 * still has to render while the host is editing it.
 */
export function parseRichText(source: string): RichLine[] {
  const spans: RichSpan[] = [];

  let bold = false;
  let size: TextSize = "md";
  let cursor = 0;

  const push = (text: string) => {
    if (!text) return;
    spans.push({ text, bold, size });
  };

  TOKEN.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = TOKEN.exec(source)) !== null) {
    push(source.slice(cursor, match.index));
    cursor = match.index + match[0].length;

    if (match[0] === "**") {
      bold = !bold;
    } else if (match[0] === "[/size]") {
      size = "md";
    } else if (match[1]) {
      size = match[1] as TextSize;
    }
  }

  push(source.slice(cursor));

  // Split into lines afterwards so a style can span a line break, the way it
  // reads in the editor.
  const lines: RichLine[] = [[]];
  for (const span of spans) {
    const parts = span.text.split("\n");
    parts.forEach((part, index) => {
      if (index > 0) lines.push([]);
      if (part) lines[lines.length - 1].push({ ...span, text: part });
    });
  }

  return lines;
}

/** Plain text with the markup stripped, for previews and search. */
export function stripRichText(source: string): string {
  return source.replace(TOKEN, "");
}

export type Edit = { value: string; selectionStart: number; selectionEnd: number };

/**
 * Wraps the current selection in a marker pair, or inserts an empty pair at the
 * caret. Returns the new text and where the selection should land.
 */
export function wrapSelection(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  open: string,
  close: string
): Edit {
  const before = value.slice(0, selectionStart);
  const selected = value.slice(selectionStart, selectionEnd);
  const after = value.slice(selectionEnd);

  return {
    value: `${before}${open}${selected}${close}${after}`,
    selectionStart: selectionStart + open.length,
    selectionEnd: selectionStart + open.length + selected.length,
  };
}

const SIZE_OPEN = /\[size=(sm|md|lg)\]/g;
const SIZE_CLOSE = /\[\/size\]/g;
const SIZE_OPEN_AT_END = /\[size=(sm|md|lg)\]$/;

/** With an empty selection, act on the whole line the caret sits in. */
function selectionOrLine(value: string, start: number, end: number): [number, number] {
  if (start !== end) return [start, end];

  const lineStart = value.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
  const lineEnd = value.indexOf("\n", end);
  return [lineStart, lineEnd === -1 ? value.length : lineEnd];
}

/**
 * Grows the range to swallow marker pairs that sit immediately outside it.
 *
 * After a wrap the selection covers only the inner text, so without this the
 * next press cannot see the markers it just added and would wrap them again —
 * which is exactly how `[size=lg][size=lg]…` used to accumulate.
 */
function expandOverMarkers(
  value: string,
  start: number,
  end: number,
  matchOpen: (before: string) => string | null,
  close: string
): [number, number] {
  let from = start;
  let to = end;

  for (;;) {
    const open = matchOpen(value.slice(0, from));
    if (open === null || !value.slice(to).startsWith(close)) break;
    from -= open.length;
    to += close.length;
  }

  return [from, to];
}

/**
 * Applies a size to the selection, replacing any size already on it rather than
 * nesting another pair around it. Pressing a size button repeatedly therefore
 * settles on that size instead of stacking `[size=lg][size=lg]…`.
 *
 * With nothing selected it retags the whole enclosing block, which is what the
 * button appears to promise when the caret is just sitting in the text.
 */
export function applySize(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  size: TextSize
): Edit {
  const [lineStart, lineEnd] = selectionOrLine(value, selectionStart, selectionEnd);
  const [start, end] = expandOverMarkers(
    value,
    lineStart,
    lineEnd,
    (before) => before.match(SIZE_OPEN_AT_END)?.[0] ?? null,
    "[/size]"
  );

  const before = value.slice(0, start);
  const selected = value.slice(start, end);
  const after = value.slice(end);

  const stripped = selected.replace(SIZE_OPEN, "").replace(SIZE_CLOSE, "");

  // Nothing to tag. Without this, pressing a size button on an empty line left
  // a stray `[size=sm][/size]` sitting in the text.
  if (!stripped) {
    return { value, selectionStart, selectionEnd };
  }

  // "md" is the default, so it clears the tag rather than adding a redundant one.
  const wrapped = size === "md" ? stripped : `[size=${size}]${stripped}[/size]`;
  const offset = size === "md" ? 0 : `[size=${size}]`.length;

  return {
    value: `${before}${wrapped}${after}`,
    selectionStart: start + offset,
    selectionEnd: start + offset + stripped.length,
  };
}

/** Toggles bold across the selection instead of nesting another `**` pair. */
export function applyBold(value: string, selectionStart: number, selectionEnd: number): Edit {
  const [lineStart, lineEnd] = selectionOrLine(value, selectionStart, selectionEnd);
  const [start, end] = expandOverMarkers(
    value,
    lineStart,
    lineEnd,
    (before) => (before.endsWith("**") ? "**" : null),
    "**"
  );

  const before = value.slice(0, start);
  const selected = value.slice(start, end);
  const after = value.slice(end);

  // Same guard as applySize: never leave an empty `****` behind.
  if (!selected) {
    return { value, selectionStart, selectionEnd };
  }

  if (selected.includes("**")) {
    const stripped = selected.split("**").join("");
    return {
      value: `${before}${stripped}${after}`,
      selectionStart: start,
      selectionEnd: start + stripped.length,
    };
  }

  return {
    value: `${before}**${selected}**${after}`,
    selectionStart: start + 2,
    selectionEnd: start + 2 + selected.length,
  };
}
