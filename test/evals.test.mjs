import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { compareResults, diffSnapshots, evaluateCase, generatorArgs, generatorCalls, keptRatio, listFiles, lostExports, runStats, snapshot } from '../evals/lib.mjs';
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

test('every case is well-formed and its generator call behaves as expected against its fixture', () => {
  const cases = JSON.parse(fs.readFileSync(path.join(evalsDir, 'cases.json'), 'utf8'));
  const fixtures = fs.readdirSync(path.join(evalsDir, 'fixtures'));
  assert.ok(cases.length >= 16);
  assert.equal(new Set(cases.map((c) => c.id)).size, cases.length);
  for (const c of cases) {
    assert.ok(c.prompt && (c.generator || c.noGenerator || c.noNewFiles), c.id);
    assert.ok(fixtures.includes(c.fixture), `${c.id}: unknown fixture ${c.fixture}`);
    for (const p of [...(c.newFiles ?? []), ...(c.modified ?? []), c.noNewFiles, c.noModified, c.answer].filter(Boolean)) new RegExp(p);
    if (!c.dryRun) continue;
    const r = spawnSync(process.execPath, [cli, ...c.dryRun, '--dry-run', '--root', path.join(evalsDir, 'fixtures', c.fixture)], { encoding: 'utf8' });
    const out = JSON.parse(r.stdout);
    if (c.dryRunError) assert.match(out.error ?? '', new RegExp(c.dryRunError), c.id);
    else {
      assert.equal(out.ok, true, `${c.id}: ${r.stdout}`);
      for (const p of c.newFiles ?? []) assert.ok(out.created.some((f) => new RegExp(p).test(f)), `${c.id}: dry-run creates nothing matching ${p}`);
      for (const p of c.modified ?? []) assert.ok(out.modified.some((f) => new RegExp(p).test(f)), `${c.id}: dry-run edits nothing matching ${p}`);
    }
  }
});

test('snapshot and diffSnapshots split new and edited files', () => {
  const root = makeRepo({ files: { 'a.ts': '1', 'b.ts': '2' } });
  const before = snapshot(root);
  fs.writeFileSync(path.join(root, 'a.ts'), 'changed');
  fs.writeFileSync(path.join(root, 'c.ts'), 'new');
  assert.deepEqual(diffSnapshots(before, snapshot(root)), { newFiles: ['c.ts'], modifiedFiles: ['a.ts'] });
});

