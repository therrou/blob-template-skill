import fs from 'node:fs';
import path from 'node:path';

export function readPackageJson(root) {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  } catch {
    return null;
  }
}

function allDeps(pkg) {
  return { ...pkg?.peerDependencies, ...pkg?.devDependencies, ...pkg?.dependencies };
}

export function detectTestRunner(pkg) {
  const deps = allDeps(pkg);
  if (deps.vitest) return 'vitest';
  if (deps.jest) return 'jest';
  return null;
}

const STORYBOOK_FRAMEWORKS = [
  '@storybook/nextjs-vite',
  '@storybook/nextjs',
  '@storybook/react-vite',
  '@storybook/react-webpack5',
];

export function detectStorybook(root, pkg) {
  if (!fs.existsSync(path.join(root, '.storybook'))) return null;
  const deps = allDeps(pkg);
  return STORYBOOK_FRAMEWORKS.find((name) => deps[name]) ?? '@storybook/react';
}

export function detectMajor(pkg, name) {
  const m = /(\d+)/.exec(allDeps(pkg)[name] ?? '');
  return m ? Number(m[1]) : null;
}

// Prefer an existing `<out>` or `src/<out>`; otherwise follow the repo's src/ convention.
export function resolveOut(root, out) {
  const isDir = (p) => fs.existsSync(path.join(root, p)) && fs.statSync(path.join(root, p)).isDirectory();
  const withSrc = path.join('src', out);
  if (isDir(out)) return out;
  if (isDir(withSrc)) return withSrc;
  return isDir('src') ? withSrc : out;
}
