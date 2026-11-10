'use client';

import { createContext, useContext, useId, type ComponentProps } from 'react';
import { Slot } from '@radix-ui/react-slot';
import {
  Controller,
  FormProvider,
  useFormContext,
  useFormState,
  type ControllerProps,
  type FieldPath,
  type FieldValues,
} from 'react-hook-form';

import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

// Trimmed copy of shadcn/ui's form.tsx for the eval fixture.
export const Form = FormProvider;

const FormFieldContext = createContext({ name: '' });
const FormItemContext = createContext({ id: '' });

export function FormField<TValues extends FieldValues, TName extends FieldPath<TValues>>(props: ControllerProps<TValues, TName>) {
  return (
    <FormFieldContext.Provider value={{ name: props.name }}>
      <Controller {...props} />
    </FormFieldContext.Provider>
  );
}

function useFormField() {
  const { name } = useContext(FormFieldContext);
  const { id } = useContext(FormItemContext);
  const { getFieldState } = useFormContext();
  const formState = useFormState({ name });
  return {
    formItemId: `${id}-item`,
    formDescriptionId: `${id}-description`,
    formMessageId: `${id}-message`,
    ...getFieldState(name, formState),
  };
}

export function FormItem({ className, ...props }: ComponentProps<'div'>) {
  const id = useId();
  return (
    <FormItemContext.Provider value={{ id }}>
      <div className={cn('grid gap-2', className)} {...props} />
    </FormItemContext.Provider>
  );
}

export function FormLabel({ className, ...props }: ComponentProps<typeof Label>) {
  const { error, formItemId } = useFormField();
  return <Label className={cn(error && 'text-destructive', className)} htmlFor={formItemId} {...props} />;
}

export function FormControl(props: ComponentProps<typeof Slot>) {
  const { error, formItemId, formDescriptionId, formMessageId } = useFormField();
  return (
    <Slot
      id={formItemId}
      aria-describedby={error ? `${formDescriptionId} ${formMessageId}` : formDescriptionId}
      aria-invalid={Boolean(error)}
      {...props}
    />
  );
}

export function FormDescription({ className, ...props }: ComponentProps<'p'>) {
  const { formDescriptionId } = useFormField();
  return <p id={formDescriptionId} className={cn('text-sm text-muted-foreground', className)} {...props} />;
}

export function FormMessage({ className, children, ...props }: ComponentProps<'p'>) {
  const { error, formMessageId } = useFormField();
  const body = error ? String(error.message ?? '') : children;
  if (!body) return null;
  return (
    <p id={formMessageId} className={cn('text-sm text-destructive', className)} {...props}>
      {body}
    </p>
  );
}
