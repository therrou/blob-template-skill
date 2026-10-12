#!/usr/bin/env node
// Flags design-token violations and leftover TODO(codegen) markers. Prints JSON; exit code 1 on violations.
//
//   node check-tokens.mjs <file-or-dir>... [--root <repo root>]
import path from 'node:path';

import { checkTokens } from './lib/tokens.mjs';

const args = process.argv.slice(2);
const rootIndex = args.indexOf('--root');
const root = path.resolve(rootIndex >= 0 ? args[rootIndex + 1] : process.cwd());
const targets = rootIndex >= 0 ? args.filter((_, i) => i !== rootIndex && i !== rootIndex + 1) : args;

if (!targets.length) {
  process.stdout.write(`${JSON.stringify({ ok: false, error: 'Pass the files or directories to check.' }, null, 2)}\n`);
  process.exit(1);
}

try {
  const result = await checkTokens(root, targets);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exitCode = result.ok ? 0 : 1;
} catch (err) {
  process.stdout.write(`${JSON.stringify({ ok: false, error: err.message }, null, 2)}\n`);
  process.exitCode = 1;
}
