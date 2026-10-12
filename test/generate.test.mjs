import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const skillDir = path.join(here, '..', '.agents', 'skills', 'codegen');
const cli = path.join(skillDir, 'scripts', 'generate.mjs');

function makeRepo({ deps = {}, dirs = [], files = {} } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codegen-'));
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ devDependencies: deps }));
  for (const d of dirs) fs.mkdirSync(path.join(root, d), { recursive: true });
  for (const [p, c] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, p)), { recursive: true });
    fs.writeFileSync(path.join(root, p), c);
  }
  return root;
}

function run(root, ...args) {
  const r = spawnSync(process.execPath, [cli, ...args], { cwd: root, encoding: 'utf8' });
  let json;
  try {
    json = JSON.parse(r.stdout);
  } catch {
    throw new Error(`Non-JSON output (exit ${r.status}):\n${r.stdout}\n${r.stderr}`);
  }
  return { status: r.status, json };
}

const read = (root, p) => fs.readFileSync(path.join(root, p), 'utf8');

test('react component: kebab folder under src/, named export, cn import, no test by default', () => {
  const root = makeRepo({ deps: { vitest: '^2' }, dirs: ['src'] });
  const { status, json } = run(root, 'react', 'component', '--name', 'UserCard', '--cn', '@/lib/utils');
  assert.equal(status, 0, JSON.stringify(json));
  assert.deepEqual(json.created, ['src/components/user-card/user-card.tsx', 'src/components/user-card/index.ts']);
  const src = read(root, 'src/components/user-card/user-card.tsx');
  assert.match(src, /import \{ cn \} from '@\/lib\/utils';/);
  assert.match(src, /export function UserCard\(/);
  assert.doesNotMatch(src, /export default/);
  assert.match(read(root, 'src/components/user-card/index.ts'), /export \{ UserCard \} from '\.\/user-card';/);
  assert.ok(json.todo.length > 0);
  assert.ok(json.todo.every((t) => t.file && t.line > 0 && t.text));
});

test('--with-test uses the detected runner; vitest imports its globals', () => {
  const root = makeRepo({ deps: { vitest: '^2' } });
  const { status, json } = run(root, 'react', 'component', '--name', 'card', '--with-test');
  assert.equal(status, 0, JSON.stringify(json));
  const t = read(root, 'components/card/card.test.tsx');
  assert.match(t, /from 'vitest'/);
  assert.match(t, /@testing-library\/react/);

  const jestRoot = makeRepo({ deps: { jest: '^29' } });
  run(jestRoot, 'react', 'hook', '--name', 'useToggle', '--with-test');
  const jt = read(jestRoot, 'hooks/use-toggle.test.ts');
  assert.doesNotMatch(jt, /vitest/);
  assert.match(jt, /renderHook\(\(\) => useToggle\(\)\)/);
});

test('--with-test fails without a detectable runner and writes nothing', () => {
  const root = makeRepo();
  const { status, json } = run(root, 'react', 'util', '--name', 'formatDate', '--with-test');
  assert.equal(status, 1);
  assert.match(json.error, /test runner/i);
  assert.equal(fs.existsSync(path.join(root, 'utils')), false);
});

test('--with-story requires .storybook and imports the detected framework types', () => {
  const root = makeRepo({ deps: { '@storybook/nextjs': '^8' } });
  assert.equal(run(root, 'next', 'client-component', '--name', 'Tabs', '--with-story').status, 1);
  fs.mkdirSync(path.join(root, '.storybook'));
  const { status } = run(root, 'next', 'client-component', '--name', 'Tabs', '--with-story');
  assert.equal(status, 0);
  assert.match(read(root, 'components/tabs/tabs.stories.tsx'), /from '@storybook\/nextjs'/);
  assert.match(read(root, 'components/tabs/tabs.tsx'), /^'use client';/);
});

test('next component is a Server Component (no use client)', () => {
  const root = makeRepo();
  run(root, 'next', 'component', '--name', 'Hero');
  assert.doesNotMatch(read(root, 'components/hero/hero.tsx'), /^'use client';/m);
});

test('existing files abort the whole generation (atomic, never overwrite)', () => {
  const root = makeRepo({ files: { 'components/card/index.ts': 'keep me' } });
  const { status, json } = run(root, 'react', 'component', '--name', 'card');
  assert.equal(status, 1);
  assert.deepEqual(json.conflicts, ['components/card/index.ts']);
  assert.equal(fs.existsSync(path.join(root, 'components/card/card.tsx')), false);
  assert.equal(read(root, 'components/card/index.ts'), 'keep me');
});

test('--out outside the repo root is rejected', () => {
  const root = makeRepo();
  const { status, json } = run(root, 'react', 'util', '--name', 'x', '--out', '../escape');
  assert.equal(status, 1);
  assert.match(json.error, /outside/);
});

test('unknown generator, unknown flag and missing name are errors', () => {
  const root = makeRepo();
  assert.match(run(root, 'react', 'widget', '--name', 'x').json.error, /Unknown generator/);
  assert.match(run(root, 'react', 'util', '--name', 'x', '--bogus').json.error, /Unknown option/);
  assert.match(run(root, 'react', 'util').json.error, /--name/);
  assert.match(run(root, 'nope', 'util', '--name', 'x').json.error, /Unknown pack/);
});

test('--dry-run plans files without writing', () => {
  const root = makeRepo();
  const { status, json } = run(root, 'react', 'context', '--name', 'ThemeContext', '--dry-run');
  assert.equal(status, 0);
  assert.equal(json.dryRun, true);
  assert.deepEqual(json.files, ['contexts/theme-context.tsx']);
  assert.equal(fs.existsSync(path.join(root, 'contexts')), false);
});

test('repo overrides in .codegen/templates win over skill templates', () => {
  const root = makeRepo({ files: { '.codegen/templates/react/util/util.ts.tpl': 'export const {{name.camel}} = 1;\n' } });
  const { json } = run(root, 'react', 'util', '--name', 'answer');
  assert.deepEqual(json.overridden, ['utils/answer.ts']);
  assert.equal(read(root, 'utils/answer.ts'), 'export const answer = 1;\n');
});

test('next route: app dir detection, async params on Next 15, optional segment files', () => {
  const root = makeRepo({ deps: { next: '^15.1.0' }, dirs: ['src/app'] });
  const { status, json } = run(root, 'next', 'route', '--name', 'blog/[slug]', '--with-loading', '--with-error');
  assert.equal(status, 0, JSON.stringify(json));
  assert.deepEqual(json.created, [
    'src/app/blog/[slug]/page.tsx',
    'src/app/blog/[slug]/loading.tsx',
    'src/app/blog/[slug]/error.tsx',
  ]);
  const page = read(root, 'src/app/blog/[slug]/page.tsx');
  assert.match(page, /export default async function BlogSlugPage\(\{ params \}: BlogSlugPageProps\)/);
  assert.match(page, /params: Promise<\{ slug: string \}>/);
  assert.match(page, /const \{ slug \} = await params;/);
  assert.match(read(root, 'src/app/blog/[slug]/error.tsx'), /^'use client';/);
});

test('next route on Next 14 uses synchronous params', () => {
  const root = makeRepo({ deps: { next: '14.2.3' }, dirs: ['app'] });
  run(root, 'next', 'route', '--name', 'shop/[id]');
  const page = read(root, 'app/shop/[id]/page.tsx');
  assert.match(page, /params: \{ id: string \}/);
  assert.doesNotMatch(page, /await params/);
});

test('next api-route with test and params', () => {
  const root = makeRepo({ deps: { next: '^15', vitest: '^2' } });
  const { status, json } = run(root, 'next', 'api-route', '--name', 'users/[id]', '--with-test');
  assert.equal(status, 0, JSON.stringify(json));
  assert.match(read(root, 'app/api/users/[id]/route.ts'), /export async function GET\(/);
  assert.match(read(root, 'app/api/users/[id]/route.test.ts'), /Promise\.resolve\(\{ id: 'test' \}\)/);
});

test('next server-action and server-only util', () => {
  const root = makeRepo();
  run(root, 'next', 'server-action', '--name', 'createUserAction');
  assert.match(read(root, 'actions/create-user.ts'), /^'use server';[\s\S]*export async function createUserAction\(/);
  run(root, 'next', 'util', '--name', 'getSession', '--server-only');
  assert.match(read(root, 'lib/get-session.ts'), /^import 'server-only';/);
});

test('--list describes packs and generators', () => {
  const { status, json } = run(makeRepo(), '--list');
  assert.equal(status, 0);
  assert.ok(json.packs.react.generators.component.description);
  assert.ok(json.packs.next.generators.route.options['with-layout']);
});
