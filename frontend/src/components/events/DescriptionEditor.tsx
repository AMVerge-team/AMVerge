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

/**
 * what-you-see editor for event descriptions. formatting shows as formatting
 * while typing rather than as raw markers, but what leaves this component is
 * still the restricted markup from `descriptionMarkup.ts`: no HTML is ever
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
  // what we last handed upward. used to tell our own edits apart from a value
  // arriving from outside, so typing never triggers a re-render that would
  // throw the caret back to the start
  const lastSerialized = useRef<string>("");

  /**
   * a format applied with the caret collapsed is *pending*: the browser holds
   * it and only creates an element once something is typed. until then the DOM
   * still describes the old formatting, so the buttons would not light up until
   * the host started typing. this remembers the intent, and is dropped as soon
   * as the caret moves or the text materialises it.
   */
  const pendingRef = useRef<
    { size: TextSize | null; bold: boolean; node: Node | null; offset: number } | null
  >(null);

  const [boldActive, setBoldActive] = useState(false);
  // null when the selection spans more than one size, so no button claims to be
  // the current one
  const [activeSize, setActiveSize] = useState<TextSize | null>("md");

  /** reads what the caret or selection is currently sitting inside */
  const syncFormatState = useCallback(() => {
    const editor = editorRef.current;
    if (!editor || document.activeElement !== editor) return;

    // read from our own DOM rather than queryCommandValue, which answers with
    // a different scale on WebKit than on Chromium and made the size buttons
    // highlight the wrong one on macOS
    const { bold, size } = readActiveFormat(editor);

    // keep a pending format only while the caret has not moved off the spot it
    // was applied at. any real movement means the intent is stale
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

  // selectionchange is the only event that fires for caret moves made with the
  // keyboard, the mouse, and by the format commands alike
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
    // ask for <font size> rather than inline CSS, which is the form the
    // serializer can map back to our three sizes
    document.execCommand("styleWithCSS", false, "false");
    document.execCommand(command, false, argument);
    pushChange();

    // with a collapsed caret nothing has changed in the DOM yet, so record what
    // was asked for and show it straight away rather than after the first
    // keystroke
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
            // without this the button steals focus on mousedown, collapsing the
            // selection before the command ever runs
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
            // paste as plain text: whatever formatting came from elsewhere is
            // not ours to interpret, and pasting live HTML in here is exactly
            // what this editor exists to avoid
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
