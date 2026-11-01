'use client';

import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import type { SVGProps } from 'react';
import { useIconHost } from './useIconHost';

export interface FaChevronLeftIconProps extends Omit<SVGProps<SVGSVGElement>, 'ref'> {
  size?: number | string;
  className?: string;
}

export function FaChevronLeftIcon({ size = '1em', className, ...rest }: FaChevronLeftIconProps) {
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
    <motion.path initial="rest" animate={playing} d="M6.608 11.271 L14.959 2.92 C15.362 2.518 16.015 2.518 16.418 2.92 L17.392 3.894 C17.794 4.297 17.794 4.948 17.393 5.351 L10.775 12 L17.393 18.649 C17.794 19.052 17.793 19.704 17.391 20.106 L16.417 21.08 C16.015 21.483 15.361 21.483 14.959 21.08 L6.608 12.729 C6.206 12.327 6.206 11.673 6.608 11.271 Z" variants={{ rest: { x: 0, y: 0 }, peek: { x: [0,-2.914,0], y: [0,0,0], transition: { x: { duration: 0.3, times: [0,0.4,1], ease: ["easeOut", "easeInOut"] }, y: { duration: 0.3, times: [0,0.4,1], ease: ["easeOut", "easeInOut"] } } }, go: { x: [0,0.436,-4.8,-4.364,-4.364,0], y: [0,0,0,0,0,0], transition: { x: { duration: 0.54, times: [0,0.1,0.3,0.4,0.72,1], ease: ["easeOut", "easeOut", "easeInOut", "linear", "easeInOut"] }, y: { duration: 0.54, times: [0,0.1,0.3,0.4,0.72,1], ease: ["easeOut", "easeOut", "easeInOut", "linear", "easeInOut"] } } } }} style={{ transformBox: 'view-box', transformOrigin: '12px 12px' }} />
    </motion.svg>
  );
}


