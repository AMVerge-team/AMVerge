'use client';

import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import type { SVGProps } from 'react';
import { useIconHost } from './useIconHost';

export interface FaPaperPlaneIconProps extends Omit<SVGProps<SVGSVGElement>, 'ref'> {
  size?: number | string;
  className?: string;
}

export function FaPaperPlaneIcon({ size = '1em', className, ...rest }: FaPaperPlaneIconProps) {
  const [playing, setPlaying] = useState<string>("rest");
  const hostRef = useRef<SVGSVGElement>(null);
  const { hovered, tapped } = useIconHost(hostRef);
  useEffect(() => {
    setPlaying((now) => (hovered ? (now === "rest" ? "lift" : now) : now === "lift" ? "rest" : now));
  }, [hovered]);
  useEffect(() => {
    if (!tapped) return;
    setPlaying("send");
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
    <g>
      <g>
        <motion.path initial="rest" animate={playing} d="M21.453 1.137 L1.537 12.627 C0.759 13.074 0.858 14.157 1.632 14.484 L6.199 16.4 L18.544 5.52 C18.78 5.31 19.116 5.632 18.914 5.877 L8.562 18.488 V21.947 C8.562 22.961 9.787 23.361 10.389 22.626 L13.117 19.305 L18.471 21.548 C19.081 21.805 19.777 21.423 19.889 20.766 L22.983 2.203 C23.129 1.335 22.196 0.708 21.453 1.137 Z" variants={{ rest: { x: 0, y: 0, scale: 1 }, lift: { x: [0,0.3,0], y: [0,-0.24,0], scale: [1,0.95,1], transition: { x: { duration: 0.32, times: [0,0.45,1], ease: ["easeOut", "easeInOut"] }, y: { duration: 0.32, times: [0,0.45,1], ease: ["easeOut", "easeInOut"] }, scale: { duration: 0.32, times: [0,0.45,1], ease: ["easeOut", "easeInOut"] } } }, send: { x: [0,-0.175,0.5,0.5,0], y: [0,0.13999999999999999,-0.4,-0.4,0], scale: [1,1.04,0.95,0.95,1], transition: { x: { duration: 0.62, times: [0,0.1,0.42,0.68,1], ease: ["easeOut", "easeOut", "easeInOut", "easeInOut"] }, y: { duration: 0.62, times: [0,0.1,0.42,0.68,1], ease: ["easeOut", "easeOut", "easeInOut", "easeInOut"] }, scale: { duration: 0.62, times: [0,0.1,0.42,0.68,1], ease: ["easeOut", "easeOut", "easeInOut", "easeInOut"] } } } }} style={{ transformBox: 'view-box', originX: '22.3px', originY: '1.6px' }} />
      </g>
    </g>
    </motion.svg>
  );
}


