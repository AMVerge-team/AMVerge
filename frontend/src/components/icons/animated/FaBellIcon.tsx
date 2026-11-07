'use client';

import { motion } from 'motion/react';
import type { Variants } from 'motion/react';
import { useEffect, useId, useRef, useState } from 'react';
import type { SVGProps } from 'react';
import { useIconHost } from './useIconHost';

export interface FaBellIconProps extends Omit<SVGProps<SVGSVGElement>, 'ref'> {
  size?: number | string;
  className?: string;
  /** draws a slash through the bell */
  muted?: boolean;
}

// the bell swings from its top, the clapper lags the other way
const BODY: Variants = {
  rest: { rotate: 0 },
  give: { rotate: [0, 10, -8, 0], transition: { duration: 0.45, ease: 'easeInOut' } },
  ring: { rotate: [0, 18, -16, 12, -9, 5, 0], transition: { duration: 0.7, ease: 'easeInOut' } },
};

const CLAPPER: Variants = {
  rest: { x: 0 },
  give: { x: [0, -16, 12, 0], transition: { duration: 0.45, ease: 'easeInOut' } },
  ring: { x: [0, -30, 26, -18, 12, -6, 0], transition: { duration: 0.7, ease: 'easeInOut' } },
};

export function FaBellIcon({ size = '1em', className, muted = false, ...rest }: FaBellIconProps) {
  const [playing, setPlaying] = useState<string>('rest');
  const hostRef = useRef<SVGSVGElement>(null);
  const { hovered, tapped } = useIconHost(hostRef);
  // react's ids carry characters a url(#...) reference can't hold
  const maskId = `bell-cut-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  useEffect(() => {
    setPlaying((now) => (hovered ? (now === 'rest' ? 'give' : now) : now === 'give' ? 'rest' : now));
  }, [hovered]);
  useEffect(() => {
    if (!tapped) return;
    setPlaying('ring');
    const done = setTimeout(() => setPlaying('rest'), 750);
    return () => clearTimeout(done);
  }, [tapped]);
  const slash = { pathLength: muted ? 1 : 0, opacity: muted ? 1 : 0 };
  const slashTransition = { duration: 0.3, ease: 'easeOut' } as const;
  return (
    <motion.svg
      ref={hostRef}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 448 512"
      width={size}
      height={size}
      className={className}
      {...(rest as object)}
      fill="currentColor"
      overflow="visible"
    >
      <defs>
        <mask id={maskId} maskUnits="userSpaceOnUse" x={-64} y={-64} width={576} height={640}>
          <rect x={-64} y={-64} width={576} height={640} fill="white" />
          <motion.line x1={24} y1={24} x2={424} y2={488} stroke="black" strokeWidth={112} strokeLinecap="round" initial={false} animate={slash} transition={slashTransition} />
        </mask>
      </defs>
      <g mask={`url(#${maskId})`}>
        <motion.g initial="rest" animate={playing} variants={BODY} style={{ transformBox: 'view-box', originX: '224px', originY: '24px' }}>
          <path d="M439.39 362.29c-19.32-20.76-55.47-51.99-55.47-154.29 0-77.7-54.48-139.9-127.94-155.16V32c0-17.67-14.32-32-31.98-32s-31.98 14.33-31.98 32v20.84C118.56 68.1 64.08 130.3 64.08 208c0 102.3-36.15 133.53-55.47 154.29-6 6.45-8.66 14.16-8.61 21.71.11 16.4 12.98 32 32.1 32h383.8c19.12 0 32-15.6 32.1-32 .05-7.55-2.61-15.27-8.61-21.71z" />
          <motion.path initial="rest" animate={playing} variants={CLAPPER} d="M224 512c35.32 0 63.97-28.65 63.97-64H160.03c0 35.35 28.65 64 63.97 64z" />
        </motion.g>
      </g>
      <motion.line x1={24} y1={24} x2={424} y2={488} stroke="currentColor" strokeWidth={48} strokeLinecap="round" initial={false} animate={slash} transition={slashTransition} />
    </motion.svg>
  );
}
