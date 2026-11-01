'use client';

import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import type { SVGProps } from 'react';
import { useIconHost } from './useIconHost';

export interface FaBoltIconProps extends Omit<SVGProps<SVGSVGElement>, 'ref'> {
  size?: number | string;
  className?: string;
}

export function FaBoltIcon({ size = '1em', className, ...rest }: FaBoltIconProps) {
  const [playing, setPlaying] = useState<string>("rest");
  const hostRef = useRef<SVGSVGElement>(null);
  const { hovered, tapped } = useIconHost(hostRef);
  useEffect(() => {
    setPlaying((now) => (hovered ? (now === "rest" ? "flicker" : now) : now === "flicker" ? "rest" : now));
  }, [hovered]);
  useEffect(() => {
    if (!tapped) return;
    setPlaying("throw");
    const done = setTimeout(() => setPlaying('rest'), 560);
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
    <motion.path initial="rest" animate={playing} d="M17.844 7.875 H12.885 L14.716 2.298 C14.887 1.645 14.393 1 13.719 1 H7.531 C7.016 1 6.577 1.382 6.509 1.894 L5.134 12.206 C5.052 12.825 5.533 13.375 6.156 13.375 H11.257 L9.276 21.732 C9.121 22.386 9.62 23 10.277 23 C10.638 23 10.982 22.811 11.171 22.484 L18.733 9.422 C19.133 8.739 18.639 7.875 17.844 7.875 Z" variants={{ rest: { opacity: 1, scale: 1 }, flicker: { opacity: [1,0.35,1,1], scale: [1,0.95,1], transition: { opacity: { duration: 0.24, times: [0,0.3,0.65,1], ease: [(p) => (p < 1 ? 0 : 1), (p) => (p < 1 ? 0 : 1), "easeOut"] }, scale: { duration: 0.24, times: [0,0.45,1], ease: ["easeOut", "easeInOut"] } } }, throw: { opacity: [1,0.22,1,0.45,1,1], scale: [1,1.04,0.95,0.95,1], transition: { opacity: { duration: 0.52, times: [0,0.1,0.2,0.3,0.38,1], ease: [(p) => (p < 1 ? 0 : 1), (p) => (p < 1 ? 0 : 1), (p) => (p < 1 ? 0 : 1), (p) => (p < 1 ? 0 : 1), "easeOut"] }, scale: { duration: 0.52, times: [0,0.1,0.38,0.66,1], ease: ["easeOut", "easeOut", "easeInOut", "easeInOut"] } } } }} style={{ transformBox: 'view-box', originX: '12px', originY: '12px' }} />
    </motion.svg>
  );
}


