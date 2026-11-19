import type { ComponentProps } from 'react';

import { cn } from '@/lib/utils';

interface LabelProps extends ComponentProps<'label'> {
  required?: boolean;
}

export function Label({ className, required, children, ...props }: LabelProps) {
  return (
    <label className={cn('text-sm font-medium text-foreground', className)} {...props}>
      {children}
      {required && <span aria-hidden="true"> *</span>}
    </label>
  );
}
