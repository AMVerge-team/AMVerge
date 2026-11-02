'use client';

import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import type { SVGProps } from 'react';
import { useIconHost } from './useIconHost';

export interface FaSignOutAltIconProps extends Omit<SVGProps<SVGSVGElement>, 'ref'> {
  size?: number | string;
  className?: string;
}

export function FaSignOutAltIcon({ size = '1em', className, ...rest }: FaSignOutAltIconProps) {
  const [playing, setPlaying] = useState<string>("rest");
  const hostRef = useRef<SVGSVGElement>(null);
  const { hovered, tapped } = useIconHost(hostRef);
  useEffect(() => {
    setPlaying((now) => (hovered ? (now === "rest" ? "step" : now) : now === "step" ? "rest" : now));
  }, [hovered]);
  useEffect(() => {
    if (!tapped) return;
    setPlaying("leave");
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
    <motion.path initial="rest" animate={playing} d="M22.355 12.73 L15.137 19.949 C14.492 20.594 13.375 20.143 13.375 19.219 V15.094 H7.531 C6.96 15.094 6.5 14.634 6.5 14.062 V9.938 C6.5 9.366 6.96 8.906 7.531 8.906 H13.375 V4.781 C13.375 3.862 14.488 3.406 15.137 4.051 L22.355 11.27 C22.755 11.673 22.755 12.327 22.355 12.73 Z" variants={{ rest: { x: 0, y: 0, scale: 1 }, step: { x: [0,0.48,0], y: [0,0,0], scale: [1,0.95,1], transition: { x: { duration: 0.32, times: [0,0.45,1], ease: ["easeOut", "easeInOut"] }, y: { duration: 0.32, times: [0,0.45,1], ease: ["easeOut", "easeInOut"] }, scale: { duration: 0.32, times: [0,0.45,1], ease: ["easeOut", "easeInOut"] } } }, leave: { x: [0,-0.27999999999999997,0.8,0.8,0], y: [0,0,0,0,0], scale: [1,1.04,0.95,0.95,1], transition: { x: { duration: 0.6, times: [0,0.1,0.42,0.68,1], ease: ["easeOut", "easeOut", "easeInOut", "easeInOut"] }, y: { duration: 0.6, times: [0,0.1,0.42,0.68,1], ease: ["easeOut", "easeOut", "easeInOut", "easeInOut"] }, scale: { duration: 0.6, times: [0,0.1,0.42,0.68,1], ease: ["easeOut", "easeOut", "easeInOut", "easeInOut"] } } } }} style={{ transformBox: 'view-box', originX: '22.8px', originY: '12px' }} />
    <path d="M9.25 19.734 V18.016 C9.25 17.732 9.018 17.5 8.734 17.5 H5.125 C4.364 17.5 3.75 16.886 3.75 16.125 V7.875 C3.75 7.114 4.364 6.5 5.125 6.5 H8.734 C9.018 6.5 9.25 6.268 9.25 5.984 V4.266 C9.25 3.982 9.018 3.75 8.734 3.75 H5.125 C2.848 3.75 1 5.598 1 7.875 V16.125 C1 18.402 2.848 20.25 5.125 20.25 H8.734 C9.018 20.25 9.25 20.018 9.25 19.734 Z" />
    </motion.svg>
  );
}


