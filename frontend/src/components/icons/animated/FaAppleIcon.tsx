'use client';

import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import type { SVGProps } from 'react';
import { useIconHost } from './useIconHost';

export interface FaAppleIconProps extends Omit<SVGProps<SVGSVGElement>, 'ref'> {
  size?: number | string;
  className?: string;
}

export function FaAppleIcon({ size = '1em', className, ...rest }: FaAppleIconProps) {
  const [playing, setPlaying] = useState<string>("rest");
  const hostRef = useRef<SVGSVGElement>(null);
  const { hovered, tapped } = useIconHost(hostRef);
  useEffect(() => {
    setPlaying((now) => (hovered ? (now === "rest" ? "tip" : now) : now === "tip" ? "rest" : now));
  }, [hovered]);
  useEffect(() => {
    if (!tapped) return;
    setPlaying("press");
    const done = setTimeout(() => setPlaying('rest'), 560);
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
    <motion.g initial="rest" animate={playing} variants={{ rest: { scale: 1 }, tip: { scale: [1,0.95,1], transition: { scale: { duration: 0.26, times: [0,0.4,1], ease: ["easeOut", "easeOut"] } } }, press: { scale: [1,1.04,0.95,0.95,1], transition: { scale: { duration: 0.52, times: [0,0.0923,0.3,0.4703,1], ease: ["easeOut", "easeOut", "easeOut", "linear"] } } } }} style={{ transformBox: 'view-box', originX: '12px', originY: '12px' }}>
      <path d="M17.444 12.546 C17.436 10.969 18.149 9.779 19.593 8.902 C18.785 7.746 17.564 7.11 15.953 6.986 C14.428 6.865 12.761 7.875 12.15 7.875 C11.506 7.875 10.028 7.029 8.868 7.029 C6.47 7.067 3.922 8.941 3.922 12.752 Q3.922 14.441 4.541 16.241 C5.091 17.818 7.076 21.685 9.147 21.621 C10.23 21.595 10.995 20.852 12.404 20.852 C13.77 20.852 14.479 21.621 15.687 21.621 C17.775 21.591 19.571 18.076 20.095 16.495 C17.294 15.175 17.444 12.627 17.444 12.546 Z" />
      <path d="M15.012 5.49 C16.185 4.098 16.078 2.83 16.043 2.375 C15.008 2.435 13.809 3.08 13.126 3.875 C12.374 4.725 11.931 5.778 12.026 6.964 C13.147 7.05 14.17 6.474 15.012 5.49 Z" />
    </motion.g>
    </motion.svg>
  );
}


