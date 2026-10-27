{{#if client}}
'use client';

{{/if}}
{{#if el.reactImport}}
{{el.reactImport}}
{{/if}}
{{#if el.radixSlot}}
import { Slot } from '{{slot.import}}';
{{/if}}
{{#if el.baseUi}}
import { useRender } from '@base-ui/react/use-render';
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
{{#if profileIs.react.18}}
export const {{name.pascal}} = forwardRef<{{el.refType}}, {{name.pascal}}Props>(function {{name.pascal}}({ {{el.params}} }, ref) {
{{else}}
export function {{name.pascal}}({ {{el.params}} }: {{name.pascal}}Props) {
{{/if}}
{{#if el.baseUi}}
  // TODO(codegen): implement markup in children; compose existing UI primitives and use design tokens only
  return useRender({
    defaultTagName: '{{element}}',
    render,
{{#if profileIs.react.18}}
    ref,
{{/if}}
    props: { {{el.classNameProp}}{{el.typeProp}}, ...props, children },
  });
{{else}}
{{#if el.radixSlot}}
  const Comp = asChild ? {{slot.component}} : '{{element}}';

{{/if}}
  return (
    <{{el.tag}}{{#if profileIs.react.18}} ref={ref}{{/if}} {{el.classNameAttr}}{{el.typeAttr}} {...props}>
      {/* TODO(codegen): implement markup; compose existing UI primitives and use design tokens only */}
      {children}
    </{{el.tag}}>
  );
{{/if}}
{{#if profileIs.react.18}}
});
{{name.pascal}}.displayName = '{{name.pascal}}';
{{else}}
}
{{/if}}
