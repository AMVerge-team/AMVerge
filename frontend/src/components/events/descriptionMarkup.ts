// tiny markup for event descriptions (bold, three sizes), parsed to data and rendered as React, so bad tags are just text

export type TextSize = "sm" | "md" | "lg";

/** the only sizes accepted; anything else is treated as literal text */
export const TEXT_SIZES: TextSize[] = ["sm", "md", "lg"];

export type RichSpan = {
  text: string;
  bold: boolean;
  size: TextSize;
};

/** one line of spans. blank lines survive as empty arrays */
export type RichLine = RichSpan[];

const TOKEN = /\*\*|\[size=(sm|md|lg)\]|\[\/size\]/g;

/** parses the markup into lines of styled spans; unclosed markers run to the end so a half-typed description renders */
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

  // split into lines afterwards so a style can span a line break
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

/** plain text with the markup stripped, for previews and search */
export function stripRichText(source: string): string {
  return source.replace(TOKEN, "");
}

export type Edit = { value: string; selectionStart: number; selectionEnd: number };

/** wraps the selection in a marker pair, or inserts one at the caret; returns the text and new selection */
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

/** with an empty selection, act on the whole line the caret sits in */
function selectionOrLine(value: string, start: number, end: number): [number, number] {
  if (start !== end) return [start, end];

  const lineStart = value.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
  const lineEnd = value.indexOf("\n", end);
  return [lineStart, lineEnd === -1 ? value.length : lineEnd];
}

/** grows the range over marker pairs right outside it, so a repeat press doesn't wrap them again */
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

/** sets the selection's size, replacing any existing size; with nothing selected it retags the enclosing block */
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

  // nothing to tag; an empty line would otherwise get a stray `[size=sm][/size]`
  if (!stripped) {
    return { value, selectionStart, selectionEnd };
  }

  // "md" is the default, so it clears the tag rather than adding a redundant one
  const wrapped = size === "md" ? stripped : `[size=${size}]${stripped}[/size]`;
  const offset = size === "md" ? 0 : `[size=${size}]`.length;

  return {
    value: `${before}${wrapped}${after}`,
    selectionStart: start + offset,
    selectionEnd: start + offset + stripped.length,
  };
}

/** toggles bold across the selection instead of nesting another `**` pair */
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

  // same guard as applySize: never leave an empty `****` behind
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
