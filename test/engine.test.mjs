import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { plan, write } from '../.agents/skills/codegen/scripts/lib/generate.mjs';
import { installCommand, missingDependencies } from '../.agents/skills/codegen/scripts/lib/deps.mjs';
import { makeRepo, makeSkill } from './helpers.mjs';

const kindOption = { kind: { type: 'string', required: true, choices: ['a', 'b'], description: 'k' } };

async function planWith(generator, { options = {}, repo = {} } = {}) {
  return plan({ skillDir: makeSkill(generator), root: makeRepo(repo), pack: 't', generator: 'g', options: { name: 'thing', ...options } });
}

function throwsWith(promise, check) {
  return assert.rejects(promise, (err) => {
    check(err);
    return true;
  });
}

test('required option: missing is an error that lists the choices', async () => {
  await assert.rejects(planWith({ options: kindOption }), /Missing required --kind \(one of: a, b\)/);
});

test('choices: an unknown value is an error', async () => {
  await assert.rejects(planWith({ options: kindOption }, { options: { kind: 'c' } }), /--kind must be one of: a, b\. Got "c"/);
});

test('string option passed without a value is an error', async () => {
  await assert.rejects(planWith({ options: kindOption }, { options: { kind: true } }), /--kind needs a value/);
});

test('choices expose an <option>Is map to templates', async () => {
  const gen = { options: kindOption, template: '{{#if kindIs.b}}B{{else}}A{{/if}}' };
  assert.equal((await planWith(gen, { options: { kind: 'b' } })).files[0].content, 'B');
  assert.equal((await planWith(gen, { options: { kind: 'a' } })).files[0].content, 'A');
});

test('generator and option requires: missing packages fail with an install hint', async () => {
  const gen = {
    requires: ['react-hook-form'],
    options: { fancy: { type: 'boolean', requires: ['class-variance-authority'], description: 'f' } },
  };
  await planWith(gen, { repo: { deps: { 'react-hook-form': '^7' } } });
  await throwsWith(
    planWith(gen, { options: { fancy: true } }),
    (err) => {
      assert.match(err.message, /Missing requirements for t\/g: react-hook-form, class-variance-authority/);
      assert.deepEqual(err.details.missing, ['react-hook-form', 'class-variance-authority']);
      assert.equal(err.details.install, 'npm i react-hook-form class-variance-authority');
    },
  );
});

test('an "a|b" requirement is satisfied by either package and suggests the first', () => {
  assert.deepEqual(missingDependencies({ dependencies: { 'radix-ui': '^1' } }, ['@radix-ui/react-slot|radix-ui']), []);
  assert.deepEqual(missingDependencies(null, ['@radix-ui/react-slot|radix-ui', 'zod', 'zod']), ['@radix-ui/react-slot', 'zod']);
});

test('installCommand follows the lockfile, also from a parent folder (monorepos)', () => {
  const mono = makeRepo({ files: { 'pnpm-lock.yaml': '', 'apps/web/package.json': '{}' } });
  assert.equal(installCommand(path.join(mono, 'apps/web'), ['zod']), 'pnpm add zod');
  assert.equal(installCommand(makeRepo({ files: { 'yarn.lock': '' } }), ['zod', 'x']), 'yarn add zod x');
  assert.equal(installCommand(makeRepo(), ['zod']), 'npm i zod');
});

import { detectCn, detectShadcnAliases, detectSlot, resolveAliasDir } from '../.agents/skills/codegen/scripts/lib/detect.mjs';

test('detectShadcnAliases reads components.json and tolerates its absence', () => {
  const root = makeRepo({ files: { 'components.json': JSON.stringify({ aliases: { utils: '@/lib/utils', ui: '@/components/ui' } }) } });
  assert.deepEqual(detectShadcnAliases(root), { utils: '@/lib/utils', ui: '@/components/ui' });
  assert.deepEqual(detectShadcnAliases(makeRepo()), { utils: null, ui: null });
  assert.deepEqual(detectShadcnAliases(makeRepo({ files: { 'components.json': '{ broken' } })), { utils: null, ui: null });
});

