#!/usr/bin/env node
// Behavior evals: does an agent with this skill run the generator instead of hand-writing files?
// Costs tokens and is non-deterministic; run by hand.
//
//   node evals/run.mjs [--case <id>] [--keep] [--model <model>]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { evaluateCase, generatorCalls, listFiles } from './lib.mjs';

const evalsDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(evalsDir, '..');
const checkTokens = path.join(repoRoot, '.agents/skills/codegen/scripts/check-tokens.mjs');

const args = process.argv.slice(2);
const flag = (name) => (args.includes(`--${name}`) ? args[args.indexOf(`--${name}`) + 1] : undefined);
const only = flag('case');
const model = flag('model');
const keep = args.includes('--keep');

// Only project settings, so the user's own plugins and hooks don't change agent behavior.
const ALLOWED_TOOLS = 'Read,Edit,Write,Glob,Grep,Bash(node:*),Bash(ls:*),Bash(cat:*),Bash(grep:*),Bash(find:*)';
const CLAUDE_ARGS = ['--output-format', 'stream-json', '--verbose', '--permission-mode', 'acceptEdits', '--allowedTools', ALLOWED_TOOLS, '--setting-sources', 'project'];

function prepare() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codegen-eval-'));
  fs.cpSync(path.join(evalsDir, 'fixture'), dir, { recursive: true });
  fs.cpSync(path.join(repoRoot, '.agents'), path.join(dir, '.agents'), { recursive: true });
  for (const file of ['AGENTS.md', 'CLAUDE.md']) fs.copyFileSync(path.join(repoRoot, file), path.join(dir, file));
  return dir;
}

const cases = JSON.parse(fs.readFileSync(path.join(evalsDir, 'cases.json'), 'utf8')).filter((c) => !only || c.id === only);
if (!cases.length) {
  console.error(`No case with id "${only}".`);
  process.exit(1);
}

let failed = 0;
for (const def of cases) {
  const dir = prepare();
  const before = new Set(listFiles(dir));
  const claude = spawnSync('claude', ['-p', def.prompt, ...CLAUDE_ARGS, ...(model ? ['--model', model] : [])], {
    cwd: dir,
    encoding: 'utf8',
    timeout: 10 * 60 * 1000,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (claude.error) {
    console.error(`Could not run claude: ${claude.error.message}`);
    process.exit(1);
  }
  const newFiles = listFiles(dir).filter((f) => !before.has(f));
  const code = newFiles.filter((f) => /\.(tsx?|jsx?)$/.test(f));
  const tokensOk = code.length
    ? spawnSync(process.execPath, [checkTokens, ...code, '--root', dir], { cwd: dir, encoding: 'utf8' }).status === 0
    : null;
  const result = evaluateCase(def, {
    newFiles,
    commands: generatorCalls(claude.stdout),
    read: (f) => fs.readFileSync(path.join(dir, f), 'utf8'),
    tokensOk,
  });

  console.log(`${result.pass ? 'PASS' : 'FAIL'}  ${def.id}`);
  for (const failure of result.failures) console.log(`      - ${failure}`);
  if (result.pass && !keep) fs.rmSync(dir, { recursive: true, force: true });
  else console.log(`      workspace: ${dir}`);
  if (!result.pass) failed++;
}

console.log(`\n${cases.length - failed}/${cases.length} passed`);
process.exitCode = failed ? 1 : 0;
