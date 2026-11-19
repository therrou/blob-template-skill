import type { ComponentProps } from 'react';

import { cn } from '@/lib/utils';

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return (
    <input
      className={cn('h-10 rounded-md border border-input bg-background px-3 text-sm aria-invalid:border-destructive', className)}
      {...props}
    />
  );
}
