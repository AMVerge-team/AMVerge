'use client';

import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import type { SVGProps } from 'react';
import { useIconHost } from './useIconHost';

export interface FiDownloadIconProps extends Omit<SVGProps<SVGSVGElement>, 'ref'> {
  size?: number | string;
  className?: string;
}

export function FiDownloadIcon({ size = '1em', className, ...rest }: FiDownloadIconProps) {
  const [playing, setPlaying] = useState<string>("rest");
  const hostRef = useRef<SVGSVGElement>(null);
  const { hovered, tapped } = useIconHost(hostRef);
  useEffect(() => {
    setPlaying((now) => (hovered ? (now === "rest" ? "dip" : now) : now === "dip" ? "rest" : now));
  }, [hovered]);
  useEffect(() => {
    if (!tapped) return;
    setPlaying("take");
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
    <motion.path initial="rest" animate={playing} d="M20.25 14.75 V18.417 A1.833 1.833 0 0 1 18.417 20.25 H5.583 A1.833 1.833 0 0 1 3.75 18.417 V14.75" fill="none" stroke="currentColor" strokeWidth={1.83} strokeLinecap="round" strokeLinejoin="round" variants={{ rest: { x: 0, y: 0 }, dip: { x: 0, y: 0 }, take: { x: [0,0,0,0,0], y: [0,0,0.608,0,0], transition: { x: { duration: 0.76, times: [0,0.5,0.6,0.8,1], ease: [[0,0,1,1], "easeOut", "easeInOut", "easeOut"] }, y: { duration: 0.76, times: [0,0.5,0.6,0.8,1], ease: [[0,0,1,1], "easeOut", "easeInOut", "easeOut"] } } } }} style={{ transformBox: 'view-box', transformOrigin: '12px 12px' }} />
    <motion.g initial="rest" animate={playing} variants={{ rest: { x: 0, y: 0, opacity: 1 }, dip: { x: [0,0,0], y: [0,2.914,0], transition: { x: { duration: 0.3, times: [0,0.3,1], ease: ["easeIn", [0.34,1.56,0.64,1]] }, y: { duration: 0.3, times: [0,0.3,1], ease: ["easeIn", [0.34,1.56,0.64,1]] } } }, take: { x: [0,0,0,0,0,0], y: [0,0,1.327,1.327,0,0], opacity: [1,0.25,0.25,1,1], transition: { x: { duration: 0.76, times: [0,0.3,0.52,0.72,0.92,1], ease: [[0,0,1,1], "easeIn", "easeOut", "easeOut", "easeOut"] }, y: { duration: 0.76, times: [0,0.3,0.52,0.72,0.92,1], ease: [[0,0,1,1], "easeIn", "easeOut", "easeOut", "easeOut"] }, opacity: { duration: 0.76, times: [0,0.26,0.62,0.82,1], ease: ["linear", "linear", "linear", "easeOut"] } } } }} style={{ transformBox: 'view-box', transformOrigin: '12px 14.75px' }}>
      <path d="M7.417 10.167 L12 14.75 L16.583 10.167" fill="none" stroke="currentColor" strokeWidth={1.83} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 14.75 L12 3.75" fill="none" stroke="currentColor" strokeWidth={1.83} strokeLinecap="round" strokeLinejoin="round" />
    </motion.g>
    <motion.path initial="rest" animate={playing} d="M 9 9.75 h6 v5 h-6 z m0 1.8 h6" fill="none" stroke="currentColor" strokeWidth={1.3} strokeLinecap="round" strokeLinejoin="round" variants={{ rest: { opacity: 0, x: 0, y: -19, rotate: -10, scale: 1 }, dip: { opacity: 0, x: 0, y: -19, rotate: -10, scale: 1 }, take: { opacity: [0,1,1,0,0], x: [0,0,0,0,0], y: [-6,-6,-2.6,0,0], rotate: [-10,-10,-2,0,0], scale: [1,1,0,0], transition: { opacity: { duration: 0.76, times: [0,0.12,0.54,0.6,1], ease: [(p) => (p < 1 ? 0 : 1), "linear", "linear", "easeOut"] }, x: { duration: 0.76, times: [0,0.12,0.36,0.54,1], ease: ["easeIn", "easeIn", "easeIn", "easeOut"] }, y: { duration: 0.76, times: [0,0.12,0.36,0.54,1], ease: ["easeIn", "easeIn", "easeIn", "easeOut"] }, rotate: { duration: 0.76, times: [0,0.12,0.4,0.5,1], ease: [[0,0,1,1], "easeOut", "easeOut", "easeOut"] }, scale: { duration: 0.76, times: [0,0.52,0.58,1], ease: ["linear", "easeIn", "easeOut"] } } } }} style={{ transformBox: 'view-box', transformOrigin: '12px 14.75px' }} />
    </motion.svg>
  );
}


