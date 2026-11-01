'use client';

import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import type { SVGProps } from 'react';
import { useIconHost } from './useIconHost';

export interface FaThumbtackIconProps extends Omit<SVGProps<SVGSVGElement>, 'ref'> {
  size?: number | string;
  className?: string;
}

export function FaThumbtackIcon({ size = '1em', className, ...rest }: FaThumbtackIconProps) {
  const [playing, setPlaying] = useState<string>("rest");
  const hostRef = useRef<SVGSVGElement>(null);
  const { hovered, tapped } = useIconHost(hostRef);
  useEffect(() => {
    setPlaying((now) => (hovered ? (now === "rest" ? "nudge" : now) : now === "nudge" ? "rest" : now));
  }, [hovered]);
  useEffect(() => {
    if (!tapped) return;
    setPlaying((now) => (now === "pin" ? "unpin" : "pin"));
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
    <motion.g initial="rest" animate={playing} variants={{ rest: { x: 0, y: 0, scale: 1 }, nudge: { x: [0,0,0], y: [0,0.686,0], scale: [1,0.95,1], transition: { x: { duration: 0.3, times: [0,0.4,1], ease: ["easeOut", "easeOut"] }, y: { duration: 0.3, times: [0,0.4,1], ease: ["easeOut", "easeOut"] }, scale: { duration: 0.3, times: [0,0.45,1], ease: ["easeOut", "easeInOut"] } } }, pin: { x: [0,0,0,0], y: [0,-0.32,0.686,0.686], transition: { x: { duration: 0.62, times: [0,0.1154,0.3,1], ease: ["easeOut", "easeOut", "easeOut"] }, y: { duration: 0.62, times: [0,0.1154,0.3,1], ease: ["easeOut", "easeOut", "easeOut"] } } }, unpin: { x: [0,-0.457,0.457,-0.274,0,0], y: [0.686,0.659,0.659,0.64,-0.457,0], transition: { x: { duration: 0.72, times: [0,0.3,0.414,0.4953,0.6581,1], ease: ["easeOut", "easeInOut", "easeInOut", "easeOut", "easeOut"] }, y: { duration: 0.72, times: [0,0.3,0.414,0.4953,0.6581,1], ease: ["easeOut", "easeInOut", "easeInOut", "easeOut", "easeOut"] } } } }} style={{ transformBox: 'view-box', transformOrigin: '12px 12px' }}>
      <path d="M16.556 10.207 L16.03 5.125 H17.844 C18.413 5.125 18.875 4.663 18.875 4.094 V2.031 C18.875 1.462 18.413 1 17.844 1 H6.156 C5.587 1 5.125 1.462 5.125 2.031 V4.094 C5.125 4.663 5.587 5.125 6.156 5.125 H7.97 L7.444 10.207 C5.36 11.176 3.75 12.914 3.75 15.094 C3.75 15.663 4.212 16.125 4.781 16.125 H10.625 V20.594 C10.625 20.647 10.637 20.7 10.661 20.748 L11.693 22.81 C11.819 23.063 12.181 23.064 12.307 22.81 L13.339 20.748 A0.344 0.344 0 0 0 13.375 20.594 V16.125 H19.219 C19.788 16.125 20.25 15.663 20.25 15.094 C20.25 12.894 18.618 11.166 16.556 10.207 Z" />
      <motion.path initial="rest" animate={playing} d="M16.556 10.207 L16.03 5.125 H17.844 C18.413 5.125 18.875 4.663 18.875 4.094 V2.031 C18.875 1.462 18.413 1 17.844 1 H6.156 C5.587 1 5.125 1.462 5.125 2.031 V4.094 C5.125 4.663 5.587 5.125 6.156 5.125 H7.97 L7.444 10.207 C5.36 11.176 3.75 12.914 3.75 15.094 C3.75 15.663 4.212 16.125 4.781 16.125 H10.625 V20.594 C10.625 20.647 10.637 20.7 10.661 20.748 L11.693 22.81 C11.819 23.063 12.181 23.064 12.307 22.81 L13.339 20.748 A0.344 0.344 0 0 0 13.375 20.594 V16.125 H19.219 C19.788 16.125 20.25 15.663 20.25 15.094 C20.25 12.894 18.618 11.166 16.556 10.207 Z" fill="#22c55e" variants={{ rest: { opacity: 0 }, nudge: { opacity: 0 }, pin: { opacity: [0,0,1,1], transition: { opacity: { duration: 0.62, times: [0,0.3,0.4514,1], ease: [(p) => (p < 1 ? 0 : 1), (p) => (p < 1 ? 0 : 1), "easeOut"] } } }, unpin: { opacity: [1,1,0,0], transition: { opacity: { duration: 0.72, times: [0,0.4628,0.6093,1], ease: ["linear", "linear", "easeOut"] } } } }} style={{ transformBox: 'view-box', transformOrigin: '12px 12px' }} />
    </motion.g>
    </motion.svg>
  );
}


