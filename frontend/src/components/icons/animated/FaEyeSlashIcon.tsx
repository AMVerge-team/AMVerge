'use client';

import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import type { SVGProps } from 'react';
import { useIconHost } from './useIconHost';

export interface FaEyeSlashIconProps extends Omit<SVGProps<SVGSVGElement>, 'ref'> {
  size?: number | string;
  className?: string;
}

export function FaEyeSlashIcon({ size = '1em', className, ...rest }: FaEyeSlashIconProps) {
  const [playing, setPlaying] = useState<string>("rest");
  const hostRef = useRef<SVGSVGElement>(null);
  const { hovered, tapped } = useIconHost(hostRef);
  useEffect(() => {
    if (!hovered && !tapped) return;
    setPlaying("peek");
    const done = setTimeout(() => setPlaying('rest'), 340);
    return () => clearTimeout(done);
  }, [hovered, tapped]);
  return (
    <motion.svg
      ref={hostRef}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      {...(rest as object)}
      fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"
      initial="rest"
      animate={playing}
    >
    <path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z" opacity={0.55} />
    <circle cx={12} cy={12} r={3} fill="currentColor" stroke="none" opacity={0.55} />
    <motion.path
      d="M4 4l16 16"
      variants={{ rest: { pathLength: 1 }, peek: { pathLength: [1, 0.2, 1], transition: { duration: 0.32, ease: "easeInOut" } } }}
    />
    </motion.svg>
  );
}
