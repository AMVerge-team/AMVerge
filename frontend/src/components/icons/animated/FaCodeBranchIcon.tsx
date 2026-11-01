'use client';

import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import type { SVGProps } from 'react';
import { useIconHost } from './useIconHost';

export interface FaCodeBranchIconProps extends Omit<SVGProps<SVGSVGElement>, 'ref'> {
  size?: number | string;
  className?: string;
}

export function FaCodeBranchIcon({ size = '1em', className, ...rest }: FaCodeBranchIconProps) {
  const [playing, setPlaying] = useState<string>("rest");
  const hostRef = useRef<SVGSVGElement>(null);
  const { hovered, tapped } = useIconHost(hostRef);
  useEffect(() => {
    setPlaying((now) => (hovered ? (now === "rest" ? "lean" : now) : now === "lean" ? "rest" : now));
  }, [hovered]);
  useEffect(() => {
    if (!tapped) return;
    setPlaying("branch");
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
    <motion.path initial="rest" animate={playing} d="M20.25 7.188 C20.25 5.288 18.712 3.75 16.812 3.75 S13.375 5.288 13.375 7.188 C13.375 8.752 14.419 10.071 15.846 10.488 C15.82 11.179 15.665 11.712 15.373 12.073 C14.711 12.898 13.255 13.036 11.712 13.177 C10.5 13.289 9.246 13.409 8.219 13.904 V7.716 C9.615 7.278 10.625 5.976 10.625 4.438 C10.625 2.538 9.087 1 7.188 1 S3.75 2.538 3.75 4.438 C3.75 5.976 4.76 7.278 6.156 7.716 V16.28 C4.76 16.722 3.75 18.024 3.75 19.562 C3.75 21.462 5.288 23 7.188 23 S10.625 21.462 10.625 19.562 C10.625 18.102 9.714 16.851 8.425 16.357 C8.558 16.134 8.76 15.936 9.065 15.781 C9.761 15.429 10.801 15.334 11.905 15.231 C13.719 15.064 15.773 14.87 16.984 13.366 C17.586 12.619 17.891 11.656 17.913 10.449 C19.27 9.985 20.25 8.7 20.25 7.188 Z M7.188 3.75 C7.566 3.75 7.875 4.059 7.875 4.438 S7.566 5.125 7.188 5.125 S6.5 4.816 6.5 4.438 S6.809 3.75 7.188 3.75 Z M7.188 20.25 C6.809 20.25 6.5 19.941 6.5 19.562 S6.809 18.875 7.188 18.875 S7.875 19.184 7.875 19.562 S7.566 20.25 7.188 20.25 Z M16.812 6.5 C17.191 6.5 17.5 6.809 17.5 7.188 S17.191 7.875 16.812 7.875 S16.125 7.566 16.125 7.188 S16.434 6.5 16.812 6.5 Z" variants={{ rest: { rotate: 0 }, lean: { rotate: [0,7.36,0], transition: { rotate: { duration: 0.3, times: [0,0.4,1], ease: ["easeOut", "easeInOut"] } } }, branch: { rotate: [0,-3.79,12.12,12.12,0], transition: { rotate: { duration: 0.62, times: [0,0.1,0.32,0.68,1], ease: ["easeOut", "easeOut", "easeOut", "easeInOut"] } } } }} style={{ transformBox: 'view-box', originX: '7.188px', originY: '19.562px' }} />
    </motion.svg>
  );
}


