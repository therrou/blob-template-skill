// Reads how the repo's existing code is written (export style, folders per generator) and suggests .codegen/config.json values.
// Suggestions only: the agent shows them to the user, who decides whether to save them.
import fs from 'node:fs';
import path from 'node:path';

import { resolveOut } from './detect.mjs';

// Export styles each generator's templates can write: function (`export function x`), const (`const x = …` + one `export { x }`), inline (`export const x = …`).
// Route files are default exports, so their const style is `const X = …; export default X`. Route handlers stay functions.
const ALL_STYLES = ['function', 'const', 'inline'];
export const EXPORT_STYLES = { component: ['function', 'const'], 'client-component': ['function', 'const'], 'form-field': ['function', 'const'], route: ['function', 'const'], hook: ALL_STYLES, util: ALL_STYLES, context: ALL_STYLES, page: ALL_STYLES, 'server-action': ALL_STYLES };
// The string form of "exports" covers these.
export const COMPONENT_GENERATORS = ['component', 'client-component', 'form-field'];

const SKIP_DIRS = new Set(['node_modules', '.git', '.next', 'dist', 'build', 'out', 'coverage', 'storybook-static', '.agents', '.codegen', '.turbo', '.vercel']);
// shortcut: stops after this many source files; plenty to see a convention, raise it if a huge monorepo gets no suggestions.
const MAX_FILES = 5000;
// A convention is clear when it covers at least MIN_FILES files and is at least twice as common as each alternative.
const MIN_FILES = 5;

function sourceFiles(root) {
  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (files.length >= MAX_FILES) return;
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name) && !entry.name.startsWith('.')) walk(path.join(dir, entry.name));
      } else if (/\.tsx?$/.test(entry.name) && !/\.(d|test|spec|stories)\.tsx?$/.test(entry.name)) {
        files.push(path.relative(root, path.join(dir, entry.name)).split(path.sep).join('/'));
      }
    }
  };
  walk(root);
  return files;
}

const isHookFile = (rel) => /^use[-A-Z]/.test(path.posix.basename(rel));
// Which generator would have written this file. First match wins.
function kindOf(rel, src, app) {
  if (/^['"]use server['"]/.test(src)) return 'server-action';
  if (isHookFile(rel)) return 'hook';
  if (/\bcreateContext\(/.test(src)) return 'context';
  if (/(^|\/)app\/(.*\/)?(page|layout|error|loading)\.tsx$/.test(rel)) return 'route';
  if (/(^|\/)pages\/(?!api\/)/.test(rel) && rel.endsWith('.tsx') && !/\/_(app|document)\.tsx$/.test(rel)) return app === 'react-spa' ? 'page' : 'route';
  if (/(^|\/)components\//.test(rel) && rel.endsWith('.tsx') && !rel.endsWith('/index.tsx')) return 'component';
  if (/(^|\/)(utils?|lib|helpers)\//.test(rel) && rel.endsWith('.ts')) return 'util';
  return null;
}

const FN_VALUE = String.raw`(async )?(\(|<|function\b|[A-Za-z_$][\w$]* =>|forwardRef|memo)`;
const INLINE = new RegExp(String.raw`^export const [A-Za-z_$][\w$]* = ${FN_VALUE}`, 'gm');
const LOCAL = new RegExp(String.raw`^const [A-Za-z_$][\w$]* = ${FN_VALUE}`, 'gm');

function styleOf(kind, src) {
  if (kind === 'route') {
    if (/^export default (async )?function/m.test(src)) return 'function';
    return /^export default [A-Za-z_$][\w$]*;?\s*$/m.test(src) ? 'const' : null;
  }
  const counts = {
    function: (src.match(/^export (default )?(async )?function /gm) ?? []).length,
    inline: (src.match(INLINE) ?? []).length,
    const: /^export \{/m.test(src) ? (src.match(LOCAL) ?? []).length : 0,
  };
  const [[top, n], [, second]] = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return n > 0 && n > second ? top : null;
}

// The folder a generator's --out would be: for a component in its own folder (hero/hero.tsx, hero/module-hero.tsx), the folder above.
function groupDir(kind, rel) {
  const dir = path.posix.dirname(rel);
  const own = path.posix.basename(rel).replace(/\.tsx$/, '');
  if (kind === 'component' && (own === 'index' || own.includes(path.posix.basename(dir)))) return path.posix.dirname(dir);
  return dir;
}

const dominant = (counts) => {
  const [[top, n] = [], ...rest] = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const total = n + rest.reduce((sum, [, c]) => sum + c, 0);
  return total >= MIN_FILES && rest.every(([, c]) => n >= 2 * c) ? top : undefined;
};

// defaultOut: { generator: folder the generator writes to with no config }. config: the current .codegen/config.json.
export function detectConventions(root, { app, defaultOut = {}, config = {} } = {}) {
  const styles = {};
  const folders = {};
  for (const rel of sourceFiles(root)) {
    const src = fs.readFileSync(path.join(root, rel), 'utf8');
    const kind = kindOf(rel, src, app);
    if (!kind) continue;
    const style = styleOf(kind, src);
    if (style) (styles[kind] ??= {})[style] = (styles[kind][style] ?? 0) + 1;
    const dir = groupDir(kind, rel);
    (folders[kind] ??= {})[dir] = (folders[kind][dir] ?? 0) + 1;
  }

  const configured = typeof config.exports === 'string' ? Object.fromEntries(COMPONENT_GENERATORS.map((g) => [g, config.exports])) : (config.exports ?? {});
  const exports = {};
  for (const [kind, counts] of Object.entries(styles)) {
    // Only styles this generator can write compete (components can't be inline).
    const top = dominant(Object.fromEntries(Object.entries(counts).filter(([style]) => EXPORT_STYLES[kind]?.includes(style))));
    if (top && top !== 'function' && configured[kind] === undefined) exports[kind] = top;
  }
  if (exports.component) for (const g of COMPONENT_GENERATORS) if (configured[g] === undefined) exports[g] = exports.component;

  const out = {};
  for (const [kind, counts] of Object.entries(folders)) {
    const top = dominant(counts);
    if (top && kind in defaultOut && top !== defaultOut[kind] && config.out?.[kind] === undefined) out[kind] = top;
  }

  const top3 = (counts) => Object.fromEntries(Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 3));
  return {
    styles,
    folders: Object.fromEntries(Object.entries(folders).filter(([k]) => k in defaultOut).map(([k, v]) => [k, top3(v)])),
    suggest: { ...(Object.keys(exports).length && { exports }), ...(Object.keys(out).length && { out }) },
  };
}

// --detect: conventions with each generator's default folder in this repo (generators with a fixed folder only, not routes).
export function conventionsFor(root, app, pack, config) {
  const defaultOut = Object.fromEntries(
    Object.entries(pack.generators)
      .filter(([, gen]) => typeof gen.out === 'string')
      .map(([name, gen]) => [name, resolveOut(root, gen.out).split(path.sep).join('/')]),
  );
  return detectConventions(root, { app, defaultOut, config });
}
