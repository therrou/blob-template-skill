{{#if vitest}}
import { describe, expect, it } from 'vitest';

{{/if}}
import { {{name.camel}} } from './{{name.kebab}}';

describe('{{name.camel}}', () => {
  // TODO(codegen): replace with real cases: typical input, edge cases, invalid input
  it('is a function', () => {
    expect(typeof {{name.camel}}).toBe('function');
  });
});
