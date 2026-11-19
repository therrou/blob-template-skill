import fs from 'node:fs';
import path from 'node:path';

import { CodegenError } from './errors.mjs';
import { allDeps, detectCn, detectShadcnAliases, readPackageJson, resolveAliasDir } from './detect.mjs';

// The support matrix. `values: null` is free text; `newest` is the fallback when nothing signals a value.
export const DIMENSIONS = {
  app: { values: ['next-app', 'next-pages', 'react-spa'] },
  next: { values: ['13', '14', '15', '16'], newest: '16' },
  react: { values: ['18', '19'], newest: '19' },
  styling: { values: ['tailwind-3', 'tailwind-4', 'styled-components', 'emotion', 'plain'] },
  primitives: { values: ['radix', 'base', 'none'] },
  forms: { values: ['shadcn', 'tanstack-form', 'formik', 'custom', 'none'] },
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

// shadcn without components.json: what the ui folder's own files (not subfolders) import.
function primitivesFromUi(root) {
  const uiDir = path.join(root, resolveAliasDir(root, detectShadcnAliases(root).ui ?? '@/components/ui'));
  if (!fs.existsSync(uiDir)) return 'none';
  const src = fs.readdirSync(uiDir, { withFileTypes: true })
    .filter((e) => e.isFile() && /\.[jt]sx$/.test(e.name))
    .map((e) => fs.readFileSync(path.join(uiDir, e.name), 'utf8'))
    .join('\n');
  return /from ['"]@base-ui/.test(src) ? 'base' : /from ['"]@radix-ui\//.test(src) ? 'radix' : 'none';
}

function detectPrimitives(root) {
  const file = path.join(root, 'components.json');
  if (!fs.existsSync(file)) return { value: primitivesFromUi(root), source: 'detected' };
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

const FORM_LIBS = { 'tanstack-form': ['@tanstack/react-form', 'TanStack Form'], formik: ['formik', 'Formik'] };

// What the repo's form fields are built on. form-field writes shadcn Form (react-hook-form) fields only;
// for anything else `hint` tells the agent where the repo's own fields live.
function detectForms(root, deps) {
  const uiDir = resolveAliasDir(root, detectShadcnAliases(root).ui ?? '@/components/ui');
  if (['tsx', 'jsx'].some((ext) => fs.existsSync(path.join(root, uiDir, `form.${ext}`)))) return { value: 'shadcn', source: 'detected' };
  const folder = ['form', 'forms'].map((d) => `${uiDir}/${d}`).find((d) => isDir(root, d));
  const lib = Object.entries(FORM_LIBS).find(([, [pkg]]) => deps[pkg] !== undefined);
  const value = lib?.[0] ?? (folder ? 'custom' : 'none');
  if (value === 'none') return { value, source: 'detected' };
  const what = lib ? lib[1][1] : 'its own form components';
  const where = folder ? ` in ${folder}/` : '';
  return { value, source: 'detected', hint: `This repo builds form fields with ${what}${where}: write the field by hand following the existing fields${where ? ' there' : ''}, not shadcn Form. Don't install shadcn form or another form library.` };
}

const CN_IMPORT = /import\s*\{[^}]*\bcn\b[^}]*\}\s*from\s*['"]([^'"]+)['"]/;

// The project's own ui components show how cn is imported today (shadcn moved it to the `cn` package in 2026).
function detectCnImport(root) {
  const ui = detectShadcnAliases(root).ui ?? '@/components/ui';
  const uiDir = path.join(root, resolveAliasDir(root, ui));
  if (fs.existsSync(uiDir)) {
    // Flat (ui/button.tsx, shadcn) first, then one folder deep (ui/button/button.tsx).
    const entries = fs.readdirSync(uiDir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
    const files = [
      ...entries.filter((e) => e.isFile()).map((e) => path.join(uiDir, e.name)),
      ...entries.filter((e) => e.isDirectory()).flatMap((e) => fs.readdirSync(path.join(uiDir, e.name)).sort().map((f) => path.join(uiDir, e.name, f))),
    ].filter((f) => /\.[jt]sx?$/.test(f) && fs.statSync(f).isFile());
    for (const file of files) {
      const m = CN_IMPORT.exec(fs.readFileSync(file, 'utf8'));
      // A relative import (./utils) becomes the alias path, so it works from any folder.
      if (m) return m[1].startsWith('.') ? path.posix.join(ui, path.relative(uiDir, path.dirname(file)).split(path.sep).join('/'), m[1]) : m[1];
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
      forms: detectForms(root, deps),
      cn: { value: detectCnImport(root), source: 'detected' },
      zod: versionDim(root, 'zod', { min: 3, max: 4, newest: '4' }),
      table: versionDim(root, '@tanstack/react-table', { min: 8, max: 9, newest: '9' }),
      srcDir: { value: String(isDir(root, 'src')), source: 'detected' },
    },
    flags: { mui: deps['@mui/material'] !== undefined },
  };
}

const CONFIG_FILE = path.join('.codegen', 'config.json');
const CONFIG_KEYS = ['profile', 'out', 'exports', 'files'];
// { profile: { dim: value }, out: { generator: folder }, exports: 'function' | 'const' | { generator: style }, files: { generator: layout } }
export function readConfig(root) {
  const file = path.join(root, CONFIG_FILE);
  if (!fs.existsSync(file)) return {};
  let config;
  try {
    config = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    throw new CodegenError(`Invalid JSON in .codegen/config.json: ${err.message}`);
  }
  for (const key of Object.keys(config ?? {})) {
    if (!CONFIG_KEYS.includes(key)) throw new CodegenError(`Unknown key "${key}" in .codegen/config.json. Allowed: ${CONFIG_KEYS.join(', ')}.`);
  }
  const { out, exports, files } = config ?? {};
  if (out !== undefined && (typeof out !== 'object' || out === null || Array.isArray(out) || !Object.values(out).every((v) => typeof v === 'string' && v))) {
    throw new CodegenError('"out" in .codegen/config.json must map generator names to folders, e.g. { "util": "src/utils" }.');
  }
  const isMap = typeof exports === 'object' && exports !== null && !Array.isArray(exports) && Object.values(exports).every((v) => typeof v === 'string');
  if (exports !== undefined && !['function', 'const'].includes(exports) && !isMap) {
    throw new CodegenError(`"exports" in .codegen/config.json must be "function", "const" or an object of generator styles, e.g. { "hook": "inline" }. Got ${JSON.stringify(exports)}.`);
  }
  if (files !== undefined && (typeof files !== 'object' || files === null || Array.isArray(files) || !Object.values(files).every((v) => typeof v === 'string'))) {
    throw new CodegenError('"files" in .codegen/config.json must map generator names to a file layout, e.g. { "component": "pascal" }.');
  }
  return config ?? {};
}

function override(dims, key, value, source) {
  if (!(key in DIMENSIONS)) throw new CodegenError(`Unknown profile key "${key}". Allowed: ${Object.keys(DIMENSIONS).join(', ')}.`);
  const { values } = DIMENSIONS[key];
  if (values && !values.includes(String(value))) {
    throw new CodegenError(`profile ${key} must be one of: ${values.join(', ')}. Got "${value}".`);
  }
  dims[key] = { value: String(value), source };
}

// Precedence: --profile flag > .codegen/config.json > detection.
export function resolveProfile(root, flag) {
  const profile = detectProfile(root);
  for (const [key, value] of Object.entries(readConfig(root).profile ?? {})) override(profile.dims, key, value, 'config');
  if (typeof flag === 'string') {
    for (const entry of flag.split(',').map((e) => e.trim()).filter(Boolean)) {
      const eq = entry.indexOf('=');
      if (eq < 1) throw new CodegenError(`Invalid --profile entry "${entry}": use key=value.`);
      override(profile.dims, entry.slice(0, eq).trim(), entry.slice(eq + 1).trim(), 'flag');
    }
  }
  return profile;
}
