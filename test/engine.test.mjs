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
