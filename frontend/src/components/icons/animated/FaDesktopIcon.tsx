'use client';

import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import type { SVGProps } from 'react';
import { useIconHost } from './useIconHost';

export interface FaDesktopIconProps extends Omit<SVGProps<SVGSVGElement>, 'ref'> {
  size?: number | string;
  className?: string;
}

export function FaDesktopIcon({ size = '1em', className, ...rest }: FaDesktopIconProps) {
  const [playing, setPlaying] = useState<string>("rest");
  const hostRef = useRef<SVGSVGElement>(null);
  const { hovered, tapped } = useIconHost(hostRef);
  useEffect(() => {
    setPlaying((now) => (hovered ? (now === "rest" ? "tap" : now) : now === "tap" ? "rest" : now));
  }, [hovered]);
  useEffect(() => {
    if (!tapped) return;
    setPlaying("knock");
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
    <motion.path initial="rest" animate={playing} d="M21.167 2.222 H2.833 C1.821 2.222 1 3.043 1 4.056 V16.278 C1 17.29 1.821 18.111 2.833 18.111 H10.167 L9.556 19.944 H6.806 C6.298 19.944 5.889 20.353 5.889 20.861 S6.298 21.778 6.806 21.778 H17.194 C17.702 21.778 18.111 21.369 18.111 20.861 S17.702 19.944 17.194 19.944 H14.444 L13.833 18.111 H21.167 C22.179 18.111 23 17.29 23 16.278 V4.056 C23 3.043 22.179 2.222 21.167 2.222 Z M20.556 15.667 H3.444 V4.667 H20.556 V15.667 Z" variants={{ rest: { x: 0, y: 0 }, tap: { x: [0,0,0], y: [0,1.972,0], transition: { x: { duration: 0.26, times: [0,0.4,1], ease: ["easeOut", "easeOut"] }, y: { duration: 0.26, times: [0,0.4,1], ease: ["easeOut", "easeOut"] } } }, knock: { x: [0,0,0,0,0], y: [0,-0.383,1.972,1.972,0], transition: { x: { duration: 0.56, times: [0,0.1,0.3,0.4842,1], ease: ["easeOut", "easeOut", "easeOut", "linear"] }, y: { duration: 0.56, times: [0,0.1,0.3,0.4842,1], ease: ["easeOut", "easeOut", "easeOut", "linear"] } } } }} style={{ transformBox: 'view-box', transformOrigin: '12px 12px' }} />
    </motion.svg>
  );
}


