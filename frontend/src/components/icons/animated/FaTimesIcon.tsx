'use client';

import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import type { SVGProps } from 'react';
import { useIconHost } from './useIconHost';

export interface FaTimesIconProps extends Omit<SVGProps<SVGSVGElement>, 'ref'> {
  size?: number | string;
  className?: string;
}

export function FaTimesIcon({ size = '1em', className, ...rest }: FaTimesIconProps) {
  const [playing, setPlaying] = useState<string>("rest");
  const hostRef = useRef<SVGSVGElement>(null);
  const { hovered, tapped } = useIconHost(hostRef);
  useEffect(() => {
    setPlaying((now) => (hovered ? (now === "rest" ? "twist" : now) : now === "twist" ? "rest" : now));
  }, [hovered]);
  useEffect(() => {
    if (!tapped) return;
    setPlaying("close");
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
    <motion.path initial="rest" animate={playing} d="M19.167 7.7 C19.694 7.172 19.694 6.317 19.167 5.789 L18.211 4.833 C17.683 4.306 16.828 4.306 16.3 4.833 L4.833 16.3 C4.306 16.828 4.306 17.683 4.833 18.211 L5.789 19.167 C6.317 19.694 7.172 19.694 7.7 19.167 Z" variants={{ rest: { rotate: 0 }, twist: { rotate: [0,15.35,0], transition: { rotate: { duration: 0.28, times: [0,0.4,1], ease: ["easeOut", "easeInOut"] } } }, close: { rotate: [0,-6.32,25.28,25.28,0], transition: { rotate: { duration: 0.52, times: [0,0.1,0.34,0.6,1], ease: ["easeOut", "easeOut", "linear", "easeOut"] } } } }} style={{ transformBox: 'view-box', originX: '12px', originY: '12px' }} />
    <motion.path initial="rest" animate={playing} d="M7.7 4.833 C7.172 4.306 6.317 4.306 5.789 4.833 L4.833 5.789 C4.306 6.317 4.306 7.172 4.833 7.7 L16.3 19.167 C16.828 19.694 17.683 19.694 18.211 19.167 L19.167 18.211 C19.694 17.683 19.694 16.828 19.167 16.3 Z" variants={{ rest: { rotate: 0 }, twist: { rotate: [0,-15.35,0], transition: { rotate: { duration: 0.28, times: [0,0.4,1], ease: ["easeOut", "easeInOut"] } } }, close: { rotate: [0,6.32,-25.28,-25.28,0], transition: { rotate: { duration: 0.52, times: [0,0.1,0.34,0.6,1], ease: ["easeOut", "easeOut", "linear", "easeOut"] } } } }} style={{ transformBox: 'view-box', originX: '12px', originY: '12px' }} />
    </motion.svg>
  );
}