test('detectCn: components.json alias wins, then lib/utils exporting cn, else null', () => {
  assert.equal(detectCn(makeRepo({ files: { 'components.json': JSON.stringify({ aliases: { utils: '~/utils/cn' } }) } })), '~/utils/cn');
  assert.equal(detectCn(makeRepo({ files: { 'src/lib/utils.ts': 'export function cn(...inputs) {}' } })), '@/lib/utils');
  assert.equal(detectCn(makeRepo({ files: { 'lib/utils.ts': 'export const cn = (...i) => i;' } })), '@/lib/utils');
  assert.equal(detectCn(makeRepo({ files: { 'lib/utils.ts': 'export function cnx() {}' } })), null);
});

test('detectSlot prefers @radix-ui/react-slot, then the unified radix-ui package', () => {
  assert.deepEqual(detectSlot({ dependencies: { '@radix-ui/react-slot': '^1' } }), { import: '@radix-ui/react-slot', component: 'Slot' });
  assert.deepEqual(detectSlot({ dependencies: { 'radix-ui': '^1' } }), { import: 'radix-ui', component: 'Slot.Root' });
  assert.equal(detectSlot({}), null);
});

test('resolveAliasDir maps @/ and ~/ aliases onto src/ when the repo uses it', () => {
  assert.equal(resolveAliasDir(makeRepo({ dirs: ['src/components/ui'] }), '@/components/ui'), 'src/components/ui');
  assert.equal(resolveAliasDir(makeRepo({ dirs: ['components/ui'] }), '@/components/ui'), 'components/ui');
  assert.equal(resolveAliasDir(makeRepo({ dirs: ['src'] }), '~/components/ui'), 'src/components/ui');
});

test('cn option is auto-detected when not passed; --cn still wins', async () => {
  const gen = { options: { cn: { type: 'string', description: 'c' } }, template: '[{{cn}}]' };
  const repo = { files: { 'lib/utils.ts': 'export function cn() {}' } };
  assert.equal((await planWith(gen, { repo })).files[0].content, '[@/lib/utils]');
  assert.equal((await planWith(gen, { repo, options: { cn: '#/cn' } })).files[0].content, '[#/cn]');
  assert.equal((await planWith(gen)).files[0].content, '[]');
});

test('requiresUi: missing shadcn primitives fail with an add command (src/ repo)', async () => {
  const gen = { requiresUi: ['form', '{{kind}}'], options: kindOption };
  await throwsWith(
    planWith(gen, { options: { kind: 'a' }, repo: { files: { 'src/components/ui/form.tsx': '' } } }),
    (err) => {
      assert.deepEqual(err.details.missing, []);
      assert.deepEqual(err.details.missingUi, ['a']);
      assert.equal(err.details.install, 'npx shadcn@latest add a');
      assert.match(err.message, /@\/components\/ui\/a/);
    },
  );
  const ok = { files: { 'src/components/ui/form.tsx': '', 'src/components/ui/a.tsx': '' } };
  await planWith(gen, { options: { kind: 'a' }, repo: ok });
});

test('missing packages and primitives are reported together', async () => {
  const gen = { requires: ['react-hook-form'], requiresUi: ['form'] };
  await throwsWith(
    planWith(gen),
    (err) => assert.equal(err.details.install, 'npm i react-hook-form && npx shadcn@latest add form'),
  );
});

test('boolean option given a value is an error, not silently true', async () => {
  const gen = { options: { fancy: { type: 'boolean', description: 'f' } } };
  await assert.rejects(planWith(gen, { options: { fancy: 'false' } }), /--fancy is a flag and takes no value/);
  await planWith(gen, { options: { fancy: true } });
});

test('pack helpers and repo helpers, repo wins', async () => {
  const gen = {
    template: '{{tag name.raw}}',
    packFiles: { 't/helpers.mjs': "export default { tag: (v) => `pack:${v}` };" },
  };
  assert.equal((await planWith(gen)).files[0].content, 'pack:thing');
  const repo = { files: { '.codegen/helpers.mjs': "export default { tag: (v) => `repo:${v}` };" } };
  assert.equal((await planWith(gen, { repo })).files[0].content, 'repo:thing');
});

