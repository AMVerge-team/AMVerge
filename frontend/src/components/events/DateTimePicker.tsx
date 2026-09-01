import { useEffect, useMemo, useRef, useState } from "react";
import { FaChevronLeft, FaChevronRight, FaRegCalendarAlt } from "react-icons/fa";

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MINUTE_STEP = 5;

/**
 * The value is the same `YYYY-MM-DDTHH:mm` local string a `datetime-local`
 * input produces, so everything downstream is unchanged — only the picker UI
 * differs.
 */
function parseValue(value: string): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** Six rows of seven, so the grid never changes height as months change. */
function monthGrid(view: Date): Date[] {
  const first = new Date(view.getFullYear(), view.getMonth(), 1);
  const start = new Date(first);
  start.setDate(1 - first.getDay());

  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(start);
    day.setDate(start.getDate() + index);
    return day;
  });
}

export default function DateTimePicker({
  value,
  onChange,
  id,
  placeholder = "Pick a date and time",
  minDate,
}: {
  value: string;
  onChange: (value: string) => void;
  id?: string;
  placeholder?: string;
  /** Earliest selectable day. Defaults to today; the end field passes the start
   *  date so an end before the start cannot be picked at all. */
  minDate?: Date;
}) {
  const selected = parseValue(value);

  const [open, setOpen] = useState(false);
  const [view, setView] = useState<Date>(() => selected ?? new Date());
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Reopening on an existing value should land on that month, not last month
  // the user happened to browse to.
  useEffect(() => {
    if (open && selected) setView(new Date(selected.getFullYear(), selected.getMonth(), 1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        setOpen(false);
      }
    };

    document.addEventListener("pointerdown", onPointerDown);
    // Capture phase: the modal closes on Escape too, and the picker should be
    // what closes first.
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open]);

  const days = useMemo(() => monthGrid(view), [view]);
  const today = new Date();
  // Events cannot be scheduled into the past, and an end cannot precede its
  // start. Compared at day granularity so the boundary day itself stays
  // available.
  const floor = minDate && minDate > today ? minDate : today;
  const earliestDay = new Date(floor.getFullYear(), floor.getMonth(), floor.getDate());

  const commit = (next: Date) => onChange(toValue(next));

  const pickDay = (day: Date) => {
    const next = new Date(day);
    // Keep whatever time was already chosen; a fresh pick starts at midday,
    // which is a likelier intent than midnight.
    next.setHours(selected?.getHours() ?? 12, selected?.getMinutes() ?? 0, 0, 0);
    commit(next);
  };

  const setTime = (hours: number, minutes: number) => {
    const next = new Date(selected ?? new Date());
    next.setHours(hours, minutes, 0, 0);
    commit(next);
  };

  const hour12 = selected ? selected.getHours() % 12 || 12 : 12;
  const isPm = selected ? selected.getHours() >= 12 : false;

  const minuteOptions = useMemo(() => {
    const steps = Array.from({ length: 60 / MINUTE_STEP }, (_, i) => i * MINUTE_STEP);
    // An event edited from an older value may sit off the step grid; keep its
    // exact minute selectable rather than silently rounding it.
    const current = selected?.getMinutes();
    if (current !== undefined && !steps.includes(current)) {
      steps.push(current);
      steps.sort((a, b) => a - b);
    }
    return steps;
  }, [selected]);

  const display = selected
    ? selected.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "";

  return (
    <div className="event-datetime" ref={containerRef}>
      <button
        type="button"
        id={id}
        className={`event-datetime-trigger${open ? " is-open" : ""}`}
        onClick={() => setOpen((previous) => !previous)}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span className={display ? "" : "is-placeholder"}>{display || placeholder}</span>
        <FaRegCalendarAlt aria-hidden="true" />
      </button>

      {open && (
        <div className="event-datetime-popover" role="dialog" aria-label="Choose date and time">
          <div className="event-datetime-month">
            <button
              type="button"
              className="event-datetime-nav"
              onClick={() => setView(new Date(view.getFullYear(), view.getMonth() - 1, 1))}
              aria-label="Previous month"
            >
              <FaChevronLeft aria-hidden="true" />
            </button>
            <span>
              {view.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
            </span>
            <button
              type="button"
              className="event-datetime-nav"
              onClick={() => setView(new Date(view.getFullYear(), view.getMonth() + 1, 1))}
              aria-label="Next month"
            >
              <FaChevronRight aria-hidden="true" />
            </button>
          </div>

          <div className="event-datetime-weekdays">
            {WEEKDAYS.map((day) => (
              <span key={day}>{day}</span>
            ))}
          </div>

          <div className="event-datetime-days">
            {days.map((day) => {
              const outside = day.getMonth() !== view.getMonth();
              const isSelected = selected ? sameDay(day, selected) : false;
              const isToday = sameDay(day, today);
              const isPast = day < earliestDay;

              return (
                <button
                  key={day.toISOString()}
                  type="button"
                  className={`event-datetime-day${outside ? " is-outside" : ""}${
                    isSelected ? " is-selected" : ""
                  }${isToday ? " is-today" : ""}`}
                  onClick={() => pickDay(day)}
                  disabled={isPast}
                >
                  {day.getDate()}
                </button>
              );
            })}
          </div>

          <div className="event-datetime-time">
            <select
              className="event-datetime-select"
              value={hour12}
              onChange={(event) => {
                const picked = Number(event.target.value) % 12;
                setTime(isPm ? picked + 12 : picked, selected?.getMinutes() ?? 0);
              }}
              aria-label="Hour"
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map((hour) => (
                <option key={hour} value={hour}>
                  {hour}
                </option>
              ))}
            </select>

            <span className="event-datetime-colon">:</span>

            <select
              className="event-datetime-select"
              value={selected?.getMinutes() ?? 0}
              onChange={(event) =>
                setTime(selected?.getHours() ?? 12, Number(event.target.value))
              }
              aria-label="Minute"
            >
              {minuteOptions.map((minute) => (
                <option key={minute} value={minute}>
                  {String(minute).padStart(2, "0")}
                </option>
              ))}
            </select>

            <div className="event-datetime-meridiem">
              {(["AM", "PM"] as const).map((label) => {
                const wantsPm = label === "PM";
                return (
                  <button
                    key={label}
                    type="button"
                    className={`event-datetime-meridiem-option${
                      isPm === wantsPm ? " is-selected" : ""
                    }`}
                    onClick={() => {
                      const base = selected?.getHours() ?? 12;
                      const hour = base % 12;
                      setTime(wantsPm ? hour + 12 : hour, selected?.getMinutes() ?? 0);
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="event-datetime-actions">
            <button
              type="button"
              className="event-datetime-link"
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
            >
              Clear
            </button>
            <button
              type="button"
              className="event-datetime-link"
              onClick={() => {
                const next = new Date();
                next.setSeconds(0, 0);
                setView(new Date(next.getFullYear(), next.getMonth(), 1));
                commit(next);
              }}
            >
              Now
            </button>
            <button
              type="button"
              className="event-datetime-done"
              onClick={() => setOpen(false)}
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
