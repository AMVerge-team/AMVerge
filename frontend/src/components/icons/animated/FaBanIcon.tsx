'use client';

import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import type { SVGProps } from 'react';
import { useIconHost } from './useIconHost';

export interface FaBanIconProps extends Omit<SVGProps<SVGSVGElement>, 'ref'> {
  size?: number | string;
  className?: string;
}

export function FaBanIcon({ size = '1em', className, ...rest }: FaBanIconProps) {
  const [playing, setPlaying] = useState<string>("rest");
  const hostRef = useRef<SVGSVGElement>(null);
  const { hovered, tapped } = useIconHost(hostRef);
  useEffect(() => {
    setPlaying((now) => (hovered ? (now === "rest" ? "no" : now) : now === "no" ? "rest" : now));
  }, [hovered]);
  useEffect(() => {
    if (!tapped) return;
    setPlaying("refuse");
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
    <motion.path initial="rest" animate={playing} d="M12 1.344 C6.115 1.344 1.344 6.115 1.344 12 S6.115 22.656 12 22.656 S22.656 17.885 22.656 12 S17.885 1.344 12 1.344 Z M17.591 6.409 C20.403 9.222 20.598 13.52 18.479 16.534 L7.466 5.521 C10.482 3.4 14.78 3.599 17.591 6.409 Z M6.409 17.591 C3.597 14.778 3.402 10.48 5.521 7.466 L16.534 18.479 C13.518 20.6 9.22 20.401 6.409 17.591 Z" variants={{ rest: { x: 0, y: 0, scale: 1 }, no: { x: [0,-1.094,1.094,0], y: [0,0,0,0], scale: [1,0.95,1], transition: { x: { duration: 0.26, times: [0,0.25,0.6,1], ease: ["easeOut", "easeOut", "easeInOut"] }, y: { duration: 0.26, times: [0,0.25,0.6,1], ease: ["easeOut", "easeOut", "easeInOut"] }, scale: { duration: 0.26, times: [0,0.45,1], ease: ["easeOut", "easeInOut"] } } }, refuse: { x: [0,-1.094,1.094,-0.656,0.656,0], y: [0,0,0,0,0,0], scale: [1,1.03,0.95,0.95,1], transition: { x: { duration: 0.52, times: [0,0.3,0.4547,0.6093,0.7558,1], ease: ["easeOut", "easeOut", "easeOut", "easeOut", "easeInOut"] }, y: { duration: 0.52, times: [0,0.3,0.4547,0.6093,0.7558,1], ease: ["easeOut", "easeOut", "easeOut", "easeOut", "easeInOut"] }, scale: { duration: 0.52, times: [0,0.1,0.38,0.66,1], ease: ["easeOut", "easeOut", "easeInOut", "easeInOut"] } } } }} style={{ transformBox: 'view-box', originX: '12px', originY: '12px' }} />
    </motion.svg>
  );
}