test('a borrowed template resolves partials from the pack that owns it', async () => {
  const gen = {
    files: [{ template: '@o/x.tpl', path: 'a.ts' }],
    packFiles: {
      'o/pack.json': '{"generators":{}}',
      'o/templates/x.tpl': '{{> p}}',
      'o/templates/_partials/p.tpl': 'owner',
      't/templates/_partials/p.tpl': 'runner',
    },
  };
  assert.equal((await planWith(gen)).files[0].content, 'owner');
  const repo = { files: { '.codegen/templates/o/_partials/p.tpl': 'override' } };
  assert.equal((await planWith(gen, { repo })).files[0].content, 'override');
});

const append = (extra = {}) => ({ type: 'append', path: 'index.ts', text: "export * from './{{name.kebab}}';", ...extra });

test('files still work and run before actions', async () => {
  const { files } = await planWith({ actions: [append()] }, { repo: { files: { 'out/index.ts': "export * from './a';\n" } } });
  assert.deepEqual(files.map((f) => [f.path, f.kind]), [['out/thing.ts', 'create'], ['out/index.ts', 'modify']]);
  assert.equal(files[1].content, "export * from './a';\nexport * from './thing';\n");
});

test('append is unique by default and skipIfMissing skips a missing target', async () => {
  const repo = { files: { 'out/index.ts': "export * from './thing';\n" } };
  assert.deepEqual((await planWith({ actions: [append()] }, { repo })).skipped, [{ path: 'out/index.ts', action: 'append', reason: 'already present' }]);
  assert.deepEqual((await planWith({ actions: [append({ skipIfMissing: true })] })).skipped, [{ path: 'out/index.ts', action: 'append', reason: 'missing' }]);
  await assert.rejects(planWith({ actions: [append()] }), /append: out\/index\.ts does not exist/);
});

test('append after a pattern; a pattern that does not match is an error', async () => {
  const repo = { files: { 'out/r.ts': 'const routes = [\n];\n' } };
  const a = { type: 'append', path: 'r.ts', pattern: 'routes = \\[', text: "  '{{name.kebab}}',", separator: '\n' };
  assert.equal((await planWith({ actions: [a] }, { repo })).files[1].content, "const routes = [\n  'thing',\n];\n");
  await assert.rejects(planWith({ actions: [{ ...a, pattern: 'nope' }] }, { repo }), /append: pattern \/nope\/ not found in out\/r\.ts/);
});

test('modify replaces the first match with $ references; append inserts $ literally', async () => {
  const repo = { files: { 'out/m.ts': 'a\nb\n' } };
  const m = { type: 'modify', path: 'm.ts', pattern: '^(b)$', text: '$1-${x}' };
  assert.equal((await planWith({ actions: [m] }, { repo })).files[1].content, 'a\nb-${x}\n');
  const a = { type: 'append', path: 'm.ts', text: '`${x}` $&' };
  assert.equal((await planWith({ actions: [a] }, { repo })).files[1].content, 'a\nb\n`${x}` $&\n');
});

test('end-of-file append handles a missing trailing newline and CRLF', async () => {
  const noNl = { files: { 'out/index.ts': "export * from './a';" } };
  assert.equal((await planWith({ actions: [append()] }, { repo: noNl })).files[1].content, "export * from './a';\nexport * from './thing';\n");
  const crlf = { files: { 'out/index.ts': "export * from './a';\r\n" } };
  assert.equal((await planWith({ actions: [append()] }, { repo: crlf })).files[1].content, "export * from './a';\r\nexport * from './thing';\r\n");
});

test('an invalid pattern is a CodegenError naming the action', async () => {
  const repo = { files: { 'out/m.ts': 'x' } };
  await assert.rejects(planWith({ actions: [{ type: 'modify', path: 'm.ts', pattern: '(', text: 'y' }] }, { repo }), /modify m\.ts: invalid pattern/);
});

test('add with skipIfExists, then append to it in the same run', async () => {
  const actions = [{ type: 'add', path: 'index.ts', text: '', skipIfExists: true }, append()];
  const { files } = await planWith({ files: [], actions });
  assert.deepEqual(files.map((f) => [f.path, f.kind, f.content]), [['out/index.ts', 'create', "export * from './thing';\n"]]);
});

