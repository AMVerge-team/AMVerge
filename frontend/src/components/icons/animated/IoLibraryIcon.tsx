'use client';

import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import type { SVGProps } from 'react';
import { useIconHost } from './useIconHost';

export interface IoLibraryIconProps extends Omit<SVGProps<SVGSVGElement>, 'ref'> {
  size?: number | string;
  className?: string;
}

export function IoLibraryIcon({ size = '1em', className, ...rest }: IoLibraryIconProps) {
  const [playing, setPlaying] = useState<string>("rest");
  const hostRef = useRef<SVGSVGElement>(null);
  const { hovered, tapped } = useIconHost(hostRef);
  useEffect(() => {
    setPlaying((now) => (hovered ? (now === "rest" ? "rise" : now) : now === "rise" ? "rest" : now));
  }, [hovered]);
  useEffect(() => {
    if (!tapped) return;
    setPlaying("pick");
    const done = setTimeout(() => setPlaying('rest'), 800);
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
    <path d="M3.75 21.625 H3.062 A1.375 1.375 0 0 1 1.688 20.25 V5.812 A1.375 1.375 0 0 1 3.062 4.438 H3.75 A1.375 1.375 0 0 1 5.125 5.812 V20.25 A1.375 1.375 0 0 1 3.75 21.625 Z" />
    <motion.g initial="rest" animate={playing} variants={{ rest: { x: 0, y: 0 }, rise: { x: [0,0,0], y: [0,-2.125,0], transition: { x: { duration: 0.32, times: [0,0.4,1], ease: ["easeOut", "easeInOut"] }, y: { duration: 0.32, times: [0,0.4,1], ease: ["easeOut", "easeInOut"] } } }, pick: { x: [0,0,0,0,0,0], y: [0,0.327,-2.125,-2.125,0,0], transition: { x: { duration: 0.76, times: [0,0.1,0.3,0.62,0.9,1], ease: ["easeOut", "easeOut", "easeOut", "easeIn", "easeOut"] }, y: { duration: 0.76, times: [0,0.1,0.3,0.62,0.9,1], ease: ["easeOut", "easeOut", "easeOut", "easeIn", "easeOut"] } } } }} style={{ transformBox: 'view-box', transformOrigin: '8.56px 21.63px' }}>
      <path d="M11.312 8.562 A1.375 1.375 0 0 0 9.938 7.188 H7.188 A1.375 1.375 0 0 0 5.812 8.562 V9.766 A0.172 0.172 0 0 0 5.984 9.938 H11.141 A0.172 0.172 0 0 0 11.312 9.766 Z" />
      <rect x={5.812} y={11.312} width={5.5} height={6.188} />
      <path d="M5.812 20.25 A1.375 1.375 0 0 0 7.188 21.625 H9.938 A1.375 1.375 0 0 0 11.312 20.25 V18.961 A0.086 0.086 0 0 0 11.227 18.875 H5.898 A0.086 0.086 0 0 0 5.812 18.961 Z" />
    </motion.g>
    <motion.path initial="rest" animate={playing} d="M14.75 21.625 H13.375 A1.375 1.375 0 0 1 12 20.25 V3.75 A1.375 1.375 0 0 1 13.375 2.375 H14.75 A1.375 1.375 0 0 1 16.125 3.75 V20.25 A1.375 1.375 0 0 1 14.75 21.625 Z" variants={{ rest: { rotate: 0 }, rise: { rotate: 0 }, pick: { rotate: [0,0,-1.63,-1.63,0,0], transition: { rotate: { duration: 0.76, times: [0,0.3,0.5,0.74,0.96,1], ease: [[0,0,1,1], "easeOut", "easeInOut", "easeOut", "easeOut"] } } } }} style={{ transformBox: 'view-box', transformOrigin: '13.4px 21.6px' }} />
    <motion.path initial="rest" animate={playing} d="M22.308 20.14 L20.923 5.531 C20.859 4.859 20.195 4.371 19.439 4.444 L18.071 4.572 C17.315 4.644 16.754 5.247 16.817 5.92 L18.202 20.529 C18.266 21.202 18.93 21.689 19.686 21.617 L21.054 21.488 C21.81 21.416 22.371 20.813 22.308 20.14 Z" variants={{ rest: { rotate: 0 }, rise: { rotate: 0 }, pick: { rotate: [0,0,-2.12,-2.12,0], transition: { rotate: { duration: 0.76, times: [0,0.36,0.56,0.78,1], ease: [[0,0,1,1], "easeOut", "easeInOut", "easeOut"] } } } }} style={{ transformBox: 'view-box', transformOrigin: '20.4px 21.55px' }} />
    </motion.svg>
  );
}


