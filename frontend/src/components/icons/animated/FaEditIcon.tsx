'use client';

import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import type { SVGProps } from 'react';
import { useIconHost } from './useIconHost';

export interface FaEditIconProps extends Omit<SVGProps<SVGSVGElement>, 'ref'> {
  size?: number | string;
  className?: string;
}

export function FaEditIcon({ size = '1em', className, ...rest }: FaEditIconProps) {
  const [playing, setPlaying] = useState<string>("rest");
  const hostRef = useRef<SVGSVGElement>(null);
  const { hovered, tapped } = useIconHost(hostRef);
  useEffect(() => {
    setPlaying((now) => (hovered ? (now === "rest" ? "trace" : now) : now === "trace" ? "rest" : now));
  }, [hovered]);
  useEffect(() => {
    if (!tapped) return;
    setPlaying("write");
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
    <motion.path initial="rest" animate={playing} d="M15.667 15.445 V19.333 H3.444 V7.111 H12.222 C12.344 7.111 12.458 7.061 12.546 6.977 L14.074 5.45 C14.364 5.159 14.158 4.667 13.749 4.667 H2.833 C1.821 4.667 1 5.488 1 6.5 V19.944 C1 20.957 1.821 21.778 2.833 21.778 H16.278 C17.29 21.778 18.111 20.957 18.111 19.944 V13.917 C18.111 13.509 17.618 13.306 17.328 13.593 L15.8 15.12 C15.716 15.208 15.667 15.323 15.667 15.445 Z" variants={{ rest: { scale: 1, x: 0, y: 0 }, trace: { scale: [1,0.95,1], transition: { scale: { duration: 0.32, times: [0,0.45,1], ease: ["easeOut", "easeInOut"] } } }, write: { x: [0,0,0,0,0], y: [0,0,0.304,0,0], scale: [1,1.03,0.95,0.95,1], transition: { x: { duration: 0.7, times: [0,0.17,0.26,0.44,1], ease: [[0,0,1,1], "easeOut", "easeOut", "easeOut"] }, y: { duration: 0.7, times: [0,0.17,0.26,0.44,1], ease: [[0,0,1,1], "easeOut", "easeOut", "easeOut"] }, scale: { duration: 0.7, times: [0,0.1,0.38,0.66,1], ease: ["easeOut", "easeOut", "easeInOut", "easeInOut"] } } } }} style={{ transformBox: 'view-box', originX: '12px', originY: '12px' }} />
    <motion.path initial="rest" animate={playing} d="M7.2 18.65 H4.4" fill="none" stroke="#22c55e" strokeWidth={1.1} strokeLinecap="round" variants={{ rest: { pathLength: 0, pathOffset: 0, scale: 1 }, trace: { pathLength: [0,0,0.464,0.464,0,0], pathOffset: [0,0,0,0,0.464,0.464], scale: [1,0.95,1], transition: { pathLength: { duration: 0.32, times: [0,0.1,0.5,0.78,0.95,1], ease: [[0,0,1,1], "easeOut", "linear", "easeOut", "easeIn"] }, pathOffset: { duration: 0.32, times: [0,0.1,0.5,0.78,0.95,1], ease: [[0,0,1,1], "easeOut", "linear", "easeOut", "easeIn"] }, scale: { duration: 0.32, times: [0,0.45,1], ease: ["easeOut", "easeInOut"] } } }, write: { pathLength: [0,0,1,1,0,0], pathOffset: [0,0,0,0,1,1], scale: [1,1.03,0.95,0.95,1], transition: { pathLength: { duration: 0.7, times: [0,0.17,0.55,0.82,0.96,1], ease: [[0,0,1,1], "easeOut", "linear", "easeOut", "easeIn"] }, pathOffset: { duration: 0.7, times: [0,0.17,0.55,0.82,0.96,1], ease: [[0,0,1,1], "easeOut", "linear", "easeOut", "easeIn"] }, scale: { duration: 0.7, times: [0,0.1,0.38,0.66,1], ease: ["easeOut", "easeOut", "easeInOut", "easeInOut"] } } } }} style={{ transformBox: 'view-box', originX: '12px', originY: '12px' }} />
    <motion.g initial="rest" animate={playing} variants={{ rest: { x: 0, y: 0, scale: 1 }, trace: { x: [0,-0.043,-0.605,-0.54,0], y: [0,0.182,0.182,0.022,0], scale: [1,0.95,1], transition: { x: { duration: 0.32, times: [0,0.1,0.5,0.6,1], ease: ["easeOut", "easeOut", "linear", "easeOut"] }, y: { duration: 0.32, times: [0,0.1,0.5,0.6,1], ease: ["easeOut", "easeOut", "linear", "easeOut"] }, scale: { duration: 0.32, times: [0,0.45,1], ease: ["easeOut", "easeInOut"] } } }, write: { x: [0,0.073,-0.021,-0.605,-0.563,0], y: [0,-0.073,0.094,0.094,0.01,0], scale: [1,1.03,0.95,0.95,1], transition: { x: { duration: 0.7, times: [0,0.07,0.17,0.55,0.64,1], ease: ["easeOut", "easeOut", "easeOut", "linear", "easeOut"] }, y: { duration: 0.7, times: [0,0.07,0.17,0.55,0.64,1], ease: ["easeOut", "easeOut", "easeOut", "linear", "easeOut"] }, scale: { duration: 0.7, times: [0,0.1,0.38,0.66,1], ease: ["easeOut", "easeOut", "easeInOut", "easeInOut"] } } } }} style={{ transformBox: 'view-box', originX: '12px', originY: '12px' }}>
      <path d="M16.377 5.4 L19.822 8.845 C19.967 8.99 19.967 9.227 19.822 9.372 L11.481 17.714 L7.936 18.107 C7.463 18.161 7.061 17.76 7.115 17.286 L7.508 13.742 L15.85 5.4 C15.995 5.255 16.232 5.255 16.377 5.4 Z" />
      <path d="M22.565 4.525 L20.701 2.661 C20.12 2.081 19.177 2.081 18.592 2.661 L17.24 4.014 C17.095 4.159 17.095 4.395 17.24 4.541 L20.685 7.986 C20.831 8.131 21.067 8.131 21.213 7.986 L22.565 6.634 C23.145 6.049 23.145 5.106 22.565 4.525 Z" />
    </motion.g>
    </motion.svg>
  );
}


