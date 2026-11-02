'use client';

import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import type { SVGProps } from 'react';
import { useIconHost } from './useIconHost';

export interface FaPencilAltIconProps extends Omit<SVGProps<SVGSVGElement>, 'ref'> {
  size?: number | string;
  className?: string;
}

export function FaPencilAltIcon({ size = '1em', className, ...rest }: FaPencilAltIconProps) {
  const [playing, setPlaying] = useState<string>("rest");
  const hostRef = useRef<SVGSVGElement>(null);
  const { hovered, tapped } = useIconHost(hostRef);
  useEffect(() => {
    setPlaying((now) => (hovered ? (now === "rest" ? "press" : now) : now === "press" ? "rest" : now));
  }, [hovered]);
  useEffect(() => {
    if (!tapped) return;
    setPlaying("bear-down");
    const done = setTimeout(() => setPlaying('rest'), 600);
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
    <motion.g initial="rest" animate={playing} variants={{ rest: { scale: 1 }, press: { scale: [1,0.95,1], transition: { scale: { duration: 0.28, times: [0,0.4,1], ease: ["easeOut", "easeOut"] } } }, "bear-down": { scale: [1,1.04,0.95,0.95,1], transition: { scale: { duration: 0.56, times: [0,0.0923,0.3,0.4703,1], ease: ["easeOut", "easeOut", "easeOut", "linear"] } } } }} style={{ transformBox: 'view-box', originX: '1.25px', originY: '22.45px' }}>
      <path d="M22.394 7.106 L20.413 9.087 C20.211 9.289 19.885 9.289 19.683 9.087 L14.913 4.317 C14.711 4.115 14.711 3.789 14.913 3.587 L16.894 1.606 C17.698 0.802 19.004 0.802 19.812 1.606 L22.394 4.188 C23.202 4.992 23.202 6.298 22.394 7.106 Z" />
      <path d="M13.212 5.288 L1.928 16.572 L1.017 21.793 C0.893 22.497 1.507 23.107 2.212 22.987 L7.432 22.072 L18.716 10.788 C18.918 10.586 18.918 10.26 18.716 10.058 L13.946 5.288 C13.74 5.086 13.414 5.086 13.212 5.288 Z M6.332 15.605 C6.096 15.369 6.096 14.991 6.332 14.754 L12.95 8.137 C13.186 7.901 13.564 7.901 13.8 8.137 S14.037 8.752 13.8 8.988 L7.183 15.605 C6.947 15.841 6.569 15.841 6.332 15.605 Z M4.781 19.219 H6.844 V20.779 L4.072 21.264 L2.736 19.928 L3.221 17.156 H4.781 V19.219 Z" />
    </motion.g>
    </motion.svg>
  );
}


