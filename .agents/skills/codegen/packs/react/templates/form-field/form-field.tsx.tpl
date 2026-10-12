{{#if client}}
'use client';

{{/if}}
import { useFormContext, type FieldPath, type FieldValues } from 'react-hook-form';

import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '{{ui}}/form';
{{#if controlIs.input}}
import { Input } from '{{ui}}/input';
{{/if}}
{{#if controlIs.textarea}}
import { Textarea } from '{{ui}}/textarea';
{{/if}}
{{#if controlIs.select}}
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '{{ui}}/select';
{{/if}}
{{#if controlIs.checkbox}}
import { Checkbox } from '{{ui}}/checkbox';
{{/if}}

export type {{name.pascal}}Props<TValues extends FieldValues = FieldValues> = {
  name: FieldPath<TValues>;
  label: string;
  description?: string;
{{#if controlIs.select}}
  placeholder?: string;
  options: { value: string; label: string }[];
{{/if}}
};

// Render inside the shadcn <Form {...form}>. Validation lives in the form's zod schema (zodResolver), not here.
export function {{name.pascal}}<TValues extends FieldValues = FieldValues>({ name, label, description{{#if controlIs.select}}, placeholder, options{{/if}} }: {{name.pascal}}Props<TValues>) {
  const { control } = useFormContext();
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
{{#if controlIs.checkbox}}
        <FormItem className="flex items-start gap-2">
          <FormControl>
            <Checkbox checked={field.value === true} onCheckedChange={(checked) => field.onChange(checked === true)} />
          </FormControl>
          <div className="grid gap-1">
            <FormLabel>{label}</FormLabel>
            {description ? <FormDescription>{description}</FormDescription> : null}
            <FormMessage />
          </div>
        </FormItem>
{{else}}
        <FormItem>
          <FormLabel>{label}</FormLabel>
{{#if controlIs.input}}
          <FormControl>
            {/* TODO(codegen): set type and autoComplete for this field (e.g. type="email" autoComplete="email") */}
            <Input {...field} />
          </FormControl>
{{/if}}
{{#if controlIs.textarea}}
          <FormControl>
            <Textarea {...field} />
          </FormControl>
{{/if}}
{{#if controlIs.select}}
          <Select onValueChange={field.onChange} defaultValue={field.value}>
            <FormControl>
              <SelectTrigger>
                <SelectValue placeholder={placeholder} />
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              {options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
{{/if}}
          {description ? <FormDescription>{description}</FormDescription> : null}
          <FormMessage />
        </FormItem>
{{/if}}
      )}
    />
  );
}
