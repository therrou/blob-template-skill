#!/usr/bin/env node
// Behavior evals: does an agent with this skill run the generator instead of hand-writing files,
// keep what it generated, and stop when it should? Costs tokens and is non-deterministic; run by hand.
//
//   node evals/run.mjs [--case <id>] [--fixture <name>] [--runs <n>] [--jobs <n>] [--model <model>] [--keep]
//   node evals/run.mjs --compare <a/summary.json> <b/summary.json>
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { compareResults, diffSnapshots, evaluateCase, generatorArgs, generatorCalls, keptRatio, lostExports, runStats, snapshot } from './lib.mjs';

const evalsDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(evalsDir, '..');
const skillDir = path.join(repoRoot, '.agents/skills/codegen');
const checkTokens = path.join(skillDir, 'scripts/check-tokens.mjs');
const generate = path.join(skillDir, 'scripts/generate.mjs');

const args = process.argv.slice(2);
const flag = (name) => (args.includes(`--${name}`) ? args[args.indexOf(`--${name}`) + 1] : undefined);

if (args.includes('--compare')) {
  const [a, b] = args.slice(args.indexOf('--compare') + 1).map((f) => JSON.parse(fs.readFileSync(f, 'utf8')));
  console.log(compareResults(a, b));
  process.exit(0);
}

const only = flag('case');
const onlyFixture = flag('fixture');
const model = flag('model');
const runs = Number(flag('runs') ?? 1);
const jobs = Number(flag('jobs') ?? 1);
const keep = args.includes('--keep');
const TIMEOUT_MS = 10 * 60 * 1000;

// Only project settings, so the user's own plugins and hooks don't change agent behavior.
const ALLOWED_TOOLS = 'Read,Edit,Write,Glob,Grep,Bash(node:*),Bash(ls:*),Bash(cat:*),Bash(grep:*),Bash(find:*)';
const CLAUDE_ARGS = ['--output-format', 'stream-json', '--verbose', '--permission-mode', 'acceptEdits', '--allowedTools', ALLOWED_TOOLS, '--setting-sources', 'project'];

function prepare(fixture, withSkill = true) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `codegen-eval-${fixture}-`));
  fs.cpSync(path.join(evalsDir, 'fixtures', fixture), dir, { recursive: true });
  if (withSkill) {
    fs.cpSync(path.join(repoRoot, '.agents'), path.join(dir, '.agents'), { recursive: true });
    for (const file of ['AGENTS.md', 'CLAUDE.md']) fs.copyFileSync(path.join(repoRoot, file), path.join(dir, file));
  }
  return dir;
}

function exec(cmd, argv, { cwd, timeout }) {
  return new Promise((resolve) => {
    const child = spawn(cmd, argv, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let timedOut = false;
    const timer = timeout && setTimeout(() => ((timedOut = true), child.kill('SIGKILL')), timeout);
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.resume();
    child.on('error', (error) => resolve({ stdout, code: null, error }));
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ stdout, code, timedOut });
    });
  });
}

// Replays each generator call in a clean copy of the fixture and measures how much of its output survived.
async function measureDrift(fixture, commands, after) {
  const drift = [];
  for (const command of commands) {
    const genArgs = generatorArgs(command);
    if (!genArgs) continue;
    const clean = prepare(fixture, false);
    const before = snapshot(clean);
    const { code } = await exec(process.execPath, [generate, ...genArgs, '--root', clean], { cwd: clean });
    if (code === 0) {
      const { newFiles } = diffSnapshots(before, snapshot(clean));
      for (const file of newFiles) {
        const generated = fs.readFileSync(path.join(clean, file), 'utf8');
        const final = after.get(file) ?? '';
        drift.push({ file, kept: keptRatio(generated, final), lost: lostExports(generated, final) });
      }
    }
    fs.rmSync(clean, { recursive: true, force: true });
  }
  return drift;
}

