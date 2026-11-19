{{#if vitest}}
import { describe, expect, it } from 'vitest';
{{/if}}
import { render, screen } from '@testing-library/react';

import { {{name.pascal}} } from './{{file.base}}';

describe('{{name.pascal}}', () => {
  it('renders its children', () => {
    render(<{{name.pascal}}{{el.testProps}}>content</{{name.pascal}}>);
    expect(screen.getByText('content')).toBeTruthy();
  });

  // TODO(codegen): test behavior users see (roles, states, interactions via @testing-library/user-event)
});
