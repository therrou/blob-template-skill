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

export function elementVars({ element, name, variants, asChild, cn }) {
  const isButton = element === 'button';
  const variantsFn = `${name.camel}Variants`;
  const base = element === 'a' ? "Omit<ComponentProps<'a'>, 'href'> & { href: string }" : `ComponentProps<'${element}'>`;

  let classNameAttr = 'className={className}';
  if (variants && cn) classNameAttr = `className={cn(${variantsFn}({ variant, size }), className)}`;
  else if (variants) classNameAttr = `className={${variantsFn}({ variant, size, className })}`;
  else if (cn) classNameAttr = "className={cn('', className)}";

  return {
    tag: asChild ? 'Comp' : element,
    propsType: [base, variants && `VariantProps<typeof ${variantsFn}>`, asChild && '{ asChild?: boolean }'].filter(Boolean).join(' & '),
    params: ['className', variants && 'variant', variants && 'size', asChild && 'asChild = false', isButton && "type = 'button'", 'children', '...props']
      .filter(Boolean)
      .join(', '),
    classNameAttr,
    typeAttr: !isButton ? '' : asChild ? ' type={asChild ? undefined : type}' : ' type={type}',
    a11yNote: A11Y_NOTES[element] ?? '',
    testProps: element === 'a' ? ' href="/"' : '',
  };
}
