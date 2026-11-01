'use client';

import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import type { SVGProps } from 'react';
import { useIconHost } from './useIconHost';

export interface FaLayerGroupIconProps extends Omit<SVGProps<SVGSVGElement>, 'ref'> {
  size?: number | string;
  className?: string;
}

export function FaLayerGroupIcon({ size = '1em', className, ...rest }: FaLayerGroupIconProps) {
  const [playing, setPlaying] = useState<string>("rest");
  const hostRef = useRef<SVGSVGElement>(null);
  const { hovered, tapped } = useIconHost(hostRef);
  useEffect(() => {
    setPlaying((now) => (hovered ? (now === "rest" ? "lift" : now) : now === "lift" ? "rest" : now));
  }, [hovered]);
  useEffect(() => {
    if (!tapped) return;
    setPlaying("fan");
    const done = setTimeout(() => setPlaying('rest'), 740);
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
    <motion.path initial="rest" animate={playing} d="M1.533 7.36 L11.542 11.901 C11.835 12.034 12.165 12.034 12.457 11.901 L22.466 7.36 C23.177 7.038 23.177 5.963 22.466 5.64 L12.458 1.099 A1.1 1.1 0 0 0 11.543 1.099 L1.533 5.64 C0.822 5.962 0.822 7.038 1.533 7.36 Z" variants={{ rest: { x: 0, y: 0, scale: 1 }, lift: { x: [0,0,0], y: [0,-0.849,0], scale: [1,0.95,1], transition: { x: { duration: 0.32, times: [0,0.4,1], ease: ["easeOut", "easeInOut"] }, y: { duration: 0.32, times: [0,0.4,1], ease: ["easeOut", "easeInOut"] }, scale: { duration: 0.32, times: [0,0.45,1], ease: ["easeOut", "easeInOut"] } } }, fan: { x: [0,0,0,0,0,0,0], y: [0,0.236,-0.849,-0.849,0.33,-0.094,0], scale: [1,1.03,0.95,0.95,1], transition: { x: { duration: 0.7, times: [0,0.1,0.3,0.46,0.68,0.86,1], ease: ["easeOut", "easeOut", "easeOut", "easeIn", "easeOut", "easeInOut"] }, y: { duration: 0.7, times: [0,0.1,0.3,0.46,0.68,0.86,1], ease: ["easeOut", "easeOut", "easeOut", "easeIn", "easeOut", "easeInOut"] }, scale: { duration: 0.7, times: [0,0.1,0.38,0.66,1], ease: ["easeOut", "easeOut", "easeInOut", "easeInOut"] } } } }} style={{ transformBox: 'view-box', originX: '1.5px', originY: '6.4px' }} />
    <motion.path initial="rest" animate={playing} d="M22.467 11.154 L19.971 10.022 L13.025 13.17 C12.7 13.318 12.355 13.393 12 13.393 S11.3 13.318 10.975 13.17 L4.03 10.022 L1.533 11.154 C0.822 11.476 0.822 12.55 1.533 12.872 L11.542 17.409 C11.835 17.542 12.165 17.542 12.457 17.409 L22.467 12.872 C23.178 12.55 23.178 11.476 22.467 11.154 Z" variants={{ rest: { scale: 1, x: 0, y: 0 }, lift: { scale: [1,0.95,1], transition: { scale: { duration: 0.32, times: [0,0.45,1], ease: ["easeOut", "easeInOut"] } } }, fan: { x: [0,0,0,0,0], y: [0,0,0.849,0,0], scale: [1,1.03,0.95,0.95,1], transition: { x: { duration: 0.7, times: [0,0.68,0.76,0.92,1], ease: [[0,0,1,1], "easeOut", "easeInOut", "easeOut"] }, y: { duration: 0.7, times: [0,0.68,0.76,0.92,1], ease: [[0,0,1,1], "easeOut", "easeInOut", "easeOut"] }, scale: { duration: 0.7, times: [0,0.1,0.38,0.66,1], ease: ["easeOut", "easeOut", "easeInOut", "easeInOut"] } } } }} style={{ transformBox: 'view-box', originX: '1.5px', originY: '11.9px' }} />
    <motion.path initial="rest" animate={playing} d="M22.467 16.645 L19.98 15.518 L13.025 18.67 C12.7 18.818 12.355 18.893 12 18.893 S11.3 18.818 10.975 18.67 L4.02 15.518 L1.533 16.645 C0.822 16.967 0.822 18.041 1.533 18.364 L11.542 22.901 C11.835 23.033 12.165 23.033 12.457 22.901 L22.467 18.364 C23.178 18.041 23.178 16.967 22.467 16.645 Z" variants={{ rest: { scale: 1, x: 0, y: 0 }, lift: { scale: [1,0.95,1], transition: { scale: { duration: 0.32, times: [0,0.45,1], ease: ["easeOut", "easeInOut"] } } }, fan: { x: [0,0,0,0,0], y: [0,0,0.607,0,0], scale: [1,1.03,0.95,0.95,1], transition: { x: { duration: 0.7, times: [0,0.72,0.8,0.96,1], ease: [[0,0,1,1], "easeOut", "easeInOut", "easeOut"] }, y: { duration: 0.7, times: [0,0.72,0.8,0.96,1], ease: [[0,0,1,1], "easeOut", "easeInOut", "easeOut"] }, scale: { duration: 0.7, times: [0,0.1,0.38,0.66,1], ease: ["easeOut", "easeOut", "easeInOut", "easeInOut"] } } } }} style={{ transformBox: 'view-box', originX: '12px', originY: '12px' }} />
    </motion.svg>
  );
}