async function runOne(def, run, outDir) {
  const fixture = def.fixture ?? 'next-app-tw4';
  const dir = prepare(fixture);
  const before = snapshot(dir);
  const claude = await exec('claude', ['-p', def.prompt, ...CLAUDE_ARGS, ...(model ? ['--model', model] : [])], { cwd: dir, timeout: TIMEOUT_MS });
  if (claude.error) {
    console.error(`Could not run claude: ${claude.error.message}`);
    process.exit(1);
  }
  fs.writeFileSync(path.join(outDir, `${def.id}-${run}.jsonl`), claude.stdout);

  const after = snapshot(dir);
  const { newFiles, modifiedFiles } = diffSnapshots(before, after);
  const stats = runStats(claude.stdout);
  const status = claude.timedOut ? 'timeout' : !stats.hasResult || stats.isError ? 'error' : 'ok';
  const commands = generatorCalls(claude.stdout);
  const code = [...newFiles, ...modifiedFiles].filter((f) => /\.(tsx?|jsx?)$/.test(f));
  const tokensOk = code.length ? (await exec(process.execPath, [checkTokens, ...code, '--root', dir], { cwd: dir })).code === 0 : null;
  const drift = await measureDrift(fixture, commands, after);
  const result = evaluateCase(def, {
    status,
    newFiles,
    modifiedFiles,
    commands,
    read: (f) => after.get(f),
    tokensOk,
    finalText: stats.finalText,
    drift,
  });

  const kept = keep || !result.pass;
  if (!kept) fs.rmSync(dir, { recursive: true, force: true });
  const { finalText, hasResult, isError, ...numbers } = stats;
  return { run, status, ...result, ...numbers, newFiles, modifiedFiles, generatorCalls: commands, drift, workspace: kept ? dir : undefined };
}

const cases = JSON.parse(fs.readFileSync(path.join(evalsDir, 'cases.json'), 'utf8')).filter(
  (c) => (!only || c.id === only) && (!onlyFixture || (c.fixture ?? 'next-app-tw4') === onlyFixture),
);
if (!cases.length) {
  console.error('No case matches the filters.');
  process.exit(1);
}

const version = fs.readFileSync(path.join(skillDir, 'VERSION'), 'utf8').trim();
const stamp = `${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}-v${version}-${model ?? 'default'}${only ? `-${only}` : ''}`;
const outDir = path.join(evalsDir, 'results', stamp);
fs.mkdirSync(outDir, { recursive: true });

// A small worker pool: each task is one run of one case.
const tasks = cases.flatMap((def) => Array.from({ length: runs }, (_, i) => ({ def, run: i + 1 })));
const results = new Map(cases.map((c) => [c.id, []]));
let next = 0;
await Promise.all(
  Array.from({ length: Math.min(jobs, tasks.length) }, async () => {
    while (next < tasks.length) {
      const { def, run } = tasks[next++];
      const r = await runOne(def, run, outDir);
      results.get(def.id).push(r);
      const label = r.status === 'ok' ? (r.pass ? 'PASS' : 'FAIL') : r.status.toUpperCase();
      console.log(`${label.padEnd(7)} ${def.id} #${run}${r.costUsd !== undefined ? `  $${r.costUsd.toFixed(3)}` : ''}`);
      for (const failure of r.failures) console.log(`        - ${failure}`);
      if (r.workspace) console.log(`        workspace: ${r.workspace}`);
    }
  }),
);

const summary = {
  version,
  model: model ?? 'default',
  date: new Date().toISOString(),
  runs,
  cases: Object.fromEntries(
    cases.map((c) => {
      const rs = results.get(c.id).sort((a, b) => a.run - b.run);
      return [c.id, { fixture: c.fixture ?? 'next-app-tw4', passed: rs.filter((r) => r.pass).length, runs: rs.length, results: rs }];
    }),
  ),
};
fs.writeFileSync(path.join(outDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);

console.log('');
for (const [id, c] of Object.entries(summary.cases)) console.log(`${c.passed === c.runs ? ' ' : '!'} ${id.padEnd(28)} ${c.passed}/${c.runs}`);
const total = tasks.length;
const passed = Object.values(summary.cases).reduce((s, c) => s + c.passed, 0);
console.log(`\n${passed}/${total} runs passed. Results: ${path.relative(repoRoot, outDir)}/summary.json`);
process.exitCode = passed === total ? 0 : 1;
