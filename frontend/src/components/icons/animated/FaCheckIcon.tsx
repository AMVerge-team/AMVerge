'use client';

import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import type { SVGProps } from 'react';
import { useIconHost } from './useIconHost';

export interface FaCheckIconProps extends Omit<SVGProps<SVGSVGElement>, 'ref'> {
  size?: number | string;
  className?: string;
}

export function FaCheckIcon({ size = '1em', className, ...rest }: FaCheckIconProps) {
  const [playing, setPlaying] = useState<string>("rest");
  const hostRef = useRef<SVGSVGElement>(null);
  const { hovered, tapped } = useIconHost(hostRef);
  useEffect(() => {
    setPlaying((now) => (hovered ? (now === "rest" ? "trace" : now) : now === "trace" ? "rest" : now));
  }, [hovered]);
  useEffect(() => {
    if (!tapped) return;
    setPlaying("strike");
    const done = setTimeout(() => setPlaying('rest'), 640);
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
    <motion.g initial="rest" animate={playing} variants={{ rest: { scale: 1 }, trace: { scale: [1,0.95,1], transition: { scale: { duration: 0.32, times: [0,0.45,1], ease: ["easeOut", "easeInOut"] } } }, strike: { scale: [1,1.04,0.95,0.95,1], transition: { scale: { duration: 0.6, times: [0,0.1,0.38,0.66,1], ease: ["easeOut", "easeOut", "easeInOut", "easeInOut"] } } } }} style={{ transformBox: 'view-box', originX: '12px', originY: '11.8px' }}>
      <motion.path initial="rest" animate={playing} d="M8.472 19.881 L1.322 12.731 C0.893 12.301 0.893 11.605 1.322 11.175 L2.878 9.619 C3.307 9.19 4.004 9.19 4.433 9.619 L9.25 14.436 L19.567 4.119 C19.996 3.69 20.693 3.69 21.122 4.119 L22.678 5.675 C23.107 6.105 23.107 6.801 22.678 7.231 L10.028 19.881 C9.598 20.31 8.902 20.31 8.472 19.881 Z" variants={{ rest: { opacity: 1 }, trace: { opacity: [0,1], transition: { opacity: { duration: 0.32, times: [0,1], ease: [(p) => (p < 1 ? 0 : 1)] } } }, strike: { opacity: [0,1], transition: { opacity: { duration: 0.6, times: [0,1], ease: [(p) => (p < 1 ? 0 : 1)] } } } }} style={{ transformBox: 'view-box', originX: '1.1px', originY: '11.95px' }} />
      <motion.path initial="rest" animate={playing} d="M2.1 11.175 L9.25 17.5475 L21.9 5.675" fill="none" stroke="currentColor" strokeWidth={4.4} strokeLinecap="butt" strokeLinejoin="miter" variants={{ rest: { opacity: 0, pathLength: 1 }, trace: { opacity: [1,0], pathLength: [1,0.65,1], transition: { opacity: { duration: 0.32, times: [0,1], ease: [(p) => (p < 1 ? 0 : 1)] }, pathLength: { duration: 0.32, times: [0,0.32,1], ease: ["easeInOut", "easeOut"] } } }, strike: { opacity: [1,0], pathLength: [1,0,1], transition: { opacity: { duration: 0.6, times: [0,1], ease: [(p) => (p < 1 ? 0 : 1)] }, pathLength: { duration: 0.6, times: [0,0.2,1], ease: ["easeIn", "easeOut"] } } } }} style={{ transformBox: 'view-box', originX: '12px', originY: '12px' }} />
    </motion.g>
    </motion.svg>
  );
}


