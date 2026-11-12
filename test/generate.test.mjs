import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { makeRepo, read, run } from './helpers.mjs';

test('react component: kebab folder under src/, named export, cn import, no test by default', () => {
  const root = makeRepo({ deps: { vitest: '^2' }, dirs: ['src'] });
  const { status, json } = run(root, 'react', 'component', '--name', 'UserCard', '--element', 'article', '--cn', '@/lib/utils');
  assert.equal(status, 0, JSON.stringify(json));
  assert.deepEqual(json.created, ['src/components/user-card/user-card.tsx']);
  const src = read(root, 'src/components/user-card/user-card.tsx');
  assert.match(src, /import \{ cn \} from '@\/lib\/utils';/);
  assert.match(src, /export function UserCard\(/);
  assert.doesNotMatch(src, /export default/);
  assert.equal(fs.existsSync(path.join(root, 'src/components/user-card/index.ts')), false);
  assert.ok(json.todo.length > 0);
  assert.ok(json.todo.every((t) => t.file && t.line > 0 && t.text));
});

test('--with-test uses the detected runner; vitest imports its globals', () => {
  const root = makeRepo({ deps: { vitest: '^2' } });
  const { status, json } = run(root, 'react', 'component', '--name', 'card', '--element', 'div', '--with-test');
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
  assert.equal(run(root, 'next', 'client-component', '--name', 'Tabs', '--element', 'div', '--with-story').status, 1);
  fs.mkdirSync(path.join(root, '.storybook'));
  const { status } = run(root, 'next', 'client-component', '--name', 'Tabs', '--element', 'div', '--with-story');
  assert.equal(status, 0);
  assert.match(read(root, 'components/tabs/tabs.stories.tsx'), /from '@storybook\/nextjs'/);
  assert.match(read(root, 'components/tabs/tabs.tsx'), /^'use client';/);
});

test('next component is a Server Component (no use client)', () => {
  const root = makeRepo();
  run(root, 'next', 'component', '--name', 'Hero', '--element', 'section');
  assert.doesNotMatch(read(root, 'components/hero/hero.tsx'), /^'use client';/m);
});

test('existing files abort the whole generation (atomic, never overwrite)', () => {
  const root = makeRepo({ files: { 'components/card/index.ts': 'keep me' } });
  const { status, json } = run(root, 'react', 'component', '--name', 'card', '--element', 'div', '--with-barrel');
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
  assert.deepEqual(json.created, ['contexts/theme-context.tsx']);
  assert.deepEqual(json.modified, []);
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

import { plan } from '../.agents/skills/codegen/scripts/lib/generate.mjs';
import { skillDir } from './helpers.mjs';

test('component requires --element from the allowlist and writes nothing otherwise', () => {
  const root = makeRepo();
  const missing = run(root, 'react', 'component', '--name', 'Card');
  assert.equal(missing.status, 1);
  assert.match(missing.json.error, /Missing required --element \(one of: div, span, section/);
  assert.match(run(root, 'react', 'component', '--name', 'Card', '--element', 'img').json.error, /--element must be one of/);
  assert.match(run(root, 'react', 'component', '--name', 'Card', '--element', '--variants').json.error, /--element needs a value/);
  assert.equal(fs.existsSync(path.join(root, 'components')), false);
});

test('--element button: typed props, type="button" default and an a11y todo', () => {
  const root = makeRepo();
  const { status, json } = run(root, 'react', 'component', '--name', 'IconButton', '--element', 'button');
  assert.equal(status, 0, JSON.stringify(json));
  const src = read(root, 'components/icon-button/icon-button.tsx');
  assert.match(src, /export type IconButtonProps = ComponentProps<'button'> & \{/);
  assert.match(src, /export function IconButton\(\{ className, type = 'button', children, \.\.\.props \}: IconButtonProps\)/);
  assert.match(src, /<button className=\{className\} type=\{type\} \{\.\.\.props\}>/);
  assert.match(src, /<\/button>/);
  assert.ok(json.todo.some((t) => /aria-label/.test(t.text)));
});

test('--element a requires href, also in the generated test and story', () => {
  const root = makeRepo({ deps: { vitest: '^2', '@storybook/react-vite': '^8' }, dirs: ['.storybook'] });
  run(root, 'react', 'component', '--name', 'NavLink', '--element', 'a', '--with-test', '--with-story');
  assert.match(read(root, 'components/nav-link/nav-link.tsx'), /Omit<ComponentProps<'a'>, 'href'> & \{ href: string \}/);
  assert.match(read(root, 'components/nav-link/nav-link.test.tsx'), /<NavLink href="\/">content<\/NavLink>/);
  assert.match(read(root, 'components/nav-link/nav-link.stories.tsx'), /href: '\/',/);
});

test('--variants needs class-variance-authority; then generates cva with the detected cn', () => {
  const bare = makeRepo();
  const failed = run(bare, 'react', 'component', '--name', 'Badge', '--element', 'span', '--variants');
  assert.equal(failed.status, 1);
  assert.deepEqual(failed.json.missing, ['class-variance-authority']);
  assert.equal(failed.json.install, 'npm i class-variance-authority');
  assert.equal(fs.existsSync(path.join(bare, 'components')), false);

  const root = makeRepo({
    deps: { 'class-variance-authority': '^0.7' },
    files: { 'components.json': JSON.stringify({ aliases: { utils: '@/lib/utils', ui: '@/components/ui' } }) },
  });
  const { status, json } = run(root, 'react', 'component', '--name', 'Badge', '--element', 'span', '--variants', '--with-barrel');
  assert.equal(status, 0, JSON.stringify(json));
  const src = read(root, 'components/badge/badge.tsx');
  assert.match(src, /import \{ cva, type VariantProps \} from 'class-variance-authority';/);
  assert.match(src, /import \{ cn \} from '@\/lib\/utils';/);
  assert.match(src, /export const badgeVariants = cva\(/);
  assert.match(src, /defaultVariants: \{ variant: 'default', size: 'default' \}/);
  assert.match(src, /ComponentProps<'span'> & VariantProps<typeof badgeVariants> & \{/);
  assert.match(src, /className=\{cn\(badgeVariants\(\{ variant, size \}\), className\)\}/);
  assert.match(read(root, 'components/badge/index.ts'), /export \{ Badge, badgeVariants \} from '\.\/badge';/);
});

test('--as-child uses the installed Radix Slot and keeps type off the child', () => {
  const root = makeRepo({ deps: { 'radix-ui': '^1' } });
  const { status, json } = run(root, 'next', 'client-component', '--name', 'Action', '--element', 'button', '--as-child');
  assert.equal(status, 0, JSON.stringify(json));
  const src = read(root, 'components/action/action.tsx');
  assert.match(src, /^'use client';/);
  assert.match(src, /import \{ Slot \} from 'radix-ui';/);
  assert.match(src, /const Comp = asChild \? Slot\.Root : 'button';/);
  assert.match(src, /<Comp className=\{className\} type=\{asChild \? undefined : type\} \{\.\.\.props\}>/);
  assert.match(src, /<\/Comp>/);
  assert.deepEqual(run(makeRepo(), 'react', 'component', '--name', 'X', '--element', 'a', '--as-child').json.missing, ['@radix-ui/react-slot']);
});

test('every element × variants × as-child × cn combination renders consistent TSX', async () => {
  const pack = JSON.parse(fs.readFileSync(path.join(skillDir, 'packs/react/pack.json'), 'utf8'));
  const deps = { 'class-variance-authority': '^0.7', '@radix-ui/react-slot': '^1' };
  const roots = [makeRepo({ deps }), makeRepo({ deps, files: { 'lib/utils.ts': 'export function cn() {}' } })];
  for (const root of roots) {
    for (const element of pack.generators.component.options.element.choices) {
      for (const variants of [false, true]) {
        for (const asChild of [false, true]) {
         for (const react of ['18', '19']) {
          const options = { name: `x-${element}`, element, profile: `react=${react}`, 'with-barrel': true, ...(variants && { variants: true }), ...(asChild && { 'as-child': true }) };
          const [main, index] = (await plan({ skillDir, root, pack: 'react', generator: 'component', options })).files;
          const src = main.content;
          const label = `${element} variants=${variants} asChild=${asChild} react=${react}`;
          const tag = asChild ? 'Comp' : element;
          assert.doesNotMatch(src, /\{\{/, label);
          assert.match(src, new RegExp(`<${tag}${react === '18' ? ' ref=\\{ref\\}' : ''} className=`), label);
          assert.equal(/forwardRef</.test(src), react === '18', label);
          assert.equal(/\.displayName = /.test(src), react === '18', label);
          assert.match(src, new RegExp(`</${tag}>`), label);
          assert.equal(/const Comp = /.test(src), asChild, label);
          assert.equal(/ type=\{/.test(src), element === 'button', label);
          assert.equal(/Variants = cva\(/.test(src), variants, label);
          assert.equal(/Variants \}/.test(index.content), variants, label);
         }
        }
      }
    }
  }
});

test('the element allowlist is identical across every component generator', () => {
  const choices = (pack, gen) =>
    JSON.parse(fs.readFileSync(path.join(skillDir, `packs/${pack}/pack.json`), 'utf8')).generators[gen].options.element.choices;
  const expected = 'div span section article aside nav header footer main ul ol li button a form label p h1 h2 h3 h4 h5 h6'.split(' ');
  assert.deepEqual(choices('react', 'component'), expected);
  assert.deepEqual(choices('next', 'component'), expected);
  assert.deepEqual(choices('next', 'client-component'), expected);
});

test('a 0.1.0-era component.tsx override still generates', () => {
  const override = 'export function {{name.pascal}}() { return null; }\n';
  const root = makeRepo({ files: { '.codegen/templates/react/component/component.tsx.tpl': override } });
  const { status, json } = run(root, 'react', 'component', '--name', 'Old', '--element', 'div');
  assert.equal(status, 0, JSON.stringify(json));
  assert.deepEqual(json.overridden, ['components/old/old.tsx']);
  assert.equal(read(root, 'components/old/old.tsx'), 'export function Old() { return null; }\n');
});

const formRepo = (extraUi = [], extra = {}) =>
  makeRepo({
    deps: { 'react-hook-form': '^7', zod: '^3', ...extra.deps },
    files: {
      'components.json': JSON.stringify({ aliases: { utils: '@/lib/utils', ui: '@/components/ui' } }),
      ...Object.fromEntries(['form', ...extraUi].map((ui) => [`src/components/ui/${ui}.tsx`, ''])),
      ...extra.files,
    },
  });

test('form-field needs react-hook-form and the shadcn primitives', () => {
  const noRhf = run(makeRepo(), 'react', 'form-field', '--name', 'EmailField', '--control', 'input');
  assert.equal(noRhf.status, 1);
  assert.deepEqual(noRhf.json.missing, ['react-hook-form']);

  const noUi = run(formRepo(), 'react', 'form-field', '--name', 'EmailField', '--control', 'input');
  assert.equal(noUi.status, 1);
  assert.deepEqual(noUi.json.missingUi, ['input']);
  assert.equal(noUi.json.install, 'npx shadcn@latest add input');

  assert.match(run(formRepo(), 'react', 'form-field', '--name', 'X').json.error, /Missing required --control \(one of: input, textarea, select, checkbox\)/);
});

test('form-field input (next): client component wired to the form primitives in src/', () => {
  const root = formRepo(['input'], { deps: { next: '^15' } });
  const { status, json } = run(root, 'next', 'form-field', '--name', 'EmailField', '--control', 'input');
  assert.equal(status, 0, JSON.stringify(json));
  assert.deepEqual(json.created, ['src/components/email-field/email-field.tsx']);
  const src = read(root, 'src/components/email-field/email-field.tsx');
  assert.match(src, /^'use client';/);
  assert.match(src, /import \{ useFormContext, type FieldPath, type FieldValues \} from 'react-hook-form';/);
  assert.match(src, /from '@\/components\/ui\/form';/);
  assert.match(src, /import \{ Input \} from '@\/components\/ui\/input';/);
  assert.match(src, /export function EmailField<TValues extends FieldValues = FieldValues>\(/);
  assert.match(src, /<Input \{\.\.\.field\} \/>/);
  assert.match(src, /<FormMessage \/>/);
  assert.doesNotMatch(src, /Select|Checkbox|Textarea/);
  assert.ok(json.todo.some((t) => /autoComplete/.test(t.text)));
});

test('form-field select and checkbox (react): right primitives, no use client', () => {
  const root = formRepo(['select', 'checkbox']);
  run(root, 'react', 'form-field', '--name', 'PlanField', '--control', 'select');
  const select = read(root, 'src/components/plan-field/plan-field.tsx');
  assert.doesNotMatch(select, /'use client'/);
  assert.match(select, /options: \{ value: string; label: string \}\[\];/);
  assert.match(select, /<Select onValueChange=\{field\.onChange\} defaultValue=\{field\.value\}>/);
  assert.match(select, /<SelectItem key=\{option\.value\} value=\{option\.value\}>/);

  run(root, 'react', 'form-field', '--name', 'TermsField', '--control', 'checkbox');
  assert.match(read(root, 'src/components/terms-field/terms-field.tsx'), /<Checkbox checked=\{field\.value === true\} onCheckedChange=\{\(checked\) => field\.onChange\(checked === true\)\} \/>/);
});

test('form-field --with-test renders inside a Form harness', () => {
  const root = formRepo(['checkbox'], { deps: { vitest: '^2' } });
  const { status, json } = run(root, 'react', 'form-field', '--name', 'TermsField', '--control', 'checkbox', '--with-test');
  assert.equal(status, 0, JSON.stringify(json));
  const t = read(root, 'src/components/terms-field/terms-field.test.tsx');
  assert.match(t, /from 'vitest'/);
  assert.match(t, /useForm\(\{ defaultValues: \{ field: false \} \}\)/);
  assert.match(t, /import \{ Form \} from '@\/components\/ui\/form';/);
  assert.match(t, /getByLabelText\('Label'\)/);
});

test('an override that ignores a flag the skill template handles is refused, writing nothing', () => {
  const override = 'export function {{name.pascal}}() { return null; }\n';
  const root = makeRepo({
    deps: { 'class-variance-authority': '^0.7' },
    files: { '.codegen/templates/react/component/component.tsx.tpl': override },
  });
  const { status, json } = run(root, 'react', 'component', '--name', 'Card', '--element', 'div', '--variants');
  assert.equal(status, 1);
  assert.match(json.error, /override .*component\/component\.tsx\.tpl ignores --variants/);
  assert.equal(fs.existsSync(path.join(root, 'components')), false);
});

test('component registers itself in an existing components barrel, idempotently', () => {
  const root = makeRepo({ files: { 'components/index.ts': "export * from './a';\n" } });
  const { json } = run(root, 'next', 'component', '--name', 'UserCard', '--element', 'article');
  assert.deepEqual(json.modified, ['components/index.ts']);
  assert.equal(read(root, 'components/index.ts'), "export * from './a';\nexport * from './user-card/user-card';\n");
});

test('--with-barrel adds the folder index.ts, and the components barrel points at the folder', () => {
  const root = makeRepo({ files: { 'components/index.ts': '' } });
  const { json } = run(root, 'react', 'component', '--name', 'UserCard', '--element', 'article', '--with-barrel');
  assert.deepEqual(json.created, ['components/user-card/user-card.tsx', 'components/user-card/index.ts']);
  assert.equal(read(root, 'components/index.ts'), "export * from './user-card';\n");
});

// A stand-in for the repo's Prettier: prefixes each file with a line, so formatting and moved todo lines are visible.
const fakePrettier = (bin) => ({
  'node_modules/prettier/package.json': JSON.stringify({ name: 'prettier', bin }),
  [`node_modules/prettier/${bin.replace('./', '')}`]:
    "const fs = require('fs');\nfor (const f of process.argv.slice(2).filter((a) => !a.startsWith('--'))) fs.writeFileSync(f, '// formatted\\n' + fs.readFileSync(f, 'utf8'));\n",
});

test("written files go through the repo's Prettier, and todo lines follow the formatted file", () => {
  const plain = run(makeRepo(), 'react', 'hook', '--name', 'useThing').json;
  assert.equal(plain.format, null);
  const root = makeRepo({ files: fakePrettier('./bin/prettier.cjs') });
  const { json } = run(root, 'react', 'hook', '--name', 'useThing');
  assert.deepEqual(json.format, { tool: 'prettier', ok: true });
  assert.match(read(root, 'hooks/use-thing.ts'), /^\/\/ formatted\n/);
  assert.deepEqual(json.todo.map((t) => t.line), plain.todo.map((t) => t.line + 1));
});

test('--format formats any files with the repo Prettier; without one it is a no-op', () => {
  const root = makeRepo({ files: { ...fakePrettier('./bin/prettier.cjs'), 'src/a.ts': 'a\n', 'src/b.ts': 'b\n' } });
  const { status, json } = run(root, '--format', 'src/a.ts', 'src/b.ts');
  assert.equal(status, 0);
  assert.deepEqual(json, { ok: true, format: { tool: 'prettier', ok: true } });
  assert.equal(read(root, 'src/b.ts'), '// formatted\nb\n');
  assert.deepEqual(run(makeRepo({ files: { 'a.ts': '' } }), '--format', 'a.ts').json, { ok: true, format: null });
  assert.equal(run(root, '--format').status, 1);
});

test('.codegen/config.json "out" sets a generator folder as written; --out still wins', () => {
  const config = JSON.stringify({ out: { util: 'src/utils', component: 'src/components/modules' } });
  const root = makeRepo({ dirs: ['src'], files: { '.codegen/config.json': config } });
  assert.deepEqual(run(root, 'next', 'util', '--name', 'slugify').json.created, ['src/utils/slugify.ts']);
  assert.deepEqual(run(root, 'next', 'component', '--name', 'Stats', '--element', 'ul').json.created, ['src/components/modules/stats/stats.tsx']);
  assert.deepEqual(run(root, 'next', 'component', '--name', 'Pill', '--element', 'span', '--out', 'src/components/ui').json.created, ['src/components/ui/pill/pill.tsx']);
  assert.deepEqual(run(root, 'next', 'hook', '--name', 'useX').json.created, ['src/hooks/use-x.ts']);
});

test('.codegen/config.json is validated: unknown generators in "out", bad "exports"', () => {
  const bad = (config) => run(makeRepo({ files: { '.codegen/config.json': JSON.stringify(config) } }), 'next', 'util', '--name', 'a').json.error;
  assert.match(bad({ out: { utils: 'src/utils' } }), /Unknown generator utils in "out"/);
  assert.match(bad({ out: { util: '' } }), /must map generator names to folders/);
  assert.match(bad({ exports: 'default' }), /"exports" .* must be one of: function, const/);
});

test('"exports": "const" writes const components with a local props type and one export list', () => {
  const deps = { 'class-variance-authority': '^0.7', '@radix-ui/react-slot': '^1' };
  const files = { '.codegen/config.json': JSON.stringify({ exports: 'const' }), 'lib/utils.ts': 'export function cn() {}' };
  const root = makeRepo({ deps, files });
  run(root, 'next', 'component', '--name', 'Badge', '--element', 'span', '--variants', '--as-child', '--with-barrel');
  const src = read(root, 'components/badge/badge.tsx');
  assert.match(src, /^const badgeVariants = cva\(/m);
  assert.match(src, /^type BadgeProps = /m);
  assert.match(src, /^const Badge = \(\{ .* \}: BadgeProps\) => \{$/m);
  assert.match(src, /^\};\n\nexport \{ Badge, badgeVariants \};\n$/m);
  assert.doesNotMatch(src, /export (function|const|type)/);
  assert.equal(read(root, 'components/badge/index.ts'), "export { Badge, badgeVariants } from './badge';\n");

  const r18 = makeRepo({ deps: { react: '^18.3' }, files: { '.codegen/config.json': JSON.stringify({ exports: 'const' }) } });
  run(r18, 'react', 'component', '--name', 'Card', '--element', 'article');
  assert.match(read(r18, 'components/card/card.tsx'), /^const Card = forwardRef<HTMLElement, CardProps>\(function Card[\s\S]*Card\.displayName = 'Card';\n\nexport \{ Card \};\n$/m);

  const styled = makeRepo({ deps: { 'styled-components': '^6' }, files: { '.codegen/config.json': JSON.stringify({ exports: 'const' }) } });
  run(styled, 'react', 'component', '--name', 'Tile', '--element', 'section');
  const tile = read(styled, 'components/tile/tile.tsx');
  assert.match(tile, /^const Tile = \(/m);
  assert.match(tile, /\nexport \{ Tile \};\n$/);
});

test('Prettier 2 bin layout and a failing formatter: files stay written, the error is reported', () => {
  const root = makeRepo({ files: { ...fakePrettier('./bin-prettier.js'), 'node_modules/prettier/package.json': JSON.stringify({ bin: { prettier: './bin-prettier.js' } }) } });
  assert.equal(run(root, 'react', 'util', '--name', 'a').json.format.ok, true);
  fs.writeFileSync(path.join(root, 'node_modules/prettier/bin-prettier.js'), "console.error('[error] boom'); process.exit(2);\n");
  const { status, json } = run(root, 'react', 'util', '--name', 'b');
  assert.equal(status, 0);
  assert.deepEqual(json.format, { tool: 'prettier', ok: false, error: '[error] boom' });
  assert.ok(fs.existsSync(path.join(root, 'utils/b.ts')));
});

test('no barrel, no change: the append is reported as skipped', () => {
  const { json } = run(makeRepo(), 'react', 'component', '--name', 'UserCard', '--element', 'article');
  assert.deepEqual(json.modified, []);
  assert.deepEqual(json.skipped, [{ path: 'components/index.ts', action: 'append', reason: 'missing' }]);
});

test('a repo override restyles the barrel line', () => {
  const root = makeRepo({ files: { 'components/index.ts': '', '.codegen/templates/react/barrel/export.ts.tpl': 'export * from "./{{name.kebab}}"\n' } });
  const { json } = run(root, 'react', 'component', '--name', 'UserCard', '--element', 'article');
  assert.equal(read(root, 'components/index.ts'), 'export * from "./user-card"\n');
  assert.ok(json.overridden.includes('components/index.ts'));
});

test('--dry-run reports conflicts the real run would refuse', () => {
  const root = makeRepo({ files: { 'contexts/theme-context.tsx': 'taken' } });
  const { status, json } = run(root, 'react', 'context', '--name', 'ThemeContext', '--dry-run');
  assert.equal(status, 1);
  assert.equal(json.ok, false);
  assert.deepEqual(json.conflicts, ['contexts/theme-context.tsx']);
});

test('--detect prints the profile; every result carries it', () => {
  const root = makeRepo({ deps: { react: '^19' } });
  const detect = run(root, '--detect').json;
  assert.equal(detect.ok, true);
  assert.deepEqual(detect.profile.app, { value: 'react-spa', source: 'detected' });
  assert.equal(run(root, 'react', 'util', '--name', 'x').json.profile.react.value, '19');
  assert.equal(run(root, 'react', 'util', '--name', 'x', '--profile', 'nope=1').json.ok, false);
});

test('react 18 components forward refs; react 19 is unchanged', () => {
  const root = makeRepo({ deps: { react: '^18.3' } });
  run(root, 'react', 'component', '--name', 'Card', '--element', 'article', '--with-barrel');
  const src = read(root, 'components/card/card.tsx');
  assert.match(src, /import \{ forwardRef, type ComponentPropsWithoutRef \} from 'react';/);
  assert.match(src, /export const Card = forwardRef<HTMLElement, CardProps>\(function Card\(\{ className, children, \.\.\.props \}, ref\) \{/);
  assert.match(src, /<article ref=\{ref\} /);
  assert.match(src, /Card\.displayName = 'Card';/);
  assert.match(read(root, 'components/card/index.ts'), /export \{ Card \} from '\.\/card';/);
});

test('cn import follows existing ui components', () => {
  const root = makeRepo({ deps: { react: '^19' }, files: { 'components/ui/button.tsx': "import { cn } from 'cn';\n" } });
  run(root, 'react', 'component', '--name', 'Card', '--element', 'article');
  assert.match(read(root, 'components/card/card.tsx'), /import \{ cn \} from 'cn';/);
});

test('base primitives: --as-child emits a render prop with Base UI useRender', () => {
  const root = makeRepo({ deps: { react: '^19', '@base-ui/react': '^1.9.0' }, files: { 'components.json': '{"style":"base-nova"}' } });
  const { json } = run(root, 'react', 'component', '--name', 'Cta', '--element', 'button', '--as-child');
  assert.equal(json.ok, true, JSON.stringify(json));
  const src = read(root, 'components/cta/cta.tsx');
  assert.match(src, /import \{ useRender \} from '@base-ui\/react\/use-render';/);
  assert.match(src, /export type CtaProps = useRender\.ComponentProps<'button'> & \{/);
  assert.match(src, /export function Cta\(\{ className, render, type = 'button', children, \.\.\.props \}: CtaProps\)/);
  assert.match(src, /return useRender\(\{\n    defaultTagName: 'button',\n    render,\n    props: \{ className: className, type: render \? undefined : type, \.\.\.props, children \},\n  \}\);/);
  assert.doesNotMatch(src, /asChild|Slot|forwardRef/);
});

test('base primitives: React 18 passes the forwarded ref; next-app makes it a client component; package required', () => {
  const root = makeRepo({ deps: { next: '^16', react: '^18.3', '@base-ui/react': '^1.9.0' }, dirs: ['app'], files: { 'components.json': '{"style":"base-nova"}' } });
  run(root, 'next', 'component', '--name', 'Cta', '--element', 'a', '--as-child');
  const src = read(root, 'components/cta/cta.tsx');
  assert.match(src, /^'use client';/);
  assert.match(src, /export type CtaProps = Omit<useRender\.ComponentProps<'a'>, 'ref' \| 'href'> & \{ href: string \}/);
  assert.match(src, /forwardRef<HTMLAnchorElement, CtaProps>/);
  assert.match(src, /    render,\n    ref,\n/);
  const bare = makeRepo({ deps: { react: '^19' }, files: { 'components.json': '{"style":"base-nova"}' } });
  assert.deepEqual(run(bare, 'react', 'component', '--name', 'X', '--element', 'button', '--as-child').json.missing, ['@base-ui/react']);
});

test('styled-components component: styled root, transient variant props, no cn/cva', () => {
  const root = makeRepo({ deps: { react: '^19', 'styled-components': '^6' } });
  const { json } = run(root, 'react', 'component', '--name', 'Badge', '--element', 'span', '--variants');
  assert.equal(json.ok, true, JSON.stringify(json));
  const src = read(root, 'components/badge/badge.tsx');
  assert.match(src, /import styled from 'styled-components';/);
  assert.match(src, /const Root = styled\.span<\{ \$variant: BadgeVariant; \$size: BadgeSize \}>`/);
  assert.match(src, /\$variant=\{variant\}/);
  assert.doesNotMatch(src, /cva|cn\(|className=/);
});

test('MUI repos import styled from @mui/material/styles; next-app css-in-js is a client component', () => {
  const root = makeRepo({ deps: { next: '^16', react: '^19', '@mui/material': '^7', '@emotion/react': '^11', '@emotion/styled': '^11' }, dirs: ['app'] });
  run(root, 'next', 'component', '--name', 'Panel', '--element', 'section');
  const src = read(root, 'components/panel/panel.tsx');
  assert.match(src, /^'use client';/);
  assert.match(src, /import \{ styled \} from '@mui\/material\/styles';/);
  assert.match(src, /const Root = styled\('section'\)/);
});

test('css-in-js refuses --as-child; form-field refuses non-radix or non-tailwind', () => {
  const sc = makeRepo({ deps: { react: '^19', 'styled-components': '^6' } });
  assert.match(run(sc, 'react', 'component', '--name', 'A', '--element', 'a', '--as-child').json.error, /--as-child is not supported with styling styled-components/);
  assert.match(run(sc, 'react', 'form-field', '--name', 'Email', '--control', 'input').json.error, /does not support/);
});

test('tailwind + styled-components repo uses tailwind, and the flag switches', () => {
  const root = makeRepo({ deps: { react: '^19', tailwindcss: '^4', 'styled-components': '^6' } });
  assert.match(run(root, 'react', 'component', '--name', 'A', '--element', 'p', '--dry-run').json.profile.styling.value, /tailwind-4/);
  run(root, 'react', 'component', '--name', 'B', '--element', 'p', '--profile', 'styling=styled-components');
  assert.match(read(root, 'components/b/b.tsx'), /styled-components/);
});

test('pages router: route and api-route land in pages/, app-only flags and actions are refused', () => {
  const root = makeRepo({ deps: { next: '14.2.0', react: '^18' }, dirs: ['pages'] });
  run(root, 'next', 'route', '--name', 'blog/[slug]');
  const page = read(root, 'pages/blog/[slug].tsx');
  assert.match(page, /export default function BlogSlugPage\(/);
  assert.match(page, /TODO\(codegen\).*getServerSideProps/);
  run(root, 'next', 'api-route', '--name', 'users/[id]');
  assert.match(read(root, 'pages/api/users/[id].ts'), /NextApiRequest, res: NextApiResponse/);
  assert.match(run(root, 'next', 'route', '--name', 'x', '--with-loading').json.error, /--with-loading is not supported with app next-pages/);
  assert.match(run(root, 'next', 'server-action', '--name', 'save').json.error, /does not support app next-pages/);
  assert.match(run(root, 'next', 'route', '--name', '(m)/about').json.error, /App Router only/);
});

test('pages router components carry no RSC notes or use client', () => {
  const root = makeRepo({ deps: { next: '^15', react: '^19' }, dirs: ['pages'] });
  run(root, 'next', 'client-component', '--name', 'Toggle', '--element', 'button');
  assert.doesNotMatch(read(root, 'components/toggle/toggle.tsx'), /use client|Server Component/);
});

test('server action takes (prevState, formData) for useActionState', () => {
  const root = makeRepo({ deps: { next: '^16' }, dirs: ['app'] });
  run(root, 'next', 'server-action', '--name', 'saveProfile');
  assert.match(read(root, 'actions/save-profile.ts'), /export async function saveProfileAction\(prevState: SaveProfileState, formData: FormData\): Promise<SaveProfileState>/);
});

test('unknown or out-of-matrix targets are refused by the generators that depend on them', () => {
  const err = (deps, files, ...args) => run(makeRepo({ deps, files }), ...args).json.error ?? '';
  assert.match(err({ react: '^17.0.2' }, {}, 'react', 'component', '--name', 'A', '--element', 'p'), /react 17 is not supported \(supported: 18, 19\)/);
  assert.match(err({ next: '12.3.0' }, { 'app/.keep': '' }, 'next', 'route', '--name', 'x'), /next 12 is not supported/);
  assert.match(err({ tailwindcss: 'catalog:' }, {}, 'react', 'component', '--name', 'A', '--element', 'p'), /styling could not be detected/);
  assert.match(err({ next: 'catalog:' }, { 'app/.keep': '' }, 'next', 'route', '--name', 'blog/[slug]'), /next could not be detected/);
  assert.match(err({}, { 'components.json': '{"style":"aria-nova"}' }, 'react', 'component', '--name', 'A', '--element', 'p', '--as-child'), /primitives aria is not supported/);
  assert.equal(run(makeRepo({ deps: { react: '^17' } }), 'react', 'util', '--name', 'x').json.ok, true);
});

test('index routes: app/page.tsx, pages/index.tsx and pages/api/index.ts', () => {
  const app = makeRepo({ deps: { next: '^16' }, dirs: ['app'] });
  assert.deepEqual(run(app, 'next', 'route', '--name', '/').json.created, ['app/page.tsx']);
  const pages = makeRepo({ deps: { next: '^15' }, dirs: ['pages'] });
  assert.deepEqual(run(pages, 'next', 'route', '--name', '/').json.created, ['pages/index.tsx']);
  assert.deepEqual(run(pages, 'next', 'api-route', '--name', '/').json.created, ['pages/api/index.ts']);
});
