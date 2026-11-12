{{#if client}}
'use client';

{{/if}}
{{#if el.reactImport}}
{{el.reactImport}}
{{/if}}
{{#if mui}}
import { styled } from '@mui/material/styles';
{{else}}
{{#if profileIs.styling.emotion}}
import styled from '@emotion/styled';
{{else}}
import styled from 'styled-components';
{{/if}}
{{/if}}

{{#if variants}}
// TODO(codegen): name the real variants and sizes
export type {{name.pascal}}Variant = 'default';
export type {{name.pascal}}Size = 'default';

{{/if}}
// TODO(codegen): style with theme values only (e.g. ({ theme }) => theme.space[2]); no hard-coded colors, px or font sizes
const Root = {{el.styledOpen}}`
{{#if variants}}
  /* TODO(codegen): switch on $variant and $size, theme values only */
{{/if}}
`;

{{#unless constExport}}export {{/unless}}type {{name.pascal}}Props = {{el.baseProps}}{{#if variants}} & { variant?: {{name.pascal}}Variant; size?: {{name.pascal}}Size }{{/if}} & {
  // TODO(codegen): add component-specific props (or drop this intersection)
};

{{#if el.a11yNote}}
// TODO(codegen): a11y: {{el.a11yNote}}
{{/if}}
// TODO(codegen): to render a different element or component, pass `as` (e.g. as="a" with href)
{{#if profileIs.react.18}}
{{#unless constExport}}export {{/unless}}const {{name.pascal}} = forwardRef<{{el.refType}}, {{name.pascal}}Props>(function {{name.pascal}}({ {{el.styledParams}} }, ref) {
{{else}}
{{#if constExport}}
const {{name.pascal}} = ({ {{el.styledParams}} }: {{name.pascal}}Props) => {
{{else}}
export function {{name.pascal}}({ {{el.styledParams}} }: {{name.pascal}}Props) {
{{/if}}
{{/if}}
  return (
    <Root{{#if profileIs.react.18}} ref={ref}{{/if}}{{#if variants}} $variant={variant} $size={size}{{/if}}{{el.typeAttr}} {...props}>
      {/* TODO(codegen): implement markup; compose existing UI primitives */}
      {children}
    </Root>
  );
{{#if profileIs.react.18}}
});
{{name.pascal}}.displayName = '{{name.pascal}}';
{{else}}
{{#if constExport}}
};
{{else}}
}
{{/if}}
{{/if}}
{{#if constExport}}

export { {{name.pascal}} };
{{/if}}
