'use client';

import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import type { SVGProps } from 'react';
import { useIconHost } from './useIconHost';

export interface FaExternalLinkAltIconProps extends Omit<SVGProps<SVGSVGElement>, 'ref'> {
  size?: number | string;
  className?: string;
}

export function FaExternalLinkAltIcon({ size = '1em', className, ...rest }: FaExternalLinkAltIconProps) {
  const [playing, setPlaying] = useState<string>("rest");
  const hostRef = useRef<SVGSVGElement>(null);
  const { hovered, tapped } = useIconHost(hostRef);
  useEffect(() => {
    setPlaying((now) => (hovered ? (now === "rest" ? "out" : now) : now === "out" ? "rest" : now));
  }, [hovered]);
  useEffect(() => {
    if (!tapped) return;
    setPlaying("open");
    const done = setTimeout(() => setPlaying('rest'), 620);
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
    <path d="M19.562 14.75 H18.188 A0.688 0.688 0 0 0 17.5 15.438 V20.25 H3.75 V6.5 H9.938 A0.688 0.688 0 0 0 10.625 5.812 V4.438 A0.688 0.688 0 0 0 9.938 3.75 H3.062 A2.062 2.062 0 0 0 1 5.812 V20.938 A2.062 2.062 0 0 0 3.062 23 H18.188 A2.062 2.062 0 0 0 20.25 20.938 V15.438 A0.688 0.688 0 0 0 19.562 14.75 Z" />
    <motion.path initial="rest" animate={playing} d="M21.969 1 H16.469 C15.551 1 15.092 2.113 15.738 2.762 L17.274 4.297 L6.801 14.766 A1.031 1.031 0 0 0 6.801 16.227 L7.775 17.199 A1.031 1.031 0 0 0 9.236 17.199 L19.703 6.729 L21.238 8.262 C21.883 8.906 23 8.455 23 7.531 V2.031 A1.031 1.031 0 0 0 21.969 1 Z" variants={{ rest: { x: 0, y: 0, scale: 1 }, out: { x: [0,0.36,0], y: [0,-0.36,0], scale: [1,0.874,1], transition: { x: { duration: 0.32, times: [0,0.45,1], ease: ["easeOut", "easeInOut"] }, y: { duration: 0.32, times: [0,0.45,1], ease: ["easeOut", "easeInOut"] }, scale: { duration: 0.32, times: [0,0.45,1], ease: ["easeOut", "easeInOut"] } } }, open: { x: [0,-0.21,0.6,0.6,0], y: [0,0.21,-0.6,-0.6,0], scale: [1,1.04,0.82,0.82,1], transition: { x: { duration: 0.58, times: [0,0.1,0.42,0.68,1], ease: ["easeOut", "easeOut", "easeInOut", "easeInOut"] }, y: { duration: 0.58, times: [0,0.1,0.42,0.68,1], ease: ["easeOut", "easeOut", "easeInOut", "easeInOut"] }, scale: { duration: 0.58, times: [0,0.1,0.42,0.68,1], ease: ["easeOut", "easeOut", "easeInOut", "easeInOut"] } } } }} style={{ transformBox: 'view-box', originX: '23px', originY: '1px' }} />
    </motion.svg>
  );
}


