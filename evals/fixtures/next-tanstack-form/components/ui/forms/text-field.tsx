import type { AnyFieldApi } from '@tanstack/react-form';
import type { ComponentProps } from 'react';

import { Field } from './field';
import { Input } from './input';

interface TextFieldProps extends Omit<ComponentProps<'input'>, 'name' | 'value' | 'onChange' | 'onBlur'> {
  field: AnyFieldApi;
  label: string;
  description?: string;
}

// Usage: <form.Field name="name">{(field) => <TextField field={field} label="Name" />}</form.Field>
export function TextField({ field, label, description, ...props }: TextFieldProps) {
  return (
    <Field field={field} label={label} description={description}>
      {(control) => (
        <Input
          {...props}
          {...control}
          value={field.state.value ?? ''}
          onChange={(e) => field.handleChange(e.target.value)}
          onBlur={field.handleBlur}
        />
      )}
    </Field>
  );
}
