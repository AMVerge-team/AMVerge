'use client';

import { motion, type Variants } from 'motion/react';
import { useIconPlay } from './useIconPlay';

/**
 * The chrome icons AMVerge draws by hand: panel toggles, the window buttons,
 * the grid zoom pair and the two toolbar marks. They never went through the
 * NetsuIcon pack because they are not react-icons glyphs, so they were the
 * only things left in the app with no animation at all.
 *
 * Same contract as the generated pack: the drawing at rest is untouched, the
 * icon follows the control it sits in, and each clip animates what the button
 * says it does. Amplitudes are set against the size each one actually renders
 * at - 17 px for the toggles, 10 px for the window buttons, 12 px for the zoom
 * pair - since a unit of a 24 box is barely half a pixel there.
 */

const vb = { transformBox: 'view-box', originX: '12px', originY: '12px' } as const;
const at = (x: number, y: number) =>
  ({ transformBox: 'view-box', originX: `${x}px`, originY: `${y}px` }) as const;

const HOVER = { duration: 0.3, ease: 'easeInOut' } as const;
const PRESS = { duration: 0.56, ease: 'easeInOut' } as const;

/* ---------------------------------------------------------------- panels */

type ToggleProps = { filled?: boolean };

/**
 * One panel toggle, left or right.
 *
 * The gesture is a preview of the click, so it runs the way the panel is
 * about to go: a panel that is open shows itself closing, a panel that is
 * hidden shows itself opening. Showing it open wider when it is already open
 * says nothing about what the button does.
 */
function PanelToggle({ side, filled }: { side: 'left' | 'right'; filled: boolean }) {
  const { hostRef, playing } = useIconPlay(620);
  const left = side === 'left';
  // positive x opens the left panel and closes the right one
  const open = left ? 1 : -1;
  const dir = filled ? -open : open;
  // the strip only exists while the panel is open, so it only ever closes
  const shut = { hover: 0.25, press: 0.167 };

  return (
    <svg ref={hostRef} viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <motion.path
        d={left ? 'M9 3v18' : 'M15 3v18'}
        animate={playing}
        variants={{
          rest: { x: 0 },
          hover: { x: [0, 4.5 * dir, 4.5 * dir], transition: HOVER },
          press: { x: [0, -1.1 * dir, 5 * dir, 5 * dir, 0], transition: { ...PRESS, times: [0, 0.12, 0.42, 0.74, 1] } },
        }}
        style={vb}
      />
      {filled && (
        <motion.g
          animate={playing}
          variants={{
            rest: { scaleX: 1 },
            hover: { scaleX: [1, shut.hover, shut.hover], transition: HOVER },
            press: { scaleX: [1, 1.18, shut.press, shut.press, 1], transition: { ...PRESS, times: [0, 0.12, 0.42, 0.74, 1] } },
          }}
          style={at(left ? 3 : 21, 12)}
        >
          <rect x={left ? 3 : 15} y="3" width="6" height="18" rx="2" fill="currentColor" stroke="none" />
        </motion.g>
      )}
    </svg>
  );
}

/** hides or shows the left panel, and shows which of the two it is about to do */
export function PanelLeftIcon({ filled = false }: ToggleProps) {
  return <PanelToggle side="left" filled={filled} />;
}

/** the same for the right panel */
export function PanelRightIcon({ filled = false }: ToggleProps) {
  return <PanelToggle side="right" filled={filled} />;
}

/** four tiles start playing one after the other, which is what the button does */
export function GridPreviewIcon({ filled = false }: ToggleProps) {
  const { hostRef, playing } = useIconPlay(760);
  const tiles: Array<[number, number]> = [
    [3, 3],
    [13.5, 3],
    [3, 13.5],
    [13.5, 13.5],
  ];
  return (
    <svg ref={hostRef} viewBox="0 0 24 24" width="17" height="17" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true">
      {tiles.map(([x, y], i) => {
        const lead = i * 0.14;
        return (
          <motion.g
            key={`${x}-${y}`}
            animate={playing}
            variants={{
              rest: { y: 0 },
              hover: {
                y: [0, 0, -1.9, 0],
                transition: { duration: 0.46 + lead, times: [0, lead / (0.46 + lead), (lead + 0.2) / (0.46 + lead), 1], ease: 'easeInOut' },
              },
              press: {
                y: [0, 0, -3, 0.6, 0],
                transition: { duration: 0.7 + lead, times: [0, lead / (0.7 + lead), (lead + 0.26) / (0.7 + lead), (lead + 0.46) / (0.7 + lead), 1], ease: 'easeInOut' },
              },
            }}
            style={at(x + 3.75, y + 3.75)}
          >
            <rect x={x} y={y} width="7.5" height="7.5" rx="1.5" />
          </motion.g>
        );
      })}
    </svg>
  );
}

