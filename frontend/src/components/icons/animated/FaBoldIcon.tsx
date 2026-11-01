'use client';

import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import type { SVGProps } from 'react';
import { useIconHost } from './useIconHost';

export interface FaBoldIconProps extends Omit<SVGProps<SVGSVGElement>, 'ref'> {
  size?: number | string;
  className?: string;
}

export function FaBoldIcon({ size = '1em', className, ...rest }: FaBoldIconProps) {
  const [playing, setPlaying] = useState<string>("rest");
  const hostRef = useRef<SVGSVGElement>(null);
  const { hovered, tapped } = useIconHost(hostRef);
  useEffect(() => {
    setPlaying((now) => (hovered ? (now === "rest" ? "weight" : now) : now === "weight" ? "rest" : now));
  }, [hovered]);
  useEffect(() => {
    if (!tapped) return;
    setPlaying((now) => (now === "heavy" ? "heavy-back" : "heavy"));
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
    <motion.path initial="rest" animate={playing} d="M18.08 11.227 A5.242 5.242 0 0 0 19.24 8.425 C19.557 5.146 16.984 2.375 13.78 2.375 H5.211 A0.688 0.688 0 0 0 4.523 3.062 V5.125 A0.688 0.688 0 0 0 5.211 5.812 H6.58 V18.188 H5.211 A0.688 0.688 0 0 0 4.523 18.875 V20.938 A0.688 0.688 0 0 0 5.211 21.625 H14.205 C17.247 21.625 19.969 19.401 20.264 16.366 C20.467 14.284 19.559 12.41 18.08 11.227 Z M10.009 5.812 H13.78 A2.062 2.062 0 0 1 13.78 9.938 H10.009 Z M13.78 18.188 H10.009 V13.375 H13.78 A2.406 2.406 0 0 1 13.78 18.188 Z" stroke="currentColor" strokeWidth={0} strokeLinejoin="round" variants={{ rest: { strokeWidth: 0, scale: 1 }, weight: { strokeWidth: [0,0.4,0], scale: [1,0.95,1], transition: { strokeWidth: { duration: 0.3, times: [0,0.4,1], ease: ["easeOut", "easeInOut"] }, scale: { duration: 0.3, times: [0,0.45,1], ease: ["easeOut", "easeInOut"] } } }, heavy: { strokeWidth: [0,0,1,0.9,0.9], transition: { strokeWidth: { duration: 0.56, times: [0,0.1,0.55,0.72,1], ease: ["easeOut", "easeOut", "easeInOut", "linear"] } } }, "heavy-back": { strokeWidth: [0.9,0.9,1,0,0], transition: { strokeWidth: { duration: 0.56, times: [0,0.28,0.45,0.9,1], ease: ["linear", "easeInOut", "easeIn", "easeIn"] } } } }} style={{ transformBox: 'view-box', transformOrigin: '12px 12px' }} />
    <motion.path initial="rest" animate={playing} d="M18.08 11.227 A5.242 5.242 0 0 0 19.24 8.425 C19.557 5.146 16.984 2.375 13.78 2.375 H5.211 A0.688 0.688 0 0 0 4.523 3.062 V5.125 A0.688 0.688 0 0 0 5.211 5.812 H6.58 V18.188 H5.211 A0.688 0.688 0 0 0 4.523 18.875 V20.938 A0.688 0.688 0 0 0 5.211 21.625 H14.205 C17.247 21.625 19.969 19.401 20.264 16.366 C20.467 14.284 19.559 12.41 18.08 11.227 Z M10.009 5.812 H13.78 A2.062 2.062 0 0 1 13.78 9.938 H10.009 Z M13.78 18.188 H10.009 V13.375 H13.78 A2.406 2.406 0 0 1 13.78 18.188 Z" fill="#22c55e" stroke="#22c55e" strokeWidth={0} strokeLinejoin="round" variants={{ rest: { scale: 1, strokeWidth: 0, opacity: 0 }, weight: { scale: [1,0.95,1], transition: { scale: { duration: 0.3, times: [0,0.45,1], ease: ["easeOut", "easeInOut"] } } }, heavy: { strokeWidth: [0,0,1,0.9,0.9], opacity: [0,0,1,1], transition: { strokeWidth: { duration: 0.56, times: [0,0.1,0.55,0.72,1], ease: ["easeOut", "easeOut", "easeInOut", "linear"] }, opacity: { duration: 0.56, times: [0,0.25,0.55,1], ease: ["linear", "linear", "easeOut"] } } }, "heavy-back": { strokeWidth: [0.9,0.9,1,0,0], opacity: [1,1,0,0], transition: { strokeWidth: { duration: 0.56, times: [0,0.28,0.45,0.9,1], ease: ["linear", "easeInOut", "easeIn", "easeIn"] }, opacity: { duration: 0.56, times: [0,0.45,0.75,1], ease: ["easeIn", "linear", "linear"] } } } }} style={{ transformBox: 'view-box', transformOrigin: '12px 12px' }} />
    </motion.svg>
  );
}


