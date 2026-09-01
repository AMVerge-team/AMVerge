import { useCallback, useEffect, useRef, useState } from "react";
import { FaBold } from "react-icons/fa";

import Tooltip from "../common/Tooltip";
import { FONT_TO_SIZE, SIZE_TO_FONT, renderInto, serializeRoot } from "./editorDom";
import type { TextSize } from "./descriptionMarkup";

const SIZE_BUTTONS: { size: TextSize; label: string; title: string }[] = [
  { size: "sm", label: "A", title: "Small text" },
  { size: "md", label: "A", title: "Normal text" },
  { size: "lg", label: "A", title: "Large text" },
];

/**
 * What-you-see editor for event descriptions. Formatting shows as formatting
 * while typing rather than as raw markers, but what leaves this component is
 * still the restricted markup from `descriptionMarkup.ts` — no HTML is ever
 * stored or sent, so a description cannot become markup in anyone else's app.
 */
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
  // What we last handed upward. Used to tell our own edits apart from a value
  // arriving from outside, so typing never triggers a re-render that would
  // throw the caret back to the start.
  const lastSerialized = useRef<string>("");

  const [boldActive, setBoldActive] = useState(false);
  // null when the selection spans more than one size, so no button claims to be
  // the current one.
  const [activeSize, setActiveSize] = useState<TextSize | null>("md");

  /** Reads what the caret or selection is currently sitting inside. */
  const syncFormatState = useCallback(() => {
    const editor = editorRef.current;
    if (!editor || document.activeElement !== editor) return;

    setBoldActive(document.queryCommandState("bold"));
    // Returns "" for a mixed selection, which is exactly the case where nothing
    // should be highlighted.
    setActiveSize(FONT_TO_SIZE[document.queryCommandValue("fontSize")] ?? null);
  }, []);

  // selectionchange is the only event that fires for caret moves made with the
  // keyboard, the mouse, and by the format commands alike.
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
      // Put back the last accepted state rather than storing an over-long value.
      renderInto(editor, lastSerialized.current);
      return;
    }

    lastSerialized.current = markup;
    onChange(markup);
  };

  const runCommand = (command: string, argument?: string) => {
    const editor = editorRef.current;
    if (!editor) return;

    editor.focus();
    // Ask for <font size> rather than inline CSS, which is the form the
    // serializer can map back to our three sizes.
    document.execCommand("styleWithCSS", false, "false");
    document.execCommand(command, false, argument);
    pushChange();
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
            // Without this the button steals focus on mousedown, collapsing the
            // selection before the command ever runs.
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
              onClick={() => runCommand("fontSize", SIZE_TO_FONT[size])}
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
          onInput={pushChange}
          onBlur={pushChange}
          onKeyDown={(keyEvent) => {
            if ((keyEvent.ctrlKey || keyEvent.metaKey) && keyEvent.key.toLowerCase() === "b") {
              keyEvent.preventDefault();
              runCommand("bold");
            }
          }}
          onPaste={(pasteEvent) => {
            // Paste as plain text: whatever formatting came from elsewhere is
            // not ours to interpret, and pasting live HTML in here is exactly
            // what this editor exists to avoid.
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
