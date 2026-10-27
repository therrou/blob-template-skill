// Derived TSX snippets for the component template. Keeping the flag logic here
// keeps the template readable and guarantees every flag combination is valid TSX.

const NO_SEMANTICS =
  'div/span carry no meaning: if this is interactive use button or a; if it is a page region use section, nav, aside, header or footer';
const HEADING = 'keep heading levels sequential on the page (one h1 per page)';
const LIST = 'render only li children';

const A11Y_NOTES = {
  div: NO_SEMANTICS,
  span: NO_SEMANTICS,
  section: 'name the section with aria-labelledby pointing at its heading; unnamed sections are not landmarks',
  nav: 'name the nav with aria-label (e.g. "Footer") so screen readers can tell navs apart',
  main: 'render only one main per page',
  ul: LIST,
  ol: LIST,
  button: 'icon-only buttons need an aria-label; use the disabled attribute for the disabled state',
  a: 'use the router link for internal routes (next/link in Next) and keep the link text meaningful out of context',
  form: 'label every control and handle submit with a server action or the form library',
  label: 'associate the label with its control via htmlFor (or by wrapping it)',
  h1: HEADING,
  h2: HEADING,
  h3: HEADING,
  h4: HEADING,
  h5: HEADING,
  h6: HEADING,
};

const REF_TYPES = {
  button: 'HTMLButtonElement',
  a: 'HTMLAnchorElement',
  div: 'HTMLDivElement',
  span: 'HTMLSpanElement',
  ul: 'HTMLUListElement',
  ol: 'HTMLOListElement',
  li: 'HTMLLIElement',
  form: 'HTMLFormElement',
  label: 'HTMLLabelElement',
  p: 'HTMLParagraphElement',
};

const REACT_IMPORTS = {
  'r18': "import { forwardRef, type ComponentPropsWithoutRef } from 'react';",
  'r18-base': "import { forwardRef } from 'react';",
  'r19': "import type { ComponentProps } from 'react';",
  'r19-base': '',
};

// React 18 function components don't receive `ref`, so they use forwardRef and props without ref.
// Polymorphism is Radix Slot + asChild, or Base UI's useRender + render prop when primitives are Base UI.
export function elementVars({ element, name, variants, asChild, cn, react18 = false, primitives = 'radix', styling = 'plain' }) {
  const isButton = element === 'button';
  const baseUi = Boolean(asChild) && primitives === 'base';
  const variantsFn = `${name.camel}Variants`;
  let base;
  if (baseUi) {
    const omit = [react18 && "'ref'", element === 'a' && "'href'"].filter(Boolean);
    const props = `useRender.ComponentProps<'${element}'>`;
    base = (omit.length ? `Omit<${props}, ${omit.join(' | ')}>` : props) + (element === 'a' ? ' & { href: string }' : '');
  } else {
    const props = react18 ? 'ComponentPropsWithoutRef' : 'ComponentProps';
    base = element === 'a' ? `Omit<${props}<'a'>, 'href'> & { href: string }` : `${props}<'${element}'>`;
  }

  let classNameAttr = 'className={className}';
  if (variants && cn) classNameAttr = `className={cn(${variantsFn}({ variant, size }), className)}`;
  else if (variants) classNameAttr = `className={${variantsFn}({ variant, size, className })}`;
  else if (cn) classNameAttr = "className={cn('', className)}";

  return {
    baseUi,
    radixSlot: Boolean(asChild) && !baseUi,
    reactImport: REACT_IMPORTS[`${react18 ? 'r18' : 'r19'}${baseUi ? '-base' : ''}`],
    tag: asChild ? 'Comp' : element,
    refType: REF_TYPES[element] ?? (/^h[1-6]$/.test(element) ? 'HTMLHeadingElement' : 'HTMLElement'),
    propsType: [base, variants && `VariantProps<typeof ${variantsFn}>`, asChild && !baseUi && '{ asChild?: boolean }'].filter(Boolean).join(' & '),
    params: ['className', variants && 'variant', variants && 'size', asChild && (baseUi ? 'render' : 'asChild = false'), isButton && "type = 'button'", 'children', '...props']
      .filter(Boolean)
      .join(', '),
    baseProps: base,
    // CSS-in-JS: styled root with transient $variant/$size props; Emotion and MUI use the styled('el') form.
    styledOpen:
      (styling === 'styled-components' ? `styled.${element}` : `styled('${element}')`) +
      (variants ? `<{ $variant: ${name.pascal}Variant; $size: ${name.pascal}Size }>` : ''),
    styledParams: [variants && "variant = 'default'", variants && "size = 'default'", isButton && "type = 'button'", 'children', '...props']
      .filter(Boolean)
      .join(', '),
    classNameAttr,
    classNameProp: classNameAttr.replace(/^className=\{(.*)\}$/, 'className: $1'),
    typeProp: isButton ? ', type: render ? undefined : type' : '',
    typeAttr: !isButton ? '' : asChild ? ' type={asChild ? undefined : type}' : ' type={type}',
    a11yNote: A11Y_NOTES[element] ?? '',
    testProps: element === 'a' ? ' href="/"' : '',
  };
}
