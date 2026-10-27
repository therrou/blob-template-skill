import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { CodegenError } from './errors.mjs';
import {
  detectShadcnAliases,
  detectSlot,
  detectStorybook,
  detectTestRunner,
  readPackageJson,
  resolveAliasDir,
  resolveOut,
} from './detect.mjs';
import { ensureInside, matches, runActions } from './actions.mjs';
import { installCommand, missingDependencies } from './deps.mjs';
import { elementVars } from './elements.mjs';
import { parseName } from './names.mjs';
import { DIMENSIONS, resolveProfile } from './profile.mjs';
import { parseRoute } from './route.mjs';
import { loadHelpers } from './helpers.mjs';
import { findTodos, render } from './template.mjs';

export const GLOBAL_OPTIONS = {
  name: { type: 'string', description: 'Name of the thing to generate (any casing), or a route path for route generators.' },
  out: { type: 'string', description: 'Output directory relative to the repo root. Defaults to the generator\'s folder (under src/ when the repo uses src/).' },
  root: { type: 'string', description: 'Repo/app root. Defaults to the current directory.' },
  'dry-run': { type: 'boolean', description: 'Print the planned files without writing anything.' },
  'test-runner': { type: 'string', description: 'vitest | jest. Defaults to the one found in package.json.' },
  profile: { type: 'string', description: 'Override detected targets, e.g. app=next-pages,styling=emotion. See --detect.' },
};

const camel = (flag) => flag.replace(/-(\w)/g, (_, c) => c.toUpperCase());

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
export function resolveTemplate(skillDir, root, pack, ref) {
  const [owner, rel] = ref.startsWith('@') ? [ref.slice(1, ref.indexOf('/')), ref.slice(ref.indexOf('/') + 1)] : [pack, ref];
  const override = path.join(root, '.codegen', 'templates', owner, rel);
  const shipped = path.join(skillDir, 'packs', owner, 'templates', rel);
  if (fs.existsSync(override)) return { file: override, overridden: true, shipped, label: `.codegen/templates/${owner}/${rel}`, owner };
  return { file: shipped, overridden: false, owner };
}

// Render env for templates owned by `owner`: its helpers, and partials resolved from the same owner,
// so a borrowed template renders the same whichever pack runs it.
export function templateEnvs(skillDir, root) {
  const cache = new Map();
  const envFor = async (owner) => {
    if (cache.has(owner)) return cache.get(owner);
    const env = { helpers: await loadHelpers(skillDir, root, owner), partial: null };
    cache.set(owner, env);
    return env;
  };
  // Partials need their owner's env synchronously while rendering, so preload every pack's env.
  const preload = async () => {
    for (const pack of listPacks(skillDir)) {
      const env = await envFor(pack);
      env.partial = (ref) => {
        const target = ref.startsWith('@') ? `${ref.slice(0, ref.indexOf('/'))}/_partials/${ref.slice(ref.indexOf('/') + 1)}.tpl` : `_partials/${ref}.tpl`;
        const t = resolveTemplate(skillDir, root, pack, target);
        if (!fs.existsSync(t.file)) return null;
        return { text: fs.readFileSync(t.file, 'utf8'), source: t.overridden ? t.label : `${t.owner}/${target.replace(/^@[^/]+\//, '')}`, env: cache.get(t.owner) };
      };
    }
    return (owner) => cache.get(owner);
  };
  return preload();
}

// An override written before a flag existed would silently drop it (and break files that rely on it).
function assertOverrideHandles(template, gen, ctx) {
  const shipped = fs.readFileSync(template.shipped, 'utf8');
  const override = fs.readFileSync(template.file, 'utf8');
  for (const [key, spec] of Object.entries(gen.options ?? {})) {
    if (spec.type !== 'boolean' || !ctx[camel(key)]) continue;
    const usesFlag = new RegExp(`\\{\\{#(?:if|unless) ${camel(key)}\\}\\}`);
    if (usesFlag.test(shipped) && !usesFlag.test(override)) {
      throw new CodegenError(`Repo override ${template.label} ignores --${key}. Update it from the skill template or drop the flag.`);
    }
  }
}

// A requirement is "pkg" or { package: "pkg", when: { dim: value } } (only needed when the profile matches).
function requiredPackages(gen, ctx) {
  const fromOptions = Object.entries(gen.options ?? {})
    .filter(([key]) => ctx[camel(key)])
    .flatMap(([, spec]) => spec.requires ?? []);
  return [...(gen.requires ?? []), ...fromOptions]
    .filter((req) => typeof req === 'string' || matches(req.when, ctx))
    .map((req) => (typeof req === 'string' ? req : req.package));
}

