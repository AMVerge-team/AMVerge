'use client';

import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import type { SVGProps } from 'react';
import { useIconHost } from './useIconHost';

export interface FaFileAltIconProps extends Omit<SVGProps<SVGSVGElement>, 'ref'> {
  size?: number | string;
  className?: string;
}

export function FaFileAltIcon({ size = '1em', className, ...rest }: FaFileAltIconProps) {
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
    <motion.path initial="rest" animate={playing} d="M13.375 6.844 V1 H4.781 C4.21 1 3.75 1.46 3.75 2.031 V21.969 C3.75 22.54 4.21 23 4.781 23 H19.219 C19.79 23 20.25 22.54 20.25 21.969 V7.875 H14.406 C13.839 7.875 13.375 7.411 13.375 6.844 Z M16.125 16.984 C16.125 17.268 15.893 17.5 15.609 17.5 H8.391 C8.107 17.5 7.875 17.268 7.875 16.984 V16.641 C7.875 16.357 8.107 16.125 8.391 16.125 H15.609 C15.893 16.125 16.125 16.357 16.125 16.641 V16.984 Z M16.125 14.234 C16.125 14.518 15.893 14.75 15.609 14.75 H8.391 C8.107 14.75 7.875 14.518 7.875 14.234 V13.891 C7.875 13.607 8.107 13.375 8.391 13.375 H15.609 C15.893 13.375 16.125 13.607 16.125 13.891 V14.234 Z M16.125 11.141 V11.484 C16.125 11.768 15.893 12 15.609 12 H8.391 C8.107 12 7.875 11.768 7.875 11.484 V11.141 C7.875 10.857 8.107 10.625 8.391 10.625 H15.609 C15.893 10.625 16.125 10.857 16.125 11.141 Z" variants={{ rest: { x: 0, y: 0 }, tip: { x: 0, y: 0 }, knock: { x: [0,0,0,0,0], y: [0,0,0.72,0.72,0], transition: { x: { duration: 0.62, times: [0,0.3,0.44,0.74,1], ease: [[0,0,1,1], "easeOut", "easeInOut", "easeInOut"] }, y: { duration: 0.62, times: [0,0.3,0.44,0.74,1], ease: [[0,0,1,1], "easeOut", "easeInOut", "easeInOut"] } } } }} style={{ transformBox: 'view-box', originX: '12px', originY: '23px' }} />
    <motion.path initial="rest" animate={playing} d="M20.25 6.238 V6.5 H14.75 V1 H15.012 C15.287 1 15.549 1.107 15.743 1.301 L19.949 5.512 C20.143 5.705 20.25 5.967 20.25 6.238 Z" variants={{ rest: { rotate: 0 }, tip: { rotate: [0,21.47,0], transition: { rotate: { duration: 0.32, times: [0,0.4,1], ease: ["easeOut", "easeInOut"] } } }, knock: { rotate: [0,-3.6,21.6,19.8,19.8,0], transition: { rotate: { duration: 0.62, times: [0,0.1,0.3,0.4,0.7,1], ease: ["easeOut", "easeOut", "easeInOut", "linear", "easeInOut"] } } } }} style={{ transformBox: 'view-box', originX: '20.25px', originY: '1px' }} />
    </motion.svg>
  );
}


