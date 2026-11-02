'use client';

import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import type { SVGProps } from 'react';
import { useIconHost } from './useIconHost';

export interface FaChevronRightIconProps extends Omit<SVGProps<SVGSVGElement>, 'ref'> {
  size?: number | string;
  className?: string;
}

export function FaChevronRightIcon({ size = '1em', className, ...rest }: FaChevronRightIconProps) {
  const [playing, setPlaying] = useState<string>("rest");
  const hostRef = useRef<SVGSVGElement>(null);
  const { hovered, tapped } = useIconHost(hostRef);
  useEffect(() => {
    setPlaying((now) => (hovered ? (now === "rest" ? "peek" : now) : now === "peek" ? "rest" : now));
  }, [hovered]);
  useEffect(() => {
    if (!tapped) return;
    setPlaying("go");
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
    <motion.path initial="rest" animate={playing} d="M17.392 12.729 L9.041 21.08 C8.638 21.483 7.985 21.483 7.582 21.08 L6.608 20.106 C6.206 19.704 6.206 19.052 6.607 18.649 L13.225 12 L6.607 5.351 C6.206 4.948 6.206 4.296 6.608 3.894 L7.582 2.92 C7.985 2.517 8.638 2.517 9.041 2.92 L17.392 11.271 C17.794 11.674 17.794 12.326 17.392 12.729 Z" variants={{ rest: { x: 0, y: 0 }, peek: { x: [0,2.914,0], y: [0,0,0], transition: { x: { duration: 0.3, times: [0,0.4,1], ease: ["easeOut", "easeInOut"] }, y: { duration: 0.3, times: [0,0.4,1], ease: ["easeOut", "easeInOut"] } } }, go: { x: [0,-0.436,4.8,4.364,4.364,0], y: [0,0,0,0,0,0], transition: { x: { duration: 0.54, times: [0,0.1,0.3,0.4,0.72,1], ease: ["easeOut", "easeOut", "easeInOut", "linear", "easeInOut"] }, y: { duration: 0.54, times: [0,0.1,0.3,0.4,0.72,1], ease: ["easeOut", "easeOut", "easeInOut", "linear", "easeInOut"] } } } }} style={{ transformBox: 'view-box', originX: '12px', originY: '12px' }} />
    </motion.svg>
  );
}


