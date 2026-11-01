'use client';

import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import type { SVGProps } from 'react';
import { useIconHost } from './useIconHost';

export interface FaChevronDownIconProps extends Omit<SVGProps<SVGSVGElement>, 'ref'> {
  size?: number | string;
  className?: string;
}

export function FaChevronDownIcon({ size = '1em', className, ...rest }: FaChevronDownIconProps) {
  const [playing, setPlaying] = useState<string>("rest");
  const hostRef = useRef<SVGSVGElement>(null);
  const { hovered, tapped } = useIconHost(hostRef);
  useEffect(() => {
    setPlaying((now) => (hovered ? (now === "rest" ? "tip" : now) : now === "tip" ? "rest" : now));
  }, [hovered]);
  useEffect(() => {
    if (!tapped) return;
    setPlaying((now) => (now === "open" ? "open-back" : "open"));
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
    <motion.path initial="rest" animate={playing} d="M11.271 17.392 L2.92 9.041 C2.517 8.638 2.517 7.985 2.92 7.582 L3.894 6.608 C4.296 6.206 4.948 6.206 5.351 6.607 L12 13.225 L18.649 6.607 C19.052 6.206 19.704 6.206 20.106 6.608 L21.08 7.582 C21.483 7.985 21.483 8.638 21.08 9.041 L12.729 17.392 C12.326 17.794 11.674 17.794 11.271 17.392 Z" variants={{ rest: { rotate: 0 }, tip: { rotate: [0,15.03,0], transition: { rotate: { duration: 0.3, times: [0,0.4,1], ease: ["easeOut", "easeInOut"] } } }, open: { rotate: [0,-8,186,180,180], transition: { rotate: { duration: 0.62, times: [0,0.1,0.52,0.78,1], ease: ["easeOut", "easeOut", "easeOut", "easeOut"] } } }, "open-back": { rotate: [180,180,186,-8,0], transition: { rotate: { duration: 0.62, times: [0,0.22,0.48,0.9,1], ease: [[0,0,1,1], "easeIn", "easeIn", "easeIn"] } } } }} style={{ transformBox: 'view-box', transformOrigin: '12px 12px' }} />
    </motion.svg>
  );
}


