'use client';

import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import type { SVGProps } from 'react';
import { useIconHost } from './useIconHost';

export interface FaArrowLeftIconProps extends Omit<SVGProps<SVGSVGElement>, 'ref'> {
  size?: number | string;
  className?: string;
}

export function FaArrowLeftIcon({ size = '1em', className, ...rest }: FaArrowLeftIconProps) {
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
    <motion.path initial="rest" animate={playing} d="M13.439 20.125 L12.486 21.079 C12.082 21.483 11.429 21.483 11.029 21.079 L2.676 12.73 C2.272 12.327 2.272 11.673 2.676 11.274 L11.029 2.921 C11.433 2.517 12.086 2.517 12.486 2.921 L13.439 3.875 C13.848 4.283 13.839 4.949 13.422 5.348 L8.245 10.281 H20.594 C21.165 10.281 21.625 10.741 21.625 11.312 V12.688 C21.625 13.259 21.165 13.719 20.594 13.719 H8.245 L13.422 18.652 C13.843 19.051 13.852 19.717 13.439 20.125 Z" variants={{ rest: { x: 0, y: 0 }, peek: { x: [0,-2.022,0], y: [0,0,0], transition: { x: { duration: 0.28, times: [0,0.4,1], ease: ["easeOut", "easeInOut"] }, y: { duration: 0.28, times: [0,0.4,1], ease: ["easeOut", "easeInOut"] } } }, go: { x: [0,0.18,-1.98,-1.8,-1.8,0], y: [0,0,0,0,0,0], transition: { x: { duration: 0.56, times: [0,0.1,0.3,0.4,0.72,1], ease: ["easeOut", "easeOut", "easeInOut", "linear", "easeInOut"] }, y: { duration: 0.56, times: [0,0.1,0.3,0.4,0.72,1], ease: ["easeOut", "easeOut", "easeInOut", "linear", "easeInOut"] } } } }} style={{ transformBox: 'view-box', transformOrigin: '12px 12px' }} />
    </motion.svg>
  );
}


