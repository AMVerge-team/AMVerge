'use client';

import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import type { SVGProps } from 'react';
import { useIconHost } from './useIconHost';

export interface FaWrenchIconProps extends Omit<SVGProps<SVGSVGElement>, 'ref'> {
  size?: number | string;
  className?: string;
}

export function FaWrenchIcon({ size = '1em', className, ...rest }: FaWrenchIconProps) {
  const [playing, setPlaying] = useState<string>("rest");
  const hostRef = useRef<SVGSVGElement>(null);
  const { hovered, tapped } = useIconHost(hostRef);
  useEffect(() => {
    setPlaying((now) => (hovered ? (now === "rest" ? "nod" : now) : now === "nod" ? "rest" : now));
  }, [hovered]);
  useEffect(() => {
    if (!tapped) return;
    setPlaying("press");
    const done = setTimeout(() => setPlaying('rest'), 580);
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
    <motion.path initial="rest" animate={playing} d="M22.817 5.688 C22.72 5.3 22.235 5.168 21.952 5.451 L18.757 8.646 L15.84 8.16 L15.354 5.244 L18.549 2.048 C18.834 1.764 18.697 1.279 18.306 1.182 C16.27 0.678 14.029 1.221 12.437 2.812 C10.734 4.515 10.265 6.984 10.974 9.137 L1.805 18.306 C0.731 19.38 0.731 21.121 1.805 22.195 C2.879 23.269 4.62 23.269 5.694 22.195 L14.855 13.033 C17.009 13.751 19.473 13.277 21.188 11.563 C22.78 9.97 23.323 7.725 22.817 5.688 Z M3.75 21.281 C3.181 21.281 2.719 20.819 2.719 20.25 C2.719 19.68 3.181 19.219 3.75 19.219 S4.781 19.68 4.781 20.25 C4.781 20.819 4.319 21.281 3.75 21.281 Z" variants={{ rest: { x: 0, y: 0, scale: 1 }, nod: { x: [0,0,0], y: [0,0.428,0], scale: [1,0.95,1], transition: { x: { duration: 0.26, times: [0,0.4,1], ease: ["easeOut", "easeOut"] }, y: { duration: 0.26, times: [0,0.4,1], ease: ["easeOut", "easeOut"] }, scale: { duration: 0.26, times: [0,0.45,1], ease: ["easeOut", "easeInOut"] } } }, press: { x: [0,0,0,0,0,0], y: [0,-0.068,0.428,0.394,0.394,0], scale: [1,1.03,0.95,0.95,1], transition: { x: { duration: 0.54, times: [0,0.1,0.3,0.4,0.72,1], ease: ["easeOut", "easeOut", "easeOut", "easeInOut", "linear"] }, y: { duration: 0.54, times: [0,0.1,0.3,0.4,0.72,1], ease: ["easeOut", "easeOut", "easeOut", "easeInOut", "linear"] }, scale: { duration: 0.54, times: [0,0.1,0.38,0.66,1], ease: ["easeOut", "easeOut", "easeInOut", "easeInOut"] } } } }} style={{ transformBox: 'view-box', originX: '17.3px', originY: '6.9px' }} />
    </motion.svg>
  );
}


