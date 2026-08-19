import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-neutral-900 text-white',
        secondary: 'border-transparent bg-neutral-100 text-neutral-900',
        outline: 'border-neutral-300 text-neutral-700',
        warning: 'border-transparent bg-amber-100 text-amber-900',
        destructive: 'border-transparent bg-red-100 text-red-900',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

export function Badge({
  className,
  variant,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
