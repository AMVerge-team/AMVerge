'use client';

import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import type { SVGProps } from 'react';
import { useIconHost } from './useIconHost';

export interface FaFolderOpenIconProps extends Omit<SVGProps<SVGSVGElement>, 'ref'> {
  size?: number | string;
  className?: string;
}

export function FaFolderOpenIcon({ size = '1em', className, ...rest }: FaFolderOpenIconProps) {
  const [playing, setPlaying] = useState<string>("rest");
  const hostRef = useRef<SVGSVGElement>(null);
  const { hovered, tapped } = useIconHost(hostRef);
  useEffect(() => {
    setPlaying((now) => (hovered ? (now === "rest" ? "ajar" : now) : now === "ajar" ? "rest" : now));
  }, [hovered]);
  useEffect(() => {
    if (!tapped) return;
    setPlaying("open");
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
    <motion.path initial="rest" animate={playing} d="M6.806 10.778 H19.333 V8.944 C19.333 7.932 18.513 7.111 17.5 7.111 H11.389 L8.944 4.667 H2.833 C1.821 4.667 1 5.487 1 6.5 V17.12 L3.638 12.597 C4.293 11.475 5.507 10.778 6.806 10.778 Z" variants={{ rest: { x: 0, y: 0 }, ajar: { x: 0, y: 0 }, open: { x: [0,0,0,0,0], y: [0,0,0.479,0,0], transition: { x: { duration: 0.7, times: [0,0.3,0.3757,0.5459,1], ease: [[0,0,1,1], "easeOut", "easeInOut", "easeOut"] }, y: { duration: 0.7, times: [0,0.3,0.3757,0.5459,1], ease: [[0,0,1,1], "easeOut", "easeInOut", "easeOut"] } } } }} style={{ transformBox: 'view-box', transformOrigin: '12px 12px' }} />
    <motion.path initial="rest" animate={playing} d="M22.874 13.379 L20.108 18.121 A2.444 2.444 0 0 1 17.996 19.333 H2.72 C2.012 19.333 1.571 18.566 1.928 17.955 L4.694 13.213 A2.444 2.444 0 0 1 6.806 12 H22.082 C22.789 12 23.23 12.767 22.874 13.379 Z" variants={{ rest: { rotate: 0 }, ajar: { rotate: [0,8.23,0], transition: { rotate: { duration: 0.3, times: [0,0.4,1], ease: ["easeOut", "easeInOut"] } } }, open: { rotate: [0,-3.19,13.56,12.29,12.29,0], transition: { rotate: { duration: 0.7, times: [0,0.0923,0.3,0.3757,0.6973,1], ease: ["easeOut", "easeOut", "easeInOut", "linear", "easeInOut"] } } } }} style={{ transformBox: 'view-box', transformOrigin: '3.3px 15.6px' }} />
    </motion.svg>
  );
}


