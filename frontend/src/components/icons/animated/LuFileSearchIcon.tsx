'use client';

import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import type { SVGProps } from 'react';
import { useIconHost } from './useIconHost';

export interface LuFileSearchIconProps extends Omit<SVGProps<SVGSVGElement>, 'ref'> {
  size?: number | string;
  className?: string;
}

export function LuFileSearchIcon({ size = '1em', className, ...rest }: LuFileSearchIconProps) {
  const [playing, setPlaying] = useState<string>("rest");
  const hostRef = useRef<SVGSVGElement>(null);
  const { hovered, tapped } = useIconHost(hostRef);
  useEffect(() => {
    setPlaying((now) => (hovered ? (now === "rest" ? "peer" : now) : now === "peer" ? "rest" : now));
  }, [hovered]);
  useEffect(() => {
    if (!tapped) return;
    setPlaying("scan");
    const done = setTimeout(() => setPlaying('rest'), 720);
    return () => clearTimeout(done);
  }, [tapped]);
  return (
    <motion.svg
      ref={hostRef}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      {...(rest as object)}
      fill="currentColor" stroke="none" strokeWidth={0} strokeLinecap="round" strokeLinejoin="round"
      initial="rest"
      animate={playing}
    >
    <path d="M13.833 2.833 V6.5 A1.833 1.833 0 0 0 15.667 8.333 H19.333" fill="none" stroke="currentColor" strokeWidth={1.83} strokeLinecap="round" strokeLinejoin="round" />
    <path d="M4.912 20.25 A1.833 1.833 0 0 0 6.495 21.167 H17.5 A1.833 1.833 0 0 0 19.333 19.333 V7.417 L14.75 2.833 H6.5 A1.833 1.833 0 0 0 4.667 4.667 V7.417" fill="none" stroke="currentColor" strokeWidth={1.83} strokeLinecap="round" strokeLinejoin="round" />
    <motion.g initial="rest" animate={playing} variants={{ rest: { x: 0, y: 0 }, peer: { x: [0,2.061,0], y: [0,-2.061,0], transition: { x: { duration: 0.3, times: [0,0.4,1], ease: ["easeOut", "easeOut"] }, y: { duration: 0.3, times: [0,0.4,1], ease: ["easeOut", "easeOut"] } } }, scan: { x: [0,-0.517,2.583,2.454,2.454,0], y: [0,0.517,-2.583,-2.454,-2.454,0], transition: { x: { duration: 0.68, times: [0,0.08,0.3,0.4,0.62,1], ease: ["easeOut", "easeOut", "easeOut", "linear", "linear"] }, y: { duration: 0.68, times: [0,0.08,0.3,0.4,0.62,1], ease: ["easeOut", "easeOut", "easeOut", "linear", "linear"] } } } }} style={{ transformBox: 'view-box', transformOrigin: '12px 12px' }}>
      <path d="M9.25 17.5 L7.875 16.125" fill="none" stroke="currentColor" strokeWidth={1.83} strokeLinecap="round" strokeLinejoin="round" />
      <motion.circle initial="rest" animate={playing} cx={5.583} cy={13.833} r={2.75} fill="none" stroke="currentColor" strokeWidth={1.83} strokeLinecap="round" strokeLinejoin="round" variants={{ rest: { scale: 1 }, peer: { scale: 1 }, scan: { scale: [1,1,1.1033,1,1], transition: { scale: { duration: 0.68, times: [0,0.56,0.66,0.8,1], ease: [[0,0,1,1], "easeOut", "easeOut", "easeOut"] } } } }} style={{ transformBox: 'view-box', transformOrigin: '12px 12px' }} />
    </motion.g>
    </motion.svg>
  );
}


