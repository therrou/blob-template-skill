import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseName } from '../.agents/skills/codegen/scripts/lib/names.mjs';
import { render, findTodos } from '../.agents/skills/codegen/scripts/lib/template.mjs';
import { parseRoute } from '../.agents/skills/codegen/scripts/lib/route.mjs';

test('parseName produces pascal, camel and kebab from any input casing', () => {
  for (const raw of ['userCard', 'UserCard', 'user-card', 'user_card', 'user card']) {
    const n = parseName(raw);
    assert.deepEqual([n.pascal, n.camel, n.kebab], ['UserCard', 'userCard', 'user-card'], raw);
  }
  assert.equal(parseName('HTMLParser').kebab, 'html-parser');
});

test('parseName strips configured leading/trailing words but never the only word', () => {
  assert.equal(parseName('useUserData', ['use']).pascal, 'UserData');
  assert.equal(parseName('ThemeContext', ['context', 'provider']).pascal, 'Theme');
  assert.equal(parseName('use', ['use']).pascal, 'Use');
});

test('parseName rejects invalid identifiers', () => {
  for (const raw of ['', '1abc', '../x', 'a/b', 'a.b']) {
    assert.throws(() => parseName(raw), /Invalid name/, raw);
  }
});

test('render substitutes variables and fails on unknown ones', () => {
  assert.equal(render('Hi {{name.pascal}}!', { name: { pascal: 'Bob' } }), 'Hi Bob!');
  assert.throws(() => render('{{nope}}', {}), /Unknown template variable "nope"/);
});

test('render handles if/else/unless, nesting, and strips block-only lines', () => {
  const tpl = [
    'a',
    '{{#if x}}',
    'x-line',
    '{{#unless y}}',
    'not-y',
    '{{/unless}}',
    '{{else}}',
    'no-x',
    '{{/if}}',
    'b',
    '',
  ].join('\n');
  assert.equal(render(tpl, { x: true, y: false }), 'a\nx-line\nnot-y\nb\n');
  assert.equal(render(tpl, { x: false, y: false }), 'a\nno-x\nb\n');
  assert.equal(render('f(a{{#if p}}, b{{/if}})', { p: true }), 'f(a, b)');
});

test('render leaves JSX object literals alone', () => {
  assert.equal(render('style={{ color: "red" }}', {}), 'style={{ color: "red" }}');
});

test('findTodos reports TODO(codegen) markers with line numbers', () => {
  assert.deepEqual(findTodos('a\n// TODO(codegen): do it\nb'), [{ line: 2, text: 'do it' }]);
});

test('parseRoute understands static, dynamic, catch-all and group segments', () => {
  const r = parseRoute('/blog/[slug]/');
  assert.equal(r.route, 'blog/[slug]');
  assert.equal(r.name.pascal, 'BlogSlug');
  assert.equal(r.hasParams, true);
  assert.equal(r.paramsType, '{ slug: string }');
  assert.equal(r.paramsList, 'slug');
  assert.equal(r.urlPath, 'blog/test');

  const c = parseRoute('(marketing)/docs/[...parts]');
  assert.equal(c.name.pascal, 'DocsParts');
  assert.equal(c.paramsType, '{ parts: string[] }');
  assert.equal(c.urlPath, 'docs/test');

  assert.equal(parseRoute('shop/[[...filters]]').paramsType, '{ filters?: string[] }');
  assert.equal(parseRoute('/').name.pascal, 'Home');
  assert.equal(parseRoute('/').hasParams, false);
});

test('parseRoute rejects invalid segments and traversal', () => {
  for (const raw of ['../x', 'Blog', 'a//b', '[1x]', 'a b']) {
    assert.throws(() => parseRoute(raw), /Invalid route/, raw);
  }
});

import { elementVars } from '../.agents/skills/codegen/scripts/lib/elements.mjs';

const nameOf = { camel: 'badge' };

test('elementVars: plain div with cn', () => {
  const el = elementVars({ element: 'div', name: nameOf, variants: false, asChild: false, cn: '@/lib/utils' });
  assert.equal(el.tag, 'div');
  assert.equal(el.propsType, "ComponentProps<'div'>");
  assert.equal(el.params, 'className, children, ...props');
  assert.equal(el.classNameAttr, "className={cn('', className)}");
  assert.equal(el.typeAttr, '');
  assert.match(el.a11yNote, /interactive/);
});

test('elementVars: button defaults type, and keeps it off Slot children', () => {
  const plain = elementVars({ element: 'button', name: nameOf, variants: false, asChild: false, cn: '' });
  assert.equal(plain.params, "className, type = 'button', children, ...props");
  assert.equal(plain.typeAttr, ' type={type}');
  assert.equal(plain.classNameAttr, 'className={className}');
  const slotted = elementVars({ element: 'button', name: nameOf, variants: false, asChild: true, cn: '' });
  assert.equal(slotted.tag, 'Comp');
  assert.equal(slotted.typeAttr, ' type={asChild ? undefined : type}');
  assert.equal(slotted.params, "className, asChild = false, type = 'button', children, ...props");
  assert.equal(slotted.propsType, "ComponentProps<'button'> & { asChild?: boolean }");
});

test('elementVars: anchors require href; variants go through cva', () => {
  const el = elementVars({ element: 'a', name: nameOf, variants: true, asChild: false, cn: '@/lib/utils' });
  assert.equal(el.propsType, "Omit<ComponentProps<'a'>, 'href'> & { href: string } & VariantProps<typeof badgeVariants>");
  assert.equal(el.params, 'className, variant, size, children, ...props');
  assert.equal(el.classNameAttr, 'className={cn(badgeVariants({ variant, size }), className)}');
  assert.equal(el.testProps, ' href="/"');
  const noCn = elementVars({ element: 'span', name: nameOf, variants: true, asChild: false, cn: '' });
  assert.equal(noCn.classNameAttr, 'className={badgeVariants({ variant, size, className })}');
});

test('elementVars: notes for landmarks and headings, none for article', () => {
  const note = (element) => elementVars({ element, name: nameOf, variants: false, asChild: false, cn: '' }).a11yNote;
  assert.match(note('nav'), /aria-label/);
  assert.match(note('section'), /aria-labelledby/);
  assert.match(note('h2'), /heading levels/);
  assert.match(note('ul'), /li children/);
  assert.equal(note('article'), '');
});