/* -------------------------------------------------------- window buttons */

/** the pin tilts off its point, then drives in when pressed */
export function WindowPinIcon({ pinned = false }: { pinned?: boolean }) {
  const { hostRef, playing } = useIconPlay(640);
  return (
    <svg ref={hostRef} viewBox="0 0 24 24" width="14" height="14" fill={pinned ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <motion.g
        animate={playing}
        variants={{
          rest: { rotate: 0, y: 0 },
          hover: { rotate: [0, -11, -11], transition: { duration: 0.28, ease: 'easeOut' } },
          press: {
            rotate: [0, -13, 0, 0],
            y: [0, -0.8, 1.9, 0],
            transition: { duration: 0.6, times: [0, 0.22, 0.52, 1], ease: 'easeInOut' },
          },
        }}
        style={at(12, 22)}
      >
        <path d="M12 17v5" />
        <path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z" />
      </motion.g>
    </svg>
  );
}

/** the bar drops to the floor of the box, which is where the window goes */
export function WindowMinimizeIcon() {
  const { hostRef, playing } = useIconPlay(520);
  return (
    <svg ref={hostRef} viewBox="0 0 12 12" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
      <motion.line
        x1="1" y1="6" x2="11" y2="6"
        animate={playing}
        variants={{
          rest: { y: 0 },
          hover: { y: [0, 1.7, 1.7], transition: { duration: 0.26, ease: 'easeOut' } },
          press: { y: [0, -0.9, 3.6, 3.6, 0], transition: { duration: 0.5, times: [0, 0.14, 0.44, 0.74, 1], ease: 'easeInOut' } },
        }}
        style={at(6, 6)}
      />
    </svg>
  );
}

/** the frame swells to fill, or the front pane drops back when restoring */
export function WindowMaximizeIcon({ isMaximized = false }: { isMaximized?: boolean }) {
  const { hostRef, playing } = useIconPlay(560);
  const grow: Variants = {
    rest: { scale: 1 },
    hover: { scale: [1, 1.22, 1.22], transition: { duration: 0.28, ease: 'easeOut' } },
    press: { scale: [1, 0.9, 1.26, 1.26, 1], transition: { duration: 0.54, times: [0, 0.15, 0.45, 0.74, 1], ease: 'easeInOut' } },
  };
  if (isMaximized) {
    return (
      <svg ref={hostRef} viewBox="0 0 12 12" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden="true">
        <motion.g
          animate={playing}
          variants={{
            rest: { x: 0, y: 0 },
            hover: { x: [0, -1.3, -1.3], y: [0, 1.3, 1.3], transition: { duration: 0.28, ease: 'easeOut' } },
            press: { x: [0, 0.7, -2.2, -2.2, 0], y: [0, -0.7, 2.2, 2.2, 0], transition: { duration: 0.52, times: [0, 0.15, 0.45, 0.74, 1], ease: 'easeInOut' } },
          }}
          style={at(7, 5)}
        >
          <rect x="3" y="1" width="8" height="8" rx="1.5" />
        </motion.g>
        <path d="M1 4v6a1 1 0 0 0 1 1h6" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg ref={hostRef} viewBox="0 0 12 12" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden="true">
      <motion.g animate={playing} variants={grow} style={at(6, 6)}>
        <rect x="1.5" y="1.5" width="9" height="9" rx="2" />
      </motion.g>
    </svg>
  );
}

/** the cross twists, and a press turns it a full quarter onto its own picture */
export function WindowCloseIcon() {
  const { hostRef, playing } = useIconPlay(500);
  return (
    <svg ref={hostRef} viewBox="0 0 12 12" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
      <motion.g
        animate={playing}
        variants={{
          rest: { rotate: 0 },
          hover: { rotate: [0, 15, 15], transition: { duration: 0.26, ease: 'easeOut' } },
          press: { rotate: [0, -8, 90, 90], transition: { duration: 0.48, times: [0, 0.16, 0.66, 1], ease: 'easeInOut' } },
        }}
        style={at(6, 6)}
      >
        <line x1="2" y1="2" x2="10" y2="10" />
        <line x1="10" y1="2" x2="2" y2="10" />
      </motion.g>
    </svg>
  );
}

/* ------------------------------------------------------------- grid zoom */

/** fewer columns: the bar draws in on itself */
export function ZoomOutIcon() {
  const { hostRef, playing } = useIconPlay(480);
  return (
    <svg ref={hostRef} viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <motion.line
        x1="3" y1="8" x2="13" y2="8"
        animate={playing}
        variants={{
          rest: { scaleX: 1 },
          hover: { scaleX: [1, 0.66, 0.66], transition: { duration: 0.26, ease: 'easeOut' } },
          press: { scaleX: [1, 1.15, 0.5, 0.5, 1], transition: { duration: 0.46, times: [0, 0.15, 0.45, 0.74, 1], ease: 'easeInOut' } },
        }}
        style={at(8, 8)}
      />
    </svg>
  );
}

/** more columns: both arms reach out */
export function ZoomInIcon() {
  const { hostRef, playing } = useIconPlay(480);
  const reach: Variants = {
    rest: { scale: 1 },
    hover: { scale: [1, 1.26, 1.26], transition: { duration: 0.26, ease: 'easeOut' } },
    press: { scale: [1, 0.86, 1.34, 1.34, 1], transition: { duration: 0.46, times: [0, 0.15, 0.45, 0.74, 1], ease: 'easeInOut' } },
  };
  return (
    <svg ref={hostRef} viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <motion.g animate={playing} variants={reach} style={at(8, 8)}>
        <line x1="8" y1="3" x2="8" y2="13" />
        <line x1="3" y1="8" x2="13" y2="8" />
      </motion.g>
    </svg>
  );
}

/* ---------------------------------------------------------- toolbar marks */

/** add a video from your files: the plus drops into the folder */
export function FolderAddIcon() {
  const { hostRef, playing } = useIconPlay(620);
  return (
    <svg ref={hostRef} viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 7.5a2 2 0 0 1 2-2h4.2l2 2H19a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      {/* shorter and thinner than the outline, so it keeps clear of the folder's edges */}
      <motion.g
        animate={playing}
        variants={{
          rest: { y: 0, scale: 1 },
          hover: { y: [0, -2.4, 0], scale: [1, 1, 1], transition: { duration: 0.34, ease: 'easeInOut' } },
          press: { y: [0, -3.4, 0, 0], scale: [1, 1, 0.72, 1], transition: { duration: 0.6, times: [0, 0.26, 0.56, 1], ease: 'easeInOut' } },
        }}
        style={at(12, 13.5)}
      >
        <path d="M12 11.25v4.5" strokeWidth="1.6" />
        <path d="M9.75 13.5h4.5" strokeWidth="1.6" />
      </motion.g>
    </svg>
  );
}

/** import a database file: the arrow beside the disks drives down */
export function DatabaseDownloadIcon() {
  const { hostRef, playing } = useIconPlay(620);
  return (
    <svg ref={hostRef} viewBox="0 0 24 24" width="1.6em" height="1.6em" fill="currentColor" aria-hidden="true">
      <ellipse cx="8" cy="4.5" rx="6" ry="2.5" />
      <path d="M2 5.9v4.6c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5V5.9c-1.2 1.5-3.5 2.5-6 2.5S3.2 7.4 2 5.9z" />
      <path d="M2 11.9v4.6c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5v-4.6c-1.2 1.5-3.5 2.5-6 2.5s-4.8-1-6-2.5z" />
      <motion.g
        animate={playing}
        variants={{
          rest: { y: 0 },
          hover: { y: [0, -1.1, 1.8, 1.8], transition: { duration: 0.34, times: [0, 0.3, 0.8, 1], ease: 'easeInOut' } },
          press: { y: [0, -1.6, 2.6, 2.6, 0], transition: { duration: 0.6, times: [0, 0.16, 0.46, 0.76, 1], ease: 'easeInOut' } },
        }}
        style={at(19.3, 13.5)}
      >
        <rect x="18" y="6.5" width="2.6" height="9" rx="1.3" />
        <path d="M15 14.2h8.6l-4.3 6.3z" />
      </motion.g>
    </svg>
  );
}
