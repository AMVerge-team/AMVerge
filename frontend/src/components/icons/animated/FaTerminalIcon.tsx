'use client';

import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import type { SVGProps } from 'react';
import { useIconHost } from './useIconHost';

export interface FaTerminalIconProps extends Omit<SVGProps<SVGSVGElement>, 'ref'> {
  size?: number | string;
  className?: string;
}

export function FaTerminalIcon({ size = '1em', className, ...rest }: FaTerminalIconProps) {
  const [playing, setPlaying] = useState<string>("rest");
  const hostRef = useRef<SVGSVGElement>(null);
  const { hovered, tapped } = useIconHost(hostRef);
  useEffect(() => {
    setPlaying((now) => (hovered ? (now === "rest" ? "prompt" : now) : now === "prompt" ? "rest" : now));
  }, [hovered]);
  useEffect(() => {
    if (!tapped) return;
    setPlaying("run");
    const done = setTimeout(() => setPlaying('rest'), 700);
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
    <motion.path initial="rest" animate={playing} d="M9.868 12.583 L3.188 19.264 C2.865 19.586 2.343 19.586 2.021 19.264 L1.242 18.485 C0.92 18.163 0.919 17.642 1.24 17.319 L6.535 12 L1.24 6.681 C0.919 6.358 0.92 5.837 1.242 5.515 L2.021 4.736 C2.343 4.414 2.865 4.414 3.188 4.736 L9.868 11.417 C10.19 11.739 10.19 12.261 9.868 12.583 Z" variants={{ rest: { x: 0, y: 0, scale: 1 }, prompt: { x: [0,0.669,0], y: [0,0,0], scale: [1,0.95,1], transition: { x: { duration: 0.26, times: [0,0.4,1], ease: ["easeOut", "easeOut"] }, y: { duration: 0.26, times: [0,0.4,1], ease: ["easeOut", "easeOut"] }, scale: { duration: 0.26, times: [0,0.45,1], ease: ["easeOut", "easeInOut"] } } }, run: { x: [0,-0.084,0.418,0.335,0.669,0.585,0.585,0], y: [0,0,0,0,0,0,0,0], scale: [1,1.03,0.95,0.95,1], transition: { x: { duration: 0.66, times: [0,0.08,0.22,0.34,0.5,0.62,0.78,1], ease: ["easeOut", "easeOut", "easeOut", "easeInOut", "easeOut", "easeInOut", "linear"] }, y: { duration: 0.66, times: [0,0.08,0.22,0.34,0.5,0.62,0.78,1], ease: ["easeOut", "easeOut", "easeOut", "easeInOut", "easeOut", "easeInOut", "linear"] }, scale: { duration: 0.66, times: [0,0.1,0.38,0.66,1], ease: ["easeOut", "easeOut", "easeInOut", "easeInOut"] } } } }} style={{ transformBox: 'view-box', transformOrigin: '12px 12px' }} />
    <motion.path initial="rest" animate={playing} d="M23 18.875 V17.775 C23 17.319 22.631 16.95 22.175 16.95 H11.725 C11.269 16.95 10.9 17.319 10.9 17.775 V18.875 C10.9 19.331 11.269 19.7 11.725 19.7 H22.175 C22.631 19.7 23 19.331 23 18.875 Z" variants={{ rest: { scale: 1 }, prompt: { scale: [1,0.95,1], transition: { scale: { duration: 0.26, times: [0,0.45,1], ease: ["easeOut", "easeInOut"] } } }, run: { scale: [1,1.03,0.95,0.95,1], transition: { scale: { duration: 0.66, times: [0,0.1,0.38,0.66,1], ease: ["easeOut", "easeOut", "easeInOut", "easeInOut"] } } } }} style={{ transformBox: 'view-box', transformOrigin: '12px 12px' }} />
    </motion.svg>
  );
}