function checkSupports(supports, profile, describe) {
  for (const [dim, allowed] of Object.entries(supports ?? {})) {
    const { value, supported } = profile.dims[dim] ?? {};
    if (supported === false) {
      throw new CodegenError(
        `${dim} ${value} is not supported (supported: ${DIMENSIONS[dim].values.join(', ')}). Set it in .codegen/config.json if detection is wrong.`,
      );
    }
    if (!allowed.includes(value)) throw new CodegenError(`${describe(dim, value)} (supported: ${allowed.join(', ')}).`);
  }
}

// `out` is a folder, or [{ when, out }, …] where the first matching entry wins.
function pickOut(out, ctx) {
  if (!Array.isArray(out)) return out;
  const match = out.find((entry) => matches(entry.when, ctx));
  if (!match) throw new CodegenError('No output folder matches this profile.');
  return match.out;
}

export async function plan({ skillDir, root, pack, generator, options }) {
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
    if (spec.type === 'boolean' && value !== true) throw new CodegenError(`--${key} is a flag and takes no value.`);
    if (spec.choices && !spec.choices.includes(value)) {
      throw new CodegenError(`--${key} must be one of: ${spec.choices.join(', ')}. Got "${value}".`);
    }
  }

  const profile = resolveProfile(root, options.profile);
  try {
    return await planWithProfile({ skillDir, root, pack, generator, options, manifest, gen, profile });
  } catch (err) {
    if (err instanceof CodegenError) err.details = { ...err.details, profile: profile.dims };
    throw err;
  }
}

