'use client';

import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import type { SVGProps } from 'react';
import { useIconHost } from './useIconHost';

export interface FaArrowUpIconProps extends Omit<SVGProps<SVGSVGElement>, 'ref'> {
  size?: number | string;
  className?: string;
}

export function FaArrowUpIcon({ size = '1em', className, ...rest }: FaArrowUpIconProps) {
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
    <motion.path initial="rest" animate={playing} d="M3.875 13.439 L2.921 12.486 C2.517 12.082 2.517 11.429 2.921 11.029 L11.27 2.676 C11.673 2.272 12.327 2.272 12.726 2.676 L21.075 11.025 C21.479 11.429 21.479 12.082 21.075 12.481 L20.121 13.435 C19.713 13.843 19.047 13.835 18.647 13.418 L13.719 8.245 V20.594 C13.719 21.165 13.259 21.625 12.688 21.625 H11.312 C10.741 21.625 10.281 21.165 10.281 20.594 V8.245 L5.348 13.422 C4.949 13.843 4.283 13.852 3.875 13.439 Z" variants={{ rest: { x: 0, y: 0 }, peek: { x: [0,0,0], y: [0,-2.022,0], transition: { x: { duration: 0.28, times: [0,0.4,1], ease: ["easeOut", "easeInOut"] }, y: { duration: 0.28, times: [0,0.4,1], ease: ["easeOut", "easeInOut"] } } }, go: { x: [0,0,0,0,0,0], y: [0,0.18,-1.98,-1.8,-1.8,0], transition: { x: { duration: 0.56, times: [0,0.1,0.3,0.4,0.72,1], ease: ["easeOut", "easeOut", "easeInOut", "linear", "easeInOut"] }, y: { duration: 0.56, times: [0,0.1,0.3,0.4,0.72,1], ease: ["easeOut", "easeOut", "easeInOut", "linear", "easeInOut"] } } } }} style={{ transformBox: 'view-box', originX: '12px', originY: '12px' }} />
    </motion.svg>
  );
}


