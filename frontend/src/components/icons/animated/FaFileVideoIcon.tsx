'use client';

import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import type { SVGProps } from 'react';
import { useIconHost } from './useIconHost';

export interface FaFileVideoIconProps extends Omit<SVGProps<SVGSVGElement>, 'ref'> {
  size?: number | string;
  className?: string;
}

export function FaFileVideoIcon({ size = '1em', className, ...rest }: FaFileVideoIconProps) {
  const [playing, setPlaying] = useState<string>("rest");
  const hostRef = useRef<SVGSVGElement>(null);
  const { hovered, tapped } = useIconHost(hostRef);
  useEffect(() => {
    setPlaying((now) => (hovered ? (now === "rest" ? "tip" : now) : now === "tip" ? "rest" : now));
  }, [hovered]);
  useEffect(() => {
    if (!tapped) return;
    setPlaying("knock");
    const done = setTimeout(() => setPlaying('rest'), 660);
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
    <motion.path initial="rest" animate={playing} d="M20.25 6.24 V6.5 H14.75 V1 H15.01 C15.284 1 15.546 1.109 15.74 1.302 L19.948 5.51 A1.031 1.031 0 0 1 20.25 6.24 Z" variants={{ rest: { rotate: 0 }, tip: { rotate: [0,21.47,0], transition: { rotate: { duration: 0.32, times: [0,0.4,1], ease: ["easeOut", "easeInOut"] } } }, knock: { rotate: [0,-3.6,21.6,19.8,19.8,0], transition: { rotate: { duration: 0.62, times: [0,0.1,0.3,0.4,0.7,1], ease: ["easeOut", "easeOut", "easeInOut", "linear", "easeInOut"] } } } }} style={{ transformBox: 'view-box', transformOrigin: '20.25px 1px' }} />
    <motion.path initial="rest" animate={playing} d="M13.375 6.844 V1 H4.781 C4.212 1 3.75 1.462 3.75 2.031 V21.969 C3.75 22.538 4.212 23 4.781 23 H19.219 C19.788 23 20.25 22.538 20.25 21.969 V7.875 H14.406 C13.839 7.875 13.375 7.411 13.375 6.844 Z M17.5 13.032 V17.843 C17.5 18.764 16.385 19.218 15.74 18.572 L13.375 16.208 V17.844 C13.375 18.413 12.913 18.875 12.344 18.875 H7.531 C6.962 18.875 6.5 18.413 6.5 17.844 V13.031 C6.5 12.462 6.962 12 7.531 12 H12.344 C12.913 12 13.375 12.462 13.375 13.031 V14.667 L15.74 12.303 C16.385 11.658 17.5 12.11 17.5 13.032 Z" variants={{ rest: { x: 0, y: 0 }, tip: { x: 0, y: 0 }, knock: { x: [0,0,0,0,0], y: [0,0,0.72,0.72,0], transition: { x: { duration: 0.62, times: [0,0.3,0.44,0.74,1], ease: [[0,0,1,1], "easeOut", "easeInOut", "easeInOut"] }, y: { duration: 0.62, times: [0,0.3,0.44,0.74,1], ease: [[0,0,1,1], "easeOut", "easeInOut", "easeInOut"] } } } }} style={{ transformBox: 'view-box', transformOrigin: '12px 23px' }} />
    </motion.svg>
  );
}


