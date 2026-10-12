import fs from 'node:fs';
import path from 'node:path';

import { CodegenError } from './errors.mjs';
import { detectMajor, detectStorybook, detectTestRunner, readPackageJson, resolveOut } from './detect.mjs';
import { installCommand, missingDependencies } from './deps.mjs';
import { parseName } from './names.mjs';
import { parseRoute } from './route.mjs';
import { findTodos, render } from './template.mjs';

export const GLOBAL_OPTIONS = {
  name: { type: 'string', description: 'Name of the thing to generate (any casing), or a route path for route generators.' },
  out: { type: 'string', description: 'Output directory relative to the repo root. Defaults to the generator\'s folder (under src/ when the repo uses src/).' },
  root: { type: 'string', description: 'Repo/app root. Defaults to the current directory.' },
  'dry-run': { type: 'boolean', description: 'Print the planned files without writing anything.' },
  'test-runner': { type: 'string', description: 'vitest | jest. Defaults to the one found in package.json.' },
};

const camel = (flag) => flag.replace(/-(\w)/g, (_, c) => c.toUpperCase());

function ensureInside(root, target) {
  const rel = path.relative(root, target);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new CodegenError(`Refusing to write outside the repo root: ${target}`);
  }
  return rel.split(path.sep).join('/');
}

export function listPacks(skillDir) {
  const packsDir = path.join(skillDir, 'packs');
  return fs
    .readdirSync(packsDir)
    .filter((name) => fs.existsSync(path.join(packsDir, name, 'pack.json')))
    .sort();
}

export function loadPack(skillDir, pack) {
  if (!/^[a-z][a-z0-9-]*$/.test(pack ?? '') || !listPacks(skillDir).includes(pack)) {
    throw new CodegenError(`Unknown pack "${pack}". Available: ${listPacks(skillDir).join(', ')}.`);
  }
  return JSON.parse(fs.readFileSync(path.join(skillDir, 'packs', pack, 'pack.json'), 'utf8'));
}

// "@react/util/util.ts.tpl" borrows a template from another pack.
// A repo override at .codegen/templates/<pack>/<path> always wins.
function resolveTemplate(skillDir, root, pack, ref) {
  const [owner, rel] = ref.startsWith('@') ? [ref.slice(1, ref.indexOf('/')), ref.slice(ref.indexOf('/') + 1)] : [pack, ref];
  const override = path.join(root, '.codegen', 'templates', owner, rel);
  if (fs.existsSync(override)) return { file: override, overridden: true };
  return { file: path.join(skillDir, 'packs', owner, 'templates', rel), overridden: false };
}

function requiredPackages(gen, ctx) {
  const fromOptions = Object.entries(gen.options ?? {})
    .filter(([key]) => ctx[camel(key)])
    .flatMap(([, spec]) => spec.requires ?? []);
  return [...(gen.requires ?? []), ...fromOptions];
}

