'use client';

import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import type { SVGProps } from 'react';
import { useIconHost } from './useIconHost';

export interface FaPlayIconProps extends Omit<SVGProps<SVGSVGElement>, 'ref'> {
  size?: number | string;
  className?: string;
}

export function FaPlayIcon({ size = '1em', className, ...rest }: FaPlayIconProps) {
  const [playing, setPlaying] = useState<string>("rest");
  const hostRef = useRef<SVGSVGElement>(null);
  const { hovered, tapped } = useIconHost(hostRef);
  useEffect(() => {
    setPlaying((now) => (hovered ? (now === "rest" ? "lean" : now) : now === "lean" ? "rest" : now));
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
    <motion.path initial="rest" animate={playing} d="M20.611 10.225 L5.486 1.284 C4.257 0.557 2.375 1.262 2.375 3.058 V20.938 C2.375 22.549 4.124 23.52 5.486 22.712 L20.611 13.775 C21.96 12.98 21.964 11.02 20.611 10.225 Z" variants={{ rest: { x: 0, y: 0, scale: 1 }, lean: { x: [0,1.786,0], y: [0,0,0], scale: [1,0.95,1], transition: { x: { duration: 0.3, times: [0,0.4,1], ease: ["easeOut", "easeInOut"] }, y: { duration: 0.3, times: [0,0.4,1], ease: ["easeOut", "easeInOut"] }, scale: { duration: 0.3, times: [0,0.45,1], ease: ["easeOut", "easeInOut"] } } }, go: { x: [0,-0.447,1.786,1.786,0], y: [0,0,0,0,0], scale: [1,1.03,0.95,0.95,1], transition: { x: { duration: 0.56, times: [0,0.1,0.32,0.68,1], ease: ["easeOut", "easeOut", "easeOut", "easeInOut"] }, y: { duration: 0.56, times: [0,0.1,0.32,0.68,1], ease: ["easeOut", "easeOut", "easeOut", "easeInOut"] }, scale: { duration: 0.56, times: [0,0.1,0.38,0.66,1], ease: ["easeOut", "easeOut", "easeInOut", "easeInOut"] } } } }} style={{ transformBox: 'view-box', transformOrigin: '21.6px 12px' }} />
    </motion.svg>
  );
}


