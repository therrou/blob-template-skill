import fs from 'node:fs';
import path from 'node:path';

export function readPackageJson(root) {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  } catch {
    return null;
  }
}

export function allDeps(pkg) {
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

// shadcn's components.json is the source of truth for import aliases.
export function detectShadcnAliases(root) {
  try {
    const { aliases = {} } = JSON.parse(fs.readFileSync(path.join(root, 'components.json'), 'utf8'));
    return { utils: aliases.utils ?? null, ui: aliases.ui ?? null };
  } catch {
    return { utils: null, ui: null };
  }
}

const CN_EXPORT = /export\s+(?:function\s+cn\b|const\s+cn\s*=)/;

// Without components.json, look for cn() where shadcn puts it and assume the default @/ alias.
export function detectCn(root) {
  const { utils } = detectShadcnAliases(root);
  if (utils) return utils;
  for (const dir of ['lib', 'src/lib']) {
    for (const ext of ['ts', 'tsx', 'js']) {
      const file = path.join(root, dir, `utils.${ext}`);
      if (fs.existsSync(file) && CN_EXPORT.test(fs.readFileSync(file, 'utf8'))) return '@/lib/utils';
    }
  }
  return null;
}

export function detectSlot(pkg) {
  const deps = allDeps(pkg);
  if (deps['@radix-ui/react-slot']) return { import: '@radix-ui/react-slot', component: 'Slot' };
  if (deps['radix-ui']) return { import: 'radix-ui', component: 'Slot.Root' };
  return null;
}

// '@/components/ui' -> 'components/ui' or 'src/components/ui', following the repo's src/ convention.
export function resolveAliasDir(root, alias) {
  return resolveOut(root, alias.replace(/^[@~]\//, '')).split(path.sep).join('/');
}
