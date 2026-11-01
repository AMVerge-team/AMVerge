'use client';

import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import type { SVGProps } from 'react';
import { useIconHost } from './useIconHost';

export interface FaRedoIconProps extends Omit<SVGProps<SVGSVGElement>, 'ref'> {
  size?: number | string;
  className?: string;
}

export function FaRedoIcon({ size = '1em', className, ...rest }: FaRedoIconProps) {
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
    <motion.path initial="rest" animate={playing} d="M22.499 1 H20.461 A0.516 0.516 0 0 0 19.946 1.54 L20.118 5.096 A10.631 10.631 0 0 0 12 1.344 C6.128 1.344 1.339 6.136 1.344 12.008 C1.348 17.89 6.118 22.656 12 22.656 A10.618 10.618 0 0 0 19.141 19.91 A0.516 0.516 0 0 0 19.161 19.161 L17.7 17.7 A0.516 0.516 0 0 0 16.996 17.677 A7.562 7.562 0 1 1 18.278 7.78 L13.915 7.571 A0.516 0.516 0 0 0 13.375 8.087 V10.124 A0.516 0.516 0 0 0 13.891 10.64 H22.499 A0.516 0.516 0 0 0 23.014 10.124 V1.516 A0.516 0.516 0 0 0 22.499 1 Z" variants={{ rest: { rotate: 0, scale: 1 }, step: { rotate: [0,10.11,0], transition: { rotate: { duration: 0.3, times: [0,0.45,1], ease: ["easeOut", "easeInOut"] } } }, turn: { rotate: [0,-5.3999999999999995,360], scale: [1,0.87,0.87,1], transition: { rotate: { duration: 0.95, times: [0,0.2,1], ease: ["easeOut", "easeInOut"] }, scale: { duration: 0.95, times: [0,0.3,0.8886,1], ease: ["easeOut", "linear", "easeOut"] } } } }} style={{ transformBox: 'view-box', transformOrigin: '12px 12px' }} />
    </motion.svg>
  );
}


