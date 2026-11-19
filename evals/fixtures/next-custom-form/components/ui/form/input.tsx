import type { ComponentProps } from 'react';

import { cn } from '@/lib/utils';

interface InputProps extends ComponentProps<'input'> {
  error?: boolean;
}

export function Input({ className, error, ...props }: InputProps) {
  return (
    <input
      aria-invalid={error ? 'true' : 'false'}
      className={cn('h-10 rounded-md border border-input bg-background px-3 text-sm', error && 'border-destructive', className)}
      {...props}
    />
  );
}
