import { useCallback, useEffect, useRef, useState } from "react";
import { FaBold } from "react-icons/fa";

import Tooltip from "../common/Tooltip";
import { SIZE_TO_FONT, readActiveFormat, renderInto, serializeRoot } from "./editorDom";
import type { TextSize } from "./descriptionMarkup";

const SIZE_BUTTONS: { size: TextSize; label: string; title: string }[] = [
  { size: "sm", label: "A", title: "Small text" },
  { size: "md", label: "A", title: "Normal text" },
  { size: "lg", label: "A", title: "Large text" },
];

/** wysiwyg editor for descriptions; only the restricted markup from `descriptionMarkup.ts` leaves it, never html */
export default function DescriptionEditor({
  value,
  onChange,
  maxLength,
  id,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  maxLength: number;
  id?: string;
  placeholder?: string;
}) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  // what we last emitted, to tell our own edits from outside values so typing never resets the caret
  const lastSerialized = useRef<string>("");

  /** a format applied at a collapsed caret, shown on the buttons until the caret moves or text materialises it */
  const pendingRef = useRef<
    { size: TextSize | null; bold: boolean; node: Node | null; offset: number } | null
  >(null);

  const [boldActive, setBoldActive] = useState(false);
  // null when the selection spans several sizes
  const [activeSize, setActiveSize] = useState<TextSize | null>("md");

  /** reads what the caret or selection is currently sitting inside */
  const syncFormatState = useCallback(() => {
    const editor = editorRef.current;
    if (!editor || document.activeElement !== editor) return;

    // read from our own DOM; queryCommandValue answers on a different scale in WebKit
    const { bold, size } = readActiveFormat(editor);

    // a pending format only lasts while the caret stays where it was applied
    const selection = window.getSelection();
    const pending = pendingRef.current;
    const stillThere =
      pending !== null &&
      selection !== null &&
      selection.isCollapsed &&
      selection.anchorNode === pending.node &&
      selection.anchorOffset === pending.offset;

    if (stillThere) {
      setBoldActive(pending.bold);
      setActiveSize(pending.size);
      return;
    }

    pendingRef.current = null;
    setBoldActive(bold);
    setActiveSize(size);
  }, []);

  // selectionchange is the one event for caret moves from keyboard, mouse and commands alike
  useEffect(() => {
    document.addEventListener("selectionchange", syncFormatState);
    return () => document.removeEventListener("selectionchange", syncFormatState);
  }, [syncFormatState]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || value === lastSerialized.current) return;

    renderInto(editor, value);
    lastSerialized.current = value;
  }, [value]);

  const pushChange = () => {
    const editor = editorRef.current;
    if (!editor) return;

    const markup = serializeRoot(editor);

    if (markup.length > maxLength) {
      // put back the last accepted state rather than storing an over-long value
      renderInto(editor, lastSerialized.current);
      return;
    }

    lastSerialized.current = markup;
    onChange(markup);
  };

  /** typing turns a pending style into real markup, so the DOM takes over */
  const handleInput = () => {
    pendingRef.current = null;
    pushChange();
  };

  const runCommand = (command: string, argument?: string, intendedSize?: TextSize) => {
    const editor = editorRef.current;
    if (!editor) return;

    editor.focus();
    // <font size>, not inline css, so the serializer can map it back to our sizes
    document.execCommand("styleWithCSS", false, "false");
    document.execCommand(command, false, argument);
    pushChange();

    // a collapsed caret changes nothing yet, so the format is recorded and shown at once
    const selection = window.getSelection();
    if (selection?.isCollapsed) {
      const current = readActiveFormat(editor);
      pendingRef.current = {
        size: intendedSize ?? current.size,
        bold: command === "bold" ? !boldActive : current.bold,
        node: selection.anchorNode,
        offset: selection.anchorOffset,
      };
    } else {
      pendingRef.current = null;
    }

    syncFormatState();
  };

  const isEmpty = value.length === 0;

  return (
    <div className="event-description-editor">
      <div className="event-description-toolbar">
        <Tooltip content="Bold (Ctrl+B)">
          <button
            type="button"
            className={`event-format-button${boldActive ? " is-active" : ""}`}
            // keeps the button from stealing focus and collapsing the selection
            onMouseDown={(mouseEvent) => mouseEvent.preventDefault()}
            onClick={() => runCommand("bold")}
            aria-pressed={boldActive}
            aria-label="Bold"
          >
            <FaBold aria-hidden="true" />
          </button>
        </Tooltip>

        <span className="event-format-divider" />

        {SIZE_BUTTONS.map(({ size, label, title }) => (
          <Tooltip key={size} content={title}>
            <button
              type="button"
              className={`event-format-button event-format-size-${size}${activeSize === size ? " is-active" : ""}`}
              onMouseDown={(mouseEvent) => mouseEvent.preventDefault()}
              onClick={() => runCommand("fontSize", SIZE_TO_FONT[size], size)}
              aria-pressed={activeSize === size}
              aria-label={title}
            >
              {label}
            </button>
          </Tooltip>
        ))}

        <span className="event-description-count">
          {value.length}/{maxLength}
        </span>
      </div>

      <div className="event-description-surface">
        <div
          id={id}
          ref={editorRef}
          className="event-description-input"
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-multiline="true"
          aria-label="Description"
          onInput={handleInput}
          onBlur={pushChange}
          onKeyDown={(keyEvent) => {
            if ((keyEvent.ctrlKey || keyEvent.metaKey) && keyEvent.key.toLowerCase() === "b") {
              keyEvent.preventDefault();
              runCommand("bold");
            }
          }}
          onPaste={(pasteEvent) => {
            // paste as plain text; foreign html is exactly what this editor avoids
            pasteEvent.preventDefault();
            const text = pasteEvent.clipboardData.getData("text/plain");
            document.execCommand("insertText", false, text);
          }}
        />

        {isEmpty && <span className="event-description-placeholder">{placeholder}</span>}
      </div>
    </div>
  );
}
