import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const skillDir = path.join(here, '..', '.agents', 'skills', 'codegen');
export const cli = path.join(skillDir, 'scripts', 'generate.mjs');

export function makeRepo({ deps = {}, dirs = [], files = {} } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codegen-'));
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ devDependencies: deps }));
  for (const d of dirs) fs.mkdirSync(path.join(root, d), { recursive: true });
  for (const [p, c] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, p)), { recursive: true });
    fs.writeFileSync(path.join(root, p), c);
  }
  return root;
}

// A throwaway skill with one pack "t" and one generator "g", for engine tests.
export function makeSkill({ template = 'x', ...generator } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codegen-skill-'));
  fs.mkdirSync(path.join(dir, 'packs', 't', 'templates'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'packs', 't', 'templates', 'x.tpl'), template);
  const g = { out: 'out', options: {}, files: [{ template: 'x.tpl', path: '{{name.kebab}}.ts' }], ...generator };
  fs.writeFileSync(path.join(dir, 'packs', 't', 'pack.json'), JSON.stringify({ vars: {}, generators: { g } }));
  return dir;
}

export function run(root, ...args) {
  const r = spawnSync(process.execPath, [cli, ...args], { cwd: root, encoding: 'utf8' });
  try {
    return { status: r.status, json: JSON.parse(r.stdout) };
  } catch {
    throw new Error(`Non-JSON output (exit ${r.status}):\n${r.stdout}\n${r.stderr}`);
  }
}

export const read = (root, p) => fs.readFileSync(path.join(root, p), 'utf8');
