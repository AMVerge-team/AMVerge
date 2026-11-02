'use client';

import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import type { SVGProps } from 'react';
import { useIconHost } from './useIconHost';

export interface FaFolderIconProps extends Omit<SVGProps<SVGSVGElement>, 'ref'> {
  size?: number | string;
  className?: string;
}

export function FaFolderIcon({ size = '1em', className, ...rest }: FaFolderIconProps) {
  const [playing, setPlaying] = useState<string>("rest");
  const hostRef = useRef<SVGSVGElement>(null);
  const { hovered, tapped } = useIconHost(hostRef);
  useEffect(() => {
    setPlaying((now) => (hovered ? (now === "rest" ? "lift" : now) : now === "lift" ? "rest" : now));
  }, [hovered]);
  useEffect(() => {
    if (!tapped) return;
    setPlaying((now) => (now === "show" ? "show-back" : "show"));
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
    <motion.path initial="rest" animate={playing} d="M20.938 6.5 H12.688 L9.938 3.75 H3.062 C1.923 3.75 1 4.673 1 5.812 V18.188 C1 19.327 1.923 20.25 3.062 20.25 H20.938 C22.077 20.25 23 19.327 23 18.188 V8.562 C23 7.423 22.077 6.5 20.938 6.5 Z" variants={{ rest: { x: 0, y: 0, rotate: 0 }, lift: { x: [0,0,0], y: [0,-2.914,0], transition: { x: { duration: 0.3, times: [0,0.4,1], ease: ["easeOut", "easeInOut"] }, y: { duration: 0.3, times: [0,0.4,1], ease: ["easeOut", "easeInOut"] } } }, show: { rotate: [0,2.66,-10.63,-7.97], transition: { rotate: { duration: 0.62, times: [0,0.1,0.55,1], ease: ["easeOut", "easeOut", "easeInOut"] } } }, "show-back": { rotate: [-7.97,-10.63,2.66,0], transition: { rotate: { duration: 0.62, times: [0,0.45,0.9,1], ease: ["easeInOut", "easeIn", "easeIn"] } } } }} style={{ transformBox: 'view-box', originX: '3.062px', originY: '3.75px' }} />
    <motion.path initial="rest" animate={playing} d="M20.938 6.5 H12.688 L9.938 3.75 H3.062 C1.923 3.75 1 4.673 1 5.812 V18.188 C1 19.327 1.923 20.25 3.062 20.25 H20.938 C22.077 20.25 23 19.327 23 18.188 V8.562 C23 7.423 22.077 6.5 20.938 6.5 Z" fill="#22c55e" variants={{ rest: { rotate: 0, opacity: 0 }, lift: { rotate: 0, opacity: 0 }, show: { rotate: [0,2.66,-10.63,-7.97], opacity: [0,0,1], transition: { rotate: { duration: 0.62, times: [0,0.1,0.55,1], ease: ["easeOut", "easeOut", "easeInOut"] }, opacity: { duration: 0.62, times: [0,0.3,1], ease: ["linear", "easeOut"] } } }, "show-back": { rotate: [-7.97,-10.63,2.66,0], opacity: [1,0,0], transition: { rotate: { duration: 0.62, times: [0,0.45,0.9,1], ease: ["easeInOut", "easeIn", "easeIn"] }, opacity: { duration: 0.62, times: [0,0.7,1], ease: ["easeIn", "linear"] } } } }} style={{ transformBox: 'view-box', originX: '3.062px', originY: '3.75px' }} />
    </motion.svg>
  );
}


