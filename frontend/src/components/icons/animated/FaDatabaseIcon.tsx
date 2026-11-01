'use client';

import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import type { SVGProps } from 'react';
import { useIconHost } from './useIconHost';

export interface FaDatabaseIconProps extends Omit<SVGProps<SVGSVGElement>, 'ref'> {
  size?: number | string;
  className?: string;
}

export function FaDatabaseIcon({ size = '1em', className, ...rest }: FaDatabaseIconProps) {
  const [playing, setPlaying] = useState<string>("rest");
  const hostRef = useRef<SVGSVGElement>(null);
  const { hovered, tapped } = useIconHost(hostRef);
  useEffect(() => {
    setPlaying((now) => (hovered ? (now === "rest" ? "lift" : now) : now === "lift" ? "rest" : now));
  }, [hovered]);
  useEffect(() => {
    if (!tapped) return;
    setPlaying("seat");
    const done = setTimeout(() => setPlaying('rest'), 740);
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
    <motion.path initial="rest" animate={playing} d="M21.625 4.143 V6.107 C21.625 7.838 17.314 9.25 12 9.25 S2.375 7.838 2.375 6.107 V4.143 C2.375 2.412 6.686 1 12 1 S21.625 2.412 21.625 4.143 Z" variants={{ rest: { x: 0, y: 0, scale: 1 }, lift: { x: [0,0,0], y: [0,-0.75,0], scale: [1,0.95,1], transition: { x: { duration: 0.3, times: [0,0.4,1], ease: ["easeOut", "easeInOut"] }, y: { duration: 0.3, times: [0,0.4,1], ease: ["easeOut", "easeInOut"] }, scale: { duration: 0.3, times: [0,0.45,1], ease: ["easeOut", "easeInOut"] } } }, seat: { x: [0,0,0,0,0,0], y: [0,0.188,-0.75,-0.75,0,0], scale: [1,1.03,0.95,0.95,1], transition: { x: { duration: 0.7, times: [0,0.0857,0.3,0.65,0.8639,1], ease: ["easeOut", "easeOut", "easeOut", "easeIn", "easeOut"] }, y: { duration: 0.7, times: [0,0.0857,0.3,0.65,0.8639,1], ease: ["easeOut", "easeOut", "easeOut", "easeIn", "easeOut"] }, scale: { duration: 0.7, times: [0,0.1,0.38,0.66,1], ease: ["easeOut", "easeOut", "easeInOut", "easeInOut"] } } } }} style={{ transformBox: 'view-box', transformOrigin: '12px 12px' }} />
    <motion.path initial="rest" animate={playing} d="M21.625 8.562 V12.982 C21.625 14.713 17.314 16.125 12 16.125 S2.375 14.713 2.375 12.982 V8.562 C4.443 9.987 8.228 10.65 12 10.65 S19.557 9.987 21.625 8.562 Z" variants={{ rest: { scale: 1, x: 0, y: 0 }, lift: { scale: [1,0.95,1], transition: { scale: { duration: 0.3, times: [0,0.45,1], ease: ["easeOut", "easeInOut"] } } }, seat: { x: [0,0,0,0], y: [0,0,1.574,0], scale: [1,1.03,0.95,0.95,1], transition: { x: { duration: 0.7, times: [0,0.8444,0.9028,1], ease: [[0,0,1,1], "easeOut", "easeInOut"] }, y: { duration: 0.7, times: [0,0.8444,0.9028,1], ease: [[0,0,1,1], "easeOut", "easeInOut"] }, scale: { duration: 0.7, times: [0,0.1,0.38,0.66,1], ease: ["easeOut", "easeOut", "easeInOut", "easeInOut"] } } } }} style={{ transformBox: 'view-box', transformOrigin: '12px 12px' }} />
    <motion.path initial="rest" animate={playing} d="M21.625 15.438 V19.857 C21.625 21.588 17.314 23 12 23 S2.375 21.588 2.375 19.857 V15.438 C4.443 16.862 8.228 17.525 12 17.525 S19.557 16.862 21.625 15.438 Z" variants={{ rest: { scale: 1, x: 0, y: 0 }, lift: { scale: [1,0.95,1], transition: { scale: { duration: 0.3, times: [0,0.45,1], ease: ["easeOut", "easeInOut"] } } }, seat: { x: [0,0,0,0], y: [0,0,0.75,0], scale: [1,1.03,0.95,0.95,1], transition: { x: { duration: 0.7, times: [0,0.8639,0.9319,1], ease: [[0,0,1,1], "easeOut", "easeInOut"] }, y: { duration: 0.7, times: [0,0.8639,0.9319,1], ease: [[0,0,1,1], "easeOut", "easeInOut"] }, scale: { duration: 0.7, times: [0,0.1,0.38,0.66,1], ease: ["easeOut", "easeOut", "easeInOut", "easeInOut"] } } } }} style={{ transformBox: 'view-box', transformOrigin: '12px 12px' }} />
    </motion.svg>
  );
}


