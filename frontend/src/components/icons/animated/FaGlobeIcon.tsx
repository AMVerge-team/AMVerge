'use client';

import { motion } from 'motion/react';
import type { SVGProps } from 'react';

export interface FaGlobeIconProps extends Omit<SVGProps<SVGSVGElement>, 'ref'> {
  size?: number | string;
  className?: string;
}

export function FaGlobeIcon({ size = '1em', className, ...rest }: FaGlobeIconProps) {
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
      <path d="M15.803 7.875 C15.18 4.038 13.71 1.344 12 1.344 S8.82 4.038 8.197 7.875 H15.803 Z" />
      <path d="M7.875 12 C7.875 12.954 7.927 13.869 8.017 14.75 H15.979 C16.069 13.869 16.121 12.954 16.121 12 S16.069 10.131 15.979 9.25 H8.017 C7.927 10.131 7.875 11.046 7.875 12 Z" />
      <path d="M21.827 7.875 C20.598 4.957 18.11 2.702 15.038 1.791 C16.086 3.243 16.808 5.43 17.186 7.875 H21.827 Z" />
      <path d="M8.958 1.791 C5.89 2.702 3.398 4.957 2.173 7.875 H6.814 C7.188 5.43 7.909 3.243 8.958 1.791 Z" />
      <path d="M22.287 9.25 H17.358 C17.448 10.152 17.5 11.076 17.5 12 S17.448 13.848 17.358 14.75 H22.282 C22.519 13.869 22.652 12.954 22.652 12 S22.519 10.131 22.287 9.25 Z" />
      <path d="M6.5 12 C6.5 11.076 6.552 10.152 6.642 9.25 H1.713 C1.481 10.131 1.344 11.046 1.344 12 S1.481 13.869 1.713 14.75 H6.638 C6.552 13.848 6.5 12.924 6.5 12 Z" />
      <path d="M8.197 16.125 C8.82 19.962 10.29 22.656 12 22.656 S15.18 19.962 15.803 16.125 H8.197 Z" />
      <path d="M15.042 22.209 C18.11 21.298 20.602 19.043 21.831 16.125 H17.191 C16.812 18.57 16.091 20.757 15.042 22.209 Z" />
      <path d="M2.173 16.125 C3.402 19.043 5.89 21.298 8.962 22.209 C7.914 20.757 7.192 18.57 6.814 16.125 H2.173 Z" />
    </g>
    </motion.svg>
  );
}


