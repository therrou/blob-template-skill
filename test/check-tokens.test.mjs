import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const cli = path.join(here, '..', '.agents', 'skills', 'codegen', 'scripts', 'check-tokens.mjs');

const V4_THEME = `@import "tailwindcss";
@theme inline {
  --color-primary: var(--primary);
  --color-muted-foreground: var(--muted-foreground);
  --color-brand-500: oklch(0.6 0.2 250);
}
:root { --primary: #0a0a0a; }
`;

function repo(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tokens-'));
  for (const [p, c] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, p)), { recursive: true });
    fs.writeFileSync(path.join(root, p), c);
  }
  return root;
}

function check(root, ...targets) {
  const r = spawnSync(process.execPath, [cli, ...targets], { cwd: root, encoding: 'utf8' });
  return { status: r.status, json: JSON.parse(r.stdout) };
}

const rules = (json) => json.violations.map((v) => `${v.rule}:${v.match}`);

test('clean file with semantic tokens passes and theme is read from @theme', () => {
  const root = repo({
    'app/globals.css': V4_THEME,
    'components/a.tsx': `export const A = () => <p className="bg-primary text-muted-foreground p-4 bg-brand-500" />;\n`,
  });
  const { status, json } = check(root, 'components');
  assert.equal(status, 0, JSON.stringify(json));
  assert.ok(json.theme.colorTokens.includes('primary'));
});

test('flags arbitrary values, raw palette colors, color literals and leftover markers', () => {
  const root = repo({
    'app/globals.css': V4_THEME,
    'components/b.tsx': [
      `export const B = () => (`,
      `  <div className="p-[13px] bg-[#1a2b3c] text-blue-500 hover:bg-red-600/50" style={{ color: '#ff0000' }}>`,
      `    {/* TODO(codegen): implement */}`,
      `  </div>`,
      `);`,
    ].join('\n'),
  });
  const { status, json } = check(root, 'components/b.tsx');
  assert.equal(status, 1);
  assert.deepEqual(rules(json).sort(), [
    'arbitrary-value:bg-[#1a2b3c]',
    'arbitrary-value:p-[13px]',
    'codegen-todo:TODO(codegen)',
    'color-literal:#ff0000',
    'palette-color:hover:bg-red-600/50',
    'palette-color:text-blue-500',
  ]);
  assert.equal(json.violations[0].line, 2);
});

test('allows token-backed arbitrary values and tokens-allow suppressions with a reason', () => {
  const root = repo({
    'app/globals.css': V4_THEME,
    'c.tsx': [
      `<div className="w-[var(--sidebar-width)] h-(--header-height)" />`,
      `{/* tokens-allow: third-party embed needs exact size */}`,
      `<iframe className="h-[315px]" />`,
      `<i className="h-[1px]" /> {/* tokens-allow: */}`,
    ].join('\n'),
  });
  const { json } = check(root, 'c.tsx');
  assert.deepEqual(rules(json), ['arbitrary-value:h-[1px]']);
});

test('without semantic theme colors, palette colors are allowed but reported as a warning', () => {
  const root = repo({ 'd.tsx': `<p className="text-blue-500" />` });
  const { status, json } = check(root, 'd.tsx');
  assert.equal(status, 0);
  assert.match(json.warnings.join(' '), /No Tailwind theme/);
});

test('reads v3 colors from tailwind.config.js including nested DEFAULT keys', () => {
  const root = repo({
    'tailwind.config.js': `module.exports = { theme: { extend: { colors: { primary: { DEFAULT: '#000', foreground: '#fff' } } } } };`,
    'e.tsx': `<p className="bg-primary text-primary-foreground text-gray-500" />`,
  });
  const { json } = check(root, 'e.tsx');
  assert.deepEqual(json.theme.colorTokens.sort(), ['primary', 'primary-foreground']);
  assert.deepEqual(rules(json), ['palette-color:text-gray-500']);
});

test('css-in-js mode flags literals in styled templates and sx, allows theme references', () => {
  const root = repo({
    'package.json': JSON.stringify({ dependencies: { 'styled-components': '^6' } }),
    'src/badge.tsx': [
      'const Root = styled.span`',
      '  color: #ff0000;',
      '  padding: 12px;',
      '  margin: 0;',
      '  border: 1px solid ${({ theme }) => theme.colors.border};',
      '  font-size: ${({ theme }) => theme.fontSizes.sm};',
      '`;',
      '<Box sx={{ fontWeight: 700, color: theme.palette.primary.main }} />',
      "const url = '#top';",
    ].join('\n'),
  });
  const { json } = check(root, 'src');
  assert.equal(json.mode, 'css-in-js');
  assert.deepEqual(json.violations.map((v) => [v.line, v.rule]), [[2, 'css-color-literal'], [3, 'css-length-literal'], [8, 'css-font-literal']]);
});

test('tailwind and plain repos keep the tailwind rules', () => {
  const { json } = check(repo({ 'package.json': '{}', 'src/a.tsx': '<div className="p-[13px]" />' }), 'src');
  assert.equal(json.mode, 'tailwind');
  assert.equal(json.violations[0].rule, 'arbitrary-value');
});
