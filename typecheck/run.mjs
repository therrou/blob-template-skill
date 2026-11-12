#!/usr/bin/env node
// Does the generated code type-check against the real packages? For each supported sample app: install its
// dependencies once (cached), run every generator with every element and option combination, then `tsc --noEmit`.
// Needs network on the first run per stack.
//
// Then ESLint on the generated files: typescript-eslint, React hooks (incl. the React Compiler rules), jsx-a11y,
// and the Next plugin on Next stacks.
//
//   node typecheck/run.mjs [--stack <name>] [--keep]
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { attribute, matrix, parseEslint, parseTscErrors } from './lib.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const fixturesDir = path.join(repoRoot, 'evals', 'fixtures');
const generate = path.join(repoRoot, '.agents/skills/codegen/scripts/generate.mjs');
const cacheRoot = path.join(os.homedir(), '.cache', 'codegen-typecheck');

const args = process.argv.slice(2);
const only = args.includes('--stack') ? args[args.indexOf('--stack') + 1] : undefined;
const keep = args.includes('--keep');

// What generated code imports beyond the app's own dependencies: types, test and story tooling.
const TOOLING = {
  typescript: '^5.6.0',
  '@types/node': '^22.0.0',
  vitest: '^3.0.0',
  '@testing-library/react': '^16.0.0',
  '@testing-library/dom': '^10.0.0',
  storybook: '^10.0.0',
  '@storybook/react': '^10.0.0',
  eslint: '^9.0.0',
  'typescript-eslint': '^8.0.0',
  'eslint-plugin-react-hooks': '^7.0.0',
  'eslint-plugin-jsx-a11y': '^6.10.0',
  '@next/eslint-plugin-next': '^16.0.0',
};

// The lint rules most React/Next repos run (what eslint-config-next bundles, minus the React plugin's style rules).
const eslintConfig = (next) => `import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import jsxA11y from 'eslint-plugin-jsx-a11y';
${next ? "import nextPlugin from '@next/eslint-plugin-next';\n" : ''}
export default [
  ...tseslint.configs.recommended,
  reactHooks.configs.flat['recommended-latest'],
  jsxA11y.flatConfigs.recommended,
${next ? "  { ...nextPlugin.configs['core-web-vitals'], settings: { next: { rootDir: '.' } } },\n" : ''}];
`;
const reactTypes = (major) => ({ '@types/react': `^${major}.0.0`, '@types/react-dom': `^${major}.0.0` });

// shortcut: plain re-exports of the Radix parts instead of the full shadcn sources; same prop types, minus shadcn's styling wrappers.
const RADIX_PRIMITIVES = {
  'components/ui/select.tsx': `import * as SelectPrimitive from '@radix-ui/react-select';

export const Select = SelectPrimitive.Root;
export const SelectTrigger = SelectPrimitive.Trigger;
export const SelectValue = SelectPrimitive.Value;
export const SelectContent = SelectPrimitive.Content;
export const SelectItem = SelectPrimitive.Item;
`,
  'components/ui/checkbox.tsx': `import * as CheckboxPrimitive from '@radix-ui/react-checkbox';

export const Checkbox = CheckboxPrimitive.Root;
`,
  'components/ui/textarea.tsx': `import type { ComponentProps } from 'react';

export function Textarea(props: ComponentProps<'textarea'>) {
  return <textarea {...props} />;
}
`,
};
const RADIX_DEPS = { '@radix-ui/react-select': '^2.1.0', '@radix-ui/react-checkbox': '^1.1.0' };

// The supported sample apps, plus pinned variants for the oldest supported versions. `pin` replaces the app's own
// dependency ranges with exact versions; the generator then detects those installed versions.
// react17-legacy is outside the matrix and has nothing to check.
const NEXT_RADIX = { ...RADIX_DEPS, 'server-only': '^0.0.1' };
const REACT_18_2 = { react: '18.2.0', 'react-dom': '18.2.0' };
const CONST_EXPORTS = { '.codegen/config.json': JSON.stringify({ exports: 'const' }) };

