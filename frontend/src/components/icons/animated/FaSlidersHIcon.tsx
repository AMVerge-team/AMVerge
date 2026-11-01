'use client';

import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import type { SVGProps } from 'react';
import { useIconHost } from './useIconHost';

export interface FaSlidersHIconProps extends Omit<SVGProps<SVGSVGElement>, 'ref'> {
  size?: number | string;
  className?: string;
}

export function FaSlidersHIcon({ size = '1em', className, ...rest }: FaSlidersHIconProps) {
  const [playing, setPlaying] = useState<string>("rest");
  const hostRef = useRef<SVGSVGElement>(null);
  const { hovered, tapped } = useIconHost(hostRef);
  useEffect(() => {
    setPlaying((now) => (hovered ? (now === "rest" ? "touch" : now) : now === "touch" ? "rest" : now));
  }, [hovered]);
  useEffect(() => {
    if (!tapped) return;
    setPlaying("set");
    const done = setTimeout(() => setPlaying('rest'), 760);
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
    <rect x={1} y={17.5} width={22} height={2.75} rx={0.688} />
    <rect x={1} y={10.625} width={22} height={2.75} rx={0.688} />
    <rect x={1} y={3.75} width={22} height={2.75} rx={0.688} />
    <motion.rect initial="rest" animate={playing} x={5.125} y={16.125} width={2.75} height={5.5} rx={0.688} variants={{ rest: { x: 0, y: 0 }, touch: { x: 0, y: 0 }, set: { x: [0,0,-0.662,3.972,3.972,0], y: [0,0,0,0,0,0], transition: { x: { duration: 0.72, times: [0,0.24,0.32,0.54,0.82,1], ease: [[0,0,1,1], "easeOut", "easeOut", "easeInOut", "easeInOut"] }, y: { duration: 0.72, times: [0,0.24,0.32,0.54,0.82,1], ease: [[0,0,1,1], "easeOut", "easeOut", "easeInOut", "easeInOut"] } } } }} style={{ transformBox: 'view-box', transformOrigin: '12px 12px' }} />
    <motion.rect initial="rest" animate={playing} x={16.125} y={9.25} width={2.75} height={5.5} rx={0.688} variants={{ rest: { x: 0, y: 0 }, touch: { x: 0, y: 0 }, set: { x: [0,0,0.662,-4.8,-4.8,0], y: [0,0,0,0,0,0], transition: { x: { duration: 0.72, times: [0,0.12,0.2,0.42,0.72,1], ease: [[0,0,1,1], "easeOut", "easeOut", "easeInOut", "easeInOut"] }, y: { duration: 0.72, times: [0,0.12,0.2,0.42,0.72,1], ease: [[0,0,1,1], "easeOut", "easeOut", "easeInOut", "easeInOut"] } } } }} style={{ transformBox: 'view-box', transformOrigin: '12px 12px' }} />
    <motion.rect initial="rest" animate={playing} x={10.625} y={2.375} width={2.75} height={5.5} rx={0.688} variants={{ rest: { x: 0, y: 0 }, touch: { x: [0,2.914,0], y: [0,0,0], transition: { x: { duration: 0.3, times: [0,0.45,1], ease: ["easeOut", "easeInOut"] }, y: { duration: 0.3, times: [0,0.45,1], ease: ["easeOut", "easeInOut"] } } }, set: { x: [0,-0.662,4.8,4.8,0], y: [0,0,0,0,0], transition: { x: { duration: 0.72, times: [0,0.08,0.3,0.62,1], ease: ["easeOut", "easeOut", "easeInOut", "easeInOut"] }, y: { duration: 0.72, times: [0,0.08,0.3,0.62,1], ease: ["easeOut", "easeOut", "easeInOut", "easeInOut"] } } } }} style={{ transformBox: 'view-box', transformOrigin: '12px 12px' }} />
    </motion.svg>
  );
}