test('root-relative paths follow the src/ rule; template and text are exclusive', async () => {
  const repo = { dirs: ['src/app'], files: { 'src/app/layout.tsx': 'x\n' } };
  const a = { type: 'append', path: '/app/layout.tsx', text: 'y' };
  assert.equal((await planWith({ files: [], actions: [a] }, { repo })).files[0].path, 'src/app/layout.tsx');
  await assert.rejects(planWith({ files: [], actions: [{ ...a, path: '/../x' }] }, { repo }), /outside the repo root/);
  await assert.rejects(planWith({ files: [], actions: [{ ...a, template: 'x.tpl' }] }, { repo }), /exactly one of template or text/);
});

test('addMany renders a template folder, names included, with per-file repo overrides', async () => {
  const gen = {
    files: [],
    actions: [{ type: 'addMany', templates: 'feature', path: '{{name.kebab}}' }],
    packFiles: {
      't/templates/feature/{{name.kebab}}.ts.tpl': 'a',
      't/templates/feature/parts/{{name.kebab}}-part.ts.tpl': 'b',
    },
  };
  const { files } = await planWith(gen, { repo: { files: { '.codegen/templates/t/feature/parts/{{name.kebab}}-part.ts.tpl': 'B' } } });
  assert.deepEqual(files.map((f) => [f.path, f.content, f.overridden]), [
    ['out/thing/parts/thing-part.ts', 'B', true],
    ['out/thing/thing.ts', 'a', false],
  ]);
});

test('custom returns changes, sees planned files, and cannot leave the root', async () => {
  const mod = (body) => ({ files: [], actions: [{ type: 'add', path: 'a.ts', text: 'A' }, { type: 'custom', module: 'm.mjs' }], packFiles: { 't/actions/m.mjs': body } });
  const ok = "export default (ctx, api) => [{ path: 'b.ts', content: api.read('a.ts') + ctx.name.kebab }];";
  assert.deepEqual((await planWith(mod(ok))).files.map((f) => [f.path, f.content]), [['out/a.ts', 'A'], ['out/b.ts', 'Athing']]);
  await assert.rejects(planWith(mod("export default () => [{ path: '/../evil.ts', content: '' }];")), /outside the repo root/);
  await assert.rejects(planWith(mod('export default () => null;')), /custom m\.mjs must return an array/);
});

test('a conflicting add leaves a planned modify unwritten', async () => {
  const root = makeRepo({ files: { 'out/index.ts': 'x\n', 'out/thing.ts': 'taken' } });
  const { files } = await plan({ skillDir: makeSkill({ actions: [append()] }), root, pack: 't', generator: 'g', options: { name: 'thing' } });
  assert.throws(() => write(files), (e) => e.details.conflicts[0] === 'out/thing.ts');
  assert.equal(fs.readFileSync(path.join(root, 'out/index.ts'), 'utf8'), 'x\n');
});

test('a mid-write failure restores modified files', async () => {
  const root = makeRepo({ files: { 'out/index.ts': 'x\n' } });
  const { files } = await plan({ skillDir: makeSkill({ files: [], actions: [append(), { type: 'add', path: 'z/y.ts', text: '' }] }), root, pack: 't', generator: 'g', options: { name: 'thing' } });
  fs.writeFileSync(path.join(root, 'out/z'), 'a file where a dir must go');
  assert.throws(() => write(files));
  assert.equal(fs.readFileSync(path.join(root, 'out/index.ts'), 'utf8'), 'x\n');
});

test('a file changed between plan and write is refused', async () => {
  const root = makeRepo({ files: { 'out/index.ts': 'x\n' } });
  const { files } = await plan({ skillDir: makeSkill({ files: [], actions: [append()] }), root, pack: 't', generator: 'g', options: { name: 'thing' } });
  fs.writeFileSync(path.join(root, 'out/index.ts'), 'edited\n');
  assert.throws(() => write(files), /out\/index\.ts changed while generating; nothing was written/);
  assert.equal(fs.readFileSync(path.join(root, 'out/index.ts'), 'utf8'), 'edited\n');
});

