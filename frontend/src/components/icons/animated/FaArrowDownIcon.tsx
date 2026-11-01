'use client';

import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import type { SVGProps } from 'react';
import { useIconHost } from './useIconHost';

export interface FaArrowDownIconProps extends Omit<SVGProps<SVGSVGElement>, 'ref'> {
  size?: number | string;
  className?: string;
}

export function FaArrowDownIcon({ size = '1em', className, ...rest }: FaArrowDownIconProps) {
  const [playing, setPlaying] = useState<string>("rest");
  const hostRef = useRef<SVGSVGElement>(null);
  const { hovered, tapped } = useIconHost(hostRef);
  useEffect(() => {
    setPlaying((now) => (hovered ? (now === "rest" ? "peek" : now) : now === "peek" ? "rest" : now));
  }, [hovered]);
  useEffect(() => {
    if (!tapped) return;
    setPlaying("go");
    const done = setTimeout(() => setPlaying('rest'), 600);
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
    <motion.path initial="rest" animate={playing} d="M20.125 10.561 L21.079 11.514 C21.483 11.918 21.483 12.571 21.079 12.971 L12.73 21.324 C12.327 21.728 11.673 21.728 11.274 21.324 L2.921 12.971 C2.517 12.567 2.517 11.914 2.921 11.514 L3.875 10.561 C4.283 10.152 4.949 10.161 5.348 10.578 L10.281 15.755 V3.406 C10.281 2.835 10.741 2.375 11.312 2.375 H12.688 C13.259 2.375 13.719 2.835 13.719 3.406 V15.755 L18.652 10.578 C19.051 10.157 19.717 10.148 20.125 10.561 Z" variants={{ rest: { x: 0, y: 0 }, peek: { x: [0,0,0], y: [0,2.022,0], transition: { x: { duration: 0.28, times: [0,0.4,1], ease: ["easeOut", "easeInOut"] }, y: { duration: 0.28, times: [0,0.4,1], ease: ["easeOut", "easeInOut"] } } }, go: { x: [0,0,0,0,0,0], y: [0,-0.18,1.98,1.8,1.8,0], transition: { x: { duration: 0.56, times: [0,0.1,0.3,0.4,0.72,1], ease: ["easeOut", "easeOut", "easeInOut", "linear", "easeInOut"] }, y: { duration: 0.56, times: [0,0.1,0.3,0.4,0.72,1], ease: ["easeOut", "easeOut", "easeInOut", "linear", "easeInOut"] } } } }} style={{ transformBox: 'view-box', transformOrigin: '12px 12px' }} />
    </motion.svg>
  );
}


