'use client';

import { useFormContext } from 'react-hook-form';

import { FormField } from './form-field';
import { Input } from './input';

interface NameFieldProps {
  name: string;
  label: string;
  required?: boolean;
}

// An example field: register with react-hook-form, show the error from formState.
export function NameField({ name, label, required }: NameFieldProps) {
  const { register, formState } = useFormContext();
  const error = formState.errors[name]?.message as string | undefined;
  const id = `field-${name}`;
  return (
    <FormField id={id} label={label} error={error} required={required}>
      <Input id={id} autoComplete="name" error={!!error} aria-describedby={error ? `${id}-error` : undefined} {...register(name)} />
    </FormField>
  );
}
