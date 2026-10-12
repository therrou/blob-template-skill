import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { plan } from '../.agents/skills/codegen/scripts/lib/generate.mjs';
import { installCommand, missingDependencies } from '../.agents/skills/codegen/scripts/lib/deps.mjs';
import { makeRepo, makeSkill } from './helpers.mjs';

const kindOption = { kind: { type: 'string', required: true, choices: ['a', 'b'], description: 'k' } };

function planWith(generator, { options = {}, repo = {} } = {}) {
  return plan({ skillDir: makeSkill(generator), root: makeRepo(repo), pack: 't', generator: 'g', options: { name: 'thing', ...options } });
}

function throwsWith(fn, check) {
  assert.throws(fn, (err) => {
    check(err);
    return true;
  });
}

test('required option: missing is an error that lists the choices', () => {
  assert.throws(() => planWith({ options: kindOption }), /Missing required --kind \(one of: a, b\)/);
});

test('choices: an unknown value is an error', () => {
  assert.throws(() => planWith({ options: kindOption }, { options: { kind: 'c' } }), /--kind must be one of: a, b\. Got "c"/);
});

test('string option passed without a value is an error', () => {
  assert.throws(() => planWith({ options: kindOption }, { options: { kind: true } }), /--kind needs a value/);
});

test('choices expose an <option>Is map to templates', () => {
  const gen = { options: kindOption, template: '{{#if kindIs.b}}B{{else}}A{{/if}}' };
  assert.equal(planWith(gen, { options: { kind: 'b' } }).files[0].content, 'B');
  assert.equal(planWith(gen, { options: { kind: 'a' } }).files[0].content, 'A');
});

test('generator and option requires: missing packages fail with an install hint', () => {
  const gen = {
    requires: ['react-hook-form'],
    options: { fancy: { type: 'boolean', requires: ['class-variance-authority'], description: 'f' } },
  };
  assert.doesNotThrow(() => planWith(gen, { repo: { deps: { 'react-hook-form': '^7' } } }));
  throwsWith(
    () => planWith(gen, { options: { fancy: true } }),
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

test('cn option is auto-detected when not passed; --cn still wins', () => {
  const gen = { options: { cn: { type: 'string', description: 'c' } }, template: '[{{cn}}]' };
  const repo = { files: { 'lib/utils.ts': 'export function cn() {}' } };
  assert.equal(planWith(gen, { repo }).files[0].content, '[@/lib/utils]');
  assert.equal(planWith(gen, { repo, options: { cn: '#/cn' } }).files[0].content, '[#/cn]');
  assert.equal(planWith(gen).files[0].content, '[]');
});

test('requiresUi: missing shadcn primitives fail with an add command (src/ repo)', () => {
  const gen = { requiresUi: ['form', '{{kind}}'], options: kindOption };
  throwsWith(
    () => planWith(gen, { options: { kind: 'a' }, repo: { files: { 'src/components/ui/form.tsx': '' } } }),
    (err) => {
      assert.deepEqual(err.details.missing, []);
      assert.deepEqual(err.details.missingUi, ['a']);
      assert.equal(err.details.install, 'npx shadcn@latest add a');
      assert.match(err.message, /@\/components\/ui\/a/);
    },
  );
  const ok = { files: { 'src/components/ui/form.tsx': '', 'src/components/ui/a.tsx': '' } };
  assert.doesNotThrow(() => planWith(gen, { options: { kind: 'a' }, repo: ok }));
});

test('missing packages and primitives are reported together', () => {
  const gen = { requires: ['react-hook-form'], requiresUi: ['form'] };
  throwsWith(
    () => planWith(gen),
    (err) => assert.equal(err.details.install, 'npm i react-hook-form && npx shadcn@latest add form'),
  );
});

test('boolean option given a value is an error, not silently true', () => {
  const gen = { options: { fancy: { type: 'boolean', description: 'f' } } };
  assert.throws(() => planWith(gen, { options: { fancy: 'false' } }), /--fancy is a flag and takes no value/);
  assert.doesNotThrow(() => planWith(gen, { options: { fancy: true } }));
});
