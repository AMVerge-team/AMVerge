'use client';

import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import type { SVGProps } from 'react';
import { useIconHost } from './useIconHost';

export interface FaBarsIconProps extends Omit<SVGProps<SVGSVGElement>, 'ref'> {
  size?: number | string;
  className?: string;
}

export function FaBarsIcon({ size = '1em', className, ...rest }: FaBarsIconProps) {
  const [playing, setPlaying] = useState<string>("rest");
  const hostRef = useRef<SVGSVGElement>(null);
  const { hovered, tapped } = useIconHost(hostRef);
  useEffect(() => {
    setPlaying((now) => (hovered ? (now === "rest" ? "part" : now) : now === "part" ? "rest" : now));
  }, [hovered]);
  useEffect(() => {
    if (!tapped) return;
    setPlaying("open");
    const done = setTimeout(() => setPlaying('rest'), 680);
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
    <motion.path initial="rest" animate={playing} d="M3.062 6.672 H20.938 C21.317 6.672 21.625 6.364 21.625 5.984 V4.266 C21.625 3.886 21.317 3.578 20.938 3.578 H3.062 C2.683 3.578 2.375 3.886 2.375 4.266 V5.984 C2.375 6.364 2.683 6.672 3.062 6.672 Z" variants={{ rest: { x: 0, y: 0 }, part: { x: [0,0,0], y: [0,-2.914,0], transition: { x: { duration: 0.3, times: [0,0.4,1], ease: ["easeOut", "easeInOut"] }, y: { duration: 0.3, times: [0,0.4,1], ease: ["easeOut", "easeInOut"] } } }, open: { x: [0,0,0,0,0,0], y: [0,0.481,-3.328,-3.025,-3.025,0], transition: { x: { duration: 0.64, times: [0,0.1,0.3,0.4,0.72,1], ease: ["easeOut", "easeOut", "easeInOut", "linear", "easeInOut"] }, y: { duration: 0.64, times: [0,0.1,0.3,0.4,0.72,1], ease: ["easeOut", "easeOut", "easeInOut", "linear", "easeInOut"] } } } }} style={{ transformBox: 'view-box', originX: '12px', originY: '12px' }} />
    <path d="M3.062 13.547 H20.938 C21.317 13.547 21.625 13.239 21.625 12.859 V11.141 C21.625 10.761 21.317 10.453 20.938 10.453 H3.062 C2.683 10.453 2.375 10.761 2.375 11.141 V12.859 C2.375 13.239 2.683 13.547 3.062 13.547 Z" />
    <motion.path initial="rest" animate={playing} d="M3.062 20.422 H20.938 C21.317 20.422 21.625 20.114 21.625 19.734 V18.016 C21.625 17.636 21.317 17.328 20.938 17.328 H3.062 C2.683 17.328 2.375 17.636 2.375 18.016 V19.734 C2.375 20.114 2.683 20.422 3.062 20.422 Z" variants={{ rest: { x: 0, y: 0 }, part: { x: [0,0,0], y: [0,2.914,0], transition: { x: { duration: 0.3, times: [0,0.4,1], ease: ["easeOut", "easeInOut"] }, y: { duration: 0.3, times: [0,0.4,1], ease: ["easeOut", "easeInOut"] } } }, open: { x: [0,0,0,0,0,0], y: [0,-0.481,3.328,3.025,3.025,0], transition: { x: { duration: 0.64, times: [0,0.1,0.3,0.4,0.72,1], ease: ["easeOut", "easeOut", "easeInOut", "linear", "easeInOut"] }, y: { duration: 0.64, times: [0,0.1,0.3,0.4,0.72,1], ease: ["easeOut", "easeOut", "easeInOut", "linear", "easeInOut"] } } } }} style={{ transformBox: 'view-box', originX: '12px', originY: '12px' }} />
    </motion.svg>
  );
}


