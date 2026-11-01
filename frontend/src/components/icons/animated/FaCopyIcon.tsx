'use client';

import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import type { SVGProps } from 'react';
import { useIconHost } from './useIconHost';

export interface FaCopyIconProps extends Omit<SVGProps<SVGSVGElement>, 'ref'> {
  size?: number | string;
  className?: string;
}

export function FaCopyIcon({ size = '1em', className, ...rest }: FaCopyIconProps) {
  const [playing, setPlaying] = useState<string>("rest");
  const hostRef = useRef<SVGSVGElement>(null);
  const { hovered, tapped } = useIconHost(hostRef);
  useEffect(() => {
    setPlaying((now) => (hovered ? (now === "rest" ? "peel" : now) : now === "peel" ? "rest" : now));
  }, [hovered]);
  useEffect(() => {
    if (!tapped) return;
    setPlaying("duplicate");
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
    <motion.path initial="rest" animate={playing} d="M16.125 20.25 V21.969 C16.125 22.538 15.663 23 15.094 23 H3.406 C2.837 23 2.375 22.538 2.375 21.969 V6.156 C2.375 5.587 2.837 5.125 3.406 5.125 H6.5 V17.844 C6.5 19.171 7.579 20.25 8.906 20.25 H16.125 Z" variants={{ rest: { scale: 1, x: 0, y: 0 }, peel: { scale: [1,0.95,1], transition: { scale: { duration: 0.32, times: [0,0.45,1], ease: ["easeOut", "easeInOut"] } } }, duplicate: { x: [0,0,-0.423,0], y: [0,0,0.204,0], scale: [1,1.03,0.95,0.95,1], transition: { x: { duration: 0.7, times: [0,0.9,0.96,1], ease: [[0,0,1,1], "easeOut", "easeInOut"] }, y: { duration: 0.7, times: [0,0.9,0.96,1], ease: [[0,0,1,1], "easeOut", "easeInOut"] }, scale: { duration: 0.7, times: [0,0.1,0.38,0.66,1], ease: ["easeOut", "easeOut", "easeInOut", "easeInOut"] } } } }} style={{ transformBox: 'view-box', originX: '12px', originY: '12px' }} />
    <motion.path initial="rest" animate={playing} d="M16.125 5.469 V1 H8.906 C8.337 1 7.875 1.462 7.875 2.031 V17.844 C7.875 18.413 8.337 18.875 8.906 18.875 H20.594 C21.163 18.875 21.625 18.413 21.625 17.844 V6.5 H17.156 C16.589 6.5 16.125 6.036 16.125 5.469 Z M21.323 4.135 L18.49 1.302 A1.031 1.031 0 0 0 17.76 1 H17.5 V5.125 H21.625 V4.865 A1.031 1.031 0 0 0 21.323 4.135 Z" variants={{ rest: { x: 0, y: 0, scale: 1 }, peel: { x: [0,1.501,0], y: [0,-0.75,0], scale: [1,0.95,1], transition: { x: { duration: 0.32, times: [0,0.4,1], ease: ["easeOut", "easeInOut"] }, y: { duration: 0.32, times: [0,0.4,1], ease: ["easeOut", "easeInOut"] }, scale: { duration: 0.32, times: [0,0.45,1], ease: ["easeOut", "easeInOut"] } } }, duplicate: { x: [0,-0.237,1.5,1.421,1.421,0], y: [0,0.118,-0.75,-0.711,-0.711,0], scale: [1,1.03,0.95,0.95,1], transition: { x: { duration: 0.7, times: [0,0.1,0.3,0.4,0.72,1], ease: ["easeOut", "easeOut", "easeOut", "linear", "easeInOut"] }, y: { duration: 0.7, times: [0,0.1,0.3,0.4,0.72,1], ease: ["easeOut", "easeOut", "easeOut", "linear", "easeInOut"] }, scale: { duration: 0.7, times: [0,0.1,0.38,0.66,1], ease: ["easeOut", "easeOut", "easeInOut", "easeInOut"] } } } }} style={{ transformBox: 'view-box', originX: '12px', originY: '12px' }} />
    </motion.svg>
  );
}