async function planWithProfile({ skillDir, root, pack, generator, options, manifest, gen, profile }) {
  const pkg = readPackageJson(root);
  const ctx = { ...manifest.vars, ...gen.vars };
  ctx.profile = Object.fromEntries(Object.entries(profile.dims).map(([dim, { value }]) => [dim, value]));
  ctx.profileIs = Object.fromEntries(
    Object.entries(DIMENSIONS)
      .filter(([, { values }]) => values)
      .map(([dim, { values }]) => [dim, Object.fromEntries(values.map((v) => [v, ctx.profile[dim] === v]))]),
  );
  ctx.mui = profile.flags.mui;
  // The Pages Router has no Server Components, so no RSC notes or 'use client'.
  if (ctx.profile.app === 'next-pages') Object.assign(ctx, { server: false, client: false });

  checkSupports(gen.supports, profile, (dim, value) => `${pack}/${generator} does not support ${dim} ${value}`);
  for (const [key, spec] of Object.entries(gen.options ?? {})) {
    if (options[key] === undefined) continue;
    checkSupports(spec.supports, profile, (dim, value) => `--${key} is not supported with ${dim} ${value}`);
  }
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

  if ('cn' in (gen.options ?? {}) && !ctx.cn) ctx.cn = ctx.profile.cn === 'none' ? '' : ctx.profile.cn;
  ctx.ui = detectShadcnAliases(root).ui ?? '@/components/ui';
  ctx.slot = detectSlot(pkg) ?? { import: '', component: '' };

  const missing = missingDependencies(pkg, requiredPackages(gen, ctx));
  const uiDir = resolveAliasDir(root, ctx.ui);
  const missingUi = (gen.requiresUi ?? [])
    .map((ref) => render(ref, ctx, `requiresUi of ${generator}`))
    .filter((ui) => !['tsx', 'jsx'].some((ext) => fs.existsSync(path.join(root, uiDir, `${ui}.${ext}`))));
  if (missing.length || missingUi.length) {
    const install = [
      missing.length && installCommand(root, missing),
      missingUi.length && `npx shadcn@latest add ${missingUi.join(' ')}`,
    ].filter(Boolean).join(' && ');
    const names = [...missing, ...missingUi.map((ui) => `${ctx.ui}/${ui}`)];
    throw new CodegenError(
      `Missing requirements for ${pack}/${generator}: ${names.join(', ')}. Ask the user before installing, then rerun.`,
      { missing, missingUi, install },
    );
  }

  if (ctx.element) {
    ctx.el = elementVars({ element: ctx.element, name: ctx.name, variants: ctx.variants, asChild: ctx.asChild, cn: ctx.cn, react18: ctx.profile.react === '18' });
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

  ctx.asyncParams = Number(ctx.profile.next) >= 15;

  const outDir = path.resolve(root, options.out ?? resolveOut(root, pickOut(gen.out, ctx)));
  ensureInside(root, outDir);

  const envOf = await templateEnvs(skillDir, root);
  const renderPath = (action) => render(action.path, ctx, `path of ${action.type} ${action.template ?? action.path}`, envOf(pack));
  const renderText = (action) => {
    if ((typeof action.template === 'string') === (typeof action.text === 'string')) {
      throw new CodegenError(`${action.type} ${action.path}: needs exactly one of template or text.`);
    }
    if (typeof action.text === 'string') {
      return { content: render(action.text, ctx, `${pack}/${generator} ${action.type} ${action.path}`, envOf(pack)), overridden: false };
    }
    const template = resolveTemplate(skillDir, root, pack, action.template);
    if (template.overridden) assertOverrideHandles(template, gen, ctx);
    return { content: render(fs.readFileSync(template.file, 'utf8'), ctx, action.template, envOf(template.owner)), overridden: template.overridden };
  };
  const renderString = (text, c, source) => render(text, c, source, envOf(pack));
  // "@react/x" refers to another pack's folder, like template refs do.
  const split = (ref) => (ref.startsWith('@') ? [ref.slice(1, ref.indexOf('/')), ref.slice(ref.indexOf('/') + 1)] : [pack, ref]);
  const listTemplates = (action) => {
    const [owner, rel] = split(action.templates);
    const base = path.join(skillDir, 'packs', owner, 'templates', rel);
    if (!fs.existsSync(base)) throw new CodegenError(`addMany: template folder ${owner}/${rel} not found.`);
    const walk = (dir) =>
      fs.readdirSync(dir, { withFileTypes: true })
        .sort((a, b) => (a.name < b.name ? -1 : 1))
        .flatMap((e) => (e.isDirectory() ? (e.name === '_partials' ? [] : walk(path.join(dir, e.name))) : e.name.endsWith('.tpl') ? [path.join(dir, e.name)] : []));
    return walk(base).map((file) => {
      const sub = path.relative(base, file).split(path.sep).join('/');
      return { template: `@${owner}/${rel}/${sub}`, path: `${action.path}/${sub.replace(/\.tpl$/, '')}` };
    });
  };
  const loadCustom = async (action) => {
    const [owner, rel] = split(action.module);
    const file = path.join(skillDir, 'packs', owner, 'actions', rel);
    if (!fs.existsSync(file)) throw new CodegenError(`custom: module ${owner}/actions/${rel} not found.`);
    const fn = (await import(pathToFileURL(file).href)).default;
    if (typeof fn !== 'function') throw new CodegenError(`custom ${action.module} must export a default function.`);
    return fn;
  };
  const actions = [...(gen.files ?? []).map((f) => ({ type: 'add', ...f })), ...(gen.actions ?? [])];
  const { files, skipped } = await runActions(actions, { root, outDir, ctx, renderPath, renderText, renderString, listTemplates, loadCustom });

  const todo = files.flatMap((f) => {
    const before = f.kind === 'modify' ? findTodos(f.before).map((t) => t.text) : [];
    return findTodos(f.content)
      .filter((t) => {
        const i = before.indexOf(t.text);
        if (i === -1) return true;
        before.splice(i, 1);
        return false;
      })
      .map((t) => ({ file: f.path, ...t }));
  });
  return { files, skipped, todo, profile: profile.dims };
}

// All-or-nothing: refuse if any create target exists or a modified file changed since planning;
// on a mid-write failure, remove what was created and restore what was modified.
export function checkWritable(files) {
  const conflicts = files.filter((f) => f.kind === 'create' && fs.existsSync(f.abs)).map((f) => f.path);
  if (conflicts.length) {
    throw new CodegenError('Target files already exist; nothing was written. Reuse/extend them or pick another name.', {
      conflicts,
    });
  }
  for (const f of files) {
    if (f.kind === 'modify' && (!fs.existsSync(f.abs) || fs.readFileSync(f.abs, 'utf8') !== f.before)) {
      throw new CodegenError(`${f.path} changed while generating; nothing was written.`);
    }
  }
}

export function write(files) {
  checkWritable(files);
  const done = [];
  const createdDirs = [];
  try {
    for (const f of files) {
      if (f.kind === 'modify') {
        fs.writeFileSync(f.abs, f.content);
      } else {
        for (let dir = path.dirname(f.abs); !fs.existsSync(dir); dir = path.dirname(dir)) createdDirs.push(dir);
        fs.mkdirSync(path.dirname(f.abs), { recursive: true });
        fs.writeFileSync(f.abs, f.content, { flag: 'wx' });
      }
      done.push(f);
    }
  } catch (err) {
    for (const f of done.reverse()) {
      if (f.kind === 'modify') fs.writeFileSync(f.abs, f.before);
      else fs.rmSync(f.abs, { force: true });
    }
    for (const dir of [...new Set(createdDirs)].sort((a, b) => b.length - a.length)) {
      try {
        fs.rmdirSync(dir);
      } catch {}
    }
    throw err;
  }
}
