'use client';

import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import type { SVGProps } from 'react';
import { useIconHost } from './useIconHost';

export interface FaKeyboardIconProps extends Omit<SVGProps<SVGSVGElement>, 'ref'> {
  size?: number | string;
  className?: string;
}

export function FaKeyboardIcon({ size = '1em', className, ...rest }: FaKeyboardIconProps) {
  const [playing, setPlaying] = useState<string>("rest");
  const hostRef = useRef<SVGSVGElement>(null);
  const { hovered, tapped } = useIconHost(hostRef);
  useEffect(() => {
    setPlaying((now) => (hovered ? (now === "rest" ? "tap" : now) : now === "tap" ? "rest" : now));
  }, [hovered]);
  useEffect(() => {
    if (!tapped) return;
    setPlaying("type");
    const done = setTimeout(() => setPlaying('rest'), 680);
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
    <motion.g initial="rest" animate={playing} variants={{ rest: { x: 0, y: 0 }, tap: { x: [0,0,0,0], y: [0,2.56,0,0], transition: { x: { duration: 0.26, times: [0,0.28,0.66,1], ease: [(p) => (p < 1 ? 0 : 1), "easeOut", "easeOut"] }, y: { duration: 0.26, times: [0,0.28,0.66,1], ease: [(p) => (p < 1 ? 0 : 1), "easeOut", "easeOut"] } } }, type: { x: [0,0,0,0,0,0,0,0], y: [0,3.6,0,3.6,0,3.6,0,0], transition: { x: { duration: 0.64, times: [0,0.3,0.414,0.5116,0.6256,0.7395,0.886,1], ease: [(p) => (p < 1 ? 0 : 1), "easeOut", "easeOut", "easeOut", "easeOut", "easeOut", "easeOut"] }, y: { duration: 0.64, times: [0,0.3,0.414,0.5116,0.6256,0.7395,0.886,1], ease: [(p) => (p < 1 ? 0 : 1), "easeOut", "easeOut", "easeOut", "easeOut", "easeOut", "easeOut"] } } } }} style={{ transformBox: 'view-box', transformOrigin: '12px 12px' }}>
      <path d="M21.167 19.333 H2.833 C1.821 19.333 1 18.513 1 17.5 V6.5 C1 5.487 1.821 4.667 2.833 4.667 H21.167 C22.179 4.667 23 5.487 23 6.5 V17.5 C23 18.513 22.179 19.333 21.167 19.333 Z M5.889 9.097 V7.569 C5.889 7.316 5.684 7.111 5.431 7.111 H3.903 C3.65 7.111 3.444 7.316 3.444 7.569 V9.097 C3.444 9.35 3.65 9.556 3.903 9.556 H5.431 C5.684 9.556 5.889 9.35 5.889 9.097 Z M9.556 9.097 V7.569 C9.556 7.316 9.35 7.111 9.097 7.111 H7.569 C7.316 7.111 7.111 7.316 7.111 7.569 V9.097 C7.111 9.35 7.316 9.556 7.569 9.556 H9.097 C9.35 9.556 9.556 9.35 9.556 9.097 Z M13.222 9.097 V7.569 C13.222 7.316 13.017 7.111 12.764 7.111 H11.236 C10.983 7.111 10.778 7.316 10.778 7.569 V9.097 C10.778 9.35 10.983 9.556 11.236 9.556 H12.764 C13.017 9.556 13.222 9.35 13.222 9.097 Z M16.889 9.097 V7.569 C16.889 7.316 16.684 7.111 16.431 7.111 H14.903 C14.65 7.111 14.444 7.316 14.444 7.569 V9.097 C14.444 9.35 14.65 9.556 14.903 9.556 H16.431 C16.684 9.556 16.889 9.35 16.889 9.097 Z M20.556 9.097 V7.569 C20.556 7.316 20.35 7.111 20.097 7.111 H18.569 C18.316 7.111 18.111 7.316 18.111 7.569 V9.097 C18.111 9.35 18.316 9.556 18.569 9.556 H20.097 C20.35 9.556 20.556 9.35 20.556 9.097 Z M7.722 12.764 V11.236 C7.722 10.983 7.517 10.778 7.264 10.778 H5.736 C5.483 10.778 5.278 10.983 5.278 11.236 V12.764 C5.278 13.017 5.483 13.222 5.736 13.222 H7.264 C7.517 13.222 7.722 13.017 7.722 12.764 Z M11.389 12.764 V11.236 C11.389 10.983 11.184 10.778 10.931 10.778 H9.403 C9.15 10.778 8.944 10.983 8.944 11.236 V12.764 C8.944 13.017 9.15 13.222 9.403 13.222 H10.931 C11.184 13.222 11.389 13.017 11.389 12.764 Z M15.056 12.764 V11.236 C15.056 10.983 14.85 10.778 14.597 10.778 H13.069 C12.816 10.778 12.611 10.983 12.611 11.236 V12.764 C12.611 13.017 12.816 13.222 13.069 13.222 H14.597 C14.85 13.222 15.056 13.017 15.056 12.764 Z M18.722 12.764 V11.236 C18.722 10.983 18.517 10.778 18.264 10.778 H16.736 C16.483 10.778 16.278 10.983 16.278 11.236 V12.764 C16.278 13.017 16.483 13.222 16.736 13.222 H18.264 C18.517 13.222 18.722 13.017 18.722 12.764 Z M5.889 16.431 V14.903 C5.889 14.65 5.684 14.444 5.431 14.444 H3.903 C3.65 14.444 3.444 14.65 3.444 14.903 V16.431 C3.444 16.684 3.65 16.889 3.903 16.889 H5.431 C5.684 16.889 5.889 16.684 5.889 16.431 Z M16.889 16.431 V14.903 C16.889 14.65 16.684 14.444 16.431 14.444 H7.569 C7.316 14.444 7.111 14.65 7.111 14.903 V16.431 C7.111 16.684 7.316 16.889 7.569 16.889 H16.431 C16.684 16.889 16.889 16.684 16.889 16.431 Z M20.556 16.431 V14.903 C20.556 14.65 20.35 14.444 20.097 14.444 H18.569 C18.316 14.444 18.111 14.65 18.111 14.903 V16.431 C18.111 16.684 18.316 16.889 18.569 16.889 H20.097 C20.35 16.889 20.556 16.684 20.556 16.431 Z" />
      <motion.rect initial="rest" animate={playing} x={7.111} y={7.111} width={2.445} height={2.445} rx={0.46} variants={{ rest: { opacity: 0 }, tap: { opacity: [0,1,0,0], transition: { opacity: { duration: 0.26, times: [0,0.28,0.62,1], ease: [(p) => (p < 1 ? 0 : 1), (p) => (p < 1 ? 0 : 1), (p) => (p < 1 ? 0 : 1)] } } }, type: { opacity: [0,1,0,0], transition: { opacity: { duration: 0.64, times: [0,0.3,0.414,1], ease: [(p) => (p < 1 ? 0 : 1), (p) => (p < 1 ? 0 : 1), (p) => (p < 1 ? 0 : 1)] } } } }} style={{ transformBox: 'view-box', transformOrigin: '12px 12px' }} />
      <motion.rect initial="rest" animate={playing} x={8.944} y={10.778} width={2.445} height={2.444} rx={0.46} variants={{ rest: { opacity: 0 }, tap: { opacity: 0 }, type: { opacity: [0,1,0,0], transition: { opacity: { duration: 0.64, times: [0,0.5116,0.6256,1], ease: [(p) => (p < 1 ? 0 : 1), (p) => (p < 1 ? 0 : 1), (p) => (p < 1 ? 0 : 1)] } } } }} style={{ transformBox: 'view-box', transformOrigin: '12px 12px' }} />
      <motion.rect initial="rest" animate={playing} x={7.111} y={14.444} width={9.778} height={2.445} rx={0.46} variants={{ rest: { opacity: 0 }, tap: { opacity: 0 }, type: { opacity: [0,1,0,0], transition: { opacity: { duration: 0.64, times: [0,0.7395,0.886,1], ease: [(p) => (p < 1 ? 0 : 1), (p) => (p < 1 ? 0 : 1), (p) => (p < 1 ? 0 : 1)] } } } }} style={{ transformBox: 'view-box', transformOrigin: '12px 12px' }} />
    </motion.g>
    </motion.svg>
  );
}