test('end-of-file append is unique by whole line, not by substring', async () => {
  const repo = { files: { 'out/index.ts': "// export * from './thing';\n" } };
  const { files, skipped } = await planWith({ files: [], actions: [append()] }, { repo });
  assert.deepEqual(skipped, []);
  assert.equal(files[0].content, "// export * from './thing';\nexport * from './thing';\n");
});

test('a path that is a directory is a CodegenError naming the action', async () => {
  const repo = { dirs: ['out/sub'] };
  await assert.rejects(planWith({ files: [], actions: [append({ path: 'sub' })] }, { repo }), /append: out\/sub is not a file/);
});

test('modify reports the expanded replacement as its change text', async () => {
  const repo = { files: { 'out/m.ts': 'a\nb\n' } };
  const { files } = await planWith({ files: [], actions: [{ type: 'modify', path: 'm.ts', pattern: '^(b)$', text: '$1-x' }] }, { repo });
  assert.equal(files[0].text, 'b-x');
});

test('object when and generator/option supports follow the profile', async () => {
  const gen = {
    files: [{ template: 'x.tpl', path: 'a.ts', when: { react: '18' } }, { template: 'x.tpl', path: 'b.ts', when: { react: ['19'] } }],
    supports: { styling: ['plain', 'tailwind-4'] },
    options: { fancy: { type: 'boolean', supports: { app: ['next-app'] }, description: 'f' } },
  };
  assert.deepEqual((await planWith(gen, { options: { profile: 'react=18' } })).files.map((f) => f.path), ['out/a.ts']);
  await assert.rejects(planWith(gen, { options: { profile: 'styling=emotion' } }), /t\/g does not support styling emotion \(supported: plain, tailwind-4\)/);
  await assert.rejects(planWith(gen, { options: { fancy: true, profile: 'app=react-spa' } }), /--fancy is not supported with app react-spa/);
  await assert.rejects(planWith({ supports: { react: ['18', '19'] } }, { repo: { deps: { react: '^17' } } }), /react 17 is not supported \(supported: 18, 19\)/);
});

test('out and requires can depend on the profile', async () => {
  const gen = { out: [{ when: { app: 'next-pages' }, out: 'pages' }, { out: 'app' }], requires: [{ package: 'zzz', when: { react: '18' } }] };
  assert.equal((await planWith(gen, { options: { profile: 'app=next-pages' } })).files[0].path, 'pages/thing.ts');
  await assert.rejects(planWith(gen, { options: { profile: 'react=18' } }), /Missing requirements for t\/g: zzz/);
});

test('templates see profile and profileIs', async () => {
  const gen = { template: '{{profile.styling}}|{{#if profileIs.react.18}}r18{{/if}}' };
  assert.equal((await planWith(gen, { options: { profile: 'react=18' } })).files[0].content, 'plain|r18');
});

test('a !value condition excludes one value in when and supports', async () => {
  const gen = { files: [{ template: 'x.tpl', path: 'a.ts', when: { app: '!next-pages' } }, { template: 'x.tpl', path: 'b.ts', when: { app: 'next-pages' } }], supports: { styling: ['!emotion'] } };
  assert.deepEqual((await planWith(gen)).files.map((f) => f.path), ['out/a.ts']);
  assert.deepEqual((await planWith(gen, { options: { profile: 'app=next-pages' } })).files.map((f) => f.path), ['out/b.ts']);
  await assert.rejects(planWith(gen, { options: { profile: 'styling=emotion' } }), /does not support styling emotion \(supported: anything but emotion\)/);
});

test('a file whose variants all fail to match is an error, not a silent skip', async () => {
  const gen = { files: [{ template: 'x.tpl', path: 'a.ts', when: { react: '18' } }, { template: 'x.tpl', path: 'a.ts', when: { styling: 'emotion' } }] };
  assert.equal((await planWith(gen, { options: { profile: 'react=18' } })).files.length, 1);
  await assert.rejects(planWith(gen, { options: { profile: 'react=19' } }), /No template variant of a\.ts matches this profile/);
});
