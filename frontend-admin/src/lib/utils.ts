import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Cn. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
