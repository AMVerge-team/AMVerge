'use client';

import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import type { SVGProps } from 'react';
import { useIconHost } from './useIconHost';

export interface FaAngleRightIconProps extends Omit<SVGProps<SVGSVGElement>, 'ref'> {
  size?: number | string;
  className?: string;
}

export function FaAngleRightIcon({ size = '1em', className, ...rest }: FaAngleRightIconProps) {
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
    <motion.path initial="rest" animate={playing} d="M16.138 12.73 L10.294 18.574 C9.89 18.978 9.237 18.978 8.838 18.574 L7.866 17.603 C7.463 17.199 7.463 16.546 7.866 16.146 L12.009 12.004 L7.866 7.862 C7.463 7.458 7.463 6.805 7.866 6.405 L8.833 5.426 C9.237 5.022 9.89 5.022 10.29 5.426 L16.134 11.27 C16.542 11.673 16.542 12.327 16.138 12.73 Z" variants={{ rest: { x: 0, y: 0 }, peek: { x: [0,2.914,0], y: [0,0,0], transition: { x: { duration: 0.3, times: [0,0.4,1], ease: ["easeOut", "easeInOut"] }, y: { duration: 0.3, times: [0,0.4,1], ease: ["easeOut", "easeInOut"] } } }, go: { x: [0,-0.436,4.8,4.364,4.364,0], y: [0,0,0,0,0,0], transition: { x: { duration: 0.56, times: [0,0.1,0.3,0.4,0.72,1], ease: ["easeOut", "easeOut", "easeInOut", "linear", "easeInOut"] }, y: { duration: 0.56, times: [0,0.1,0.3,0.4,0.72,1], ease: ["easeOut", "easeOut", "easeInOut", "linear", "easeInOut"] } } } }} style={{ transformBox: 'view-box', originX: '12px', originY: '12px' }} />
    </motion.svg>
  );
}