export function plan({ skillDir, root, pack, generator, options }) {
  const manifest = loadPack(skillDir, pack);
  const gen = manifest.generators[generator];
  if (!gen) {
    throw new CodegenError(
      `Unknown generator "${generator}" in pack "${pack}". Available: ${Object.keys(manifest.generators).join(', ')}.`,
    );
  }

  for (const key of Object.keys(options)) {
    if (!(key in GLOBAL_OPTIONS) && !(key in (gen.options ?? {}))) {
      throw new CodegenError(`Unknown option --${key} for ${pack}/${generator}. Run --list ${pack} to see options.`);
    }
  }
  if (typeof options.name !== 'string' || !options.name) throw new CodegenError('Missing required --name.');
  for (const [key, spec] of Object.entries(gen.options ?? {})) {
    const value = options[key];
    if (value === undefined) {
      if (spec.required) {
        throw new CodegenError(`Missing required --${key}${spec.choices ? ` (one of: ${spec.choices.join(', ')})` : ''}.`);
      }
      continue;
    }
    if (spec.type === 'string' && typeof value !== 'string') throw new CodegenError(`--${key} needs a value.`);
    if (spec.choices && !spec.choices.includes(value)) {
      throw new CodegenError(`--${key} must be one of: ${spec.choices.join(', ')}. Got "${value}".`);
    }
  }

  const pkg = readPackageJson(root);
  const ctx = { ...manifest.vars, ...gen.vars };
  for (const [key, spec] of Object.entries(gen.options ?? {})) {
    ctx[camel(key)] = options[key] ?? (spec.type === 'boolean' ? false : '');
  }
  for (const [key, spec] of Object.entries(gen.options ?? {})) {
    if (spec.choices) ctx[`${camel(key)}Is`] = Object.fromEntries(spec.choices.map((c) => [c, ctx[camel(key)] === c]));
  }

  if (gen.nameKind === 'route') {
    const { name, ...route } = parseRoute(options.name);
    Object.assign(ctx, route, { name });
  } else {
    ctx.name = parseName(options.name, gen.strip);
  }

  const missing = missingDependencies(pkg, requiredPackages(gen, ctx));
  if (missing.length) {
    throw new CodegenError(
      `Missing requirements for ${pack}/${generator}: ${missing.join(', ')}. Ask the user before installing, then rerun.`,
      { missing, install: installCommand(root, missing) },
    );
  }

  ctx.vitest = false;
  ctx.jest = false;
  if (ctx.withTest) {
    const runner = options['test-runner'] ?? detectTestRunner(pkg);
    if (runner !== 'vitest' && runner !== 'jest') {
      throw new CodegenError('--with-test needs a test runner: add vitest or jest to package.json, or pass --test-runner.');
    }
    ctx[runner] = true;
  }

  ctx.storybookImport = '';
  if (ctx.withStory) {
    ctx.storybookImport = detectStorybook(root, pkg);
    if (!ctx.storybookImport) throw new CodegenError('--with-story needs Storybook: no .storybook/ directory found.');
  }

  const nextMajor = detectMajor(pkg, 'next');
  ctx.asyncParams = nextMajor === null || nextMajor >= 15;

  const outDir = path.resolve(root, options.out ?? resolveOut(root, gen.out));
  ensureInside(root, outDir);

  const files = gen.files
    .filter((f) => !f.when || Boolean(ctx[f.when]))
    .map((f) => {
      const { file, overridden } = resolveTemplate(skillDir, root, pack, f.template);
      const abs = path.join(outDir, render(f.path, ctx, `path of ${f.template}`));
      return {
        abs,
        path: ensureInside(root, abs),
        content: render(fs.readFileSync(file, 'utf8'), ctx, f.template),
        overridden,
      };
    });

  return { files, todo: files.flatMap((f) => findTodos(f.content).map((t) => ({ file: f.path, ...t }))) };
}

// All-or-nothing: refuse if any target exists; roll back on a mid-write failure.
export function write(files) {
  const conflicts = files.filter((f) => fs.existsSync(f.abs)).map((f) => f.path);
  if (conflicts.length) {
    throw new CodegenError('Target files already exist; nothing was written. Reuse/extend them or pick another name.', {
      conflicts,
    });
  }
  const written = [];
  const createdDirs = [];
  try {
    for (const f of files) {
      for (let dir = path.dirname(f.abs); !fs.existsSync(dir); dir = path.dirname(dir)) createdDirs.push(dir);
      fs.mkdirSync(path.dirname(f.abs), { recursive: true });
      fs.writeFileSync(f.abs, f.content, { flag: 'wx' });
      written.push(f.abs);
    }
  } catch (err) {
    for (const file of written) fs.rmSync(file, { force: true });
    for (const dir of [...new Set(createdDirs)].sort((a, b) => b.length - a.length)) {
      try {
        fs.rmdirSync(dir);
      } catch {}
    }
    throw err;
  }
}
