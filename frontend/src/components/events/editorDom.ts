import { parseRichText, type TextSize } from "./descriptionMarkup";

/**
 * Bridge between the editable DOM and our restricted markup.
 *
 * `serializeRoot` is the security boundary: the editor's DOM may contain
 * whatever the browser or a paste produced, but only bold and the three known
 * sizes survive the trip out. Everything else — tags, attributes, event
 * handlers, urls — collapses to plain text, so what gets stored and rendered in
 * other people's apps can never be markup.
 */

/**
 * `execCommand("fontSize")` only speaks the legacy 1-7 scale, so each of our
 * three sizes borrows one of its steps and is mapped back on the way out.
 */
export const SIZE_TO_FONT: Record<TextSize, string> = { sm: "2", md: "3", lg: "5" };
export const FONT_TO_SIZE: Record<string, TextSize> = { "2": "sm", "3": "md", "5": "lg" };

function isTextSize(value: string | undefined): value is TextSize {
  return value === "sm" || value === "md" || value === "lg";
}

function serialize(node: Node, bold: boolean, size: TextSize): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
  if (!(node instanceof HTMLElement)) return "";
  if (node.tagName === "BR") return "\n";

  // Never read the contents of an element that carries code rather than text.
  if (node.tagName === "SCRIPT" || node.tagName === "STYLE") return "";

  let nextBold = bold;
  let nextSize = size;

  if (node.tagName === "B" || node.tagName === "STRONG") nextBold = true;
  if (node.style.fontWeight === "bold" || Number(node.style.fontWeight) >= 600) nextBold = true;

  if (node.tagName === "FONT") {
    const mapped = FONT_TO_SIZE[node.getAttribute("size") ?? ""];
    if (mapped) nextSize = mapped;
  }
  if (isTextSize(node.dataset.size)) nextSize = node.dataset.size;

  const isBlock = node.tagName === "DIV" || node.tagName === "P";
  const children = Array.from(node.childNodes);

  // A block's trailing <br> is the browser's filler for an empty or final line,
  // not a line break the host typed. Counting it as well as the block's own
  // newline turned every blank line into two.
  const last = children[children.length - 1];
  if (isBlock && last instanceof HTMLElement && last.tagName === "BR") {
    children.pop();
  }

  let inner = children.map((child) => serialize(child, nextBold, nextSize)).join("");

  if (inner) {
    if (nextSize !== size) inner = `[size=${nextSize}]${inner}[/size]`;
    if (nextBold !== bold) inner = `**${inner}**`;
  }

  // contentEditable wraps each line in its own block element.
  return isBlock ? `${inner}\n` : inner;
}

export function serializeRoot(root: HTMLElement): string {
  const text = Array.from(root.childNodes)
    .map((child) => serialize(child, false, "md"))
    .join("");

  // The last block contributes a trailing newline that was never typed.
  return text.replace(/\n$/, "");
}

/** Paints markup into the editor as real formatted nodes, never via innerHTML. */
export function renderInto(root: HTMLElement, markup: string): void {
  root.replaceChildren();

  for (const line of parseRichText(markup)) {
    const block = root.ownerDocument.createElement("div");

    if (line.length === 0) {
      block.appendChild(root.ownerDocument.createElement("br"));
    } else {
      for (const span of line) {
        let node: Node = root.ownerDocument.createTextNode(span.text);

        if (span.size !== "md") {
          const sized = root.ownerDocument.createElement("span");
          sized.dataset.size = span.size;
          sized.appendChild(node);
          node = sized;
        }

        if (span.bold) {
          const strong = root.ownerDocument.createElement("strong");
          strong.appendChild(node);
          node = strong;
        }

        block.appendChild(node);
      }
    }

    root.appendChild(block);
  }
}
