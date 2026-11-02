'use client';

import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import type { SVGProps } from 'react';
import { useIconHost } from './useIconHost';

export interface FaRegCalendarAltIconProps extends Omit<SVGProps<SVGSVGElement>, 'ref'> {
  size?: number | string;
  className?: string;
}

export function FaRegCalendarAltIcon({ size = '1em', className, ...rest }: FaRegCalendarAltIconProps) {
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
    <motion.g initial="rest" animate={playing} variants={{ rest: { scale: 1, x: 0, y: 0 }, band: { scale: [1,0.95,1], transition: { scale: { duration: 0.32, times: [0,0.45,1], ease: ["easeOut", "easeInOut"] } } }, "raise-band": { x: [0,0,0,0,0], y: [0,0,0.718,0,0], scale: [1,1.03,0.95,0.95,1], transition: { x: { duration: 0.7, times: [0,0.46,0.54,0.7,1], ease: [[0,0,1,1], "easeOut", "easeInOut", "easeOut"] }, y: { duration: 0.7, times: [0,0.46,0.54,0.7,1], ease: [[0,0,1,1], "easeOut", "easeInOut", "easeOut"] }, scale: { duration: 0.7, times: [0,0.1,0.38,0.66,1], ease: ["easeOut", "easeOut", "easeInOut", "easeInOut"] } } } }} style={{ transformBox: 'view-box', originX: '12px', originY: '12px' }}>
      <path d="M2.375 7.875 V20.938 C2.375 22.076 3.299 23 4.438 23 H19.562 C20.701 23 21.625 22.076 21.625 20.938 V7.875 H19.562 V20.68 C19.562 20.821 19.446 20.938 19.305 20.938 H4.695 C4.554 20.938 4.438 20.821 4.438 20.68 V7.875 Z" />
      <path d="M8.734 13.375 H7.016 C6.732 13.375 6.5 13.143 6.5 12.859 V11.141 C6.5 10.857 6.732 10.625 7.016 10.625 H8.734 C9.018 10.625 9.25 10.857 9.25 11.141 V12.859 C9.25 13.143 9.018 13.375 8.734 13.375 Z" />
      <motion.path initial="rest" animate={playing} d="M13.375 12.859 V11.141 C13.375 10.857 13.143 10.625 12.859 10.625 H11.141 C10.857 10.625 10.625 10.857 10.625 11.141 V12.859 C10.625 13.143 10.857 13.375 11.141 13.375 H12.859 C13.143 13.375 13.375 13.143 13.375 12.859 Z" variants={{ rest: { x: 0, y: 0 }, band: { x: 0, y: 0 }, "raise-band": { x: [0,0,0,0,0,0], y: [0,0,3.6,3.6,0,0], transition: { x: { duration: 0.7, times: [0,0.34,0.46,0.56,0.72,1], ease: [[0,0,1,1], "easeOut", "easeOut", "easeInOut", "easeOut"] }, y: { duration: 0.7, times: [0,0.34,0.46,0.56,0.72,1], ease: [[0,0,1,1], "easeOut", "easeOut", "easeInOut", "easeOut"] } } } }} style={{ transformBox: 'view-box', originX: '12px', originY: '12px' }} />
      <path d="M17.5 12.859 V11.141 C17.5 10.857 17.268 10.625 16.984 10.625 H15.266 C14.982 10.625 14.75 10.857 14.75 11.141 V12.859 C14.75 13.143 14.982 13.375 15.266 13.375 H16.984 C17.268 13.375 17.5 13.143 17.5 12.859 Z" />
      <path d="M13.375 16.984 V15.266 C13.375 14.982 13.143 14.75 12.859 14.75 H11.141 C10.857 14.75 10.625 14.982 10.625 15.266 V16.984 C10.625 17.268 10.857 17.5 11.141 17.5 H12.859 C13.143 17.5 13.375 17.268 13.375 16.984 Z" />
      <path d="M9.25 16.984 V15.266 C9.25 14.982 9.018 14.75 8.734 14.75 H7.016 C6.732 14.75 6.5 14.982 6.5 15.266 V16.984 C6.5 17.268 6.732 17.5 7.016 17.5 H8.734 C9.018 17.5 9.25 17.268 9.25 16.984 Z" />
      <path d="M17.5 16.984 V15.266 C17.5 14.982 17.268 14.75 16.984 14.75 H15.266 C14.982 14.75 14.75 14.982 14.75 15.266 V16.984 C14.75 17.268 14.982 17.5 15.266 17.5 H16.984 C17.268 17.5 17.5 17.268 17.5 16.984 Z" />
    </motion.g>
    <motion.path initial="rest" animate={playing} d="M2.375 7.875 V5.812 C2.375 4.674 3.299 3.75 4.438 3.75 H6.5 V1.516 C6.5 1.232 6.732 1 7.016 1 H8.734 C9.018 1 9.25 1.232 9.25 1.516 V3.75 H14.75 V1.516 C14.75 1.232 14.982 1 15.266 1 H16.984 C17.268 1 17.5 1.232 17.5 1.516 V3.75 H19.562 C20.701 3.75 21.625 4.674 21.625 5.812 V7.875 Z" variants={{ rest: { x: 0, y: 0, scale: 1 }, band: { x: [0,0,0], y: [0,-0.75,0], scale: [1,0.95,1], transition: { x: { duration: 0.32, times: [0,0.4,1], ease: ["easeOut", "easeInOut"] }, y: { duration: 0.32, times: [0,0.4,1], ease: ["easeOut", "easeInOut"] }, scale: { duration: 0.32, times: [0,0.45,1], ease: ["easeOut", "easeInOut"] } } }, "raise-band": { x: [0,0,0,0,0,0], y: [0,0.176,-0.75,-0.75,0,0], scale: [1,1.03,0.95,0.95,1], transition: { x: { duration: 0.7, times: [0,0.08,0.26,0.62,0.86,1], ease: ["easeOut", "easeOut", "easeOut", "easeIn", "easeOut"] }, y: { duration: 0.7, times: [0,0.08,0.26,0.62,0.86,1], ease: ["easeOut", "easeOut", "easeOut", "easeIn", "easeOut"] }, scale: { duration: 0.7, times: [0,0.1,0.38,0.66,1], ease: ["easeOut", "easeOut", "easeInOut", "easeInOut"] } } } }} style={{ transformBox: 'view-box', originX: '12px', originY: '12px' }} />
    </motion.svg>
  );
}


