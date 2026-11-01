'use client';

import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import type { SVGProps } from 'react';
import { useIconHost } from './useIconHost';

export interface FaVolumeUpIconProps extends Omit<SVGProps<SVGSVGElement>, 'ref'> {
  size?: number | string;
  className?: string;
}

export function FaVolumeUpIcon({ size = '1em', className, ...rest }: FaVolumeUpIconProps) {
  const [playing, setPlaying] = useState<string>("rest");
  const hostRef = useRef<SVGSVGElement>(null);
  const { hovered, tapped } = useIconHost(hostRef);
  useEffect(() => {
    setPlaying((now) => (hovered ? (now === "rest" ? "quieten" : now) : now === "quieten" ? "rest" : now));
  }, [hovered]);
  useEffect(() => {
    if (!tapped) return;
    setPlaying("mute");
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
    <motion.path initial="rest" animate={playing} d="M9.213 4.936 L5.815 8.333 H1.917 C1.41 8.333 1 8.744 1 9.25 V14.75 C1 15.256 1.41 15.667 1.917 15.667 H5.815 L9.213 19.064 C9.787 19.638 10.778 19.235 10.778 18.416 V5.584 C10.778 4.764 9.786 4.363 9.213 4.936 Z" variants={{ rest: { scale: 1, x: 0, y: 0 }, quieten: { scale: [1,0.95,1], transition: { scale: { duration: 0.3, times: [0,0.45,1], ease: ["easeOut", "easeInOut"] } } }, mute: { x: [0,0,-0.75,0,0], y: [0,0,0,0,0], scale: [1,1.03,0.95,0.95,1], transition: { x: { duration: 0.66, times: [0,0.4795,0.5872,0.7846,1], ease: [[0,0,1,1], "easeOut", "easeOut", "easeOut"] }, y: { duration: 0.66, times: [0,0.4795,0.5872,0.7846,1], ease: [[0,0,1,1], "easeOut", "easeOut", "easeOut"] }, scale: { duration: 0.66, times: [0,0.1,0.38,0.66,1], ease: ["easeOut", "easeOut", "easeInOut", "easeInOut"] } } } }} style={{ transformBox: 'view-box', originX: '1px', originY: '12px' }} />
    <motion.path initial="rest" animate={playing} d="M18.124 2.985 C17.698 2.705 17.125 2.823 16.845 3.25 C16.564 3.677 16.683 4.25 17.11 4.53 C19.641 6.191 21.152 8.984 21.152 12 C21.152 15.017 19.641 17.809 17.11 19.47 C16.683 19.75 16.564 20.324 16.845 20.75 C17.113 21.159 17.682 21.306 18.124 21.015 C21.177 19.012 23 15.641 23 12 S21.177 4.989 18.124 2.985 Z" variants={{ rest: { opacity: 1, x: 0, y: 0, scale: 1 }, quieten: { opacity: [1,0.3,1], x: [0,-0.75,0], y: [0,0,0], scale: [1,0.95,1], transition: { opacity: { duration: 0.3, times: [0,0.45,1], ease: ["easeOut", "easeInOut"] }, x: { duration: 0.3, times: [0,0.45,1], ease: ["easeOut", "easeInOut"] }, y: { duration: 0.3, times: [0,0.45,1], ease: ["easeOut", "easeInOut"] }, scale: { duration: 0.3, times: [0,0.45,1], ease: ["easeOut", "easeInOut"] } } }, mute: { opacity: [1,0.15,0.15,1,1], x: [0,-0.75,-0.75,0,0], y: [0,0,0,0,0], scale: [1,1.03,0.95,0.95,1], transition: { opacity: { duration: 0.66, times: [0,0.3,0.5154,0.8026,1], ease: ["easeOut", "linear", "easeOut", "easeOut"] }, x: { duration: 0.66, times: [0,0.3,0.5154,0.8026,1], ease: ["easeOut", "linear", "easeOut", "easeOut"] }, y: { duration: 0.66, times: [0,0.3,0.5154,0.8026,1], ease: ["easeOut", "linear", "easeOut", "easeOut"] }, scale: { duration: 0.66, times: [0,0.1,0.38,0.66,1], ease: ["easeOut", "easeOut", "easeInOut", "easeInOut"] } } } }} style={{ transformBox: 'view-box', originX: '12px', originY: '12px' }} />
    <motion.path initial="rest" animate={playing} d="M19.333 12 C19.333 9.574 18.109 7.343 16.057 6.032 C15.63 5.76 15.063 5.887 14.792 6.317 S14.648 7.319 15.075 7.592 C16.594 8.561 17.5 10.209 17.5 12 S16.594 15.439 15.075 16.408 C14.648 16.681 14.522 17.251 14.792 17.683 C15.041 18.078 15.599 18.261 16.057 17.968 C18.109 16.657 19.333 14.427 19.333 12 Z" variants={{ rest: { scale: 1, opacity: 1, x: 0, y: 0 }, quieten: { scale: [1,0.95,1], transition: { scale: { duration: 0.3, times: [0,0.45,1], ease: ["easeOut", "easeInOut"] } } }, mute: { opacity: [1,1,0.15,0.15,1,1], x: [0,0,-2.698,-2.698,0,0], y: [0,0,0,0,0,0], scale: [1,1.03,0.95,0.95,1], transition: { opacity: { duration: 0.66, times: [0,0.1364,0.3897,0.6051,0.8923,1], ease: [[0,0,1,1], "easeOut", "linear", "easeOut", "easeOut"] }, x: { duration: 0.66, times: [0,0.1364,0.3897,0.6051,0.8923,1], ease: [[0,0,1,1], "easeOut", "linear", "easeOut", "easeOut"] }, y: { duration: 0.66, times: [0,0.1364,0.3897,0.6051,0.8923,1], ease: [[0,0,1,1], "easeOut", "linear", "easeOut", "easeOut"] }, scale: { duration: 0.66, times: [0,0.1,0.38,0.66,1], ease: ["easeOut", "easeOut", "easeInOut", "easeInOut"] } } } }} style={{ transformBox: 'view-box', originX: '12px', originY: '12px' }} />
    <motion.path initial="rest" animate={playing} d="M13.919 9.064 C13.476 8.822 12.918 8.981 12.673 9.425 C12.429 9.868 12.59 10.426 13.034 10.67 C13.527 10.941 13.833 11.451 13.833 12 C13.833 12.549 13.527 13.059 13.034 13.33 C12.591 13.574 12.429 14.132 12.673 14.575 C12.919 15.02 13.477 15.179 13.919 14.936 C14.997 14.342 15.667 13.217 15.667 12 S14.997 9.658 13.919 9.064 Z" variants={{ rest: { scale: 1, opacity: 1, x: 0, y: 0 }, quieten: { scale: [1,0.95,1], transition: { scale: { duration: 0.3, times: [0,0.45,1], ease: ["easeOut", "easeInOut"] } } }, mute: { opacity: [1,1,0.15,0.15,1,1], x: [0,0,-1.8,-1.8,0,0], y: [0,0,0,0,0,0], scale: [1,1.03,0.95,0.95,1], transition: { opacity: { duration: 0.66, times: [0,0.2727,0.4795,0.6949,0.9641,1], ease: [[0,0,1,1], "easeOut", "linear", "easeOut", "easeOut"] }, x: { duration: 0.66, times: [0,0.2727,0.4795,0.6949,0.9641,1], ease: [[0,0,1,1], "easeOut", "linear", "easeOut", "easeOut"] }, y: { duration: 0.66, times: [0,0.2727,0.4795,0.6949,0.9641,1], ease: [[0,0,1,1], "easeOut", "linear", "easeOut", "easeOut"] }, scale: { duration: 0.66, times: [0,0.1,0.38,0.66,1], ease: ["easeOut", "easeOut", "easeInOut", "easeInOut"] } } } }} style={{ transformBox: 'view-box', originX: '12px', originY: '12px' }} />
    </motion.svg>
  );
}


