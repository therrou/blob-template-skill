{{#if client}}
'use client';

{{/if}}
import type { ComponentProps } from 'react';
{{#if cn}}

import { cn } from '{{cn}}';
{{/if}}

{{#if server}}
// Server Component by default. If part of this needs state, effects or browser APIs,
// move only that part into a small client component instead of adding 'use client' here.
{{/if}}
export type {{name.pascal}}Props = ComponentProps<'div'> & {
  // TODO(codegen): add component-specific props (or drop this intersection)
};

export function {{name.pascal}}({ className, children, ...props }: {{name.pascal}}Props) {
  return (
{{#if cn}}
    <div className={cn('', className)} {...props}>
{{else}}
    <div className={className} {...props}>
{{/if}}
      {/* TODO(codegen): implement markup; compose existing UI primitives and use design tokens only */}
      {children}
    </div>
  );
}
