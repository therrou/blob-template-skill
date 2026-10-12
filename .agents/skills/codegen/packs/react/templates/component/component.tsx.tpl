{{#if client}}
'use client';

{{/if}}
import type { ComponentProps } from 'react';
{{#if asChild}}
import { Slot } from '{{slot.import}}';
{{/if}}
{{#if variants}}
import { cva, type VariantProps } from 'class-variance-authority';
{{/if}}
{{#if cn}}

import { cn } from '{{cn}}';
{{/if}}

{{#if server}}
// Server Component by default. If part of this needs state, effects or browser APIs,
// move only that part into a small client component instead of adding 'use client' here.
{{/if}}
{{#if variants}}
export const {{name.camel}}Variants = cva('', {
  variants: {
    variant: {
      // TODO(codegen): one entry per visual variant, semantic token classes only (e.g. bg-primary text-primary-foreground)
      default: '',
    },
    size: {
      // TODO(codegen): one entry per size, spacing and text tokens only (e.g. h-9 px-4 text-sm)
      default: '',
    },
  },
  defaultVariants: { variant: 'default', size: 'default' },
});

{{/if}}
export type {{name.pascal}}Props = {{el.propsType}} & {
  // TODO(codegen): add component-specific props (or drop this intersection)
};

{{#if el.a11yNote}}
// TODO(codegen): a11y: {{el.a11yNote}}
{{/if}}
export function {{name.pascal}}({ {{el.params}} }: {{name.pascal}}Props) {
{{#if asChild}}
  const Comp = asChild ? {{slot.component}} : '{{element}}';

{{/if}}
  return (
    <{{el.tag}} {{el.classNameAttr}}{{el.typeAttr}} {...props}>
      {/* TODO(codegen): implement markup; compose existing UI primitives and use design tokens only */}
      {children}
    </{{el.tag}}>
  );
}