const STACKS = [
  { fixture: 'next-app-tw4', pack: 'next', deps: { ...reactTypes(19), ...NEXT_RADIX }, files: RADIX_PRIMITIVES },
  { fixture: 'next-pages-tw3', pack: 'next', deps: { ...reactTypes(18), ...NEXT_RADIX }, files: RADIX_PRIMITIVES },
  { fixture: 'next-base-ui', pack: 'next', deps: { ...reactTypes(19), 'server-only': '^0.0.1' }, files: {} },
  { fixture: 'vite-react18-styled', pack: 'react', deps: reactTypes(18), files: {} },
  { fixture: 'vite-react19-emotion', pack: 'react', deps: reactTypes(19), files: {} },
  { name: 'vite-react19-mui', fixture: 'vite-react19-emotion', pack: 'react', deps: reactTypes(19), pin: { '@mui/material': '^9.0.0' }, files: {} },
  // Oldest supported: App Router went stable in Next 13.4; React 18.2 is the oldest React 18 still common.
  { name: 'next13.4-app-react18.2', fixture: 'next-app-tw4', pack: 'next', deps: { '@types/react': '18.2.79', '@types/react-dom': '18.2.25', ...NEXT_RADIX }, pin: { next: '13.4.19', ...REACT_18_2 }, files: RADIX_PRIMITIVES },
  { name: 'next13.0-pages-tw3.0', fixture: 'next-pages-tw3', pack: 'next', deps: { '@types/react': '18.2.79', '@types/react-dom': '18.2.25', ...NEXT_RADIX, tailwindcss: '3.0.24' }, pin: { next: '13.0.7', ...REACT_18_2 }, files: RADIX_PRIMITIVES },
  // The repo setting for const components (`"exports": "const"`), on React 19 + Tailwind, React 18 + Tailwind and React 18 + styled-components.
  { name: 'next-app-tw4-const', fixture: 'next-app-tw4', pack: 'next', deps: { ...reactTypes(19), ...NEXT_RADIX }, files: { ...RADIX_PRIMITIVES, ...CONST_EXPORTS } },
  { name: 'next-pages-tw3-const', fixture: 'next-pages-tw3', pack: 'next', deps: { ...reactTypes(18), ...NEXT_RADIX }, files: { ...RADIX_PRIMITIVES, ...CONST_EXPORTS } },
  { name: 'vite-react18-styled-const', fixture: 'vite-react18-styled', pack: 'react', deps: reactTypes(18), files: CONST_EXPORTS },
  { name: 'next15-app', fixture: 'next-app-tw4', pack: 'next', deps: { ...reactTypes(19), ...NEXT_RADIX }, pin: { next: '~15.5.0' }, files: RADIX_PRIMITIVES },
].map((s) => ({ name: s.fixture, ...s }));

const COMMON_FILES = {
  '.storybook/main.ts': "export default { stories: ['../**/*.stories.tsx'], framework: '@storybook/react-vite' };\n",
  'typecheck-env.d.ts': "declare module '*.css';\n",
};

const run = (cmd, argv, cwd) => spawnSync(cmd, argv, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

function packageJson(stack) {
  const pkg = JSON.parse(fs.readFileSync(path.join(fixturesDir, stack.fixture, 'package.json'), 'utf8'));
  pkg.devDependencies = { ...pkg.devDependencies, ...TOOLING, ...stack.deps };
  pkg.dependencies = { ...pkg.dependencies, ...stack.pin };
  return pkg;
}

// node_modules per stack, keyed by the merged package.json so a dependency change reinstalls.
function installed(stack, pkg) {
  const text = JSON.stringify(pkg, null, 2);
  const dir = path.join(cacheRoot, `${stack.name}-${crypto.createHash('sha256').update(text).digest('hex').slice(0, 12)}`);
  if (fs.existsSync(path.join(dir, 'node_modules', '.package-lock.json'))) return dir;
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'package.json'), text);
  console.log(`  installing dependencies into ${dir} ...`);
  const r = run('npm', ['install', '--no-audit', '--no-fund', '--ignore-scripts', '--legacy-peer-deps', '--loglevel=error'], dir);
  if (r.status !== 0) throw new Error(`npm install failed for ${stack.name}:\n${r.stderr}`);
  return dir;
}

function workspace(stack, pkg, cacheDir) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `codegen-typecheck-${stack.name}-`));
  fs.cpSync(path.join(fixturesDir, stack.fixture), dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(pkg, null, 2));
  for (const [file, content] of Object.entries({ ...COMMON_FILES, ...stack.files })) {
    if (fs.existsSync(path.join(dir, file))) continue;
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    fs.writeFileSync(path.join(dir, file), content);
  }
  fs.symlinkSync(path.join(cacheDir, 'node_modules'), path.join(dir, 'node_modules'), 'dir');
  const srcDir = fs.existsSync(path.join(dir, 'src'));
  const tsconfig = {
    compilerOptions: {
      target: 'ES2022',
      lib: ['dom', 'dom.iterable', 'ES2023'],
      module: 'esnext',
      moduleResolution: 'bundler',
      jsx: 'react-jsx',
      strict: true,
      noEmit: true,
      skipLibCheck: true,
      esModuleInterop: true,
      isolatedModules: true,
      resolveJsonModule: true,
      baseUrl: '.',
      paths: { '@/*': [srcDir ? './src/*' : './*'] },
    },
    include: ['**/*.ts', '**/*.tsx'],
    exclude: ['node_modules'],
  };
  fs.writeFileSync(path.join(dir, 'tsconfig.typecheck.json'), JSON.stringify(tsconfig, null, 2));
  fs.writeFileSync(path.join(dir, 'eslint.config.mjs'), eslintConfig(stack.pack === 'next'));
  return dir;
}

