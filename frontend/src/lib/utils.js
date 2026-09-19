import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** shadcn/ui's class combiner: conditional classes, with later Tailwind utilities winning. */
export function cn(...inputs) {
  return twMerge(clsx(inputs));
}
