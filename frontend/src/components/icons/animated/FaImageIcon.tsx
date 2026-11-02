'use client';

import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import type { SVGProps } from 'react';
import { useIconHost } from './useIconHost';

export interface FaImageIconProps extends Omit<SVGProps<SVGSVGElement>, 'ref'> {
  size?: number | string;
  className?: string;
}

export function FaImageIcon({ size = '1em', className, ...rest }: FaImageIconProps) {
  const [playing, setPlaying] = useState<string>("rest");
  const hostRef = useRef<SVGSVGElement>(null);
  const { hovered, tapped } = useIconHost(hostRef);
  useEffect(() => {
    setPlaying((now) => (hovered ? (now === "rest" ? "raise" : now) : now === "raise" ? "rest" : now));
  }, [hovered]);
  useEffect(() => {
    if (!tapped) return;
    setPlaying("show");
    const done = setTimeout(() => setPlaying('rest'), 740);
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
    <motion.path initial="rest" animate={playing} d="M20.938 20.25 H3.062 C1.923 20.25 1 19.327 1 18.188 V5.812 C1 4.673 1.923 3.75 3.062 3.75 H20.938 C22.077 3.75 23 4.673 23 5.812 V18.188 C23 19.327 22.077 20.25 20.938 20.25 Z M5.812 6.156 C4.484 6.156 3.406 7.234 3.406 8.562 S4.484 10.969 5.812 10.969 S8.219 9.891 8.219 8.562 S7.141 6.156 5.812 6.156 Z M3.75 17.5 H20.25 V12.688 L16.49 8.927 C16.288 8.726 15.962 8.726 15.76 8.927 L9.938 14.75 L7.552 12.365 C7.351 12.163 7.024 12.163 6.823 12.365 L3.75 15.438 V17.5 Z" variants={{ rest: { x: 0, y: 0 }, raise: { x: [0,0,0], y: [0,-2.914,0], transition: { x: { duration: 0.32, times: [0,0.4,1], ease: ["easeOut", "easeInOut"] }, y: { duration: 0.32, times: [0,0.4,1], ease: ["easeOut", "easeInOut"] } } }, show: { x: [0,0,0,0,0,0], y: [0,-3.5,-3.5,0.583,-0.194,0], transition: { x: { duration: 0.7, times: [0,0.3,0.4302,0.6744,0.8372,1], ease: ["easeOut", "easeOut", "easeIn", "easeOut", "easeInOut"] }, y: { duration: 0.7, times: [0,0.3,0.4302,0.6744,0.8372,1], ease: ["easeOut", "easeOut", "easeIn", "easeOut", "easeInOut"] } } } }} style={{ transformBox: 'view-box', originX: '12px', originY: '20.25px' }} />
    </motion.svg>
  );
}


