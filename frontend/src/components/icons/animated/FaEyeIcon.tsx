'use client';

import { motion, type Variants } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import type { SVGProps } from 'react';
import { useIconHost } from './useIconHost';

export interface FaEyeIconProps extends Omit<SVGProps<SVGSVGElement>, 'ref'> {
  size?: number | string;
  className?: string;
}

const BLINK: Variants = {
  rest: { scaleY: 1 },
  blink: { scaleY: [1, 0.12, 1], transition: { duration: 0.32, times: [0, 0.45, 1], ease: ["easeIn", "easeOut"] } },
};

export function FaEyeIcon({ size = '1em', className, ...rest }: FaEyeIconProps) {
  const [playing, setPlaying] = useState<string>("rest");
  const hostRef = useRef<SVGSVGElement>(null);
  const { hovered, tapped } = useIconHost(hostRef);
  useEffect(() => {
    if (!hovered && !tapped) return;
    setPlaying("blink");
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
    <motion.g variants={BLINK} style={{ transformBox: 'view-box', originX: '12px', originY: '12px' }}>
      <path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z" />
      <circle cx={12} cy={12} r={3} fill="currentColor" stroke="none" />
    </motion.g>
    </motion.svg>
  );
}
