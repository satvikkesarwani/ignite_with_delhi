import { cva } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/**
 * Bordered, never filled — a filled pill is the single most common look of an
 * AI-generated dashboard. Mono uppercase tag text keeps it reading as data.
 */
const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-sm border px-1.5 py-px font-mono text-[10.5px] font-medium uppercase leading-[1.5] tracking-[0.06em]',
  {
    variants: {
      tone: {
        neutral: 'border-border-strong text-muted',
        accent: 'border-accent/60 text-accent',
        positive: 'border-positive/60 text-positive',
        warning: 'border-warning/60 text-warning',
        danger: 'border-danger/60 text-danger',
      },
    },
    defaultVariants: { tone: 'neutral' },
  }
);

export function Badge({ className, tone, ...props }) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

export { badgeVariants };
