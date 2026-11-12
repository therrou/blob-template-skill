import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { findTodos } from './template.mjs';

// The repo's own Prettier, installed in the root or a parent folder (monorepos hoist it). Never downloads one.
export function findPrettier(root) {
  for (let dir = root; ; dir = path.dirname(dir)) {
    const pkgFile = path.join(dir, 'node_modules', 'prettier', 'package.json');
    if (fs.existsSync(pkgFile)) {
      const { bin } = JSON.parse(fs.readFileSync(pkgFile, 'utf8'));
      // Prettier 3: "bin": "./bin/prettier.cjs"; Prettier 2: "bin": { "prettier": "./bin-prettier.js" }.
      const rel = typeof bin === 'string' ? bin : bin?.prettier;
      if (rel) return path.join(path.dirname(pkgFile), rel);
    }
    if (path.dirname(dir) === dir) return null;
  }
}

// Formats the written files with the repo's config and .prettierignore. A formatter failure never undoes the generation.
export function formatFiles(root, files) {
  const bin = findPrettier(root);
  if (!bin || !files.length) return null;
  const r = spawnSync(process.execPath, [bin, '--write', '--ignore-unknown', ...files], { cwd: root, encoding: 'utf8' });
  if (r.status === 0) return { tool: 'prettier', ok: true };
  return { tool: 'prettier', ok: false, error: (r.stderr || r.error?.message || '').trim().split('\n').slice(0, 5).join('\n') };
}

// Formatting moves lines: point each todo at the line its text is on now, in order of appearance.
export function relocateTodos(root, todo) {
  const seen = new Map();
  return todo.map((t) => {
    const lines = findTodos(fs.readFileSync(path.join(root, t.file), 'utf8')).filter((x) => x.text === t.text);
    const key = `${t.file}\0${t.text}`;
    const n = seen.get(key) ?? 0;
    seen.set(key, n + 1);
    return lines[n] ? { ...t, line: lines[n].line } : t;
  });
}
