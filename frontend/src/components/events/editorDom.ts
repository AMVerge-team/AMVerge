import { parseRichText, type TextSize } from "./descriptionMarkup";

// bridge between the editable DOM and our markup; `serializeRoot` is the security boundary where only bold and sizes survive

/** execCommand("fontSize") only speaks 1-7, so each size borrows a step and is mapped back */
export const SIZE_TO_FONT: Record<TextSize, string> = { sm: "2", md: "3", lg: "5" };
export const FONT_TO_SIZE: Record<string, TextSize> = { "2": "sm", "3": "md", "5": "lg" };

function isTextSize(value: string | undefined): value is TextSize {
  return value === "sm" || value === "md" || value === "lg";
}

function serialize(node: Node, bold: boolean, size: TextSize): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
  if (!(node instanceof HTMLElement)) return "";
  if (node.tagName === "BR") return "\n";

  // never read the contents of an element that carries code rather than text
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

  // a block's trailing <br> is browser filler, not a typed break; counting it doubled blank lines
  const last = children[children.length - 1];
  if (isBlock && last instanceof HTMLElement && last.tagName === "BR") {
    children.pop();
  }

  let inner = children.map((child) => serialize(child, nextBold, nextSize)).join("");

  if (inner) {
    if (nextSize !== size) inner = `[size=${nextSize}]${inner}[/size]`;
    if (nextBold !== bold) inner = `**${inner}**`;
  }

  // contentEditable wraps each line in its own block element
  return isBlock ? `${inner}\n` : inner;
}

export function serializeRoot(root: HTMLElement): string {
  const text = Array.from(root.childNodes)
    .map((child) => serialize(child, false, "md"))
    .join("");

  // the last block contributes a trailing newline that was never typed
  return text.replace(/\n$/, "");
}

/** paints markup into the editor as real formatted nodes, never via innerHTML */
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

/** the caret's current format, read from our own elements since queryCommandValue differs between engines; size null when mixed */
export function readActiveFormat(editor: HTMLElement): { bold: boolean; size: TextSize | null } {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return { bold: false, size: null };

  const sizeAt = (node: Node | null): TextSize | null => {
    let current: Node | null = node;

    while (current && current !== editor) {
      if (current instanceof HTMLElement) {
        if (isTextSize(current.dataset.size)) return current.dataset.size;
        if (current.tagName === "FONT") {
          const mapped = FONT_TO_SIZE[current.getAttribute("size") ?? ""];
          if (mapped) return mapped;
        }
      }
      current = current.parentNode;
    }

    // nothing wrapping it means the editor's own size, which is "md"
    return "md";
  };

  const boldAt = (node: Node | null): boolean => {
    let current: Node | null = node;

    while (current && current !== editor) {
      if (current instanceof HTMLElement) {
        if (current.tagName === "B" || current.tagName === "STRONG") return true;
        const weight = current.style.fontWeight;
        if (weight === "bold" || Number(weight) >= 600) return true;
      }
      current = current.parentNode;
    }

    return false;
  };

  const anchorSize = sizeAt(selection.anchorNode);
  const focusSize = selection.isCollapsed ? anchorSize : sizeAt(selection.focusNode);

  return {
    bold: boldAt(selection.anchorNode),
    size: anchorSize === focusSize ? anchorSize : null,
  };
}
