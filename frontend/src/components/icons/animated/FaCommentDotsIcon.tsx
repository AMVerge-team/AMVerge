'use client';

import { motion } from 'motion/react';
import type { SVGProps } from 'react';

export interface FaCommentDotsIconProps extends Omit<SVGProps<SVGSVGElement>, 'ref'> {
  size?: number | string;
  className?: string;
}

export function FaCommentDotsIcon({ size = '1em', className, ...rest }: FaCommentDotsIconProps) {
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
    <g>
      <path d="M12 2.375 C5.924 2.375 1 6.375 1 11.312 C1 13.444 1.92 15.395 3.449 16.929 C2.912 19.094 1.116 21.023 1.095 21.045 C1 21.144 0.974 21.29 1.03 21.419 S1.206 21.625 1.344 21.625 C4.193 21.625 6.328 20.259 7.385 19.416 C8.79 19.945 10.35 20.25 12 20.25 C18.076 20.25 23 16.25 23 11.312 S18.076 2.375 12 2.375 Z M6.5 12.688 C5.739 12.688 5.125 12.073 5.125 11.312 S5.739 9.938 6.5 9.938 S7.875 10.552 7.875 11.312 S7.261 12.688 6.5 12.688 Z M12 12.688 C11.239 12.688 10.625 12.073 10.625 11.312 S11.239 9.938 12 9.938 S13.375 10.552 13.375 11.312 S12.761 12.688 12 12.688 Z M17.5 12.688 C16.739 12.688 16.125 12.073 16.125 11.312 S16.739 9.938 17.5 9.938 S18.875 10.552 18.875 11.312 S18.261 12.688 17.5 12.688 Z" />
    </g>
    </motion.svg>
  );
}


