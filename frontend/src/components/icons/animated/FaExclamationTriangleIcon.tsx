'use client';

import { motion } from 'motion/react';
import type { SVGProps } from 'react';

export interface FaExclamationTriangleIconProps extends Omit<SVGProps<SVGSVGElement>, 'ref'> {
  size?: number | string;
  className?: string;
}

export function FaExclamationTriangleIcon({ size = '1em', className, ...rest }: FaExclamationTriangleIconProps) {
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
    <path d="M22.752 19.028 C23.457 20.25 22.572 21.778 21.164 21.778 H2.835 C1.425 21.778 0.544 20.248 1.247 19.028 L10.412 3.138 C11.117 1.916 12.884 1.918 13.588 3.138 L22.752 19.028 Z M12 15.743 C11.03 15.743 10.243 16.53 10.243 17.5 S11.03 19.257 12 19.257 S13.757 18.47 13.757 17.5 S12.97 15.743 12 15.743 Z M10.332 9.428 L10.615 14.622 C10.629 14.865 10.829 15.056 11.073 15.056 H12.927 C13.171 15.056 13.371 14.865 13.385 14.622 L13.668 9.428 C13.682 9.165 13.473 8.944 13.21 8.944 H10.79 C10.527 8.944 10.318 9.165 10.332 9.428 Z" />
    </motion.svg>
  );
}


