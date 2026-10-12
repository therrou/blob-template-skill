import fs from 'node:fs';
import path from 'node:path';

import { allDeps } from './detect.mjs';

// "a|b" is satisfied by either package; the first one is the suggestion.
export function missingDependencies(pkg, requires) {
  const deps = allDeps(pkg);
  const missing = requires.filter((req) => !req.split('|').some((name) => deps[name])).map((req) => req.split('|')[0]);
  return [...new Set(missing)];
}

const LOCKFILES = [
  ['pnpm-lock.yaml', 'pnpm add'],
  ['yarn.lock', 'yarn add'],
  ['bun.lock', 'bun add'],
  ['bun.lockb', 'bun add'],
  ['package-lock.json', 'npm i'],
];

// Walks up from the app root so monorepo workspaces use the workspace's package manager.
export function installCommand(root, packages) {
  for (let dir = path.resolve(root); ; dir = path.dirname(dir)) {
    const found = LOCKFILES.find(([file]) => fs.existsSync(path.join(dir, file)));
    if (found) return `${found[1]} ${packages.join(' ')}`;
    if (path.dirname(dir) === dir) return `npm i ${packages.join(' ')}`;
  }
}
