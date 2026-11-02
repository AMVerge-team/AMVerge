'use client';

import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import type { SVGProps } from 'react';
import { useIconHost } from './useIconHost';

export interface FaSearchPlusIconProps extends Omit<SVGProps<SVGSVGElement>, 'ref'> {
  size?: number | string;
  className?: string;
}

export function FaSearchPlusIcon({ size = '1em', className, ...rest }: FaSearchPlusIconProps) {
  const [playing, setPlaying] = useState<string>("rest");
  const hostRef = useRef<SVGSVGElement>(null);
  const { hovered, tapped } = useIconHost(hostRef);
  useEffect(() => {
    setPlaying((now) => (hovered ? (now === "rest" ? "look" : now) : now === "look" ? "rest" : now));
  }, [hovered]);
  useEffect(() => {
    if (!tapped) return;
    setPlaying("hunt");
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
    <motion.g initial="rest" animate={playing} variants={{ rest: { rotate: 0 }, look: { rotate: [0,-10.64,0], transition: { rotate: { duration: 0.28, times: [0,0.4,1], ease: ["easeOut", "easeInOut"] } } }, hunt: { rotate: [0,6.48,-16.2,11.34,-4.86,0], transition: { rotate: { duration: 0.62, times: [0,0.1,0.34,0.62,0.84,1], ease: ["easeOut", "easeOut", "easeInOut", "easeInOut", "easeInOut"] } } } }} style={{ transformBox: 'view-box', originX: '12px', originY: '12px' }}>
      <motion.path initial="rest" animate={playing} d="M14.062 9.25 V10.625 C14.062 10.909 13.83 11.141 13.547 11.141 H11.141 V13.547 C11.141 13.83 10.909 14.062 10.625 14.062 H9.25 C8.966 14.062 8.734 13.83 8.734 13.547 V11.141 H6.328 C6.045 11.141 5.812 10.909 5.812 10.625 V9.25 C5.812 8.966 6.045 8.734 6.328 8.734 H8.734 V6.328 C8.734 6.045 8.966 5.812 9.25 5.812 H10.625 C10.909 5.812 11.141 6.045 11.141 6.328 V8.734 H13.547 C13.83 8.734 14.062 8.966 14.062 9.25 Z" variants={{ rest: { x: 0, y: 0 }, look: { x: 0, y: 0 }, hunt: { x: [0,0,1.134,-0.81,0.389,0], y: [0,0,0,0,0,0], transition: { x: { duration: 0.62, times: [0,0.1,0.42,0.7,0.9,1], ease: [[0,0,1,1], "easeOut", "easeInOut", "easeInOut", "easeInOut"] }, y: { duration: 0.62, times: [0,0.1,0.42,0.7,0.9,1], ease: [[0,0,1,1], "easeOut", "easeInOut", "easeInOut", "easeInOut"] } } } }} style={{ transformBox: 'view-box', originX: '9.938px', originY: '9.938px' }} />
      <path d="M22.699 21.483 L21.483 22.699 C21.079 23.103 20.426 23.103 20.027 22.699 L15.738 18.415 C15.545 18.222 15.438 17.96 15.438 17.685 V16.984 C13.921 18.17 12.013 18.875 9.938 18.875 C5 18.875 1 14.875 1 9.938 S5 1 9.938 1 S18.875 5 18.875 9.938 C18.875 12.013 18.17 13.921 16.984 15.438 H17.685 C17.96 15.438 18.222 15.545 18.415 15.738 L22.699 20.022 C23.099 20.426 23.099 21.079 22.699 21.483 Z M15.781 9.938 C15.781 6.706 13.169 4.094 9.938 4.094 S4.094 6.706 4.094 9.938 S6.706 15.781 9.938 15.781 S15.781 13.169 15.781 9.938 Z" />
    </motion.g>
    </motion.svg>
  );
}


