'use client';

import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import type { SVGProps } from 'react';
import { useIconHost } from './useIconHost';

export interface FaThLargeIconProps extends Omit<SVGProps<SVGSVGElement>, 'ref'> {
  size?: number | string;
  className?: string;
}

export function FaThLargeIcon({ size = '1em', className, ...rest }: FaThLargeIconProps) {
  const [playing, setPlaying] = useState<string>("rest");
  const hostRef = useRef<SVGSVGElement>(null);
  const { hovered, tapped } = useIconHost(hostRef);
  useEffect(() => {
    setPlaying((now) => (hovered ? (now === "rest" ? "narrow" : now) : now === "narrow" ? "rest" : now));
  }, [hovered]);
  useEffect(() => {
    if (!tapped) return;
    setPlaying("take-all");
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
    <motion.path initial="rest" animate={playing} d="M13.719 2.375 H21.969 C22.538 2.375 23 2.837 23 3.406 V10.281 C23 10.851 22.538 11.312 21.969 11.312 H13.719 C13.149 11.312 12.688 10.851 12.688 10.281 V3.406 C12.688 2.837 13.149 2.375 13.719 2.375 Z" variants={{ rest: { x: 0, y: 0, scale: 1 }, narrow: { x: [0,-0.75,0], y: [0,0.75,0], scale: [1,0.95,1], transition: { x: { duration: 0.28, times: [0,0.45,1], ease: ["easeOut", "easeInOut"] }, y: { duration: 0.28, times: [0,0.45,1], ease: ["easeOut", "easeInOut"] }, scale: { duration: 0.28, times: [0,0.45,1], ease: ["easeOut", "easeInOut"] } } }, "take-all": { x: [0,0.327,-0.75,-0.75,0], y: [0,-0.327,0.75,0.75,0], scale: [1,1.03,0.95,0.95,1], transition: { x: { duration: 0.7, times: [0,0.1,0.34,0.7,1], ease: ["easeOut", "easeOut", "linear", "easeInOut"] }, y: { duration: 0.7, times: [0,0.1,0.34,0.7,1], ease: ["easeOut", "easeOut", "linear", "easeInOut"] }, scale: { duration: 0.7, times: [0,0.1,0.38,0.66,1], ease: ["easeOut", "easeOut", "easeInOut", "easeInOut"] } } } }} style={{ transformBox: 'view-box', originX: '17.844px', originY: '6.844px' }} />
    <motion.path initial="rest" animate={playing} d="M10.281 2.375 H2.031 C1.462 2.375 1 2.837 1 3.406 V10.281 C1 10.851 1.462 11.312 2.031 11.312 H10.281 C10.851 11.312 11.312 10.851 11.312 10.281 V3.406 C11.312 2.837 10.851 2.375 10.281 2.375 Z" variants={{ rest: { x: 0, y: 0, scale: 1 }, narrow: { x: [0,0.75,0], y: [0,0.75,0], scale: [1,0.95,1], transition: { x: { duration: 0.28, times: [0,0.45,1], ease: ["easeOut", "easeInOut"] }, y: { duration: 0.28, times: [0,0.45,1], ease: ["easeOut", "easeInOut"] }, scale: { duration: 0.28, times: [0,0.45,1], ease: ["easeOut", "easeInOut"] } } }, "take-all": { x: [0,-0.327,0.75,0.75,0], y: [0,-0.327,0.75,0.75,0], scale: [1,1.03,0.95,0.95,1], transition: { x: { duration: 0.7, times: [0,0.1,0.34,0.7,1], ease: ["easeOut", "easeOut", "linear", "easeInOut"] }, y: { duration: 0.7, times: [0,0.1,0.34,0.7,1], ease: ["easeOut", "easeOut", "linear", "easeInOut"] }, scale: { duration: 0.7, times: [0,0.1,0.38,0.66,1], ease: ["easeOut", "easeOut", "easeInOut", "easeInOut"] } } } }} style={{ transformBox: 'view-box', originX: '6.156px', originY: '6.844px' }} />
    <motion.path initial="rest" animate={playing} d="M1 13.719 V20.594 C1 21.163 1.462 21.625 2.031 21.625 H10.281 C10.851 21.625 11.312 21.163 11.312 20.594 V13.719 C11.312 13.149 10.851 12.688 10.281 12.688 H2.031 C1.462 12.688 1 13.149 1 13.719 Z" variants={{ rest: { x: 0, y: 0, scale: 1 }, narrow: { x: [0,0.75,0], y: [0,-0.75,0], scale: [1,0.95,1], transition: { x: { duration: 0.28, times: [0,0.4,1], ease: ["easeOut", "easeInOut"] }, y: { duration: 0.28, times: [0,0.4,1], ease: ["easeOut", "easeInOut"] }, scale: { duration: 0.28, times: [0,0.45,1], ease: ["easeOut", "easeInOut"] } } }, "take-all": { x: [0,-0.327,0.75,0.75,0], y: [0,0.327,-0.75,-0.75,0], scale: [1,1.03,0.95,0.95,1], transition: { x: { duration: 0.7, times: [0,0.1,0.34,0.7,1], ease: ["easeOut", "easeOut", "linear", "easeInOut"] }, y: { duration: 0.7, times: [0,0.1,0.34,0.7,1], ease: ["easeOut", "easeOut", "linear", "easeInOut"] }, scale: { duration: 0.7, times: [0,0.1,0.38,0.66,1], ease: ["easeOut", "easeOut", "easeInOut", "easeInOut"] } } } }} style={{ transformBox: 'view-box', originX: '6.156px', originY: '17.156px' }} />
    <motion.path initial="rest" animate={playing} d="M13.719 21.625 H21.969 C22.538 21.625 23 21.163 23 20.594 V13.719 C23 13.149 22.538 12.688 21.969 12.688 H13.719 C13.149 12.688 12.688 13.149 12.688 13.719 V20.594 C12.688 21.163 13.149 21.625 13.719 21.625 Z" variants={{ rest: { x: 0, y: 0, scale: 1 }, narrow: { x: [0,-0.75,0], y: [0,-0.75,0], scale: [1,0.95,1], transition: { x: { duration: 0.28, times: [0,0.4,1], ease: ["easeOut", "easeInOut"] }, y: { duration: 0.28, times: [0,0.4,1], ease: ["easeOut", "easeInOut"] }, scale: { duration: 0.28, times: [0,0.45,1], ease: ["easeOut", "easeInOut"] } } }, "take-all": { x: [0,0.327,-0.75,-0.75,0], y: [0,0.327,-0.75,-0.75,0], scale: [1,1.03,0.95,0.95,1], transition: { x: { duration: 0.7, times: [0,0.1,0.34,0.7,1], ease: ["easeOut", "easeOut", "linear", "easeInOut"] }, y: { duration: 0.7, times: [0,0.1,0.34,0.7,1], ease: ["easeOut", "easeOut", "linear", "easeInOut"] }, scale: { duration: 0.7, times: [0,0.1,0.38,0.66,1], ease: ["easeOut", "easeOut", "easeInOut", "easeInOut"] } } } }} style={{ transformBox: 'view-box', originX: '17.844px', originY: '17.156px' }} />
    </motion.svg>
  );
}


