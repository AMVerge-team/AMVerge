'use client';

import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import type { SVGProps } from 'react';
import { useIconHost } from './useIconHost';

export interface FaColumnsIconProps extends Omit<SVGProps<SVGSVGElement>, 'ref'> {
  size?: number | string;
  className?: string;
}

export function FaColumnsIcon({ size = '1em', className, ...rest }: FaColumnsIconProps) {
  const [playing, setPlaying] = useState<string>("rest");
  const hostRef = useRef<SVGSVGElement>(null);
  const { hovered, tapped } = useIconHost(hostRef);
  useEffect(() => {
    setPlaying((now) => (hovered ? (now === "rest" ? "peek" : now) : now === "peek" ? "rest" : now));
  }, [hovered]);
  useEffect(() => {
    if (!tapped) return;
    setPlaying((now) => (now === "collapse" ? "collapse-back" : "collapse"));
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
    <path d="M20.938 2.375 H3.062 C1.923 2.375 1 3.298 1 4.438 V19.562 C1 20.702 1.923 21.625 3.062 21.625 H20.938 C22.077 21.625 23 20.702 23 19.562 V4.438 C23 3.298 22.077 2.375 20.938 2.375 Z M3.75 7.875 H20.25 V18.875 H3.75 Z" fillRule="evenodd" />
    <motion.rect initial="rest" animate={playing} x={10.625} y={7.875} width={2.75} height={11} variants={{ rest: { x: 0, y: 0 }, peek: { x: [0,2.914,0], y: [0,0,0], transition: { x: { duration: 0.3, times: [0,0.45,1], ease: ["easeOut", "easeInOut"] }, y: { duration: 0.3, times: [0,0.45,1], ease: ["easeOut", "easeInOut"] } } }, collapse: { x: [0,-0.506,4.971,4.971], y: [0,0,0,0], transition: { x: { duration: 0.64, times: [0,0.12,0.84,1], ease: ["easeOut", "easeOut", "easeInOut"] }, y: { duration: 0.64, times: [0,0.12,0.84,1], ease: ["easeOut", "easeOut", "easeInOut"] } } }, "collapse-back": { x: [4.971,4.971,-0.506,0], y: [0,0,0,0], transition: { x: { duration: 0.64, times: [0,0.16,0.88,1], ease: ["easeInOut", "easeIn", "easeIn"] }, y: { duration: 0.64, times: [0,0.16,0.88,1], ease: ["easeInOut", "easeIn", "easeIn"] } } } }} style={{ transformBox: 'view-box', transformOrigin: '12px 12px' }} />
    </motion.svg>
  );
}


