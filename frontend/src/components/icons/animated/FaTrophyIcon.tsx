'use client';

import { motion } from 'motion/react';
import type { SVGProps } from 'react';

export interface FaTrophyIconProps extends Omit<SVGProps<SVGSVGElement>, 'ref'> {
  size?: number | string;
  className?: string;
}

export function FaTrophyIcon({ size = '1em', className, ...rest }: FaTrophyIconProps) {
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
    <path d="M22.083 4.667 H18.111 V3.139 C18.111 2.631 17.702 2.222 17.194 2.222 H6.806 C6.298 2.222 5.889 2.631 5.889 3.139 V4.667 H1.917 C1.409 4.667 1 5.075 1 5.583 V7.722 C1 9.086 1.859 10.488 3.364 11.568 C4.567 12.435 6.03 12.985 7.566 13.161 C8.765 15.151 10.167 15.972 10.167 15.972 V18.722 H8.333 C6.985 18.722 5.889 19.513 5.889 20.861 V21.319 C5.889 21.572 6.095 21.778 6.347 21.778 H17.653 C17.905 21.778 18.111 21.572 18.111 21.319 V20.861 C18.111 19.513 17.015 18.722 15.667 18.722 H13.833 V15.972 S15.235 15.151 16.434 13.161 C17.974 12.985 19.436 12.435 20.636 11.568 C22.137 10.488 23 9.086 23 7.722 V5.583 C23 5.075 22.591 4.667 22.083 4.667 Z M4.793 9.586 C3.861 8.914 3.444 8.165 3.444 7.722 V7.111 H5.897 C5.935 8.356 6.118 9.449 6.385 10.403 C5.809 10.205 5.27 9.93 4.793 9.586 Z M20.556 7.722 C20.556 8.337 19.88 9.101 19.207 9.586 C18.73 9.93 18.188 10.205 17.611 10.403 C17.878 9.449 18.061 8.356 18.1 7.111 H20.556 V7.722 Z" />
    </motion.svg>
  );
}


