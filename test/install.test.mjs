import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { makeRepo } from './helpers.mjs';

const repoDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const install = (cwd, ...args) => spawnSync(process.execPath, [path.join(repoDir, 'bin/install.mjs'), ...args], { cwd, encoding: 'utf8' });
const read = (root, rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const SKILL = '.agents/skills/codegen';

test('install: adds the skill and every pointer, and prints what it detected', () => {
  const root = makeRepo({ deps: { next: '^16', react: '^19', tailwindcss: '^4' }, dirs: ['app'] });
  const r = install(root);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(read(root, `${SKILL}/VERSION`), read(repoDir, `${SKILL}/VERSION`));
  assert.match(read(root, 'AGENTS.md'), /^## Code generation\n\nBefore creating any React/);
  assert.equal(read(root, 'CLAUDE.md'), '@AGENTS.md\n');
  assert.equal(read(root, '.cursor/rules/codegen.mdc'), read(repoDir, '.cursor/rules/codegen.mdc'));
  assert.match(read(root, '.github/copilot-instructions.md'), /^Before creating any React.*SKILL\.md/s);
  assert.match(r.stdout, /Detected: next-app 16, React 19, tailwind-4/);
});

test('install again: updates the skill in place, keeps .codegen and existing instructions, never duplicates a pointer', () => {
  const root = makeRepo({
    deps: { react: '^19' },
    files: {
      'AGENTS.md': '# Team rules\n\nUse pnpm.\n',
      'CLAUDE.md': '# Claude\n\nBe brief.\n',
      '.codegen/templates/react/hook/hook.ts.tpl': 'custom',
      [`${SKILL}/VERSION`]: '0.1.0\n',
      [`${SKILL}/old-file.md`]: 'removed upstream',
    },
  });
  for (let i = 0; i < 2; i++) assert.equal(install(root).status, 0);
  const agents = read(root, 'AGENTS.md');
  assert.ok(agents.startsWith('# Team rules\n\nUse pnpm.\n\n## Code generation'));
  assert.equal(agents.split('## Code generation').length, 2);
  assert.equal(read(root, 'CLAUDE.md'), '# Claude\n\nBe brief.\n\n@AGENTS.md\n');
  assert.equal(read(root, '.codegen/templates/react/hook/hook.ts.tpl'), 'custom');
  assert.equal(fs.existsSync(path.join(root, `${SKILL}/old-file.md`)), false);
  assert.match(install(root).stdout, new RegExp(`updated ${read(repoDir, `${SKILL}/VERSION`).trim()} → `));
});

test('install refuses a folder without package.json; --dir points at the app root', () => {
  const root = makeRepo({ deps: { react: '^19' } });
  const parent = path.dirname(root);
  const empty = fs.mkdtempSync(path.join(parent, 'no-pkg-'));
  const r = install(empty);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /No package\.json/);
  assert.equal(install(empty, '--dir', root).status, 0);
  assert.ok(fs.existsSync(path.join(root, `${SKILL}/SKILL.md`)));
});

test('package.json version matches the skill VERSION', () => {
  assert.equal(JSON.parse(read(repoDir, 'package.json')).version, read(repoDir, `${SKILL}/VERSION`).trim());
});
