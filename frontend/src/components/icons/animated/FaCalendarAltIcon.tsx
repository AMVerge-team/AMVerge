'use client';

import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import type { SVGProps } from 'react';
import { useIconHost } from './useIconHost';

export interface FaCalendarAltIconProps extends Omit<SVGProps<SVGSVGElement>, 'ref'> {
  size?: number | string;
  className?: string;
}

export function FaCalendarAltIcon({ size = '1em', className, ...rest }: FaCalendarAltIconProps) {
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
    <motion.path initial="rest" animate={playing} d="M2.375 20.938 C2.375 22.076 3.299 23 4.438 23 H19.562 C20.701 23 21.625 22.076 21.625 20.938 V9.25 H2.375 V20.938 Z M16.125 12.516 C16.125 12.232 16.357 12 16.641 12 H18.359 C18.643 12 18.875 12.232 18.875 12.516 V14.234 C18.875 14.518 18.643 14.75 18.359 14.75 H16.641 C16.357 14.75 16.125 14.518 16.125 14.234 V12.516 Z M16.125 18.016 C16.125 17.732 16.357 17.5 16.641 17.5 H18.359 C18.643 17.5 18.875 17.732 18.875 18.016 V19.734 C18.875 20.018 18.643 20.25 18.359 20.25 H16.641 C16.357 20.25 16.125 20.018 16.125 19.734 V18.016 Z M10.625 12.516 C10.625 12.232 10.857 12 11.141 12 H12.859 C13.143 12 13.375 12.232 13.375 12.516 V14.234 C13.375 14.518 13.143 14.75 12.859 14.75 H11.141 C10.857 14.75 10.625 14.518 10.625 14.234 V12.516 Z M10.625 18.016 C10.625 17.732 10.857 17.5 11.141 17.5 H12.859 C13.143 17.5 13.375 17.732 13.375 18.016 V19.734 C13.375 20.018 13.143 20.25 12.859 20.25 H11.141 C10.857 20.25 10.625 20.018 10.625 19.734 V18.016 Z M5.125 12.516 C5.125 12.232 5.357 12 5.641 12 H7.359 C7.643 12 7.875 12.232 7.875 12.516 V14.234 C7.875 14.518 7.643 14.75 7.359 14.75 H5.641 C5.357 14.75 5.125 14.518 5.125 14.234 V12.516 Z M5.125 18.016 C5.125 17.732 5.357 17.5 5.641 17.5 H7.359 C7.643 17.5 7.875 17.732 7.875 18.016 V19.734 C7.875 20.018 7.643 20.25 7.359 20.25 H5.641 C5.357 20.25 5.125 20.018 5.125 19.734 V18.016 Z" variants={{ rest: { scale: 1, x: 0, y: 0 }, band: { scale: [1,0.95,1], transition: { scale: { duration: 0.32, times: [0,0.45,1], ease: ["easeOut", "easeInOut"] } } }, "raise-band": { x: [0,0,0,0,0,0], y: [0,0,-0.75,-0.75,0.429,0], scale: [1,1.03,0.95,0.95,1], transition: { x: { duration: 0.7, times: [0,0.2143,0.4167,0.7083,0.9028,1], ease: [[0,0,1,1], "easeOut", "easeOut", "easeIn", "easeInOut"] }, y: { duration: 0.7, times: [0,0.2143,0.4167,0.7083,0.9028,1], ease: [[0,0,1,1], "easeOut", "easeOut", "easeIn", "easeInOut"] }, scale: { duration: 0.7, times: [0,0.1,0.38,0.66,1], ease: ["easeOut", "easeOut", "easeInOut", "easeInOut"] } } } }} style={{ transformBox: 'view-box', transformOrigin: '12px 12px' }} />
    <motion.path initial="rest" animate={playing} d="M19.562 3.75 H17.5 V1.688 C17.5 1.309 17.191 1 16.812 1 H15.438 C15.059 1 14.75 1.309 14.75 1.688 V3.75 H9.25 V1.688 C9.25 1.309 8.941 1 8.562 1 H7.188 C6.809 1 6.5 1.309 6.5 1.688 V3.75 H4.438 C3.299 3.75 2.375 4.674 2.375 5.812 V7.875 H21.625 V5.812 C21.625 4.674 20.701 3.75 19.562 3.75 Z" variants={{ rest: { x: 0, y: 0, scale: 1 }, band: { x: [0,0,0], y: [0,-0.75,0], scale: [1,0.95,1], transition: { x: { duration: 0.32, times: [0,0.4,1], ease: ["easeOut", "easeInOut"] }, y: { duration: 0.32, times: [0,0.4,1], ease: ["easeOut", "easeInOut"] }, scale: { duration: 0.32, times: [0,0.45,1], ease: ["easeOut", "easeInOut"] } } }, "raise-band": { x: [0,0,0,0,0,0], y: [0,0.2,-0.75,-0.75,0,0], scale: [1,1.03,0.95,0.95,1], transition: { x: { duration: 0.7, times: [0,0.0857,0.3,0.6694,0.8833,1], ease: ["easeOut", "easeOut", "easeOut", "easeIn", "easeOut"] }, y: { duration: 0.7, times: [0,0.0857,0.3,0.6694,0.8833,1], ease: ["easeOut", "easeOut", "easeOut", "easeIn", "easeOut"] }, scale: { duration: 0.7, times: [0,0.1,0.38,0.66,1], ease: ["easeOut", "easeOut", "easeInOut", "easeInOut"] } } } }} style={{ transformBox: 'view-box', transformOrigin: '12px 12px' }} />
    </motion.svg>
  );
}


