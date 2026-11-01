'use client';

import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import type { SVGProps } from 'react';
import { useIconHost } from './useIconHost';

export interface FaArrowsAltHIconProps extends Omit<SVGProps<SVGSVGElement>, 'ref'> {
  size?: number | string;
  className?: string;
}

export function FaArrowsAltHIcon({ size = '1em', className, ...rest }: FaArrowsAltHIconProps) {
  const [playing, setPlaying] = useState<string>("rest");
  const hostRef = useRef<SVGSVGElement>(null);
  const { hovered, tapped } = useIconHost(hostRef);
  useEffect(() => {
    setPlaying((now) => (hovered ? (now === "rest" ? "pinch" : now) : now === "pinch" ? "rest" : now));
  }, [hovered]);
  useEffect(() => {
    if (!tapped) return;
    setPlaying("flip");
    const done = setTimeout(() => setPlaying('rest'), 600);
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
    <motion.path initial="rest" animate={playing} d="M13.5 10.281 H6.76 V8.302 C6.76 7.383 5.65 6.923 5 7.573 L1.302 11.271 C0.899 11.674 0.899 12.326 1.302 12.729 L5 16.427 C5.65 17.077 6.76 16.617 6.76 15.698 V13.719 H13.5 Z" variants={{ rest: { x: 0, y: 0, scale: 1 }, pinch: { x: [0,0.649,0], y: [0,0,0], scale: [1,0.95,1], transition: { x: { duration: 0.3, times: [0,0.4,1], ease: ["easeOut", "easeInOut"] }, y: { duration: 0.3, times: [0,0.4,1], ease: ["easeOut", "easeInOut"] }, scale: { duration: 0.3, times: [0,0.45,1], ease: ["easeOut", "easeInOut"] } } }, flip: { x: [0,0.649,0.649,0], y: [0,0,0,0], scale: [1,1.03,0.95,0.95,1], transition: { x: { duration: 0.56, times: [0,0.3,0.55,1], ease: ["easeOut", "linear", "easeOut"] }, y: { duration: 0.56, times: [0,0.3,0.55,1], ease: ["easeOut", "linear", "easeOut"] }, scale: { duration: 0.56, times: [0,0.1,0.38,0.66,1], ease: ["easeOut", "easeOut", "easeInOut", "easeInOut"] } } } }} style={{ transformBox: 'view-box', transformOrigin: '12px 12px' }} />
    <motion.path initial="rest" animate={playing} d="M10.5 13.719 H17.24 V15.698 C17.24 16.617 18.35 17.077 19 16.427 L22.698 12.729 C23.101 12.326 23.101 11.674 22.698 11.271 L19 7.573 C18.35 6.923 17.24 7.383 17.24 8.302 V10.281 H10.5 Z" variants={{ rest: { x: 0, y: 0, scale: 1 }, pinch: { x: [0,-0.649,0], y: [0,0,0], scale: [1,0.95,1], transition: { x: { duration: 0.3, times: [0,0.4,1], ease: ["easeOut", "easeInOut"] }, y: { duration: 0.3, times: [0,0.4,1], ease: ["easeOut", "easeInOut"] }, scale: { duration: 0.3, times: [0,0.45,1], ease: ["easeOut", "easeInOut"] } } }, flip: { x: [0,-0.649,-0.649,0], y: [0,0,0,0], scale: [1,1.03,0.95,0.95,1], transition: { x: { duration: 0.56, times: [0,0.3,0.55,1], ease: ["easeOut", "linear", "easeOut"] }, y: { duration: 0.56, times: [0,0.3,0.55,1], ease: ["easeOut", "linear", "easeOut"] }, scale: { duration: 0.56, times: [0,0.1,0.38,0.66,1], ease: ["easeOut", "easeOut", "easeInOut", "easeInOut"] } } } }} style={{ transformBox: 'view-box', transformOrigin: '12px 12px' }} />
    </motion.svg>
  );
}


