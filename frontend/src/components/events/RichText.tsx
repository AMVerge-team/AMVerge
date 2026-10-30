import { Fragment } from "react";

import { parseRichText } from "./descriptionMarkup";

/** renders description markup as React elements, never `dangerouslySetInnerHTML` */
export default function RichText({
  value,
  className,
}: {
  value: string;
  className?: string;
}) {
  const lines = parseRichText(value);

  return (
    <div className={className}>
      {lines.map((line, lineIndex) => (
        <p key={lineIndex} className="event-rich-line">
          {line.length === 0 ? (
            <br />
          ) : (
            line.map((span, spanIndex) => (
              <Fragment key={spanIndex}>
                <span
                  className={`event-rich-size-${span.size}${span.bold ? " event-rich-bold" : ""}`}
                >
                  {span.text}
                </span>
              </Fragment>
            ))
          )}
        </p>
      ))}
    </div>
  );
}
