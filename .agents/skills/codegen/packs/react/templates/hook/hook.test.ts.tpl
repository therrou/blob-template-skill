{{#if vitest}}
import { describe, expect, it } from 'vitest';
{{/if}}
import { renderHook } from '@testing-library/react';

import { use{{name.pascal}} } from './use-{{name.kebab}}';

describe('use{{name.pascal}}', () => {
  it('returns its initial result', () => {
    const { result } = renderHook(() => use{{name.pascal}}());
    expect(result.current).toBeDefined();
  });

  // TODO(codegen): test state transitions with act() and cleanup on unmount
});
