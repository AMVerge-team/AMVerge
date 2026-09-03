import {
  cloneElement,
  createContext,
  isValidElement,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FocusEvent as ReactFocusEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
  type ReactNode,
  type Ref,
} from "react";
import { createPortal } from "react-dom";

export type TooltipSide = "top" | "bottom" | "left" | "right";
export type TooltipAlign = "start" | "center" | "end";

/** the twelve side/align pairs, written the way floating UI kits name them */
export type TooltipPlacement =
  | TooltipSide
  | `${TooltipSide}-${Exclude<TooltipAlign, "center">}`;

function splitPlacement(placement: TooltipPlacement): [TooltipSide, TooltipAlign] {
  const dash = placement.indexOf("-");
  return dash === -1
    ? [placement as TooltipSide, "center"]
    : [
        placement.slice(0, dash) as TooltipSide,
        placement.slice(dash + 1) as TooltipAlign,
      ];
}

type TooltipGroup = {
  /** hover time before a tooltip opens */
  delay: number;
  /** grace time before a tooltip closes once the pointer leaves */
  closeDelay: number;
  /**
   * window after a tooltip closes during which the next one opens instantly.
   * this is what makes a row of icon buttons feel like one surface: the first
   * hover waits, hopping between neighbours does not.
   */
  timeout: number;
  lastClosedAt: { current: number };
};

const DEFAULT_GROUP: TooltipGroup = {
  delay: 600,
  closeDelay: 0,
  timeout: 400,
  // module-level ref: without a provider every tooltip in the app still shares
  // one hop window, which is the behaviour you want by default
  lastClosedAt: { current: 0 },
};

const TooltipGroupContext = createContext<TooltipGroup>(DEFAULT_GROUP);

/**
 * optional wrapper that retunes the hover timings of the tooltips below it (a
 * dense toolbar may want a shorter delay). tooltips work without it.
 */
export function TooltipProvider({
  delay = DEFAULT_GROUP.delay,
  closeDelay = DEFAULT_GROUP.closeDelay,
  timeout = DEFAULT_GROUP.timeout,
  children,
}: {
  delay?: number;
  closeDelay?: number;
  timeout?: number;
  children: ReactNode;
}) {
  const lastClosedAt = useRef(0);
  const group = useMemo<TooltipGroup>(
    () => ({ delay, closeDelay, timeout, lastClosedAt }),
    [delay, closeDelay, timeout]
  );
  return (
    <TooltipGroupContext.Provider value={group}>
      {children}
    </TooltipGroupContext.Provider>
  );
}

const OPPOSITE: Record<TooltipSide, TooltipSide> = {
  top: "bottom",
  bottom: "top",
  left: "right",
  right: "left",
};

/** keeps the arrow off the rounded corners when the bubble gets shifted */
const ARROW_INSET = 14;
/**
 * sideways slide the bubble may take before the perpendicular axis is tried
 * instead. past it the bubble hangs off to one side of its trigger: beside it
 * reads far better, which is what puts a corner button's tooltip next to it
 * rather than above and pushed inwards.
 */
const SHIFT_TOLERANCE = 12;
/**
 * a left/right placement may squeeze the bubble down to this width; it wraps
 * onto more lines instead of being rejected. below it the text is shredded into
 * a column, so the bubble goes back above or below the trigger.
 */
const MIN_SIDE_WIDTH = 120;
/** matches the closing animation in styles/common/tooltip.css */
const CLOSE_MS = 110;

type Placement = {
  left: number;
  top: number;
  side: TooltipSide;
  /** arrow offset along the bubble cross axis, in px from its top/left edge */
  arrow: number;
  /** width the bubble may take on this side, once the window is accounted for */
  cap: number;
};

