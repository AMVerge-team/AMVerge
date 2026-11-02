'use client';

import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import type { SVGProps } from 'react';
import { useIconHost } from './useIconHost';

export interface FaSyncAltIconProps extends Omit<SVGProps<SVGSVGElement>, 'ref'> {
  size?: number | string;
  className?: string;
}

export function FaSyncAltIcon({ size = '1em', className, ...rest }: FaSyncAltIconProps) {
  const [playing, setPlaying] = useState<string>("rest");
  const hostRef = useRef<SVGSVGElement>(null);
  const { hovered, tapped } = useIconHost(hostRef);
  useEffect(() => {
    setPlaying((now) => (hovered ? (now === "rest" ? "step" : now) : now === "step" ? "rest" : now));
  }, [hovered]);
  useEffect(() => {
    if (!tapped) return;
    setPlaying("turn");
    const done = setTimeout(() => setPlaying('rest'), 990);
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
    <motion.g initial="rest" animate={playing} variants={{ rest: { rotate: 0 }, turn: { rotate: [0,-4.39,8.78,8.78,0], transition: { rotate: { duration: 0.95, times: [0,0.3,0.4432,0.7295,1], ease: ["easeOut", "easeOut", "easeOut", "easeInOut"] } } }, step: { rotate: 0 } }} style={{ transformBox: 'view-box', originX: '12px', originY: '12px' }}>
      <motion.path initial="rest" animate={playing} d="M16.929 6.727 C15.586 5.469 13.843 4.78 11.993 4.781 C8.665 4.784 5.792 7.066 4.999 10.232 C4.941 10.462 4.735 10.625 4.498 10.625 H2.036 C1.713 10.625 1.469 10.333 1.528 10.016 C2.458 5.079 6.793 1.344 12 1.344 C14.855 1.344 17.448 2.467 19.361 4.295 L20.896 2.76 C21.545 2.111 22.656 2.571 22.656 3.49 V9.25 C22.656 9.82 22.195 10.281 21.625 10.281 H15.865 C14.946 10.281 14.486 9.17 15.135 8.521 L16.929 6.727 Z" variants={{ rest: { rotate: 0, scale: 1 }, turn: { rotate: [0,-7.2,360], scale: [1,0.87,0.87,1], transition: { rotate: { duration: 0.95, times: [0,0.2,1], ease: ["easeOut", "easeInOut"] }, scale: { duration: 0.95, times: [0,0.3,0.8886,1], ease: ["easeOut", "linear", "easeOut"] } } }, step: { rotate: [0,11.08,0], transition: { rotate: { duration: 0.3, times: [0,0.45,1], ease: ["easeOut", "easeInOut"] } } } }} style={{ transformBox: 'view-box', originX: '12px', originY: '12px' }} />
      <motion.path initial="rest" animate={playing} d="M2.375 13.719 H8.135 C9.054 13.719 9.514 14.83 8.865 15.479 L7.071 17.273 C8.414 18.531 10.157 19.22 12.007 19.219 C15.333 19.216 18.208 16.935 19.001 13.768 C19.059 13.538 19.265 13.375 19.502 13.375 H21.964 C22.287 13.375 22.531 13.668 22.472 13.984 C21.542 18.921 17.207 22.656 12 22.656 C9.145 22.656 6.552 21.533 4.639 19.705 L3.104 21.24 C2.455 21.889 1.344 21.429 1.344 20.51 V14.75 C1.344 14.18 1.805 13.719 2.375 13.719 Z" variants={{ rest: { rotate: 0, scale: 1 }, turn: { rotate: [0,-7.2,360], scale: [1,0.87,0.87,1], transition: { rotate: { duration: 0.95, times: [0,0.2,1], ease: ["easeOut", "easeInOut"] }, scale: { duration: 0.95, times: [0,0.3,0.8886,1], ease: ["easeOut", "linear", "easeOut"] } } }, step: { rotate: [0,11.08,0], transition: { rotate: { duration: 0.3, times: [0,0.45,1], ease: ["easeOut", "easeInOut"] } } } }} style={{ transformBox: 'view-box', originX: '12px', originY: '12px' }} />
    </motion.g>
    </motion.svg>
  );
}


