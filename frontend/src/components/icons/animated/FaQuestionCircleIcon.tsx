'use client';

import { motion } from 'motion/react';
import type { SVGProps } from 'react';

export interface FaQuestionCircleIconProps extends Omit<SVGProps<SVGSVGElement>, 'ref'> {
  size?: number | string;
  className?: string;
}

export function FaQuestionCircleIcon({ size = '1em', className, ...rest }: FaQuestionCircleIconProps) {
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
    <path d="M22.656 12 C22.656 17.887 17.885 22.656 12 22.656 S1.344 17.887 1.344 12 C1.344 6.117 6.115 1.344 12 1.344 S22.656 6.117 22.656 12 Z M12.286 4.867 C9.944 4.867 8.451 5.854 7.278 7.607 C7.126 7.834 7.177 8.14 7.395 8.305 L8.886 9.436 C9.109 9.605 9.428 9.565 9.602 9.345 C10.369 8.371 10.896 7.807 12.064 7.807 C12.942 7.807 14.028 8.372 14.028 9.223 C14.028 9.866 13.496 10.197 12.63 10.683 C11.619 11.249 10.281 11.954 10.281 13.719 V13.891 C10.281 14.175 10.512 14.406 10.797 14.406 H13.203 C13.488 14.406 13.719 14.175 13.719 13.891 V13.833 C13.719 12.61 17.293 12.559 17.293 9.25 C17.293 6.758 14.708 4.867 12.286 4.867 Z M12 15.523 C10.91 15.523 10.023 16.41 10.023 17.5 C10.023 18.59 10.91 19.477 12 19.477 S13.977 18.59 13.977 17.5 C13.977 16.41 13.09 15.523 12 15.523 Z" />
    </motion.svg>
  );
}


