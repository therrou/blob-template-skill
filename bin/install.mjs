#!/usr/bin/env node
// Installs or updates the codegen skill in the current repo (or --dir <path>):
//   npx github:therrou/blob-template-skill
// Copies .agents/skills/codegen/ (replacing an older copy; .codegen/ overrides are never touched) and adds the
// pointers each agent reads (AGENTS.md, CLAUDE.md, Cursor rule, Copilot instructions). Running it again is safe.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pkgDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKILL = '.agents/skills/codegen';
const MARKER = `${SKILL}/SKILL.md`;

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  console.log('Usage: npx github:therrou/blob-template-skill [--dir <app root>]\nInstalls or updates the codegen skill in the app root (the folder with package.json).');
  process.exit(0);
}
const dirArg = args.indexOf('--dir');
const root = path.resolve(dirArg >= 0 ? args[dirArg + 1] ?? '.' : '.');
const fail = (msg) => {
  console.error(`✖ ${msg}`);
  process.exit(1);
};
if (!fs.existsSync(path.join(root, 'package.json'))) fail(`No package.json in ${root}. Run this from your app root, or pass --dir <app root>.`);

const read = (rel, base = root) => (fs.existsSync(path.join(base, rel)) ? fs.readFileSync(path.join(base, rel), 'utf8') : null);
const version = (base) => read(`${SKILL}/VERSION`, base)?.trim();
const done = [];

// 1. The skill folder: replace it whole, so files removed upstream don't linger.
const before = version(root);
const after = version(pkgDir);
fs.rmSync(path.join(root, SKILL), { recursive: true, force: true });
fs.cpSync(path.join(pkgDir, SKILL), path.join(root, SKILL), { recursive: true });
done.push(before ? `${SKILL}/ updated ${before} → ${after} (see its CHANGELOG.md)` : `${SKILL}/ added (${after})`);

// 2. Pointers: create the file, or append the text once if the file doesn't mention the skill yet.
const pointer = read('AGENTS.md', pkgDir).slice(read('AGENTS.md', pkgDir).indexOf('## Code generation')).trim();
function ensure(rel, text, mentions = MARKER) {
  const current = read(rel);
  if (current?.includes(mentions)) return;
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), current ? `${current.trimEnd()}\n\n${text}\n` : `${text}\n`);
  done.push(`${rel} ${current ? 'updated' : 'added'}`);
}
ensure('AGENTS.md', pointer);
ensure('CLAUDE.md', '@AGENTS.md', 'AGENTS.md');
ensure('.cursor/rules/codegen.mdc', read('.cursor/rules/codegen.mdc', pkgDir).trim());
ensure('.github/copilot-instructions.md', pointer.replace('## Code generation\n\n', ''));

for (const line of done) console.log(`✔ ${line}`);

// 3. What the skill sees in this repo.
const detect = spawnSync(process.execPath, [path.join(root, SKILL, 'scripts/generate.mjs'), '--detect', '--root', root], { encoding: 'utf8' });
try {
  const { profile } = JSON.parse(detect.stdout);
  const v = (k) => profile[k]?.value;
  console.log(`\nDetected: ${v('app')}${v('next') && v('app') !== 'react-spa' ? ` ${v('next')}` : ''}, React ${v('react')}, ${v('styling')}, primitives ${v('primitives')}, forms ${v('forms')}`);
} catch {
  console.log(`\n--detect failed: ${(detect.stderr || detect.stdout).trim().slice(0, 300)}`);
}
console.log(`
Next: ask your agent
  "Get the codegen skill ready for this repo so that what it generates matches how our existing code is written."
Then commit the added files. Docs and feedback: https://github.com/therrou/blob-template-skill`);
