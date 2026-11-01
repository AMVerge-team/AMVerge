'use client';

import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import type { SVGProps } from 'react';
import { useIconHost } from './useIconHost';

export interface FaWaterIconProps extends Omit<SVGProps<SVGSVGElement>, 'ref'> {
  size?: number | string;
  className?: string;
}

export function FaWaterIcon({ size = '1em', className, ...rest }: FaWaterIconProps) {
  const [playing, setPlaying] = useState<string>("rest");
  const hostRef = useRef<SVGSVGElement>(null);
  const { hovered, tapped } = useIconHost(hostRef);
  useEffect(() => {
    setPlaying((now) => (hovered ? (now === "rest" ? "run" : now) : now === "run" ? "rest" : now));
  }, [hovered]);
  useEffect(() => {
    if (!tapped) return;
    setPlaying("carry");
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
    <motion.path initial="rest" animate={playing} d="M22.469 16.885 C21.648 16.793 20.861 16.484 20.258 16.01 C19.719 15.586 18.951 15.579 18.417 16.01 C16.969 17.172 14.322 17.172 12.852 15.953 C12.336 15.525 11.591 15.606 11.068 16.022 C9.617 17.172 6.985 17.168 5.522 15.957 C5.007 15.529 4.25 15.617 3.723 16.033 C3.131 16.499 2.348 16.801 1.519 16.889 C1.218 16.919 1 17.187 1 17.489 V18.718 C1 19.066 1.29 19.36 1.638 19.33 C2.738 19.234 3.781 18.894 4.67 18.34 C6.828 19.662 9.903 19.643 12.004 18.34 C14.162 19.662 17.236 19.643 19.337 18.34 C20.227 18.883 21.281 19.23 22.358 19.326 C22.706 19.356 22.996 19.062 22.996 18.715 V17.508 C23 17.202 22.778 16.919 22.469 16.885 Z" variants={{ rest: { scale: 1, x: 0, y: 0 }, run: { scale: [1,0.95,1], transition: { scale: { duration: 0.32, times: [0,0.45,1], ease: ["easeOut", "easeInOut"] } } }, carry: { x: [0,0,0.75,0,0], y: [0,0,0,0,0], scale: [1,1.03,0.95,0.95,1], transition: { x: { duration: 0.72, times: [0,0.3189,0.5649,0.8108,1], ease: [[0,0,1,1], "easeOut", "easeInOut", "easeOut"] }, y: { duration: 0.72, times: [0,0.3189,0.5649,0.8108,1], ease: [[0,0,1,1], "easeOut", "easeInOut", "easeOut"] }, scale: { duration: 0.72, times: [0,0.1,0.38,0.66,1], ease: ["easeOut", "easeOut", "easeInOut", "easeInOut"] } } } }} style={{ transformBox: 'view-box', transformOrigin: '12px 12px' }} />
    <motion.path initial="rest" animate={playing} d="M22.469 11.385 C21.648 11.293 20.861 10.984 20.258 10.51 C19.719 10.086 18.951 10.079 18.417 10.51 C16.969 11.672 14.322 11.672 12.852 10.453 C12.336 10.025 11.591 10.106 11.068 10.522 C9.617 11.672 6.985 11.668 5.522 10.457 C5.007 10.029 4.25 10.117 3.723 10.533 C3.131 10.999 2.348 11.301 1.519 11.389 C1.218 11.419 1 11.687 1 11.989 V13.218 C1 13.566 1.29 13.86 1.638 13.83 C2.738 13.734 3.781 13.394 4.67 12.84 C6.828 14.162 9.903 14.143 12.004 12.84 C14.162 14.162 17.236 14.143 19.337 12.84 C20.227 13.383 21.281 13.73 22.358 13.826 C22.706 13.856 22.996 13.562 22.996 13.215 V12.008 C23 11.702 22.778 11.419 22.469 11.385 Z" variants={{ rest: { scale: 1, x: 0, y: 0 }, run: { scale: [1,0.95,1], transition: { scale: { duration: 0.32, times: [0,0.45,1], ease: ["easeOut", "easeInOut"] } } }, carry: { x: [0,0,0.75,0,0], y: [0,0,0,0,0], scale: [1,1.03,0.95,0.95,1], transition: { x: { duration: 0.72, times: [0,0.1615,0.4324,0.6784,1], ease: [[0,0,1,1], "easeOut", "easeInOut", "easeOut"] }, y: { duration: 0.72, times: [0,0.1615,0.4324,0.6784,1], ease: [[0,0,1,1], "easeOut", "easeInOut", "easeOut"] }, scale: { duration: 0.72, times: [0,0.1,0.38,0.66,1], ease: ["easeOut", "easeOut", "easeInOut", "easeInOut"] } } } }} style={{ transformBox: 'view-box', transformOrigin: '12px 12px' }} />
    <motion.path initial="rest" animate={playing} d="M22.469 5.885 C21.648 5.79 20.861 5.484 20.258 5.01 C19.719 4.586 18.951 4.579 18.417 5.01 C16.969 6.172 14.322 6.172 12.852 4.953 C12.336 4.525 11.591 4.606 11.068 5.022 C9.617 6.172 6.985 6.168 5.522 4.957 C5.007 4.529 4.25 4.617 3.723 5.033 C3.131 5.499 2.348 5.801 1.519 5.889 C1.218 5.919 1 6.187 1 6.489 V7.718 C1 8.066 1.29 8.36 1.638 8.33 C2.738 8.234 3.781 7.894 4.67 7.34 C6.828 8.662 9.903 8.643 12.004 7.34 C14.162 8.662 17.236 8.643 19.337 7.34 C20.227 7.883 21.281 8.23 22.358 8.326 C22.706 8.356 22.996 8.062 22.996 7.715 V6.508 C23 6.202 22.778 5.919 22.469 5.885 Z" variants={{ rest: { x: 0, y: 0, scale: 1 }, run: { x: [0,0.75,0], y: [0,0,0], scale: [1,0.95,1], transition: { x: { duration: 0.32, times: [0,0.4,1], ease: ["easeOut", "easeInOut"] }, y: { duration: 0.32, times: [0,0.4,1], ease: ["easeOut", "easeInOut"] }, scale: { duration: 0.32, times: [0,0.45,1], ease: ["easeOut", "easeInOut"] } } }, carry: { x: [0,0.75,0,0], y: [0,0,0,0], scale: [1,1.03,0.95,0.95,1], transition: { x: { duration: 0.72, times: [0,0.3,0.5459,1], ease: ["easeOut", "easeInOut", "easeOut"] }, y: { duration: 0.72, times: [0,0.3,0.5459,1], ease: ["easeOut", "easeInOut", "easeOut"] }, scale: { duration: 0.72, times: [0,0.1,0.38,0.66,1], ease: ["easeOut", "easeOut", "easeInOut", "easeInOut"] } } } }} style={{ transformBox: 'view-box', transformOrigin: '12px 12px' }} />
    </motion.svg>
  );
}


