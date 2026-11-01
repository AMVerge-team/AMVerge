'use client';

import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import type { SVGProps } from 'react';
import { useIconHost } from './useIconHost';

export interface FaArrowsAltVIconProps extends Omit<SVGProps<SVGSVGElement>, 'ref'> {
  size?: number | string;
  className?: string;
}

export function FaArrowsAltVIcon({ size = '1em', className, ...rest }: FaArrowsAltVIconProps) {
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
    <motion.path initial="rest" animate={playing} d="M13.719 13.5 V6.76 H15.698 C16.617 6.76 17.077 5.65 16.427 5 L12.729 1.302 C12.326 0.899 11.674 0.899 11.271 1.302 L7.573 5 C6.923 5.65 7.383 6.76 8.302 6.76 H10.281 V13.5 Z" variants={{ rest: { x: 0, y: 0, scale: 1 }, pinch: { x: [0,0,0], y: [0,0.649,0], scale: [1,0.95,1], transition: { x: { duration: 0.3, times: [0,0.4,1], ease: ["easeOut", "easeInOut"] }, y: { duration: 0.3, times: [0,0.4,1], ease: ["easeOut", "easeInOut"] }, scale: { duration: 0.3, times: [0,0.45,1], ease: ["easeOut", "easeInOut"] } } }, flip: { x: [0,0,0,0], y: [0,0.649,0.649,0], scale: [1,1.03,0.95,0.95,1], transition: { x: { duration: 0.56, times: [0,0.3,0.55,1], ease: ["easeOut", "linear", "easeOut"] }, y: { duration: 0.56, times: [0,0.3,0.55,1], ease: ["easeOut", "linear", "easeOut"] }, scale: { duration: 0.56, times: [0,0.1,0.38,0.66,1], ease: ["easeOut", "easeOut", "easeInOut", "easeInOut"] } } } }} style={{ transformBox: 'view-box', transformOrigin: '12px 12px' }} />
    <motion.path initial="rest" animate={playing} d="M10.281 10.5 V17.24 H8.302 C7.383 17.24 6.923 18.35 7.573 19 L11.271 22.698 C11.674 23.101 12.326 23.101 12.729 22.698 L16.427 19 C17.077 18.35 16.617 17.24 15.698 17.24 H13.719 V10.5 Z" variants={{ rest: { x: 0, y: 0, scale: 1 }, pinch: { x: [0,0,0], y: [0,-0.649,0], scale: [1,0.95,1], transition: { x: { duration: 0.3, times: [0,0.4,1], ease: ["easeOut", "easeInOut"] }, y: { duration: 0.3, times: [0,0.4,1], ease: ["easeOut", "easeInOut"] }, scale: { duration: 0.3, times: [0,0.45,1], ease: ["easeOut", "easeInOut"] } } }, flip: { x: [0,0,0,0], y: [0,-0.649,-0.649,0], scale: [1,1.03,0.95,0.95,1], transition: { x: { duration: 0.56, times: [0,0.3,0.55,1], ease: ["easeOut", "linear", "easeOut"] }, y: { duration: 0.56, times: [0,0.3,0.55,1], ease: ["easeOut", "linear", "easeOut"] }, scale: { duration: 0.56, times: [0,0.1,0.38,0.66,1], ease: ["easeOut", "easeOut", "easeInOut", "easeInOut"] } } } }} style={{ transformBox: 'view-box', transformOrigin: '12px 12px' }} />
    </motion.svg>
  );
}


