'use client';

import { motion } from 'motion/react';
import type { SVGProps } from 'react';

export interface FaHeartIconProps extends Omit<SVGProps<SVGSVGElement>, 'ref'> {
  size?: number | string;
  className?: string;
}

export function FaHeartIcon({ size = '1em', className, ...rest }: FaHeartIconProps) {
  return (
    <motion.svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      {...(rest as object)}
      fill="currentColor" stroke="none" strokeWidth={0} strokeLinecap="round" strokeLinejoin="round"
    >
    <path d="M20.864 3.69 C18.51 1.683 15.008 2.044 12.846 4.274 L12 5.146 L11.154 4.274 C8.996 2.044 5.49 1.683 3.136 3.69 C0.437 5.993 0.295 10.127 2.71 12.623 L11.025 21.208 C11.562 21.762 12.434 21.762 12.971 21.208 L21.286 12.623 C23.705 10.127 23.563 5.993 20.864 3.69 Z" />
    </motion.svg>
  );
}


