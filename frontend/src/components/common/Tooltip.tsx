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
  /** after a tooltip closes, the next opens instantly within this window, so a row of buttons feels like one surface */
  timeout: number;
  lastClosedAt: { current: number };
};

const DEFAULT_GROUP: TooltipGroup = {
  delay: 600,
  closeDelay: 0,
  timeout: 400,
  // module-level, so without a provider every tooltip still shares one hop window
  lastClosedAt: { current: 0 },
};

const TooltipGroupContext = createContext<TooltipGroup>(DEFAULT_GROUP);

/** optional wrapper that retunes hover timings for the tooltips below it */
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
/** how far the bubble may slide sideways before the perpendicular side is tried, so corner buttons get it beside them */
const SHIFT_TOLERANCE = 12;
/** a left/right placement may wrap down to this width; narrower goes back above or below */
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
  // clientWidth, not innerWidth, which counts the scrollbar a fixed element can't sit under
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

  // beside the trigger the bubble may wrap narrower; above or below it only has to clear the window edges
  const cap = vertical
    ? crossViewport - padding * 2
    : room - sideOffset - padding;
  // height can't be squeezed, so a top/bottom placement must fit outright
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

/** keeps the requested side, flips when it has no room, or crosses to the perpendicular side when it would hang far off its trigger */
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
    // flip only when it helps, so a too-small viewport doesn't make the bubble jump
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
  /** side and alignment in one, e.g. `"bottom-end"`; wins over `side`/`align` */
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

/** hover/focus tooltip portalled to body; clones its trigger, which must accept a ref and pointer/focus handlers */
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

  /** hover timers only; a pending unmount timer must survive a second hide */
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
      // a trigger in a list that just unmounted would strand the bubble
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

      // measured at natural width first; if the chosen side is narrower, the text wraps and placement reruns
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
      // keyboard focus only; a click focuses too, and its tooltip was just dismissed
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
              // the cap the placement was computed at, so the render matches it
              maxWidth: `${Math.min(placement?.cap ?? maxWidth, maxWidth)}px`,
              // first paint measures at 0,0, then places within the same commit
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
