'use client';

import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import type { SVGProps } from 'react';
import { useIconHost } from './useIconHost';

export interface FaFileExportIconProps extends Omit<SVGProps<SVGSVGElement>, 'ref'> {
  size?: number | string;
  className?: string;
}

export function FaFileExportIcon({ size = '1em', className, ...rest }: FaFileExportIconProps) {
  const [playing, setPlaying] = useState<string>("rest");
  const hostRef = useRef<SVGSVGElement>(null);
  const { hovered, tapped } = useIconHost(hostRef);
  useEffect(() => {
    setPlaying((now) => (hovered ? (now === "rest" ? "push" : now) : now === "push" ? "rest" : now));
  }, [hovered]);
  useEffect(() => {
    if (!tapped) return;
    setPlaying("send");
    const done = setTimeout(() => setPlaying('rest'), 700);
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
    <motion.path initial="rest" animate={playing} d="M15.667 6.878 C15.667 6.637 15.571 6.405 15.399 6.233 L11.66 2.49 C11.488 2.318 11.255 2.222 11.011 2.222 H10.778 V7.111 H15.667 Z" variants={{ rest: { scale: 1, x: 0, y: 0 }, push: { scale: [1,0.95,1], transition: { scale: { duration: 0.32, times: [0,0.45,1], ease: ["easeOut", "easeInOut"] } } }, send: { x: [0,0,-0.75,0,0], y: [0,0,0,0,0], transition: { x: { duration: 0.66, times: [0,0.1,0.26,0.6,1], ease: [[0,0,1,1], "easeOut", "easeInOut", "easeOut"] }, y: { duration: 0.66, times: [0,0.1,0.26,0.6,1], ease: [[0,0,1,1], "easeOut", "easeInOut", "easeOut"] } } } }} style={{ transformBox: 'view-box', originX: '12px', originY: '12px' }} />
    <motion.path initial="rest" animate={playing} d="M22.809 13.986 L19.154 10.304 C18.768 9.918 18.107 10.19 18.107 10.736 V13.222 H15.663 V15.667 H18.107 V18.157 C18.107 18.703 18.768 18.974 19.154 18.589 L22.809 14.903 C23.061 14.651 23.061 14.238 22.809 13.986 Z" variants={{ rest: { x: 0, y: 0, scale: 1 }, push: { x: [0,0.33,0], y: [0,0,0], scale: [1,0.95,1], transition: { x: { duration: 0.32, times: [0,0.45,1], ease: ["easeOut", "easeInOut"] }, y: { duration: 0.32, times: [0,0.45,1], ease: ["easeOut", "easeInOut"] }, scale: { duration: 0.32, times: [0,0.45,1], ease: ["easeOut", "easeInOut"] } } }, send: { x: [0,-0.1925,0.55,0.55,0], y: [0,0,0,0,0], scale: [1,1.04,0.82,0.82,1], transition: { x: { duration: 0.66, times: [0,0.1,0.42,0.68,1], ease: ["easeOut", "easeOut", "easeInOut", "easeInOut"] }, y: { duration: 0.66, times: [0,0.1,0.42,0.68,1], ease: ["easeOut", "easeOut", "easeInOut", "easeInOut"] }, scale: { duration: 0.66, times: [0,0.1,0.42,0.68,1], ease: ["easeOut", "easeOut", "easeInOut", "easeInOut"] } } } }} style={{ transformBox: 'view-box', originX: '23.1px', originY: '14.4px' }} />
    <motion.path initial="rest" animate={playing} d="M8.333 15.056 V13.833 C8.333 13.497 8.608 13.222 8.944 13.222 H15.667 V8.333 H10.472 C9.968 8.333 9.556 7.921 9.556 7.417 V2.222 H1.917 C1.409 2.222 1 2.631 1 3.139 V20.861 C1 21.369 1.409 21.778 1.917 21.778 H14.75 C15.258 21.778 15.667 21.369 15.667 20.861 V15.667 H8.944 C8.608 15.667 8.333 15.392 8.333 15.056 Z" variants={{ rest: { scale: 1, x: 0, y: 0 }, push: { scale: [1,0.95,1], transition: { scale: { duration: 0.32, times: [0,0.45,1], ease: ["easeOut", "easeInOut"] } } }, send: { x: [0,0,-0.75,0,0], y: [0,0,0,0,0], transition: { x: { duration: 0.66, times: [0,0.1,0.26,0.6,1], ease: [[0,0,1,1], "easeOut", "easeInOut", "easeOut"] }, y: { duration: 0.66, times: [0,0.1,0.26,0.6,1], ease: [[0,0,1,1], "easeOut", "easeInOut", "easeOut"] } } } }} style={{ transformBox: 'view-box', originX: '12px', originY: '12px' }} />
    </motion.svg>
  );
}


