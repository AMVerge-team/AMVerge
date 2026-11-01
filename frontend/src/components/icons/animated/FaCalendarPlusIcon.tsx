'use client';

import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import type { SVGProps } from 'react';
import { useIconHost } from './useIconHost';

export interface FaCalendarPlusIconProps extends Omit<SVGProps<SVGSVGElement>, 'ref'> {
  size?: number | string;
  className?: string;
}

export function FaCalendarPlusIcon({ size = '1em', className, ...rest }: FaCalendarPlusIconProps) {
  const [playing, setPlaying] = useState<string>("rest");
  const hostRef = useRef<SVGSVGElement>(null);
  const { hovered, tapped } = useIconHost(hostRef);
  useEffect(() => {
    setPlaying((now) => (hovered ? (now === "rest" ? "band" : now) : now === "band" ? "rest" : now));
  }, [hovered]);
  useEffect(() => {
    if (!tapped) return;
    setPlaying("raise-band");
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
    <motion.path initial="rest" animate={playing} d="M21.109 7.875 H2.891 C2.607 7.875 2.375 7.643 2.375 7.359 V5.812 C2.375 4.674 3.299 3.75 4.438 3.75 H6.5 V1.516 C6.5 1.232 6.732 1 7.016 1 H8.734 C9.018 1 9.25 1.232 9.25 1.516 V3.75 H14.75 V1.516 C14.75 1.232 14.982 1 15.266 1 H16.984 C17.268 1 17.5 1.232 17.5 1.516 V3.75 H19.562 C20.701 3.75 21.625 4.674 21.625 5.812 V7.359 C21.625 7.643 21.393 7.875 21.109 7.875 Z" variants={{ rest: { x: 0, y: 0, scale: 1 }, band: { x: [0,0,0], y: [0,-0.75,0], scale: [1,0.95,1], transition: { x: { duration: 0.32, times: [0,0.4,1], ease: ["easeOut", "easeInOut"] }, y: { duration: 0.32, times: [0,0.4,1], ease: ["easeOut", "easeInOut"] }, scale: { duration: 0.32, times: [0,0.45,1], ease: ["easeOut", "easeInOut"] } } }, "raise-band": { x: [0,0,0,0,0,0], y: [0,-0.75,-0.75,0.292,-0.1,0], scale: [1,1.03,0.95,0.95,1], transition: { x: { duration: 0.7, times: [0,0.3,0.4591,0.6977,0.8568,1], ease: ["easeOut", "easeOut", "easeIn", "easeOut", "easeInOut"] }, y: { duration: 0.7, times: [0,0.3,0.4591,0.6977,0.8568,1], ease: ["easeOut", "easeOut", "easeIn", "easeOut", "easeInOut"] }, scale: { duration: 0.7, times: [0,0.1,0.38,0.66,1], ease: ["easeOut", "easeOut", "easeInOut", "easeInOut"] } } } }} style={{ transformBox: 'view-box', transformOrigin: '12px 12px' }} />
    <motion.path initial="rest" animate={playing} d="M2.891 9.25 H21.109 C21.393 9.25 21.625 9.482 21.625 9.766 V20.938 C21.625 22.076 20.701 23 19.562 23 H4.438 C3.299 23 2.375 22.076 2.375 20.938 V9.766 C2.375 9.482 2.607 9.25 2.891 9.25 Z M16.469 15.266 C16.469 14.982 16.237 14.75 15.953 14.75 H13.375 V12.172 C13.375 11.888 13.143 11.656 12.859 11.656 H11.141 C10.857 11.656 10.625 11.888 10.625 12.172 V14.75 H8.047 C7.763 14.75 7.531 14.982 7.531 15.266 V16.984 C7.531 17.268 7.763 17.5 8.047 17.5 H10.625 V20.078 C10.625 20.362 10.857 20.594 11.141 20.594 H12.859 C13.143 20.594 13.375 20.362 13.375 20.078 V17.5 H15.953 C16.237 17.5 16.469 17.268 16.469 16.984 V15.266 Z" variants={{ rest: { scale: 1, x: 0, y: 0 }, band: { scale: [1,0.95,1], transition: { scale: { duration: 0.32, times: [0,0.45,1], ease: ["easeOut", "easeInOut"] } } }, "raise-band": { x: [0,0,0,0,0,0,0], y: [0,0,-0.75,-0.75,0.292,-0.1,0], scale: [1,1.03,0.95,0.95,1], transition: { x: { duration: 0.7, times: [0,0.1,0.3318,0.4591,0.6659,0.825,1], ease: [[0,0,1,1], "easeOut", "easeOut", "easeIn", "easeOut", "easeInOut"] }, y: { duration: 0.7, times: [0,0.1,0.3318,0.4591,0.6659,0.825,1], ease: [[0,0,1,1], "easeOut", "easeOut", "easeIn", "easeOut", "easeInOut"] }, scale: { duration: 0.7, times: [0,0.1,0.38,0.66,1], ease: ["easeOut", "easeOut", "easeInOut", "easeInOut"] } } } }} style={{ transformBox: 'view-box', transformOrigin: '12px 12px' }} />
    </motion.svg>
  );
}


