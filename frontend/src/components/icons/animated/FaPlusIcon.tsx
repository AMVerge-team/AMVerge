'use client';

import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import type { SVGProps } from 'react';
import { useIconHost } from './useIconHost';

export interface FaPlusIconProps extends Omit<SVGProps<SVGSVGElement>, 'ref'> {
  size?: number | string;
  className?: string;
}

export function FaPlusIcon({ size = '1em', className, ...rest }: FaPlusIconProps) {
  const [playing, setPlaying] = useState<string>("rest");
  const hostRef = useRef<SVGSVGElement>(null);
  const { hovered, tapped } = useIconHost(hostRef);
  useEffect(() => {
    setPlaying((now) => (hovered ? (now === "rest" ? "cock" : now) : now === "cock" ? "rest" : now));
  }, [hovered]);
  useEffect(() => {
    if (!tapped) return;
    setPlaying("add");
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
    <motion.g initial="rest" animate={playing} variants={{ rest: { x: 0, y: 0 }, cock: { x: [0,-2.125,0], y: [0,0,0], transition: { x: { duration: 0.3, times: [0,0.4,1], ease: ["easeOut", "easeInOut"] }, y: { duration: 0.3, times: [0,0.4,1], ease: ["easeOut", "easeInOut"] } } }, add: { x: [0,-2.125,-2.125,0], y: [0,0,0,0], transition: { x: { duration: 0.56, times: [0,0.3,0.6,1], ease: ["easeOut", "linear", "easeOut"] }, y: { duration: 0.56, times: [0,0.3,0.6,1], ease: ["easeOut", "linear", "easeOut"] } } } }} style={{ transformBox: 'view-box', originX: '12px', originY: '12px' }}>
      <rect x={2.375} y={9.938} width={11.687} height={4.125} rx={1.375} />
    </motion.g>
    <motion.g initial="rest" animate={playing} variants={{ rest: { x: 0, y: 0 }, cock: { x: [0,2.125,0], y: [0,0,0], transition: { x: { duration: 0.3, times: [0,0.4,1], ease: ["easeOut", "easeInOut"] }, y: { duration: 0.3, times: [0,0.4,1], ease: ["easeOut", "easeInOut"] } } }, add: { x: [0,2.125,2.125,0], y: [0,0,0,0], transition: { x: { duration: 0.56, times: [0,0.3,0.6,1], ease: ["easeOut", "linear", "easeOut"] }, y: { duration: 0.56, times: [0,0.3,0.6,1], ease: ["easeOut", "linear", "easeOut"] } } } }} style={{ transformBox: 'view-box', originX: '12px', originY: '12px' }}>
      <rect x={9.938} y={9.938} width={11.687} height={4.125} rx={1.375} />
    </motion.g>
    <motion.g initial="rest" animate={playing} variants={{ rest: { x: 0, y: 0 }, cock: { x: [0,0,0], y: [0,-2.125,0], transition: { x: { duration: 0.3, times: [0,0.4,1], ease: ["easeOut", "easeInOut"] }, y: { duration: 0.3, times: [0,0.4,1], ease: ["easeOut", "easeInOut"] } } }, add: { x: [0,0,0,0], y: [0,-2.125,-2.125,0], transition: { x: { duration: 0.56, times: [0,0.3,0.6,1], ease: ["easeOut", "linear", "easeOut"] }, y: { duration: 0.56, times: [0,0.3,0.6,1], ease: ["easeOut", "linear", "easeOut"] } } } }} style={{ transformBox: 'view-box', originX: '12px', originY: '12px' }}>
      <rect x={9.938} y={2.375} width={4.125} height={11.687} rx={1.375} />
    </motion.g>
    <motion.g initial="rest" animate={playing} variants={{ rest: { x: 0, y: 0 }, cock: { x: [0,0,0], y: [0,2.125,0], transition: { x: { duration: 0.3, times: [0,0.4,1], ease: ["easeOut", "easeInOut"] }, y: { duration: 0.3, times: [0,0.4,1], ease: ["easeOut", "easeInOut"] } } }, add: { x: [0,0,0,0], y: [0,2.125,2.125,0], transition: { x: { duration: 0.56, times: [0,0.3,0.6,1], ease: ["easeOut", "linear", "easeOut"] }, y: { duration: 0.56, times: [0,0.3,0.6,1], ease: ["easeOut", "linear", "easeOut"] } } } }} style={{ transformBox: 'view-box', originX: '12px', originY: '12px' }}>
      <rect x={9.938} y={9.938} width={4.125} height={11.687} rx={1.375} />
    </motion.g>
    </motion.svg>
  );
}


