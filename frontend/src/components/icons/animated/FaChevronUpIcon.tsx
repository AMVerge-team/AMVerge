'use client';

import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import type { SVGProps } from 'react';
import { useIconHost } from './useIconHost';

export interface FaChevronUpIconProps extends Omit<SVGProps<SVGSVGElement>, 'ref'> {
  size?: number | string;
  className?: string;
}

export function FaChevronUpIcon({ size = '1em', className, ...rest }: FaChevronUpIconProps) {
  const [playing, setPlaying] = useState<string>("rest");
  const hostRef = useRef<SVGSVGElement>(null);
  const { hovered, tapped } = useIconHost(hostRef);
  useEffect(() => {
    setPlaying((now) => (hovered ? (now === "rest" ? "tip" : now) : now === "tip" ? "rest" : now));
  }, [hovered]);
  useEffect(() => {
    if (!tapped) return;
    setPlaying((now) => (now === "fold" ? "fold-back" : "fold"));
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
    <motion.path initial="rest" animate={playing} d="M12.729 6.608 L21.08 14.959 C21.483 15.362 21.483 16.015 21.08 16.418 L20.106 17.392 C19.704 17.794 19.052 17.794 18.649 17.393 L12 10.775 L5.351 17.393 C4.948 17.794 4.296 17.794 3.894 17.392 L2.92 16.418 C2.517 16.015 2.517 15.362 2.92 14.959 L11.271 6.608 C11.674 6.206 12.326 6.206 12.729 6.608 Z" variants={{ rest: { rotate: 0 }, tip: { rotate: [0,15.03,0], transition: { rotate: { duration: 0.3, times: [0,0.4,1], ease: ["easeOut", "easeInOut"] } } }, fold: { rotate: [0,-8,186,180,180], transition: { rotate: { duration: 0.62, times: [0,0.1,0.52,0.78,1], ease: ["easeOut", "easeOut", "easeOut", "easeOut"] } } }, "fold-back": { rotate: [180,180,186,-8,0], transition: { rotate: { duration: 0.62, times: [0,0.22,0.48,0.9,1], ease: [[0,0,1,1], "easeIn", "easeIn", "easeIn"] } } } }} style={{ transformBox: 'view-box', transformOrigin: '12px 12px' }} />
    </motion.svg>
  );
}


