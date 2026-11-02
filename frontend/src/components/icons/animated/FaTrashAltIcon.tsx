'use client';

import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import type { SVGProps } from 'react';
import { useIconHost } from './useIconHost';

export interface FaTrashAltIconProps extends Omit<SVGProps<SVGSVGElement>, 'ref'> {
  size?: number | string;
  className?: string;
}

export function FaTrashAltIcon({ size = '1em', className, ...rest }: FaTrashAltIconProps) {
  const [playing, setPlaying] = useState<string>("rest");
  const hostRef = useRef<SVGSVGElement>(null);
  const { hovered, tapped } = useIconHost(hostRef);
  useEffect(() => {
    setPlaying((now) => (hovered ? (now === "rest" ? "peek" : now) : now === "peek" ? "rest" : now));
  }, [hovered]);
  useEffect(() => {
    if (!tapped) return;
    setPlaying("empty");
    const done = setTimeout(() => setPlaying('rest'), 760);
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
    <motion.path initial="rest" animate={playing} d="M3.75 20.938 A2.062 2.062 0 0 0 5.812 23 H18.188 A2.062 2.062 0 0 0 20.25 20.938 V6.5 H3.75 Z M15.438 9.938 A0.688 0.688 0 0 1 16.812 9.938 V19.562 A0.688 0.688 0 0 1 15.438 19.562 Z M11.312 9.938 A0.688 0.688 0 0 1 12.688 9.938 V19.562 A0.688 0.688 0 0 1 11.312 19.562 Z M7.188 9.938 A0.688 0.688 0 0 1 8.562 9.938 V19.562 A0.688 0.688 0 0 1 7.188 19.562 Z" variants={{ rest: { scale: 1, x: 0, y: 0 }, peek: { scale: [1,0.95,1], transition: { scale: { duration: 0.3, times: [0,0.45,1], ease: ["easeOut", "easeInOut"] } } }, empty: { x: [0,0,0,0,0,0,0], y: [0,0,0.75,0,0,0.41,0], scale: [1,1.03,0.95,0.95,1], transition: { x: { duration: 0.72, times: [0,0.2786,0.3778,0.5722,0.9028,0.9611,1], ease: [[0,0,1,1], "easeOut", "easeInOut", "easeOut", "easeOut", "easeInOut"] }, y: { duration: 0.72, times: [0,0.2786,0.3778,0.5722,0.9028,0.9611,1], ease: [[0,0,1,1], "easeOut", "easeInOut", "easeOut", "easeOut", "easeInOut"] }, scale: { duration: 0.72, times: [0,0.1,0.38,0.66,1], ease: ["easeOut", "easeOut", "easeInOut", "easeInOut"] } } } }} style={{ transformBox: 'view-box', originX: '12px', originY: '12px' }} />
    <motion.path initial="rest" animate={playing} d="M20.938 2.375 H15.781 L15.377 1.571 A1.031 1.031 0 0 0 14.454 1 H9.542 A1.019 1.019 0 0 0 8.623 1.571 L8.219 2.375 H3.062 A0.688 0.688 0 0 0 2.375 3.062 V4.438 A0.688 0.688 0 0 0 3.062 5.125 H20.938 A0.688 0.688 0 0 0 21.625 4.438 V3.062 A0.688 0.688 0 0 0 20.938 2.375 Z" variants={{ rest: { x: 0, y: 0, scale: 1 }, peek: { x: [0,1.501,0], y: [0,-0.75,0], scale: [1,0.95,1], transition: { x: { duration: 0.3, times: [0,0.4,1], ease: ["easeOut", "easeInOut"] }, y: { duration: 0.3, times: [0,0.4,1], ease: ["easeOut", "easeInOut"] }, scale: { duration: 0.3, times: [0,0.45,1], ease: ["easeOut", "easeInOut"] } } }, empty: { x: [0,-0.25,1.5,1.5,0], y: [0,0.167,-0.75,-0.75,0], scale: [1,1.03,0.95,0.95,1], transition: { x: { duration: 0.72, times: [0,0.0857,0.3,0.6889,1], ease: ["easeOut", "easeOut", "easeOut", "easeIn"] }, y: { duration: 0.72, times: [0,0.0857,0.3,0.6889,1], ease: ["easeOut", "easeOut", "easeOut", "easeIn"] }, scale: { duration: 0.72, times: [0,0.1,0.38,0.66,1], ease: ["easeOut", "easeOut", "easeInOut", "easeInOut"] } } } }} style={{ transformBox: 'view-box', originX: '12px', originY: '12px' }} />
    </motion.svg>
  );
}


