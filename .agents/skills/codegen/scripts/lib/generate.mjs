import fs from 'node:fs';
import path from 'node:path';

import { CodegenError } from './errors.mjs';
import {
  detectCn,
  detectMajor,
  detectShadcnAliases,
  detectSlot,
  detectStorybook,
  detectTestRunner,
  readPackageJson,
  resolveAliasDir,
  resolveOut,
} from './detect.mjs';
import { ensureInside, runActions } from './actions.mjs';
import { installCommand, missingDependencies } from './deps.mjs';
import { elementVars } from './elements.mjs';
import { parseName } from './names.mjs';
import { parseRoute } from './route.mjs';
import { loadHelpers } from './helpers.mjs';
import { findTodos, render } from './template.mjs';

export const GLOBAL_OPTIONS = {
  name: { type: 'string', description: 'Name of the thing to generate (any casing), or a route path for route generators.' },
  out: { type: 'string', description: 'Output directory relative to the repo root. Defaults to the generator\'s folder (under src/ when the repo uses src/).' },
  root: { type: 'string', description: 'Repo/app root. Defaults to the current directory.' },
  'dry-run': { type: 'boolean', description: 'Print the planned files without writing anything.' },
  'test-runner': { type: 'string', description: 'vitest | jest. Defaults to the one found in package.json.' },
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

function requiredPackages(gen, ctx) {
  const fromOptions = Object.entries(gen.options ?? {})
    .filter(([key]) => ctx[camel(key)])
    .flatMap(([, spec]) => spec.requires ?? []);
  return [...(gen.requires ?? []), ...fromOptions];
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

  if ('cn' in (gen.options ?? {}) && !ctx.cn) ctx.cn = detectCn(root) ?? '';
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
    ctx.el = elementVars({ element: ctx.element, name: ctx.name, variants: ctx.variants, asChild: ctx.asChild, cn: ctx.cn });
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
  const actions = [...(gen.files ?? []).map((f) => ({ type: 'add', ...f })), ...(gen.actions ?? [])];
  const { files, skipped } = await runActions(actions, { root, outDir, ctx, renderPath, renderText });

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
  return { files, skipped, todo };
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
