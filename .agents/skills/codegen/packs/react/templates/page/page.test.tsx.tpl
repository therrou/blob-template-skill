{{#if vitest}}
import { describe, expect, it } from 'vitest';
{{/if}}
import { render, screen } from '@testing-library/react';

import { {{name.pascal}}Page } from './{{name.kebab}}-page';

describe('{{name.pascal}}Page', () => {
  it('renders the main landmark', () => {
    render(<{{name.pascal}}Page />);
    expect(screen.getByRole('main')).toBeTruthy();
  });

  // TODO(codegen): test the page's key content and states (loading, empty, error)
});
