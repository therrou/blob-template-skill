import fs from 'node:fs';
import path from 'node:path';

import { allDeps, detectCn, detectShadcnAliases, readPackageJson, resolveAliasDir } from './detect.mjs';

// The support matrix. `values: null` is free text; `newest` is the fallback when nothing signals a value.
export const DIMENSIONS = {
  app: { values: ['next-app', 'next-pages', 'react-spa'] },
  next: { values: ['13', '14', '15', '16'], newest: '16' },
  react: { values: ['18', '19'], newest: '19' },
  styling: { values: ['tailwind-3', 'tailwind-4', 'styled-components', 'emotion', 'plain'] },
  primitives: { values: ['radix', 'base', 'none'] },
  cn: { values: null },
  zod: { values: ['3', '4'], newest: '4' },
  table: { values: ['8', '9'], newest: '9' },
  srcDir: { values: ['true', 'false'] },
};

const isDir = (root, p) => fs.existsSync(path.join(root, p)) && fs.statSync(path.join(root, p)).isDirectory();

// Installed version first (walking up for hoisted monorepo installs), else the lowest version
// in the package.json range. null when the package isn't a dependency; 'unknown' when unreadable.
export function installedVersion(root, pkg) {
  const range = allDeps(readPackageJson(root))[pkg];
  if (range === undefined) return null;
  for (let dir = path.resolve(root); ; dir = path.dirname(dir)) {
    const file = path.join(dir, 'node_modules', pkg, 'package.json');
    if (fs.existsSync(file)) {
      try {
        return JSON.parse(fs.readFileSync(file, 'utf8')).version ?? 'unknown';
      } catch {
        return 'unknown';
      }
    }
    if (path.dirname(dir) === dir) break;
  }
  const m = /(\d+)(?:\.(\d+))?(?:\.(\d+))?/.exec(range);
  return m ? m[0] : 'unknown';
}

const major = (version) => (version === 'unknown' ? NaN : Number(version.split('.')[0]));

// Buckets a package's major into the matrix: below `min` keeps its real value as unsupported, at or above `max` is `max`.
function versionDim(root, pkg, { min, max, newest, label = String }) {
  const version = installedVersion(root, pkg);
  if (version === null) return { value: newest, source: 'default' };
  const m = major(version);
  if (Number.isNaN(m)) return { value: 'unknown', source: 'detected' };
  if (m < min) return { value: label(m), source: 'detected', supported: false };
  return { value: label(Math.min(m, max)), source: 'detected' };
}

function detectPrimitives(root) {
  const file = path.join(root, 'components.json');
  if (!fs.existsSync(file)) return { value: 'none', source: 'detected' };
  let style;
  try {
    ({ style } = JSON.parse(fs.readFileSync(file, 'utf8')));
  } catch {
    return { value: 'none', source: 'detected' };
  }
  if (typeof style === 'string' && style.startsWith('base-')) return { value: 'base', source: 'detected' };
  if (typeof style === 'string' && style.startsWith('aria-')) return { value: 'aria', source: 'detected', supported: false };
  return { value: 'radix', source: 'detected' };
}

const CN_IMPORT = /import\s*\{\s*cn\s*\}\s*from\s*['"]([^'"]+)['"]/;

// The project's own ui components show how cn is imported today (shadcn moved it to the `cn` package in 2026).
function detectCnImport(root) {
  const uiDir = path.join(root, resolveAliasDir(root, detectShadcnAliases(root).ui ?? '@/components/ui'));
  if (fs.existsSync(uiDir)) {
    for (const file of fs.readdirSync(uiDir).filter((f) => /\.[jt]sx?$/.test(f)).sort()) {
      const m = CN_IMPORT.exec(fs.readFileSync(path.join(uiDir, file), 'utf8'));
      if (m) return m[1];
    }
  }
  return detectCn(root) ?? 'none';
}

function detectStyling(root, deps) {
  if (deps.tailwindcss !== undefined) {
    return versionDim(root, 'tailwindcss', { min: 3, max: 4, newest: 'tailwind-4', label: (m) => `tailwind-${m}` });
  }
  if (deps['styled-components'] !== undefined) return { value: 'styled-components', source: 'detected' };
  if (deps['@emotion/react'] !== undefined || deps['@emotion/styled'] !== undefined) return { value: 'emotion', source: 'detected' };
  return { value: 'plain', source: 'detected' };
}

export function detectProfile(root) {
  const deps = allDeps(readPackageJson(root));
  const hasNext = deps.next !== undefined;
  const app = !hasNext
    ? 'react-spa'
    : isDir(root, 'app') || isDir(root, 'src/app')
      ? 'next-app'
      : isDir(root, 'pages') || isDir(root, 'src/pages')
        ? 'next-pages'
        : 'next-app';
  return {
    dims: {
      app: { value: app, source: 'detected' },
      next: versionDim(root, 'next', { min: 13, max: 16, newest: '16' }),
      react: versionDim(root, 'react', { min: 18, max: 19, newest: '19' }),
      styling: detectStyling(root, deps),
      primitives: detectPrimitives(root),
      cn: { value: detectCnImport(root), source: 'detected' },
      zod: versionDim(root, 'zod', { min: 3, max: 4, newest: '4' }),
      table: versionDim(root, '@tanstack/react-table', { min: 8, max: 9, newest: '9' }),
      srcDir: { value: String(isDir(root, 'src')), source: 'detected' },
    },
    flags: { mui: deps['@mui/material'] !== undefined },
  };
}
