'use client';

import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import type { SVGProps } from 'react';
import { useIconHost } from './useIconHost';

export interface FaSortAlphaUpIconProps extends Omit<SVGProps<SVGSVGElement>, 'ref'> {
  size?: number | string;
  className?: string;
}

export function FaSortAlphaUpIcon({ size = '1em', className, ...rest }: FaSortAlphaUpIconProps) {
  const [playing, setPlaying] = useState<string>("rest");
  const hostRef = useRef<SVGSVGElement>(null);
  const { hovered, tapped } = useIconHost(hostRef);
  useEffect(() => {
    setPlaying((now) => (hovered ? (now === "rest" ? "dip" : now) : now === "dip" ? "rest" : now));
  }, [hovered]);
  useEffect(() => {
    if (!tapped) return;
    setPlaying("sort");
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
    <motion.path initial="rest" animate={playing} d="M3.062 7.875 H5.125 V20.938 A0.688 0.688 0 0 0 5.812 21.625 H7.188 A0.688 0.688 0 0 0 7.875 20.938 V7.875 H9.938 C10.548 7.875 10.856 7.134 10.423 6.702 L6.986 2.577 A0.688 0.688 0 0 0 6.014 2.577 L2.577 6.702 C2.145 7.133 2.451 7.875 3.062 7.875 Z" variants={{ rest: { x: 0, y: 0 }, dip: { x: [0,0,0], y: [0,-2.125,0], transition: { x: { duration: 0.3, times: [0,0.4,1], ease: ["easeOut", "easeInOut"] }, y: { duration: 0.3, times: [0,0.4,1], ease: ["easeOut", "easeInOut"] } } }, sort: { x: [0,0,0,0,0], y: [0,0.797,-2.125,-2.125,0], transition: { x: { duration: 0.6, times: [0,0.1,0.34,0.68,1], ease: ["easeOut", "easeOut", "easeOut", "easeInOut"] }, y: { duration: 0.6, times: [0,0.1,0.34,0.68,1], ease: ["easeOut", "easeOut", "easeOut", "easeInOut"] } } } }} style={{ transformBox: 'view-box', transformOrigin: '6.5px 2.1px' }} />
    <path d="M20.25 13.375 H14.75 A0.688 0.688 0 0 0 14.062 14.062 V15.438 A0.688 0.688 0 0 0 14.75 16.125 H17.156 L14.524 19.152 A1.375 1.375 0 0 0 14.062 20.18 V20.938 A0.688 0.688 0 0 0 14.75 21.625 H20.25 A0.688 0.688 0 0 0 20.938 20.938 V19.562 A0.688 0.688 0 0 0 20.25 18.875 H17.844 L20.476 15.848 A1.375 1.375 0 0 0 20.938 14.82 V14.062 A0.688 0.688 0 0 0 20.25 13.375 Z" />
    <path d="M21.585 9.706 L19.038 2.831 A0.688 0.688 0 0 0 18.39 2.375 H16.61 A0.688 0.688 0 0 0 15.962 2.831 L13.415 9.706 A0.688 0.688 0 0 0 14.062 10.625 H15.129 A0.688 0.688 0 0 0 15.784 10.149 L15.974 9.594 H19.025 L19.214 10.149 A0.688 0.688 0 0 0 19.87 10.625 H20.938 A0.688 0.688 0 0 0 21.585 9.706 Z M16.796 7.188 L17.5 5.125 L18.204 7.188 Z" />
    </motion.svg>
  );
}


