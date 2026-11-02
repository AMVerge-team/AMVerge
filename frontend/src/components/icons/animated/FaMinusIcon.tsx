'use client';

import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import type { SVGProps } from 'react';
import { useIconHost } from './useIconHost';

export interface FaMinusIconProps extends Omit<SVGProps<SVGSVGElement>, 'ref'> {
  size?: number | string;
  className?: string;
}

export function FaMinusIcon({ size = '1em', className, ...rest }: FaMinusIconProps) {
  const [playing, setPlaying] = useState<string>("rest");
  const hostRef = useRef<SVGSVGElement>(null);
  const { hovered, tapped } = useIconHost(hostRef);
  useEffect(() => {
    setPlaying((now) => (hovered ? (now === "rest" ? "dip" : now) : now === "dip" ? "rest" : now));
  }, [hovered]);
  useEffect(() => {
    if (!tapped) return;
    setPlaying("less");
    const done = setTimeout(() => setPlaying('rest'), 580);
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
    <motion.g initial="rest" animate={playing} variants={{ rest: { x: 0, y: 0 }, dip: { x: [0,2.125,0], y: [0,0,0], transition: { x: { duration: 0.28, times: [0,0.4,1], ease: ["easeOut", "easeInOut"] }, y: { duration: 0.28, times: [0,0.4,1], ease: ["easeOut", "easeInOut"] } } }, less: { x: [0,2.125,2.125,0], y: [0,0,0,0], transition: { x: { duration: 0.54, times: [0,0.3,0.6,1], ease: ["easeOut", "linear", "easeOut"] }, y: { duration: 0.54, times: [0,0.3,0.6,1], ease: ["easeOut", "linear", "easeOut"] } } } }} style={{ transformBox: 'view-box', originX: '12px', originY: '12px' }}>
      <rect x={2.375} y={9.938} width={12} height={4.125} rx={1.375} />
    </motion.g>
    <motion.g initial="rest" animate={playing} variants={{ rest: { x: 0, y: 0 }, dip: { x: [0,-2.125,0], y: [0,0,0], transition: { x: { duration: 0.28, times: [0,0.4,1], ease: ["easeOut", "easeInOut"] }, y: { duration: 0.28, times: [0,0.4,1], ease: ["easeOut", "easeInOut"] } } }, less: { x: [0,-2.125,-2.125,0], y: [0,0,0,0], transition: { x: { duration: 0.54, times: [0,0.3,0.6,1], ease: ["easeOut", "linear", "easeOut"] }, y: { duration: 0.54, times: [0,0.3,0.6,1], ease: ["easeOut", "linear", "easeOut"] } } } }} style={{ transformBox: 'view-box', originX: '12px', originY: '12px' }}>
      <rect x={9.625} y={9.938} width={12} height={4.125} rx={1.375} />
    </motion.g>
    </motion.svg>
  );
}


