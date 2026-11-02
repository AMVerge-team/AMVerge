'use client';

import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import type { SVGProps } from 'react';
import { useIconHost } from './useIconHost';

export interface FaUndoIconProps extends Omit<SVGProps<SVGSVGElement>, 'ref'> {
  size?: number | string;
  className?: string;
}

export function FaUndoIcon({ size = '1em', className, ...rest }: FaUndoIconProps) {
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
    <motion.path initial="rest" animate={playing} d="M10.124 10.639 H1.516 C1.231 10.639 1 10.408 1 10.124 V1.516 C1 1.231 1.231 1 1.516 1 H3.578 C3.863 1 4.094 1.231 4.094 1.516 V4.872 C6.061 2.688 8.917 1.321 12.093 1.344 C17.976 1.387 22.683 6.14 22.671 12.023 C22.658 17.898 17.892 22.656 12.014 22.656 C9.26 22.656 6.751 21.612 4.86 19.897 C4.64 19.698 4.63 19.358 4.84 19.148 L6.299 17.689 C6.491 17.497 6.8 17.486 7.004 17.666 C8.337 18.846 10.091 19.562 12.014 19.562 C16.194 19.562 19.577 16.18 19.577 12 C19.577 7.821 16.194 4.438 12.014 4.438 C9.501 4.438 7.276 5.661 5.901 7.546 H10.124 C10.408 7.546 10.639 7.776 10.639 8.061 V10.124 C10.639 10.408 10.408 10.639 10.124 10.639 Z" variants={{ rest: { rotate: 0, scale: 1 }, step: { rotate: [0,-10.11,0], transition: { rotate: { duration: 0.3, times: [0,0.45,1], ease: ["easeOut", "easeInOut"] } } }, turn: { rotate: [0,5.3999999999999995,-360], scale: [1,0.87,0.87,1], transition: { rotate: { duration: 0.95, times: [0,0.2,1], ease: ["easeOut", "easeInOut"] }, scale: { duration: 0.95, times: [0,0.3,0.8886,1], ease: ["easeOut", "linear", "easeOut"] } } } }} style={{ transformBox: 'view-box', originX: '12px', originY: '12px' }} />
    </motion.svg>
  );
}