/** a placement plus what it cost, so the candidates can be compared */
type Candidate = Placement & {
  /** room available on this side of the trigger */
  room: number;
  /** how far the bubble had to slide along its cross axis to stay on screen */
  shift: number;
  /** whether the bubble fits on this side at all */
  fitsSide: boolean;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

/** lays the bubble out on one given side and reports what that placement cost */
function candidateFor(
  side: TooltipSide,
  anchor: DOMRect,
  width: number,
  height: number,
  align: TooltipAlign,
  sideOffset: number,
  alignOffset: number,
  padding: number
): Candidate {
  // clientWidth/Height, not innerWidth/Height: the latter counts the scrollbar,
  // which a fixed element cannot be laid out under. using it leaves phantom
  // room on the scrollbar side, which is enough to make a right-hand trigger look like
  // it barely fits above, while its mirror on the left flips beside as it
  // should. the collision box has to be the same box the browser lays out in
  const vw = document.documentElement.clientWidth;
  const vh = document.documentElement.clientHeight;

  const vertical = side === "top" || side === "bottom";
  const crossSize = vertical ? width : height;
  const mainSize = vertical ? height : width;
  const crossViewport = vertical ? vw : vh;
  const mainViewport = vertical ? vh : vw;
  const anchorStart = vertical ? anchor.left : anchor.top;
  const anchorSize = vertical ? anchor.width : anchor.height;

  const room =
    side === "top"
      ? anchor.top
      : side === "bottom"
        ? vh - anchor.bottom
        : side === "left"
          ? anchor.left
          : vw - anchor.right;

  // beside the trigger the bubble is free to wrap narrower; above or below it
  // only has to clear the window's own edges
  const cap = vertical
    ? crossViewport - padding * 2
    : room - sideOffset - padding;
  // height cannot be squeezed (text just wraps taller), so a top/bottom
  // placement still has to fit outright
  const fitsSide = vertical
    ? room >= mainSize + sideOffset + padding
    : cap >= Math.min(width, MIN_SIDE_WIDTH);

  const wantedCross =
    align === "start"
      ? anchorStart + alignOffset
      : align === "end"
        ? anchorStart + anchorSize - crossSize - alignOffset
        : anchorStart + anchorSize / 2 - crossSize / 2 + alignOffset;
  const cross = clamp(wantedCross, padding, crossViewport - crossSize - padding);

  const wantedMain =
    side === "top"
      ? anchor.top - height - sideOffset
      : side === "bottom"
        ? anchor.bottom + sideOffset
        : side === "left"
          ? anchor.left - width - sideOffset
          : anchor.right + sideOffset;
  const main = clamp(wantedMain, padding, mainViewport - mainSize - padding);

  const arrow = clamp(
    anchorStart + anchorSize / 2 - cross,
    ARROW_INSET,
    crossSize - ARROW_INSET
  );

  return {
    left: vertical ? cross : main,
    top: vertical ? main : cross,
    side,
    arrow,
    cap,
    room,
    shift: Math.abs(cross - wantedCross),
    fitsSide,
  };
}

/**
 * three collision behaviours, in order of preference: keep the requested side;
 * flip to the opposite one when it has no room; and, when the surviving side
 * only fits by sliding the bubble well off its trigger, cross over to the
 * perpendicular axis: a button parked in a corner gets its tooltip beside it,
 * arrow pointing straight back at it, instead of hanging above and inwards.
 */
function computePlacement(
  anchor: DOMRect,
  width: number,
  height: number,
  side: TooltipSide,
  align: TooltipAlign,
  sideOffset: number,
  alignOffset: number,
  padding: number
): Placement {
  const pick = (s: TooltipSide) =>
    candidateFor(s, anchor, width, height, align, sideOffset, alignOffset, padding);

  let chosen = pick(side);

  if (!chosen.fitsSide) {
    const flipped = pick(OPPOSITE[side]);
    // flip only when it helps: in a viewport too small for either side, staying
    // put and shifting reads better than a bubble that keeps jumping
    if (flipped.fitsSide || flipped.room > chosen.room) chosen = flipped;
  }

  if (chosen.shift > SHIFT_TOLERANCE) {
    const perpendicular: TooltipSide[] =
      side === "top" || side === "bottom" ? ["left", "right"] : ["top", "bottom"];
    const squarer = perpendicular
      .map(pick)
      .filter((c) => c.fitsSide && c.shift <= SHIFT_TOLERANCE)
      // least sliding first, then the side with the most room to breathe
      .sort((a, b) => a.shift - b.shift || b.room - a.room)[0];
    if (squarer) chosen = squarer;
  }

  return {
    left: chosen.left,
    top: chosen.top,
    side: chosen.side,
    arrow: chosen.arrow,
    cap: chosen.cap,
  };
}

function mergeRefs<T>(...refs: (Ref<T> | undefined)[]) {
  return (node: T | null) => {
    for (const ref of refs) {
      if (typeof ref === "function") ref(node);
      else if (ref) (ref as { current: T | null }).current = node;
    }
  };
}

/** the subset of trigger props the tooltip reads back and chains onto */
type TriggerProps = {
  ref?: Ref<HTMLElement>;
  "aria-describedby"?: string;
  onPointerEnter?: (e: ReactPointerEvent<HTMLElement>) => void;
  onPointerLeave?: (e: ReactPointerEvent<HTMLElement>) => void;
  onPointerDown?: (e: ReactPointerEvent<HTMLElement>) => void;
  onFocus?: (e: ReactFocusEvent<HTMLElement>) => void;
  onBlur?: (e: ReactFocusEvent<HTMLElement>) => void;
};

export type TooltipProps = {
  /** bubble contents. an empty value disables the tooltip */
  content: ReactNode;
  /** the trigger. a single element is cloned; anything else gets a wrapper */
  children: ReactNode;
  /**
   * side and alignment in one word: `"bottom-end"` is `side="bottom"` plus
   * `align="end"`. wins over `side`/`align` when both are given.
   */
  placement?: TooltipPlacement;
  side?: TooltipSide;
  align?: TooltipAlign;
  /** gap between trigger and bubble, arrow included */
  sideOffset?: number;
  alignOffset?: number;
  /** minimum distance kept from the window edges */
  collisionPadding?: number;
  /** overrides the group hover delay for this tooltip only */
  delay?: number;
  closeDelay?: number;
  disabled?: boolean;
  /** `accent` tints the frame with the theme colour, for hints worth noticing */
  variant?: "default" | "accent";
  className?: string;
  maxWidth?: number;
};

/**
 * hover/focus tooltip, portalled to `body` so it escapes the panes' `overflow`
 * and stacking contexts. wrap any element:
 *
 * ```tsx
 * <Tooltip content="Export the selected clips">
 *   <button className="buttons">Export</button>
 * </Tooltip>
 * ```
 *
 * the trigger is cloned rather than wrapped, so no extra box lands in the
 * layout: the element must accept a `ref` and the pointer/focus handlers (an
 * intrinsic tag, or a component forwarding its props to one).
 */
export default function Tooltip({
  content,
  children,
  placement: placementProp,
  side: sideProp = "top",
  align: alignProp = "center",
  sideOffset = 8,
  alignOffset = 0,
  collisionPadding = 8,
  delay,
  closeDelay,
  disabled = false,
  variant = "default",
  className,
  maxWidth = 240,
}: TooltipProps) {
  const [side, align] = placementProp
    ? splitPlacement(placementProp)
    : [sideProp, alignProp];

  const group = useContext(TooltipGroupContext);
  const openDelay = delay ?? group.delay;
  const hideDelay = closeDelay ?? group.closeDelay;
  const inactive =
    disabled || content === null || content === undefined || content === "";

  const [open, setOpen] = useState(false);
  // `mounted` outlives `open` by one closing animation
  const [mounted, setMounted] = useState(false);
  const [placement, setPlacement] = useState<Placement | null>(null);

  const anchorRef = useRef<HTMLElement | null>(null);
  const popupRef = useRef<HTMLDivElement | null>(null);
  const openTimer = useRef<number | null>(null);
  const closeTimer = useRef<number | null>(null);
  const unmountTimer = useRef<number | null>(null);
  const openRef = useRef(false);
  const id = useId();

  /**
   * hover timers only. the unmount timer is deliberately left alone: a hide
   * that lands while one is already pending (pointer leaves, then Escape or a
   * window blur) must not cancel the unmount it will then decline to reschedule.
   */
  const clearHoverTimers = useCallback(() => {
    for (const timer of [openTimer, closeTimer]) {
      if (timer.current !== null) {
        window.clearTimeout(timer.current);
        timer.current = null;
      }
    }
  }, []);

  const clearTimers = useCallback(() => {
    clearHoverTimers();
    if (unmountTimer.current !== null) {
      window.clearTimeout(unmountTimer.current);
      unmountTimer.current = null;
    }
  }, [clearHoverTimers]);

  const show = useCallback(() => {
    clearTimers();
    openRef.current = true;
    setMounted(true);
    setOpen(true);
  }, [clearTimers]);

  const hide = useCallback(
    (immediate = false) => {
      clearHoverTimers();
      const commit = () => {
        if (!openRef.current) return;
        openRef.current = false;
        // stamped on close so the next trigger can skip its delay
        group.lastClosedAt.current = Date.now();
        setOpen(false);
        unmountTimer.current = window.setTimeout(() => {
          unmountTimer.current = null;
          setMounted(false);
          setPlacement(null);
        }, CLOSE_MS);
      };
      if (immediate || hideDelay <= 0) commit();
      else closeTimer.current = window.setTimeout(commit, hideDelay);
    },
    [clearHoverTimers, group, hideDelay]
  );

  const scheduleOpen = useCallback(() => {
    if (inactive) return;
    clearHoverTimers();
    const hopping = Date.now() - group.lastClosedAt.current < group.timeout;
    if (hopping || openDelay <= 0) show();
    else openTimer.current = window.setTimeout(show, openDelay);
  }, [clearHoverTimers, group, inactive, openDelay, show]);

  useEffect(() => {
    if (inactive) hide(true);
  }, [inactive, hide]);

  useEffect(() => clearTimers, [clearTimers]);

  useLayoutEffect(() => {
    if (!mounted) return;

    let frame = 0;
    const update = () => {
      const anchor = anchorRef.current;
      const popup = popupRef.current;
      if (!anchor || !popup) return;
      // a trigger inside a list that just unmounted would otherwise leave the
      // bubble stranded over the layout
      if (!anchor.isConnected) {
        hide(true);
        return;
      }
      const rect = anchor.getBoundingClientRect();
      const measure = (limit: number) => {
        popup.style.maxWidth = `${limit}px`;
        return computePlacement(
          rect,
          popup.offsetWidth,
          popup.offsetHeight,
          side,
          align,
          sideOffset,
          alignOffset,
          collisionPadding
        );
      };

      // first pass at the bubble's natural width picks a side. if that side is
      // narrower than the bubble (a corner trigger in a cramped window), the
      // text wraps into what fits there and the placement is redone at the new
      // size, rather than the bubble being pushed back above the trigger
      let next = measure(maxWidth);
      const limit = Math.min(next.cap, maxWidth);
      if (limit < popup.offsetWidth) next = { ...measure(limit), cap: limit };

      setPlacement(next);
    };

    update();

    // capture phase: the panes and the clip grid scroll, not the window
    const onViewportChange = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        update();
      });
    };
    window.addEventListener("scroll", onViewportChange, true);
    window.addEventListener("resize", onViewportChange);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onViewportChange, true);
      window.removeEventListener("resize", onViewportChange);
    };
  }, [
    mounted,
    side,
    align,
    sideOffset,
    alignOffset,
    collisionPadding,
    content,
    maxWidth,
    hide,
  ]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") hide(true);
    };
    // alt-tabbing away leaves the pointer nowhere, so no `pointerleave` fires
    const onWindowBlur = () => hide(true);
    document.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("blur", onWindowBlur);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("blur", onWindowBlur);
    };
  }, [open, hide]);

  const child: ReactElement<TriggerProps> = isValidElement(children) ? (
    (children as ReactElement<TriggerProps>)
  ) : (
    <span className="tooltip-anchor">{children}</span>
  );
  const childProps = child.props;
  const childRef = childProps.ref;
  const anchorCallbackRef = useMemo(
    () => mergeRefs<HTMLElement>(anchorRef, childRef),
    [childRef]
  );

  const trigger = cloneElement(child, {
    ref: anchorCallbackRef,
    "aria-describedby": mounted ? id : childProps["aria-describedby"],
    onPointerEnter: (e: ReactPointerEvent<HTMLElement>) => {
      childProps.onPointerEnter?.(e);
      // touch has no hover: a tap would flash the bubble and eat the tap
      if (e.pointerType !== "touch") scheduleOpen();
    },
    onPointerLeave: (e: ReactPointerEvent<HTMLElement>) => {
      childProps.onPointerLeave?.(e);
      hide();
    },
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => {
      childProps.onPointerDown?.(e);
      hide(true);
    },
    onFocus: (e: ReactFocusEvent<HTMLElement>) => {
      childProps.onFocus?.(e);
      // keyboard focus only: a click already focuses the button, and its
      // tooltip was just dismissed by the pointer press
      if (e.target.matches(":focus-visible")) show();
    },
    onBlur: (e: ReactFocusEvent<HTMLElement>) => {
      childProps.onBlur?.(e);
      hide(true);
    },
  });

  const arrowStyle: CSSProperties | undefined = placement
    ? placement.side === "top" || placement.side === "bottom"
      ? { left: `${placement.arrow}px` }
      : { top: `${placement.arrow}px` }
    : undefined;

  return (
    <>
      {trigger}
      {mounted &&
        createPortal(
          <div
            ref={popupRef}
            id={id}
            role="tooltip"
            className={`tooltip-popup${variant === "accent" ? " accent" : ""}${className ? ` ${className}` : ""}`}
            data-side={placement?.side ?? side}
            data-state={open ? "open" : "closed"}
            style={{
              left: `${placement?.left ?? 0}px`,
              top: `${placement?.top ?? 0}px`,
              // the cap the bubble was measured at, so React's render matches
              // the width the placement was computed from
              maxWidth: `${Math.min(placement?.cap ?? maxWidth, maxWidth)}px`,
              // first paint is a measuring pass: the bubble is laid out at 0,0
              // to be measured, then placed within the same commit
              visibility: placement ? undefined : "hidden",
            }}
          >
            {content}
            <span className="tooltip-arrow" style={arrowStyle} aria-hidden="true">
              <TooltipArrow />
            </span>
          </div>,
          document.body
        )}
    </>
  );
}

/** 20x10 pointer: the fill sits under the bubble edge, the liner continues its border */
function TooltipArrow() {
  return (
    <svg width="20" height="10" viewBox="0 0 20 10" fill="none">
      <path
        className="tooltip-arrow-fill"
        d="M9.66437 2.60207L4.80758 6.97318C4.07308 7.63423 3.11989 8 2.13172 8H0V10H20V8H18.5349C17.5468 8 16.5936 7.63423 15.8591 6.97318L11.0023 2.60207C10.622 2.2598 10.0447 2.25979 9.66437 2.60207Z"
      />
      <path
        className="tooltip-arrow-liner"
        d="M8.99542 1.85876C9.75604 1.17425 10.9106 1.17422 11.6713 1.85878L16.5281 6.22989C17.0789 6.72568 17.7938 7.00001 18.5349 7.00001L15.89 7L11.0023 2.60207C10.622 2.2598 10.0447 2.2598 9.66437 2.60207L4.77907 7L2.13172 7.00001C2.87268 7.00001 3.58761 6.72568 4.13844 6.22989L8.99542 1.85876Z"
      />
    </svg>
  );
}
