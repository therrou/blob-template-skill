#!/usr/bin/env node
// Zero-dependency code generator. Always prints JSON to stdout; exit code 1 on error.
//
//   node generate.mjs --list [pack]
//   node generate.mjs <pack> <generator> --name <name> [--out dir] [--dry-run] [generator options]
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { CodegenError } from './lib/errors.mjs';
import { GLOBAL_OPTIONS, checkWritable, listPacks, loadPack, plan, write } from './lib/generate.mjs';
import { resolveProfile } from './lib/profile.mjs';

const skillDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function print(value, code = 0) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
  process.exitCode = code;
}

function parseArgs(argv) {
  const positional = [];
  const options = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) {
      positional.push(arg);
      continue;
    }
    const [key, inline] = arg.slice(2).split(/=(.*)/s);
    if (inline !== undefined) options[key] = inline;
    else if (argv[i + 1] !== undefined && !argv[i + 1].startsWith('--')) options[key] = argv[++i];
    else options[key] = true;
  }
  return { positional, options };
}

function describe(only) {
  const packs = {};
  for (const pack of only ? [only] : listPacks(skillDir)) {
    const manifest = loadPack(skillDir, pack);
    packs[pack] = {
      description: manifest.description,
      generators: Object.fromEntries(
        Object.entries(manifest.generators).map(([name, g]) => [
          name,
          { description: g.description, out: g.out, name: g.nameKind === 'route' ? 'route path' : 'identifier', options: g.options ?? {} },
        ]),
      ),
    };
  }
  return { usage: 'node generate.mjs <pack> <generator> --name <name> [options]', globalOptions: GLOBAL_OPTIONS, packs };
}

async function main() {
  const { positional, options } = parseArgs(process.argv.slice(2));
  if (options.detect) {
    if (options.root === true || options.profile === true) throw new CodegenError('--root and --profile need a value.');
    return print({ ok: true, profile: resolveProfile(path.resolve(options.root ?? process.cwd()), options.profile).dims });
  }
  if (options.list || options.help || positional.length === 0) return print(describe(positional[0]));

  const [pack, generator] = positional;
  const { list, help, ...genOptions } = options;
  for (const key of ['name', 'out', 'root', 'test-runner', 'profile']) {
    if (genOptions[key] === true) throw new CodegenError(`--${key} needs a value.`);
  }
  const root = path.resolve(genOptions.root ?? process.cwd());
  const result = await plan({ skillDir, root, pack, generator, options: genOptions });
  const created = result.files.filter((f) => f.kind === 'create').map((f) => f.path);
  const modified = result.files.filter((f) => f.kind === 'modify').map((f) => f.path);
  const overridden = result.files.filter((f) => f.overridden).map((f) => f.path);
  const summary = { created, modified, skipped: result.skipped, overridden, todo: result.todo, profile: result.profile };

  if (genOptions['dry-run']) {
    checkWritable(result.files);
    const changes = result.files.filter((f) => f.kind === 'modify').map((f) => ({ path: f.path, action: f.action, text: f.text ?? '' }));
    return print({ ok: true, dryRun: true, ...summary, changes });
  }

  write(result.files);
  print({
    ok: true,
    ...summary,
    next: [
      'Resolve every todo item (remove each TODO(codegen) marker).',
      'Run check-tokens.mjs on the created and modified files, then the repo\'s lint/typecheck.',
    ],
  });
}

main().catch((err) => {
  if (!(err instanceof CodegenError)) throw err;
  print({ ok: false, error: err.message, ...err.details }, 1);
});
