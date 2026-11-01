'use client';

import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import type { SVGProps } from 'react';
import { useIconHost } from './useIconHost';

export interface FaToolboxIconProps extends Omit<SVGProps<SVGSVGElement>, 'ref'> {
  size?: number | string;
  className?: string;
}

export function FaToolboxIcon({ size = '1em', className, ...rest }: FaToolboxIconProps) {
  const [playing, setPlaying] = useState<string>("rest");
  const hostRef = useRef<SVGSVGElement>(null);
  const { hovered, tapped } = useIconHost(hostRef);
  useEffect(() => {
    setPlaying((now) => (hovered ? (now === "rest" ? "lift" : now) : now === "lift" ? "rest" : now));
  }, [hovered]);
  useEffect(() => {
    if (!tapped) return;
    setPlaying("open");
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
    <motion.path initial="rest" animate={playing} d="M22.597 10.222 L20.653 8.278 C20.395 8.02 20.045 7.875 19.681 7.875 H17.5 V4.438 C17.5 3.298 16.577 2.375 15.438 2.375 H8.562 C7.423 2.375 6.5 3.298 6.5 4.438 V7.875 H4.319 C3.955 7.875 3.605 8.02 3.347 8.278 L1.403 10.222 C1.145 10.48 1 10.83 1 11.195 V14.75 H6.5 V14.062 C6.5 13.683 6.808 13.375 7.188 13.375 H8.562 C8.942 13.375 9.25 13.683 9.25 14.062 V14.75 H14.75 V14.062 C14.75 13.683 15.058 13.375 15.438 13.375 H16.812 C17.192 13.375 17.5 13.683 17.5 14.062 V14.75 H23 V11.194 C23 10.83 22.855 10.48 22.597 10.222 Z M14.75 7.875 H9.25 V5.125 H14.75 V7.875 Z" variants={{ rest: { x: 0, y: 0, rotate: 0 }, lift: { x: [0,0,0], y: [0,-2.125,0], rotate: [0,-3.09,0], transition: { x: { duration: 0.3, times: [0,0.4,1], ease: ["easeOut", "easeOut"] }, y: { duration: 0.3, times: [0,0.4,1], ease: ["easeOut", "easeOut"] }, rotate: { duration: 0.3, times: [0,0.4,1], ease: ["easeOut", "easeOut"] } } }, open: { x: [0,0,0,0,0,0,0], y: [0,0.28,-2.125,-2.013,-2.013,0,0], rotate: [0,0.89,-3.36,-2.91,-2.91,0,0], transition: { x: { duration: 0.7, times: [0,0.1,0.3,0.4,0.68,0.92,1], ease: ["easeOut", "easeOut", "easeOut", "linear", "linear", "easeOut"] }, y: { duration: 0.7, times: [0,0.1,0.3,0.4,0.68,0.92,1], ease: ["easeOut", "easeOut", "easeOut", "linear", "linear", "easeOut"] }, rotate: { duration: 0.7, times: [0,0.1,0.32,0.44,0.68,0.92,1], ease: ["easeOut", "easeOut", "easeOut", "linear", "linear", "easeOut"] } } } }} style={{ transformBox: 'view-box', transformOrigin: '12px 12px' }} />
    <motion.path initial="rest" animate={playing} d="M17.5 16.812 C17.5 17.192 17.192 17.5 16.812 17.5 H15.438 C15.058 17.5 14.75 17.192 14.75 16.812 V16.125 H9.25 V16.812 C9.25 17.192 8.942 17.5 8.562 17.5 H7.188 C6.808 17.5 6.5 17.192 6.5 16.812 V16.125 H1 V20.25 C1 21.009 1.616 21.625 2.375 21.625 H21.625 C22.384 21.625 23 21.009 23 20.25 V16.125 H17.5 V16.812 Z" variants={{ rest: { x: 0, y: 0 }, lift: { x: 0, y: 0 }, open: { x: [0,0,0,0], y: [0,0,0.391,0], transition: { x: { duration: 0.7, times: [0,0.86,0.94,1], ease: [[0,0,1,1], "easeOut", "easeOut"] }, y: { duration: 0.7, times: [0,0.86,0.94,1], ease: [[0,0,1,1], "easeOut", "easeOut"] } } } }} style={{ transformBox: 'view-box', transformOrigin: '12px 12px' }} />
    </motion.svg>
  );
}


