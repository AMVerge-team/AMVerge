'use client';

import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import type { SVGProps } from 'react';
import { useIconHost } from './useIconHost';

export interface MdKeyboardReturnIconProps extends Omit<SVGProps<SVGSVGElement>, 'ref'> {
  size?: number | string;
  className?: string;
}

export function MdKeyboardReturnIcon({ size = '1em', className, ...rest }: MdKeyboardReturnIconProps) {
  const [playing, setPlaying] = useState<string>("rest");
  const hostRef = useRef<SVGSVGElement>(null);
  const { hovered, tapped } = useIconHost(hostRef);
  useEffect(() => {
    setPlaying((now) => (hovered ? (now === "rest" ? "back" : now) : now === "back" ? "rest" : now));
  }, [hovered]);
  useEffect(() => {
    if (!tapped) return;
    setPlaying("enter");
    const done = setTimeout(() => setPlaying('rest'), 640);
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
    <motion.path initial="rest" animate={playing} d="M1 1 H23 V23 H1 Z" fill="none" stroke="currentColor" strokeWidth={1.83} variants={{ rest: { scale: 1 }, back: { scale: [1,1,0.95,1,1], transition: { scale: { duration: 0.3, times: [0,0.34,0.48,0.8,1], ease: ["linear", "easeOut", "easeOut", "easeOut"] } } }, enter: { scale: [1,1,0.95,0.95,1,1], transition: { scale: { duration: 0.6, times: [0,0.1,0.26,0.52,0.8,1], ease: ["linear", "easeOut", "linear", "easeOut", "easeOut"] } } } }} style={{ transformBox: 'view-box', transformOrigin: '12px 12px' }} />
    <motion.path initial="rest" animate={playing} d="M18.417 7.417 V11.083 H6.344 L9.626 7.792 L8.333 6.5 L2.833 12 L8.333 17.5 L9.626 16.207 L6.344 12.917 H20.25 V7.417 Z" variants={{ rest: { x: 0, y: 0 }, back: { x: [0,-2.583,0], y: [0,0,0], transition: { x: { duration: 0.3, times: [0,0.4,1], ease: ["easeOut", "easeInOut"] }, y: { duration: 0.3, times: [0,0.4,1], ease: ["easeOut", "easeInOut"] } } }, enter: { x: [0,0.904,-2.583,-2.583,0], y: [0,0,0,0,0], transition: { x: { duration: 0.6, times: [0,0.1,0.3,0.55,1], ease: ["easeOut", "easeOut", "linear", "easeOut"] }, y: { duration: 0.6, times: [0,0.1,0.3,0.55,1], ease: ["easeOut", "easeOut", "linear", "easeOut"] } } } }} style={{ transformBox: 'view-box', transformOrigin: '12px 12px' }} />
    </motion.svg>
  );
}


