'use client';

import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import type { SVGProps } from 'react';
import { useIconHost } from './useIconHost';

export interface FaVolumeMuteIconProps extends Omit<SVGProps<SVGSVGElement>, 'ref'> {
  size?: number | string;
  className?: string;
}

export function FaVolumeMuteIcon({ size = '1em', className, ...rest }: FaVolumeMuteIconProps) {
  const [playing, setPlaying] = useState<string>("rest");
  const hostRef = useRef<SVGSVGElement>(null);
  const { hovered, tapped } = useIconHost(hostRef);
  useEffect(() => {
    setPlaying((now) => (hovered ? (now === "rest" ? "give" : now) : now === "give" ? "rest" : now));
  }, [hovered]);
  useEffect(() => {
    if (!tapped) return;
    setPlaying("unmute");
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
    <motion.path initial="rest" animate={playing} d="M10.24 4.053 L6.417 7.875 H2.031 C1.461 7.875 1 8.336 1 8.906 V15.094 C1 15.663 1.461 16.125 2.031 16.125 H6.417 L10.24 19.947 C10.885 20.593 12 20.139 12 19.218 V4.782 C12 3.86 10.885 3.408 10.24 4.053 Z" variants={{ rest: { scale: 1, x: 0, y: 0 }, give: { scale: [1,0.95,1], transition: { scale: { duration: 0.3, times: [0,0.45,1], ease: ["easeOut", "easeInOut"] } } }, unmute: { x: [0,0,0.75,0,0], y: [0,0,0,0,0], scale: [1,1.03,0.95,0.95,1], transition: { x: { duration: 0.56, times: [0,0.3378,0.4514,0.6784,1], ease: [[0,0,1,1], "easeOut", "easeOut", "easeOut"] }, y: { duration: 0.56, times: [0,0.3378,0.4514,0.6784,1], ease: [[0,0,1,1], "easeOut", "easeOut", "easeOut"] }, scale: { duration: 0.56, times: [0,0.1,0.38,0.66,1], ease: ["easeOut", "easeOut", "easeInOut", "easeInOut"] } } } }} style={{ transformBox: 'view-box', transformOrigin: '12px 12px' }} />
    <motion.path initial="rest" animate={playing} d="M20.836 12 L22.797 10.039 C23.068 9.768 23.068 9.329 22.797 9.058 L21.817 8.078 C21.546 7.807 21.107 7.807 20.836 8.078 L18.875 10.039 L16.914 8.078 C16.643 7.807 16.204 7.807 15.933 8.078 L14.953 9.058 C14.682 9.329 14.682 9.768 14.953 10.039 L16.914 12 L14.953 13.961 C14.683 14.231 14.683 14.671 14.953 14.941 L15.934 15.922 C16.204 16.192 16.644 16.192 16.914 15.922 L18.875 13.961 L20.836 15.922 C21.107 16.193 21.546 16.193 21.817 15.922 L22.797 14.942 C23.068 14.671 23.068 14.232 22.797 13.961 L20.836 12 Z" variants={{ rest: { opacity: 1, x: 0, y: 0, scale: 1 }, give: { opacity: [1,0.35,1], x: [0,0.682,0], y: [0,0,0], scale: [1,0.95,1], transition: { opacity: { duration: 0.3, times: [0,0.45,1], ease: ["easeOut", "easeInOut"] }, x: { duration: 0.3, times: [0,0.45,1], ease: ["easeOut", "easeInOut"] }, y: { duration: 0.3, times: [0,0.45,1], ease: ["easeOut", "easeInOut"] }, scale: { duration: 0.3, times: [0,0.45,1], ease: ["easeOut", "easeInOut"] } } }, unmute: { opacity: [1,0.15,0.15,1,1], x: [0,0.682,0.682,0,0], y: [0,0,0,0,0], scale: [1,1.03,0.95,0.95,1], transition: { opacity: { duration: 0.56, times: [0,0.3,0.5459,0.8486,1], ease: ["easeOut", "linear", "easeOut", "easeOut"] }, x: { duration: 0.56, times: [0,0.3,0.5459,0.8486,1], ease: ["easeOut", "linear", "easeOut", "easeOut"] }, y: { duration: 0.56, times: [0,0.3,0.5459,0.8486,1], ease: ["easeOut", "linear", "easeOut", "easeOut"] }, scale: { duration: 0.56, times: [0,0.1,0.38,0.66,1], ease: ["easeOut", "easeOut", "easeInOut", "easeInOut"] } } } }} style={{ transformBox: 'view-box', transformOrigin: '18.875px 12px' }} />
    </motion.svg>
  );
}


