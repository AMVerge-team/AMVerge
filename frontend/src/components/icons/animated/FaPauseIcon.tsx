'use client';

import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import type { SVGProps } from 'react';
import { useIconHost } from './useIconHost';

export interface FaPauseIconProps extends Omit<SVGProps<SVGSVGElement>, 'ref'> {
  size?: number | string;
  className?: string;
}

export function FaPauseIcon({ size = '1em', className, ...rest }: FaPauseIconProps) {
  const [playing, setPlaying] = useState<string>("rest");
  const hostRef = useRef<SVGSVGElement>(null);
  const { hovered, tapped } = useIconHost(hostRef);
  useEffect(() => {
    setPlaying((now) => (hovered ? (now === "rest" ? "grip" : now) : now === "grip" ? "rest" : now));
  }, [hovered]);
  useEffect(() => {
    if (!tapped) return;
    setPlaying("hold");
    const done = setTimeout(() => setPlaying('rest'), 580);
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
    <motion.path initial="rest" animate={playing} d="M8.562 21.582 H4.438 C3.299 21.582 2.375 20.658 2.375 19.52 V4.395 C2.375 3.256 3.299 2.332 4.438 2.332 H8.562 C9.701 2.332 10.625 3.256 10.625 4.395 V19.52 C10.625 20.658 9.701 21.582 8.562 21.582 Z" variants={{ rest: { x: 0, y: 0 }, grip: { x: [0,-2.125,0], y: [0,0,0], transition: { x: { duration: 0.28, times: [0,0.45,1], ease: ["easeOut", "easeInOut"] }, y: { duration: 0.28, times: [0,0.45,1], ease: ["easeOut", "easeInOut"] } } }, hold: { x: [0,-2.125,-2.125,0], y: [0,0,0,0], transition: { x: { duration: 0.54, times: [0,0.3,0.7308,1], ease: ["easeOut", "linear", "easeInOut"] }, y: { duration: 0.54, times: [0,0.3,0.7308,1], ease: ["easeOut", "linear", "easeInOut"] } } } }} style={{ transformBox: 'view-box', originX: '12px', originY: '12px' }} />
    <motion.path initial="rest" animate={playing} d="M21.625 19.52 V4.395 C21.625 3.256 20.701 2.332 19.562 2.332 H15.438 C14.299 2.332 13.375 3.256 13.375 4.395 V19.52 C13.375 20.658 14.299 21.582 15.438 21.582 H19.562 C20.701 21.582 21.625 20.658 21.625 19.52 Z" variants={{ rest: { x: 0, y: 0 }, grip: { x: [0,2.125,0], y: [0,0,0], transition: { x: { duration: 0.28, times: [0,0.45,1], ease: ["easeOut", "easeInOut"] }, y: { duration: 0.28, times: [0,0.45,1], ease: ["easeOut", "easeInOut"] } } }, hold: { x: [0,2.125,2.125,0], y: [0,0,0,0], transition: { x: { duration: 0.54, times: [0,0.3,0.7308,1], ease: ["easeOut", "linear", "easeInOut"] }, y: { duration: 0.54, times: [0,0.3,0.7308,1], ease: ["easeOut", "linear", "easeInOut"] } } } }} style={{ transformBox: 'view-box', originX: '12px', originY: '12px' }} />
    </motion.svg>
  );
}


