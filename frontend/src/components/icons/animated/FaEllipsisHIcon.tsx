'use client';

import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import type { SVGProps } from 'react';
import { useIconHost } from './useIconHost';

export interface FaEllipsisHIconProps extends Omit<SVGProps<SVGSVGElement>, 'ref'> {
  size?: number | string;
  className?: string;
}

export function FaEllipsisHIcon({ size = '1em', className, ...rest }: FaEllipsisHIconProps) {
  const [playing, setPlaying] = useState<string>("rest");
  const hostRef = useRef<SVGSVGElement>(null);
  const { hovered, tapped } = useIconHost(hostRef);
  useEffect(() => {
    setPlaying((now) => (hovered ? (now === "rest" ? "roll" : now) : now === "roll" ? "rest" : now));
  }, [hovered]);
  useEffect(() => {
    if (!tapped) return;
    setPlaying("open");
    const done = setTimeout(() => setPlaying('rest'), 620);
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
    <motion.path initial="rest" animate={playing} d="M15.094 12 C15.094 13.71 13.71 15.094 12 15.094 S8.906 13.71 8.906 12 S10.29 8.906 12 8.906 S15.094 10.29 15.094 12 Z" variants={{ rest: { x: 0, y: 0 }, roll: { x: [0,0,0,0,0], y: [0,0,2.914,0,0], transition: { x: { duration: 0.32, times: [0,0.1,0.45,0.95,1], ease: [[0,0,1,1], "easeOut", "easeInOut", "easeOut"] }, y: { duration: 0.32, times: [0,0.1,0.45,0.95,1], ease: [[0,0,1,1], "easeOut", "easeInOut", "easeOut"] } } }, open: { x: [0,0,0,0,0,0], y: [0,0,4.8,4.8,0,0], transition: { x: { duration: 0.58, times: [0,0.0818,0.3538,0.6231,0.9103,1], ease: [[0,0,1,1], "easeOut", "linear", "easeOut", "easeOut"] }, y: { duration: 0.58, times: [0,0.0818,0.3538,0.6231,0.9103,1], ease: [[0,0,1,1], "easeOut", "linear", "easeOut", "easeOut"] } } } }} style={{ transformBox: 'view-box', originX: '12px', originY: '12px' }} />
    <motion.path initial="rest" animate={playing} d="M19.562 8.906 C17.852 8.906 16.469 10.29 16.469 12 S17.852 15.094 19.562 15.094 S22.656 13.71 22.656 12 S21.273 8.906 19.562 8.906 Z" variants={{ rest: { x: 0, y: 0 }, roll: { x: [0,0,0,0], y: [0,0,2.914,0], transition: { x: { duration: 0.32, times: [0,0.2,0.55,1], ease: [[0,0,1,1], "easeOut", "easeInOut"] }, y: { duration: 0.32, times: [0,0.2,0.55,1], ease: [[0,0,1,1], "easeOut", "easeInOut"] } } }, open: { x: [0,0,0,0,0], y: [0,0,4.8,4.8,0], transition: { x: { duration: 0.58, times: [0,0.1636,0.4077,0.65,1], ease: [[0,0,1,1], "easeOut", "linear", "easeOut"] }, y: { duration: 0.58, times: [0,0.1636,0.4077,0.65,1], ease: [[0,0,1,1], "easeOut", "linear", "easeOut"] } } } }} style={{ transformBox: 'view-box', originX: '12px', originY: '12px' }} />
    <motion.path initial="rest" animate={playing} d="M4.438 8.906 C2.727 8.906 1.344 10.29 1.344 12 S2.727 15.094 4.438 15.094 S7.531 13.71 7.531 12 S6.148 8.906 4.438 8.906 Z" variants={{ rest: { x: 0, y: 0 }, roll: { x: [0,0,0,0], y: [0,2.914,0,0], transition: { x: { duration: 0.32, times: [0,0.35,0.85,1], ease: ["easeOut", "easeInOut", "easeOut"] }, y: { duration: 0.32, times: [0,0.35,0.85,1], ease: ["easeOut", "easeInOut", "easeOut"] } } }, open: { x: [0,0,0,0,0], y: [0,4.8,4.8,0,0], transition: { x: { duration: 0.58, times: [0,0.3,0.5962,0.8654,1], ease: ["easeOut", "linear", "easeOut", "easeOut"] }, y: { duration: 0.58, times: [0,0.3,0.5962,0.8654,1], ease: ["easeOut", "linear", "easeOut", "easeOut"] } } } }} style={{ transformBox: 'view-box', originX: '12px', originY: '12px' }} />
    </motion.svg>
  );
}