function checkStack(stack) {
  console.log(`\n== ${stack.name} (${stack.pack} pack)`);
  const pkg = packageJson(stack);
  const dir = workspace(stack, pkg, installed(stack, pkg));

  const list = JSON.parse(run(process.execPath, [generate, '--list', stack.pack], dir).stdout);
  const filesByCall = [];
  const skipped = new Map();
  const genErrors = [];
  for (const call of matrix(stack.pack, list.packs[stack.pack].generators)) {
    const out = JSON.parse(run(process.execPath, [generate, ...call, '--root', dir], dir).stdout);
    const label = call.join(' ');
    if (out.ok) filesByCall.push({ call: label, files: [...out.created, ...out.modified] });
    else if (/not supported|does not support/.test(out.error ?? '')) skipped.set(out.error, (skipped.get(out.error) ?? 0) + 1);
    else genErrors.push(`${label}: ${out.error ?? JSON.stringify(out)}`);
  }

  const tsc = run(process.execPath, [path.join(dir, 'node_modules/typescript/bin/tsc'), '-p', 'tsconfig.typecheck.json', '--pretty', 'false'], dir);
  const typeErrors = attribute(parseTscErrors(tsc.stdout), filesByCall);
  const generated = [...new Set(filesByCall.flatMap((c) => c.files))].filter((f) => /\.tsx?$/.test(f));
  const eslint = run(process.execPath, [path.join(dir, 'node_modules/eslint/bin/eslint.js'), '--format', 'json', ...generated], dir);
  const lint = attribute(parseEslint(eslint.stdout, fs.realpathSync(dir)), filesByCall);
  const lintErrors = lint.filter((e) => e.severity === 2);
  const lintWarnings = lint.filter((e) => e.severity !== 2);

  console.log(`  ${filesByCall.length} generator calls, ${generated.length} code files, ${[...skipped.values()].reduce((a, b) => a + b, 0)} skipped as unsupported`);
  for (const [reason, n] of skipped) console.log(`    skipped ${n}x: ${reason}`);
  for (const e of genErrors) console.log(`  GENERATOR ERROR ${e}`);
  report('TYPE ERRORS', typeErrors);
  report('LINT ERRORS', lintErrors);
  report('LINT WARNINGS', lintWarnings);
  if (tsc.status !== 0 && !typeErrors.length) console.log(`  tsc failed without parsable errors:\n${tsc.stdout}${tsc.stderr}`);
  if (eslint.status === 2) console.log(`  eslint crashed:\n${eslint.stderr}`);
  const pass = !genErrors.length && tsc.status === 0 && eslint.status !== 2 && !lintErrors.length;
  console.log(`  ${pass ? 'PASS' : 'FAIL'}: ${typeErrors.length} type errors, ${lintErrors.length} lint errors, ${lintWarnings.length} lint warnings${keep || !pass ? `  workspace: ${dir}` : ''}`);
  if (pass && !keep) fs.rmSync(dir, { recursive: true, force: true });
  return pass;
}

// Errors grouped by the generator call that wrote the file, a few examples each.
function report(title, errors) {
  const groups = new Map();
  for (const e of errors) {
    const key = e.call ?? '(sample app code)';
    groups.set(key, [...(groups.get(key) ?? []), e]);
  }
  for (const [call, es] of groups) {
    console.log(`  ${title} from ${call}`);
    for (const e of es.slice(0, 5)) console.log(`    ${e.file}:${e.line} ${e.code} ${e.message.split('\n').join('\n      ')}`);
    if (es.length > 5) console.log(`    ... and ${es.length - 5} more`);
  }
}

const stacks = STACKS.filter((s) => !only || s.name === only);
if (!stacks.length) {
  console.error(`No stack "${only}". Stacks: ${STACKS.map((s) => s.name).join(', ')}`);
  process.exit(1);
}
const results = stacks.map(checkStack);
console.log(`\n${results.filter(Boolean).length}/${results.length} stacks type-check and lint clean`);
process.exitCode = results.every(Boolean) ? 0 : 1;
