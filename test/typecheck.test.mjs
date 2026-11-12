import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

import { attribute, matrix, parseEslint, parseTscErrors } from '../typecheck/lib.mjs';
import { cli } from './helpers.mjs';

test('matrix covers every generator, element and option combination with unique names', () => {
  for (const pack of ['next', 'react']) {
    const { generators } = JSON.parse(spawnSync(process.execPath, [cli, '--list', pack], { encoding: 'utf8' }).stdout).packs[pack];
    const calls = matrix(pack, generators);
    assert.deepEqual(new Set(calls.map((c) => c[1])), new Set(Object.keys(generators)), pack);
    const names = calls.map((c) => `${c[1]}:${c[3]}`);
    assert.equal(new Set(names).size, names.length, `${pack}: duplicate names`);
    const buttons = calls.filter((c) => c[1] === 'component' && c.includes('button'));
    assert.deepEqual(buttons.map((c) => c.slice(4).join(' ')), [
      '--element button --with-test --with-story --with-barrel',
      '--element button --variants --with-barrel',
      '--element button --as-child --with-barrel',
      '--element button --variants --as-child --with-barrel',
    ]);
  }
});

test('parseTscErrors reads errors with continuation lines; attribute pins them on the generator call', () => {
  const out = [
    "components/a/a.tsx(3,7): error TS2322: Type 'string' is not assignable to type 'number'.",
    "  Type 'x' is missing.",
    "lib/utils.ts(1,1): error TS2307: Cannot find module 'clsx'.",
    'Found 2 errors.',
  ].join('\n');
  const errors = attribute(parseTscErrors(out), [{ call: 'next component --name A', files: ['components/a/a.tsx'] }]);
  assert.equal(errors.length, 2);
  assert.deepEqual(errors[0], { file: 'components/a/a.tsx', line: 3, code: 'TS2322', message: "Type 'string' is not assignable to type 'number'.\n  Type 'x' is missing.", call: 'next component --name A' });
  assert.equal(errors[1].call, null);
});

test('parseEslint makes paths repo-relative and keeps severity', () => {
  const json = JSON.stringify([
    { filePath: '/ws/hooks/use-x.ts', messages: [{ ruleId: 'react-hooks/rules-of-hooks', severity: 2, message: 'conditional', line: 4 }] },
    { filePath: '/ws/app/page.tsx', messages: [{ ruleId: null, severity: 1, message: 'parse', line: 1 }] },
  ]);
  assert.deepEqual(parseEslint(json, '/ws'), [
    { file: 'hooks/use-x.ts', line: 4, code: 'react-hooks/rules-of-hooks', message: 'conditional', severity: 2 },
    { file: 'app/page.tsx', line: 1, code: 'eslint', message: 'parse', severity: 1 },
  ]);
  assert.deepEqual(parseEslint('', '/ws'), []);
});
