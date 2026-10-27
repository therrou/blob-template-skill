import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { plan } from '../.agents/skills/codegen/scripts/lib/generate.mjs';
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
