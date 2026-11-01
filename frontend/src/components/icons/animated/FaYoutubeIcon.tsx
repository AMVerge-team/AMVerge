'use client';

import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import type { SVGProps } from 'react';
import { useIconHost } from './useIconHost';

export interface FaYoutubeIconProps extends Omit<SVGProps<SVGSVGElement>, 'ref'> {
  size?: number | string;
  className?: string;
}

export function FaYoutubeIcon({ size = '1em', className, ...rest }: FaYoutubeIconProps) {
  const [playing, setPlaying] = useState<string>("rest");
  const hostRef = useRef<SVGSVGElement>(null);
  const { hovered, tapped } = useIconHost(hostRef);
  useEffect(() => {
    setPlaying((now) => (hovered ? (now === "rest" ? "tick" : now) : now === "tick" ? "rest" : now));
  }, [hovered]);
  useEffect(() => {
    if (!tapped) return;
    setPlaying("press");
    const done = setTimeout(() => setPlaying('rest'), 480);
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
    <motion.path initial="rest" animate={playing} d="M21.994 6.962 C21.754 6.058 21.047 5.347 20.15 5.105 C18.523 4.667 12 4.667 12 4.667 S5.477 4.667 3.85 5.105 C2.953 5.347 2.246 6.058 2.006 6.962 C1.57 8.599 1.57 12.015 1.57 12.015 S1.57 15.431 2.006 17.068 C2.246 17.971 2.953 18.653 3.85 18.895 C5.477 19.333 12 19.333 12 19.333 S18.523 19.333 20.15 18.895 C21.047 18.653 21.754 17.971 21.994 17.068 C22.43 15.431 22.43 12.015 22.43 12.015 S22.43 8.599 21.994 6.962 Z M9.867 15.116 V8.913 L15.318 12.015 L9.867 15.116 Z" variants={{ rest: { scale: 1 }, tick: { scale: [1,0.95,1], transition: { scale: { duration: 0.2, times: [0,0.4,1], ease: ["easeOut", "easeOut"] } } }, press: { scale: [1,1.04,0.95,0.95,1], transition: { scale: { duration: 0.44, times: [0,0.1049,0.3409,0.4834,1], ease: ["easeOut", "easeOut", "easeOut", "linear"] } } } }} style={{ transformBox: 'view-box', transformOrigin: '12px 12px' }} />
    </motion.svg>
  );
}


