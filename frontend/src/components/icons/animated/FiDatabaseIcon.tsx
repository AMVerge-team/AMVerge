'use client';

import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import type { SVGProps } from 'react';
import { useIconHost } from './useIconHost';

export interface FiDatabaseIconProps extends Omit<SVGProps<SVGSVGElement>, 'ref'> {
  size?: number | string;
  className?: string;
}

export function FiDatabaseIcon({ size = '1em', className, ...rest }: FiDatabaseIconProps) {
  const [playing, setPlaying] = useState<string>("rest");
  const hostRef = useRef<SVGSVGElement>(null);
  const { hovered, tapped } = useIconHost(hostRef);
  useEffect(() => {
    setPlaying((now) => (hovered ? (now === "rest" ? "lift" : now) : now === "lift" ? "rest" : now));
  }, [hovered]);
  useEffect(() => {
    if (!tapped) return;
    setPlaying("seat");
    const done = setTimeout(() => setPlaying('rest'), 760);
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
    <motion.path initial="rest" animate={playing} d="M20.25 12 C20.25 13.522 16.583 14.75 12 14.75 S3.75 13.522 3.75 12" fill="none" stroke="currentColor" strokeWidth={1.83} strokeLinecap="round" strokeLinejoin="round" variants={{ rest: { x: 0, y: 0 }, lift: { x: 0, y: 0 }, seat: { x: [0,0,0,0], y: [0,0,0.553,0], transition: { x: { duration: 0.72, times: [0,0.8444,0.9028,1], ease: [[0,0,1,1], "easeOut", "easeInOut"] }, y: { duration: 0.72, times: [0,0.8444,0.9028,1], ease: [[0,0,1,1], "easeOut", "easeInOut"] } } } }} style={{ transformBox: 'view-box', originX: '12px', originY: '12px' }} />
    <motion.path initial="rest" animate={playing} d="M3.75 12 V18.417 C3.75 19.938 7.417 21.167 12 21.167 S20.25 19.938 20.25 18.417 V12" fill="none" stroke="currentColor" strokeWidth={1.83} strokeLinecap="round" strokeLinejoin="round" variants={{ rest: { x: 0, y: 0 }, lift: { x: 0, y: 0 }, seat: { x: [0,0,0,0], y: [0,0,0.553,0], transition: { x: { duration: 0.72, times: [0,0.8444,0.9028,1], ease: [[0,0,1,1], "easeOut", "easeInOut"] }, y: { duration: 0.72, times: [0,0.8444,0.9028,1], ease: [[0,0,1,1], "easeOut", "easeInOut"] } } } }} style={{ transformBox: 'view-box', originX: '12px', originY: '12px' }} />
    <motion.g initial="rest" animate={playing} variants={{ rest: { x: 0, y: 0 }, lift: { x: [0,0,0], y: [0,-2.583,0], transition: { x: { duration: 0.3, times: [0,0.4,1], ease: ["easeOut", "easeInOut"] }, y: { duration: 0.3, times: [0,0.4,1], ease: ["easeOut", "easeInOut"] } } }, seat: { x: [0,0,0,0,0,0], y: [0,0.461,-2.583,-2.583,0,0], transition: { x: { duration: 0.72, times: [0,0.0857,0.3,0.65,0.8639,1], ease: ["easeOut", "easeOut", "easeOut", "easeIn", "easeOut"] }, y: { duration: 0.72, times: [0,0.0857,0.3,0.65,0.8639,1], ease: ["easeOut", "easeOut", "easeOut", "easeIn", "easeOut"] } } } }} style={{ transformBox: 'view-box', originX: '12px', originY: '12px' }}>
      <path d="M3.75 5.583 V12 M20.25 5.583 V12" fill="none" stroke="currentColor" strokeWidth={1.83} strokeLinecap="round" strokeLinejoin="round" />
      <ellipse cx={12} cy={5.583} rx={8.25} ry={2.75} fill="none" stroke="currentColor" strokeWidth={1.83} strokeLinecap="round" strokeLinejoin="round" />
    </motion.g>
    </motion.svg>
  );
}


