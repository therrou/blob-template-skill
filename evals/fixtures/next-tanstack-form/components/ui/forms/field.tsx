import type { AnyFieldApi } from '@tanstack/react-form';
import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

export interface FieldControlProps {
  id: string;
  name: string;
  'aria-invalid': boolean;
  'aria-describedby'?: string;
}

interface FieldProps {
  field: AnyFieldApi;
  label: string;
  description?: string;
  className?: string;
  children: (control: FieldControlProps) => ReactNode;
}

export function Field({ field, label, description, className, children }: FieldProps) {
  const id = `field-${field.name}`;
  const errors = field.state.meta.isTouched ? field.state.meta.errors : [];
  const describedBy = [description && `${id}-description`, errors.length > 0 && `${id}-error`].filter(Boolean).join(' ') || undefined;

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <label htmlFor={id} className="text-sm font-medium text-foreground">
        {label}
      </label>
      {children({ id, name: field.name, 'aria-invalid': errors.length > 0, 'aria-describedby': describedBy })}
      {description && (
        <p id={`${id}-description`} className="text-sm text-muted-foreground">
          {description}
        </p>
      )}
      {errors.length > 0 && (
        <p id={`${id}-error`} role="alert" className="text-sm text-destructive">
          {errors.map((e) => (typeof e === 'string' ? e : e?.message)).join(', ')}
        </p>
      )}
    </div>
  );
}
