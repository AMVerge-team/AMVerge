'use client';

import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import type { SVGProps } from 'react';
import { useIconHost } from './useIconHost';

export interface FaWindowsIconProps extends Omit<SVGProps<SVGSVGElement>, 'ref'> {
  size?: number | string;
  className?: string;
}

export function FaWindowsIcon({ size = '1em', className, ...rest }: FaWindowsIconProps) {
  const [playing, setPlaying] = useState<string>("rest");
  const hostRef = useRef<SVGSVGElement>(null);
  const { hovered, tapped } = useIconHost(hostRef);
  useEffect(() => {
    setPlaying((now) => (hovered ? (now === "rest" ? "tick" : now) : now === "tick" ? "rest" : now));
  }, [hovered]);
  useEffect(() => {
    if (!tapped) return;
    setPlaying("press");
    const done = setTimeout(() => setPlaying('rest'), 540);
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
    <motion.g initial="rest" animate={playing} variants={{ rest: { scale: 1 }, tick: { scale: [1,0.95,1], transition: { scale: { duration: 0.24, times: [0,0.4,1], ease: ["easeOut", "easeOut"] } } }, press: { scale: [1,1.04,0.95,0.95,1], transition: { scale: { duration: 0.5, times: [0,0.0923,0.3,0.4703,1], ease: ["easeOut", "easeOut", "easeOut", "linear"] } } } }} style={{ transformBox: 'view-box', originX: '12px', originY: '12px' }}>
      <path d="M2.375 5.026 L10.264 3.939 V11.562 H2.375 V5.026 Z" />
      <path d="M2.375 18.974 L10.264 20.061 V12.533 H2.375 V18.974 Z" />
      <path d="M11.132 20.177 L21.625 21.625 V12.533 H11.132 V20.177 Z" />
      <path d="M11.132 3.823 V11.562 H21.625 V2.375 L11.132 3.823 Z" />
    </motion.g>
    </motion.svg>
  );
}


