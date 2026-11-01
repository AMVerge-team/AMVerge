'use client';

import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import type { SVGProps } from 'react';
import { useIconHost } from './useIconHost';

export interface FaVolumeDownIconProps extends Omit<SVGProps<SVGSVGElement>, 'ref'> {
  size?: number | string;
  className?: string;
}

export function FaVolumeDownIcon({ size = '1em', className, ...rest }: FaVolumeDownIconProps) {
  const [playing, setPlaying] = useState<string>("rest");
  const hostRef = useRef<SVGSVGElement>(null);
  const { hovered, tapped } = useIconHost(hostRef);
  useEffect(() => {
    setPlaying((now) => (hovered ? (now === "rest" ? "quieten" : now) : now === "quieten" ? "rest" : now));
  }, [hovered]);
  useEffect(() => {
    if (!tapped) return;
    setPlaying("mute");
    const done = setTimeout(() => setPlaying('rest'), 600);
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
    <motion.path initial="rest" animate={playing} d="M12.99 4.095 L9.167 7.918 H4.781 C4.211 7.918 3.75 8.379 3.75 8.949 V15.137 C3.75 15.706 4.211 16.168 4.781 16.168 H9.167 L12.99 19.99 C13.635 20.636 14.75 20.182 14.75 19.261 V4.825 C14.75 3.903 13.635 3.451 12.99 4.095 Z" variants={{ rest: { x: 0, y: 0 }, quieten: { x: 0, y: 0 }, mute: { x: [0,0,-1.75,0,0], y: [0,0,0,0,0], transition: { x: { duration: 0.56, times: [0,0.3378,0.4514,0.6784,1], ease: [[0,0,1,1], "easeOut", "easeOut", "easeOut"] }, y: { duration: 0.56, times: [0,0.3378,0.4514,0.6784,1], ease: [[0,0,1,1], "easeOut", "easeOut", "easeOut"] } } } }} style={{ transformBox: 'view-box', transformOrigin: '12px 12px' }} />
    <motion.path initial="rest" animate={playing} d="M18.283 8.74 C17.786 8.468 17.158 8.647 16.882 9.146 C16.608 9.644 16.789 10.271 17.288 10.547 C17.843 10.852 18.188 11.425 18.188 12.043 C18.188 12.661 17.843 13.234 17.289 13.539 C16.79 13.814 16.608 14.441 16.883 14.94 C17.159 15.441 17.787 15.619 18.284 15.346 C19.497 14.678 20.25 13.412 20.25 12.043 S19.497 9.408 18.283 8.74 Z" variants={{ rest: { opacity: 1, x: 0, y: 0 }, quieten: { opacity: [1,0.3,1], x: [0,-2.914,0], y: [0,0,0], transition: { opacity: { duration: 0.3, times: [0,0.45,1], ease: ["easeOut", "easeInOut"] }, x: { duration: 0.3, times: [0,0.45,1], ease: ["easeOut", "easeInOut"] }, y: { duration: 0.3, times: [0,0.45,1], ease: ["easeOut", "easeInOut"] } } }, mute: { opacity: [1,0.15,0.15,1,1], x: [0,-3.5,-3.5,0,0], y: [0,0,0,0,0], transition: { opacity: { duration: 0.56, times: [0,0.3,0.5459,0.8486,1], ease: ["easeOut", "linear", "easeOut", "easeOut"] }, x: { duration: 0.56, times: [0,0.3,0.5459,0.8486,1], ease: ["easeOut", "linear", "easeOut", "easeOut"] }, y: { duration: 0.56, times: [0,0.3,0.5459,0.8486,1], ease: ["easeOut", "linear", "easeOut", "easeOut"] } } } }} style={{ transformBox: 'view-box', transformOrigin: '12px 12px' }} />
    </motion.svg>
  );
}


