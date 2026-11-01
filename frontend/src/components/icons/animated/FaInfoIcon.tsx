'use client';

import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import type { SVGProps } from 'react';
import { useIconHost } from './useIconHost';

export interface FaInfoIconProps extends Omit<SVGProps<SVGSVGElement>, 'ref'> {
  size?: number | string;
  className?: string;
}

export function FaInfoIcon({ size = '1em', className, ...rest }: FaInfoIconProps) {
  const [playing, setPlaying] = useState<string>("rest");
  const hostRef = useRef<SVGSVGElement>(null);
  const { hovered, tapped } = useIconHost(hostRef);
  useEffect(() => {
    setPlaying((now) => (hovered ? (now === "rest" ? "tap" : now) : now === "tap" ? "rest" : now));
  }, [hovered]);
  useEffect(() => {
    if (!tapped) return;
    setPlaying("say");
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
    <motion.path initial="rest" animate={playing} d="M8.734 19.229 H9.594 V13.021 H8.734 C8.26 13.021 7.875 12.637 7.875 12.162 V10.109 C7.875 9.635 8.26 9.25 8.734 9.25 H13.547 C14.022 9.25 14.406 9.635 14.406 10.109 V19.229 H15.266 C15.74 19.229 16.125 19.613 16.125 20.088 V22.141 C16.125 22.615 15.74 23 15.266 23 H8.734 C8.26 23 7.875 22.615 7.875 22.141 V20.088 C7.875 19.613 8.26 19.229 8.734 19.229 Z" variants={{ rest: { scale: 1, x: 0, y: 0 }, tap: { scale: [1,0.95,1], transition: { scale: { duration: 0.32, times: [0,0.45,1], ease: ["easeOut", "easeInOut"] } } }, say: { x: [0,0,0,0,0], y: [0,0,0.75,0,0], scale: [1,1.03,0.95,0.95,1], transition: { x: { duration: 0.56, times: [0,0.26,0.36,0.62,1], ease: [[0,0,1,1], "easeOut", "easeOut", "easeOut"] }, y: { duration: 0.56, times: [0,0.26,0.36,0.62,1], ease: [[0,0,1,1], "easeOut", "easeOut", "easeOut"] }, scale: { duration: 0.56, times: [0,0.1,0.38,0.66,1], ease: ["easeOut", "easeOut", "easeInOut", "easeInOut"] } } } }} style={{ transformBox: 'view-box', transformOrigin: '12px 12px' }} />
    <motion.path initial="rest" animate={playing} d="M12 1 C10.291 1 8.906 2.385 8.906 4.094 S10.291 7.188 12 7.188 S15.094 5.802 15.094 4.094 S13.709 1 12 1 Z" variants={{ rest: { x: 0, y: 0, scale: 1 }, tap: { x: [0,0,0], y: [0,0.75,0], scale: [1,0.95,1], transition: { x: { duration: 0.32, times: [0,0.4,1], ease: ["easeOut", "easeInOut"] }, y: { duration: 0.32, times: [0,0.4,1], ease: ["easeOut", "easeInOut"] }, scale: { duration: 0.32, times: [0,0.45,1], ease: ["easeOut", "easeInOut"] } } }, say: { x: [0,0,0,0,0,0], y: [0,-0.162,0.75,0.709,0.709,0], scale: [1,1.03,0.95,0.95,1], transition: { x: { duration: 0.56, times: [0,0.08,0.3,0.38,0.52,1], ease: ["easeOut", "easeIn", "easeOut", "linear", "easeInOut"] }, y: { duration: 0.56, times: [0,0.08,0.3,0.38,0.52,1], ease: ["easeOut", "easeIn", "easeOut", "linear", "easeInOut"] }, scale: { duration: 0.56, times: [0,0.1,0.38,0.66,1], ease: ["easeOut", "easeOut", "easeInOut", "easeInOut"] } } } }} style={{ transformBox: 'view-box', transformOrigin: '12px 12px' }} />
    </motion.svg>
  );
}


