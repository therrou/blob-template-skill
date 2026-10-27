import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { detectProfile, resolveProfile } from '../.agents/skills/codegen/scripts/lib/profile.mjs';
import { makeRepo } from './helpers.mjs';

test('detects a Next 16 app router + React 19 + Tailwind 4 + Base UI repo', () => {
  const root = makeRepo({ deps: { next: '^16.1.0', react: '^19.2.0', tailwindcss: '^4.1.0' }, dirs: ['src/app'], files: { 'components.json': JSON.stringify({ style: 'base-nova', aliases: { utils: '@/lib/utils' } }) } });
  const { dims } = detectProfile(root);
  assert.deepEqual(Object.fromEntries(Object.entries(dims).map(([k, v]) => [k, v.value])), {
    app: 'next-app', next: '16', react: '19', styling: 'tailwind-4', primitives: 'base', cn: '@/lib/utils', zod: '4', table: '9', srcDir: 'true',
  });
  assert.equal(dims.zod.source, 'default');
});

test('pages router, react 18, styled-components, no components.json', () => {
  const { dims, flags } = detectProfile(makeRepo({ deps: { next: '14.2.0', react: '18.3.1', 'styled-components': '^6' }, dirs: ['pages'] }));
  assert.deepEqual([dims.app.value, dims.next.value, dims.react.value, dims.styling.value, dims.primitives.value, dims.cn.value], ['next-pages', '14', '18', 'styled-components', 'none', 'none']);
  assert.equal(flags.mui, false);
});

test('mixed app/ and pages/ is next-app; tailwind beats css-in-js; MUI flags emotion', () => {
  const both = makeRepo({ deps: { next: '^15', tailwindcss: '^3.4', 'styled-components': '^6' }, dirs: ['app', 'pages'] });
  assert.equal(detectProfile(both).dims.app.value, 'next-app');
  assert.equal(detectProfile(both).dims.styling.value, 'tailwind-3');
  const mui = detectProfile(makeRepo({ deps: { react: '^18', '@mui/material': '^7', '@emotion/react': '^11', '@emotion/styled': '^11' } }));
  assert.deepEqual([mui.dims.app.value, mui.dims.styling.value, mui.flags.mui], ['react-spa', 'emotion', true]);
});

test('no styling library is plain; legacy and broken components.json', () => {
  assert.equal(detectProfile(makeRepo({ deps: { react: '^19' } })).dims.styling.value, 'plain');
  assert.equal(detectProfile(makeRepo({ files: { 'components.json': '{"style":"new-york"}' } })).dims.primitives.value, 'radix');
  assert.equal(detectProfile(makeRepo({ files: { 'components.json': '{}' } })).dims.primitives.value, 'radix');
  assert.equal(detectProfile(makeRepo({ files: { 'components.json': '{ broken' } })).dims.primitives.value, 'none');
});

test('cn comes from existing ui components first', () => {
  const root = makeRepo({ files: { 'components.json': JSON.stringify({ aliases: { utils: '@/lib/utils' } }), 'components/ui/button.tsx': "import { cn } from 'cn';\n" } });
  assert.equal(detectProfile(root).dims.cn.value, 'cn');
});

test('installed versions win, hoisted installs are found, odd ranges are unknown', () => {
  const mono = makeRepo({ files: { 'node_modules/react/package.json': '{"version":"18.3.1"}', 'apps/web/package.json': '{"dependencies":{"react":"catalog:"}}' } });
  assert.equal(detectProfile(path.join(mono, 'apps/web')).dims.react.value, '18');
  const odd = makeRepo({ files: { 'package.json': '{"dependencies":{"react":"workspace:*"}}' } });
  assert.equal(detectProfile(odd).dims.react.value, 'unknown');
});

test('out-of-matrix versions keep their value and are marked unsupported', () => {
  const { dims } = detectProfile(makeRepo({ deps: { react: '^17.0.2', next: '12.3.0' } }));
  assert.deepEqual(dims.react, { value: '17', source: 'detected', supported: false });
  assert.equal(dims.next.supported, false);
  const aria = detectProfile(makeRepo({ files: { 'components.json': '{"style":"aria-nova"}' } }));
  assert.deepEqual([aria.dims.primitives.value, aria.dims.primitives.supported], ['aria', false]);
});

test('config and flag override detection, with sources', () => {
  const root = makeRepo({ deps: { react: '^18' }, files: { '.codegen/config.json': '{"profile":{"styling":"emotion"}}' } });
  const { dims } = resolveProfile(root, 'react=19,app=react-spa');
  assert.deepEqual([dims.styling, dims.react, dims.app], [{ value: 'emotion', source: 'config' }, { value: '19', source: 'flag' }, { value: 'react-spa', source: 'flag' }]);
});

test('typos in overrides are errors that list the allowed values', () => {
  const root = makeRepo();
  assert.throws(() => resolveProfile(root, 'stlying=emotion'), /Unknown profile key "stlying"\. Allowed: app, next, react, styling/);
  assert.throws(() => resolveProfile(root, 'react=17'), /profile react must be one of: 18, 19\. Got "17"/);
  const bad = makeRepo({ files: { '.codegen/config.json': '{"profil":{}}' } });
  assert.throws(() => resolveProfile(bad), /Unknown key "profil" in \.codegen\/config\.json/);
});
