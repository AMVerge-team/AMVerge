'use client';

import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import type { SVGProps } from 'react';
import { useIconHost } from './useIconHost';

export interface FaFolderPlusIconProps extends Omit<SVGProps<SVGSVGElement>, 'ref'> {
  size?: number | string;
  className?: string;
}

export function FaFolderPlusIcon({ size = '1em', className, ...rest }: FaFolderPlusIconProps) {
  const [playing, setPlaying] = useState<string>("rest");
  const hostRef = useRef<SVGSVGElement>(null);
  const { hovered, tapped } = useIconHost(hostRef);
  useEffect(() => {
    setPlaying((now) => (hovered ? (now === "rest" ? "lift" : now) : now === "lift" ? "rest" : now));
  }, [hovered]);
  useEffect(() => {
    if (!tapped) return;
    setPlaying("pull");
    const done = setTimeout(() => setPlaying('rest'), 720);
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
    <motion.path initial="rest" animate={playing} d="M20.938 6.5 H12.688 L9.938 3.75 H3.062 A2.062 2.062 0 0 0 1 5.812 V18.188 A2.062 2.062 0 0 0 3.062 20.25 H20.938 A2.062 2.062 0 0 0 23 18.188 V8.562 A2.062 2.062 0 0 0 20.938 6.5 Z M16.447 13.719 A0.688 0.688 0 0 1 15.76 14.406 H13.01 V17.156 A0.688 0.688 0 0 1 12.322 17.844 H11.635 A0.688 0.688 0 0 1 10.947 17.156 V14.406 H8.197 A0.688 0.688 0 0 1 7.51 13.719 V13.031 A0.688 0.688 0 0 1 8.197 12.344 H10.947 V9.594 A0.688 0.688 0 0 1 11.635 8.906 H12.322 A0.688 0.688 0 0 1 13.01 9.594 V12.344 H15.76 A0.688 0.688 0 0 1 16.447 13.031 Z" variants={{ rest: { x: 0, y: 0 }, lift: { x: [0,0,0], y: [0,-2.914,0], transition: { x: { duration: 0.3, times: [0,0.4,1], ease: ["easeOut", "easeInOut"] }, y: { duration: 0.3, times: [0,0.4,1], ease: ["easeOut", "easeInOut"] } } }, pull: { x: [0,0,0,0,0,0], y: [0,-3.5,-3.5,0.557,-0.191,0], transition: { x: { duration: 0.68, times: [0,0.3,0.4465,0.6907,0.8535,1], ease: ["easeOut", "easeOut", "easeIn", "easeOut", "easeInOut"] }, y: { duration: 0.68, times: [0,0.3,0.4465,0.6907,0.8535,1], ease: ["easeOut", "easeOut", "easeIn", "easeOut", "easeInOut"] } } } }} style={{ transformBox: 'view-box', originX: '3.062px', originY: '3.75px' }} />
    </motion.svg>
  );
}


