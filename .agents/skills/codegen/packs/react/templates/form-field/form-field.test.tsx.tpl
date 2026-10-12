{{#if vitest}}
import { describe, expect, it } from 'vitest';
{{/if}}
import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import { useForm } from 'react-hook-form';

import { Form } from '{{ui}}/form';

import { {{name.pascal}} } from './{{name.kebab}}';

function Harness({ children }: { children: ReactNode }) {
  const form = useForm({ defaultValues: { field: {{#if controlIs.checkbox}}false{{else}}''{{/if}} } });
  return <Form {...form}>{children}</Form>;
}

describe('{{name.pascal}}', () => {
  it('labels its control', () => {
    render(
      <Harness>
        <{{name.pascal}} name="field" label="Label"{{#if controlIs.select}} options={[]}{{/if}} />
      </Harness>,
    );
    expect(screen.getByLabelText('Label')).toBeTruthy();
  });

  // TODO(codegen): submit with invalid values and assert the zod error message is announced
});
