import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

import { Label } from './label';

interface FormFieldProps {
  id: string;
  label: string;
  description?: string;
  error?: string;
  required?: boolean;
  className?: string;
  children: ReactNode;
}

// Wraps one control with its label, description and error. The control gets id, aria-invalid and aria-describedby from the caller.
export function FormField({ id, label, description, error, required, className, children }: FormFieldProps) {
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <Label htmlFor={id} required={required}>
        {label}
      </Label>
      {children}
      {description && (
        <p id={`${id}-description`} className="text-sm text-muted-foreground">
          {description}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
