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
