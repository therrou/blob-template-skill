import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { evaluateCase, generatorCalls, listFiles } from '../evals/lib.mjs';
import { cli, makeRepo } from './helpers.mjs';

const evalsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'evals');

test('generatorCalls reads Bash tool_use commands, not tool results that mention the script', () => {
  const lines = [
    { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Bash', input: { command: 'node .agents/skills/codegen/scripts/generate.mjs next component --name Badge --element span' } }] } },
    { type: 'user', message: { content: [{ type: 'tool_result', content: 'see scripts/generate.mjs --list' }] } },
    { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Bash', input: { command: 'ls' } }, { type: 'text', text: 'generate.mjs' }] } },
  ];
  const stream = `${lines.map((l) => JSON.stringify(l)).join('\n')}\nnot json\n`;
  assert.deepEqual(generatorCalls(stream), ['node .agents/skills/codegen/scripts/generate.mjs next component --name Badge --element span']);
});

test('listFiles skips agent and dependency folders', () => {
  const root = makeRepo({ files: { 'app/page.tsx': '', '.agents/x.md': '', '.claude/s.json': '', 'node_modules/a/i.js': '' } });
  assert.deepEqual(listFiles(root), ['app/page.tsx', 'package.json']);
});

test('evaluateCase checks generator use, new files, contents and tokens', () => {
  const def = {
    generator: 'component|client-component',
    newFiles: ['^components/[a-z-]*badge[a-z-]*/[a-z-]*badge[a-z-]*\\.tsx$'],
    contains: [{ file: 'badge\\.tsx$', pattern: 'cva\\(' }, { file: 'badge\\.tsx$', pattern: "'use client'", absent: true }],
  };
  const files = { 'components/badge/badge.tsx': 'export const badgeVariants = cva(' };
  const ok = evaluateCase(def, {
    newFiles: Object.keys(files),
    commands: ['node generate.mjs next component --name Badge --element span --variants'],
    read: (f) => files[f],
    tokensOk: true,
  });
  assert.deepEqual(ok, { pass: true, failures: [] });

  const bad = evaluateCase(def, { newFiles: [], commands: ['node generate.mjs next client-componentx'], read: () => '', tokensOk: null });
  assert.equal(bad.pass, false);
  assert.equal(bad.failures.length, 3);
});

test('evaluateCase reuse trap: no generator, no new component files', () => {
  const def = { noGenerator: true, noNewFiles: '^components/(?!ui/)' };
  assert.equal(evaluateCase(def, { newFiles: ['app/settings/page.tsx'], commands: [], read: () => '', tokensOk: true }).pass, true);
  const bad = evaluateCase(def, { newFiles: ['components/button/button.tsx'], commands: ['node generate.mjs next component'], read: () => '', tokensOk: true });
  assert.equal(bad.failures.length, 2);
});

test('every case is well-formed and its generator call succeeds against the fixture', () => {
  const cases = JSON.parse(fs.readFileSync(path.join(evalsDir, 'cases.json'), 'utf8'));
  assert.ok(cases.length >= 6);
  assert.equal(new Set(cases.map((c) => c.id)).size, cases.length);
  for (const c of cases) {
    assert.ok(c.prompt && (c.generator || c.noGenerator), c.id);
    const r = spawnSync(process.execPath, [cli, ...c.dryRun, '--dry-run', '--root', path.join(evalsDir, 'fixture')], { encoding: 'utf8' });
    assert.equal(JSON.parse(r.stdout).ok, true, `${c.id}: ${r.stdout}`);
  }
});

test('generatorCalls ignores look-only calls (--list, --help, --dry-run)', () => {
  const call = (command) => JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Bash', input: { command } }] } });
  const stream = [
    call('node .agents/skills/codegen/scripts/generate.mjs --list next'),
    call('node .agents/skills/codegen/scripts/generate.mjs --help'),
    call('node .agents/skills/codegen/scripts/generate.mjs next hook --name x --dry-run'),
    call('node .agents/skills/codegen/scripts/generate.mjs next hook --name x'),
  ].join('\n');
  assert.deepEqual(generatorCalls(stream), ['node .agents/skills/codegen/scripts/generate.mjs next hook --name x']);
});