test('runStats reads the final answer, cost and tool calls; a missing result is flagged', () => {
  const stream = [
    { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Bash', input: {} }, { type: 'tool_use', name: 'Read', input: {} }] } },
    { type: 'result', result: 'Done. Want me to install select?', num_turns: 3, total_cost_usd: 0.12, duration_ms: 900, is_error: false },
  ].map((l) => JSON.stringify(l)).join('\n');
  assert.deepEqual(runStats(stream), { finalText: 'Done. Want me to install select?', toolCalls: 2, hasResult: true, isError: false, turns: 3, costUsd: 0.12, durationMs: 900 });
  assert.equal(runStats('garbage').hasResult, false);
});

test('generatorArgs extracts replayable args from agent shell commands', () => {
  assert.deepEqual(generatorArgs('node .agents/skills/codegen/scripts/generate.mjs next component --name Badge --element span'), ['next', 'component', '--name', 'Badge', '--element', 'span']);
  assert.deepEqual(generatorArgs('cd /tmp/x && node $SKILL/scripts/generate.mjs next hook --name "use thing" --root /tmp/x 2>&1 | head'), ['next', 'hook', '--name', 'use thing']);
  assert.equal(generatorArgs('ls scripts'), null);
});

test('keptRatio ignores TODO and punctuation lines, catches rewrites, and abstains on tiny skeletons', () => {
  const generated = [
    "import type { ComponentProps } from 'react';",
    "import { cn } from '@/lib/utils';",
    '// Server Component by default.',
    "export type CardProps = ComponentProps<'article'> & {",
    '  // TODO(codegen): props',
    '};',
    'export function Card({ className, children, ...props }: CardProps) {',
    '  return (',
    "    <article className={cn('', className)} {...props}>",
    '      {children}',
    '    </article>',
    '  );',
    '}',
  ].join('\n');
  assert.equal(keptRatio(generated, generated), 1);
  assert.equal(keptRatio(generated, "import { cn } from '@/lib/utils';\nconst Card = (p) => <div>{p.x}</div>;\nexport default Card;"), 1 / 8);
  assert.equal(keptRatio('export function useX() {\n  // TODO(codegen): x\n  return {};\n}', ''), null);
});

test('keptRatio: filling in placeholders and collapsing JSX keeps the skeleton; another shape does not', () => {
  const generated = [
    "import { cva, type VariantProps } from 'class-variance-authority';",
    "import { cn } from '@/lib/utils';",
    '// Server Component by default.',
    "export const badgeVariants = cva('', {",
    '  variants: {',
    '    // TODO(codegen): variants',
    "    variant: { default: '' },",
    "    size: { default: '' },",
    '  },',
    "  defaultVariants: { variant: 'default', size: 'default' },",
    '});',
    "export type BadgeProps = ComponentProps<'span'> & VariantProps<typeof badgeVariants> & {",
    '};',
    'export function Badge({ className, variant, size, children, ...props }: BadgeProps) {',
    '  return (',
    '    <span className={cn(badgeVariants({ variant, size }), className)} {...props}>',
    '      {children}',
    '    </span>',
    '  );',
    '}',
  ].join('\n');
  const filledIn = [
    "import { cva, type VariantProps } from 'class-variance-authority';",
    "import { cn } from '@/lib/utils';",
    "export const badgeVariants = cva('inline-flex items-center', {",
    '  variants: {',
    "    variant: { success: 'bg-success', neutral: 'bg-muted' },",
    "    size: { sm: 'text-xs', md: 'text-sm' },",
    '  },',
    "  defaultVariants: { variant: 'neutral', size: 'md' },",
    '});',
    "export type BadgeProps = ComponentProps<'span'> & VariantProps<typeof badgeVariants>;",
    'export function Badge({ className, variant, size, ...props }: BadgeProps) {',
    '  return <span className={cn(badgeVariants({ variant, size }), className)} {...props} />;',
    '}',
  ].join('\n');
  assert.ok(keptRatio(generated, filledIn) >= 0.6, String(keptRatio(generated, filledIn)));
  const rewrite = "import { cn } from '@/lib/utils';\nconst styles = { success: 'bg-success' };\nexport const Badge = ({ tone = 'success', className, ...rest }) => <span className={cn(styles[tone], className)} {...rest} />;\n";
  assert.ok(keptRatio(generated, rewrite) < 0.4, String(keptRatio(generated, rewrite)));
});

test('lostExports: function and const exports must survive, types and async may change', () => {
  const gen = 'export type R = {};\nexport function useDebounce(): R { return {}; }';
  assert.deepEqual(lostExports(gen, 'export function useDebounce<T>(v: T): T { return v; }'), []);
  assert.deepEqual(lostExports(gen, 'const useDebounce = () => 1;\nexport default useDebounce;'), ['useDebounce']);
  const api = 'export default async function handler(req, res) {}';
  assert.deepEqual(lostExports(api, 'export default function handler(req, res) {}'), []);
  assert.deepEqual(lostExports('export const Card = forwardRef(function Card() {});', 'export function Card() {}'), []);
  assert.deepEqual(lostExports(api, 'export function handler() {}'), ['default']);
});

test('evaluateCase: status, edited files, answer and drift', () => {
  const base = { newFiles: [], modifiedFiles: [], commands: [], read: () => '', tokensOk: null };
  assert.deepEqual(evaluateCase({}, { ...base, status: 'timeout' }).failures, ['timed out']);
  assert.equal(evaluateCase({}, { ...base, status: 'error' }).pass, false);

  const def = { modified: ['^components/index\\.ts$'], noModified: 'package\\.json', answer: 'install', contains: [{ file: 'index\\.ts$', pattern: 'badge' }] };
  const files = { 'components/index.ts': "export * from './badge';" };
  assert.equal(evaluateCase(def, { ...base, modifiedFiles: ['components/index.ts'], read: (f) => files[f], finalText: 'Should I INSTALL it?' }).pass, true);
  const bad = evaluateCase(def, { ...base, modifiedFiles: ['package.json'], read: () => '{}', finalText: 'done' });
  assert.equal(bad.failures.length, 4);

  const drifted = evaluateCase({}, { ...base, drift: [{ file: 'a.tsx', kept: 0.2 }, { file: 'b.ts', kept: 0.9 }] });
  assert.equal(drifted.failures.length, 1);
  assert.match(drifted.failures[0], /a\.tsx: kept 20%/);
  assert.equal(evaluateCase({ minKept: 0.1 }, { ...base, drift: [{ file: 'a.tsx', kept: 0.2 }] }).pass, true);
});

test('compareResults shows pass-rate changes per case', () => {
  const r = (passed, cost) => ({ cases: { x: { passed, runs: 3, results: [{ costUsd: cost }] } } });
  const out = compareResults(r(1, 0.5), r(3, 0.25));
  assert.match(out, /↑ x\s+1\/3 → 3\/3/);
  assert.match(out, /cost: \$0\.50 → \$0\.25/);
});

test('generatorCalls ignores look-only calls (--list, --help, --dry-run)', () => {
  const call = (command) => JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Bash', input: { command } }] } });
  const stream = [
    call('node .agents/skills/codegen/scripts/generate.mjs --list next'),
    call('node .agents/skills/codegen/scripts/generate.mjs --help'),
    call('node .agents/skills/codegen/scripts/generate.mjs --detect'),
    call('node .agents/skills/codegen/scripts/generate.mjs next hook --name x --dry-run'),
    call('node .agents/skills/codegen/scripts/generate.mjs next hook --name x'),
  ].join('\n');
  assert.deepEqual(generatorCalls(stream), ['node .agents/skills/codegen/scripts/generate.mjs next hook --name x']);
});

test('generatorCalls splits chained commands: a dry-run and a real call in one Bash call', () => {
  const command = 'node $S/generate.mjs next hook --name d --dry-run 2>&1; echo; node $S/generate.mjs next hook --name d 2>&1 | head && cat x';
  const stream = JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Bash', input: { command } }] } });
  assert.deepEqual(generatorCalls(stream), ['node $S/generate.mjs next hook --name d 2>&1']);
});
