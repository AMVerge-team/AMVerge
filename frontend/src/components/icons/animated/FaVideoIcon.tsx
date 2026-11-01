'use client';

import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import type { SVGProps } from 'react';
import { useIconHost } from './useIconHost';

export interface FaVideoIconProps extends Omit<SVGProps<SVGSVGElement>, 'ref'> {
  size?: number | string;
  className?: string;
}

export function FaVideoIcon({ size = '1em', className, ...rest }: FaVideoIconProps) {
  const [playing, setPlaying] = useState<string>("rest");
  const hostRef = useRef<SVGSVGElement>(null);
  const { hovered, tapped } = useIconHost(hostRef);
  useEffect(() => {
    setPlaying((now) => (hovered ? (now === "rest" ? "nod" : now) : now === "nod" ? "rest" : now));
  }, [hovered]);
  useEffect(() => {
    if (!tapped) return;
    setPlaying("press");
    const done = setTimeout(() => setPlaying('rest'), 580);
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
    <motion.path initial="rest" animate={playing} d="M13.841 4.667 H2.826 C1.817 4.667 1 5.484 1 6.492 V17.508 C1 18.516 1.817 19.333 2.826 19.333 H13.841 C14.849 19.333 15.667 18.516 15.667 17.508 V6.492 C15.667 5.484 14.849 4.667 13.841 4.667 Z" variants={{ rest: { x: 0, y: 0 }, nod: { x: [0,0,0], y: [0,2.914,0], transition: { x: { duration: 0.26, times: [0,0.4,1], ease: ["easeOut", "easeOut"] }, y: { duration: 0.26, times: [0,0.4,1], ease: ["easeOut", "easeOut"] } } }, press: { x: [0,0,0,0,0,0], y: [0,-0.707,4.417,4.038,4.038,0], transition: { x: { duration: 0.54, times: [0,0.1,0.3,0.4,0.72,1], ease: ["easeOut", "easeOut", "easeOut", "easeInOut", "linear"] }, y: { duration: 0.54, times: [0,0.1,0.3,0.4,0.72,1], ease: ["easeOut", "easeOut", "easeOut", "easeInOut", "linear"] } } } }} style={{ transformBox: 'view-box', transformOrigin: '12px 12px' }} />
    <motion.path initial="rest" animate={playing} d="M21.075 6.107 L16.889 8.994 V15.006 L21.075 17.89 C21.885 18.447 23 17.878 23 16.904 V7.092 C23 6.122 21.889 5.549 21.075 6.107 Z" variants={{ rest: { x: 0, y: 0 }, nod: { x: [0,0,0], y: [0,2.914,0], transition: { x: { duration: 0.26, times: [0,0.4,1], ease: ["easeOut", "easeOut"] }, y: { duration: 0.26, times: [0,0.4,1], ease: ["easeOut", "easeOut"] } } }, press: { x: [0,0,0,0,0,0], y: [0,-0.707,4.417,4.038,4.038,0], transition: { x: { duration: 0.54, times: [0,0.1,0.3,0.4,0.72,1], ease: ["easeOut", "easeOut", "easeOut", "easeInOut", "linear"] }, y: { duration: 0.54, times: [0,0.1,0.3,0.4,0.72,1], ease: ["easeOut", "easeOut", "easeOut", "easeInOut", "linear"] } } } }} style={{ transformBox: 'view-box', transformOrigin: '12px 12px' }} />
    </motion.svg>
  );
}


