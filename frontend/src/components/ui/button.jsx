import { cva } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/**
 * shadcn/ui button, re-skinned for the CRM: square-ish corners, no shadows,
 * a hairline border instead of elevation, and a single ochre call-to-action.
 */
const buttonVariants = cva(
  'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded font-sans font-medium transition-colors duration-100 disabled:pointer-events-none disabled:opacity-40',
  {
    variants: {
      variant: {
        default: 'bg-accent text-accent-ink hover:bg-accent/90',
        outline: 'border border-border-strong bg-transparent text-text hover:bg-surface-2',
        ghost: 'bg-transparent text-muted hover:bg-surface-2 hover:text-text',
        danger: 'border border-danger/60 bg-transparent text-danger hover:bg-danger/10',
      },
      size: {
        sm: 'h-7 px-2.5 text-[12px]',
        md: 'h-8 px-3.5 text-[13px]',
        lg: 'h-10 px-5 text-[14px]',
        icon: 'size-8',
      },
    },
    defaultVariants: { variant: 'default', size: 'md' },
  }
);

export function Button({ className, variant, size, type = 'button', ...props }) {
  return (
    <button type={type} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  );
}

export { buttonVariants };
