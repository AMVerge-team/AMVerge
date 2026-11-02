'use client';

import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import type { SVGProps } from 'react';
import { useIconHost } from './useIconHost';

export interface FaBugIconProps extends Omit<SVGProps<SVGSVGElement>, 'ref'> {
  size?: number | string;
  className?: string;
}

export function FaBugIcon({ size = '1em', className, ...rest }: FaBugIconProps) {
  const [playing, setPlaying] = useState<string>("rest");
  const hostRef = useRef<SVGSVGElement>(null);
  const { hovered, tapped } = useIconHost(hostRef);
  useEffect(() => {
    setPlaying((now) => (hovered ? (now === "rest" ? "notice" : now) : now === "notice" ? "rest" : now));
  }, [hovered]);
  useEffect(() => {
    if (!tapped) return;
    setPlaying("spotted");
    const done = setTimeout(() => setPlaying('rest'), 640);
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
    <motion.g initial="rest" animate={playing} variants={{ rest: { scale: 1, x: 0, y: 0 }, notice: { scale: [1,0.95,1], transition: { scale: { duration: 0.3, times: [0,0.45,1], ease: ["easeOut", "easeInOut"] } } }, spotted: { x: [0,0,-0.729,-0.729,0,0], y: [0,0,0,0,0,0], scale: [1,1.03,0.95,0.95,1], transition: { x: { duration: 0.6, times: [0,0.16,0.3,0.54,0.84,1], ease: [[0,0,1,1], "easeOut", "linear", "easeOut", "easeOut"] }, y: { duration: 0.6, times: [0,0.16,0.3,0.54,0.84,1], ease: [[0,0,1,1], "easeOut", "linear", "easeOut", "easeOut"] }, scale: { duration: 0.6, times: [0,0.1,0.38,0.66,1], ease: ["easeOut", "easeOut", "easeInOut", "easeInOut"] } } } }} style={{ transformBox: 'view-box', originX: '12px', originY: '12px' }}>
      <path d="M22.999 13.414 C22.979 14.163 22.346 14.75 21.596 14.75 H19.219 V15.438 C19.219 16.377 19.009 17.267 18.634 18.065 L21.222 20.653 C21.759 21.19 21.759 22.06 21.222 22.597 C20.685 23.134 19.815 23.134 19.278 22.597 L16.926 20.245 C15.862 21.108 14.507 21.625 13.031 21.625 V11.141 C13.031 10.856 12.8 10.625 12.516 10.625 H11.484 C11.2 10.625 10.969 10.856 10.969 11.141 V21.625 C9.493 21.625 8.138 21.108 7.074 20.245 L4.722 22.597 C4.185 23.134 3.315 23.134 2.778 22.597 C2.241 22.06 2.241 21.19 2.778 20.653 L5.366 18.065 C4.991 17.267 4.781 16.377 4.781 15.438 V14.75 H2.404 C1.654 14.75 1.021 14.163 1.001 13.414 C0.979 12.637 1.603 12 2.375 12 H4.781 V9.476 L2.778 7.472 C2.241 6.935 2.241 6.065 2.778 5.528 C3.315 4.991 4.185 4.991 4.722 5.528 L7.07 7.875 H16.93 L19.278 5.528 C19.815 4.991 20.685 4.991 21.222 5.528 C21.759 6.065 21.759 6.935 21.222 7.472 L19.219 9.476 V12 H21.625 C22.397 12 23.021 12.637 22.999 13.414 Z" />
      <motion.path initial="rest" animate={playing} d="M12.043 1 C9.385 1 7.23 3.155 7.23 5.812 H16.855 C16.855 3.155 14.701 1 12.043 1 Z" variants={{ rest: { x: 0, y: 0 }, notice: { x: [0,0,0], y: [0,-0.75,0], transition: { x: { duration: 0.3, times: [0,0.4,1], ease: ["easeOut", "easeInOut"] }, y: { duration: 0.3, times: [0,0.4,1], ease: ["easeOut", "easeInOut"] } } }, spotted: { x: [0,0,0,0,0], y: [0,-0.75,-0.75,0,0], transition: { x: { duration: 0.6, times: [0,0.14,0.36,0.62,1], ease: ["easeOut", "linear", "easeOut", "easeOut"] }, y: { duration: 0.6, times: [0,0.14,0.36,0.62,1], ease: ["easeOut", "linear", "easeOut", "easeOut"] } } } }} style={{ transformBox: 'view-box', originX: '12px', originY: '12px' }} />
    </motion.g>
    </motion.svg>
  );
}


