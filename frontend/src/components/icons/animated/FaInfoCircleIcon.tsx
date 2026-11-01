'use client';

import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import type { SVGProps } from 'react';
import { useIconHost } from './useIconHost';

export interface FaInfoCircleIconProps extends Omit<SVGProps<SVGSVGElement>, 'ref'> {
  size?: number | string;
  className?: string;
}

export function FaInfoCircleIcon({ size = '1em', className, ...rest }: FaInfoCircleIconProps) {
  const [playing, setPlaying] = useState<string>("rest");
  const hostRef = useRef<SVGSVGElement>(null);
  const { hovered, tapped } = useIconHost(hostRef);
  useEffect(() => {
    setPlaying((now) => (hovered ? (now === "rest" ? "dip" : now) : now === "dip" ? "rest" : now));
  }, [hovered]);
  useEffect(() => {
    if (!tapped) return;
    setPlaying("press");
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
    <motion.path initial="rest" animate={playing} d="M12 1.344 C6.115 1.344 1.344 6.117 1.344 12 C1.344 17.887 6.115 22.656 12 22.656 S22.656 17.887 22.656 12 C22.656 6.117 17.885 1.344 12 1.344 Z M12 6.07 C12.997 6.07 13.805 6.878 13.805 7.875 S12.997 9.68 12 9.68 S10.195 8.872 10.195 7.875 S11.003 6.07 12 6.07 Z M14.406 16.984 C14.406 17.269 14.175 17.5 13.891 17.5 H10.109 C9.825 17.5 9.594 17.269 9.594 16.984 V15.953 C9.594 15.668 9.825 15.438 10.109 15.438 H10.625 V12.688 H10.109 C9.825 12.688 9.594 12.457 9.594 12.172 V11.141 C9.594 10.856 9.825 10.625 10.109 10.625 H12.859 C13.144 10.625 13.375 10.856 13.375 11.141 V15.438 H13.891 C14.175 15.438 14.406 15.668 14.406 15.953 V16.984 Z" variants={{ rest: { x: 0, y: 0, scale: 1 }, dip: { x: [0,0,0], y: [0,1.094,0], scale: [1,0.95,1], transition: { x: { duration: 0.3, times: [0,0.4,1], ease: ["easeOut", "easeInOut"] }, y: { duration: 0.3, times: [0,0.4,1], ease: ["easeOut", "easeInOut"] }, scale: { duration: 0.3, times: [0,0.45,1], ease: ["easeOut", "easeInOut"] } } }, press: { x: [0,0,0,0,0], y: [0,-0.168,1.094,1.094,0], scale: [1,1.03,0.95,0.95,1], transition: { x: { duration: 0.56, times: [0,0.1,0.32,0.6,1], ease: ["easeOut", "easeOut", "linear", "easeInOut"] }, y: { duration: 0.56, times: [0,0.1,0.32,0.6,1], ease: ["easeOut", "easeOut", "linear", "easeInOut"] }, scale: { duration: 0.56, times: [0,0.1,0.38,0.66,1], ease: ["easeOut", "easeOut", "easeInOut", "easeInOut"] } } } }} style={{ transformBox: 'view-box', transformOrigin: '12px 12px' }} />
    </motion.svg>
  );
}


