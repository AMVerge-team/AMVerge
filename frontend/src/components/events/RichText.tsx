import { Fragment } from "react";

import { parseRichText } from "./descriptionMarkup";

/**
 * renders event description markup as React elements. nothing here goes through
 * `dangerouslySetInnerHTML`, so text a community member wrote cannot become
 * markup in anyone else's app.
 */
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
