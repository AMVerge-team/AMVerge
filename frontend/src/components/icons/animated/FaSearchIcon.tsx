'use client';

import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import type { SVGProps } from 'react';
import { useIconHost } from './useIconHost';

export interface FaSearchIconProps extends Omit<SVGProps<SVGSVGElement>, 'ref'> {
  size?: number | string;
  className?: string;
}

export function FaSearchIcon({ size = '1em', className, ...rest }: FaSearchIconProps) {
  const [playing, setPlaying] = useState<string>("rest");
  const hostRef = useRef<SVGSVGElement>(null);
  const { hovered, tapped } = useIconHost(hostRef);
  useEffect(() => {
    setPlaying((now) => (hovered ? (now === "rest" ? "tilt" : now) : now === "tilt" ? "rest" : now));
  }, [hovered]);
  useEffect(() => {
    if (!tapped) return;
    setPlaying("sweep");
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
    <g>
      <motion.path initial="rest" animate={playing} d="M22.699 20.022 L18.415 15.738 C18.222 15.545 17.96 15.438 17.685 15.438 H16.984 C18.17 13.921 18.875 12.013 18.875 9.938 C18.875 5 14.875 1 9.938 1 S1 5 1 9.938 S5 18.875 9.938 18.875 C12.013 18.875 13.921 18.17 15.438 16.984 V17.685 C15.438 17.96 15.545 18.222 15.738 18.415 L20.022 22.699 C20.426 23.103 21.079 23.103 21.479 22.699 L22.695 21.483 C23.099 21.079 23.099 20.426 22.699 20.022 Z M9.938 15.438 C6.9 15.438 4.438 12.98 4.438 9.938 C4.438 6.9 6.895 4.438 9.938 4.438 C12.975 4.438 15.438 6.895 15.438 9.938 C15.438 12.975 12.98 15.438 9.938 15.438 Z" variants={{ rest: { rotate: 0 }, tilt: { rotate: [0,-10.64,0], transition: { rotate: { duration: 0.3, times: [0,0.4,1], ease: ["easeOut", "easeInOut"] } } }, sweep: { rotate: [0,4.86,-16.2,9.72,0], transition: { rotate: { duration: 0.6, times: [0,0.12,0.38,0.64,1], ease: ["easeOut", "easeInOut", "easeInOut", "easeInOut"] } } } }} style={{ transformBox: 'view-box', transformOrigin: '12px 12px' }} />
    </g>
    </motion.svg>
  );
}


