'use client';

import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import type { SVGProps } from 'react';
import { useIconHost } from './useIconHost';

export interface FaCheckCircleIconProps extends Omit<SVGProps<SVGSVGElement>, 'ref'> {
  size?: number | string;
  className?: string;
}

export function FaCheckCircleIcon({ size = '1em', className, ...rest }: FaCheckCircleIconProps) {
  const [playing, setPlaying] = useState<string>("rest");
  const hostRef = useRef<SVGSVGElement>(null);
  const { hovered, tapped } = useIconHost(hostRef);
  useEffect(() => {
    setPlaying((now) => (hovered ? (now === "rest" ? "lift" : now) : now === "lift" ? "rest" : now));
  }, [hovered]);
  useEffect(() => {
    if (!tapped) return;
    setPlaying("stamp");
    const done = setTimeout(() => setPlaying('rest'), 660);
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
    <motion.path initial="rest" animate={playing} d="M22.656 12 C22.656 17.885 17.885 22.656 12 22.656 S1.344 17.885 1.344 12 S6.115 1.344 12 1.344 S22.656 6.115 22.656 12 Z M10.767 17.642 L18.674 9.736 C18.942 9.468 18.942 9.032 18.674 8.764 L17.701 7.792 C17.433 7.523 16.998 7.523 16.729 7.792 L10.281 14.239 L7.271 11.229 C7.002 10.961 6.567 10.961 6.299 11.229 L5.326 12.201 C5.058 12.47 5.058 12.905 5.326 13.174 L9.795 17.642 C10.064 17.911 10.499 17.911 10.767 17.642 Z" variants={{ rest: { scale: 1 }, lift: { scale: [1,0.95,1], transition: { scale: { duration: 0.3, times: [0,0.4,1], ease: ["easeOut", "easeInOut"] } } }, stamp: { scale: [1,1.04,0.95,0.95,1], transition: { scale: { duration: 0.62, times: [0,0.12,0.3,0.62,1], ease: ["easeOut", "easeOut", "easeOut", "easeInOut"] } } } }} style={{ transformBox: 'view-box', transformOrigin: '12px 12px' }} />
    </motion.svg>
  );
}


