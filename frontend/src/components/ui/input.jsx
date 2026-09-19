import { cn } from '@/lib/utils';

export function Input({ className, type = 'text', ...props }) {
  return (
    <input
      type={type}
      className={cn(
        'h-8 w-full rounded border border-border bg-surface px-3 text-[13px] text-text',
        'placeholder:text-faint transition-colors duration-100',
        'hover:border-border-strong focus-visible:border-accent focus-visible:outline-none',
        'disabled:cursor-not-allowed disabled:opacity-40',
        className
      )}
      {...props}
    />
  );
}
