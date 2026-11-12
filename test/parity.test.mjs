import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { plan } from '../.agents/skills/codegen/scripts/lib/generate.mjs';
import { makeRepo, skillDir } from './helpers.mjs';

// Output for a React 19 + Tailwind 4 + Radix repo must stay what 0.3.0 produced.
// Regenerate deliberately with CODEGEN_WRITE_PARITY=1 and review the diff.
const fixture = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'parity-0.3.0.json');

const CASES = {
  react: {
    component: ['--element', 'button', '--variants', '--as-child', '--with-test', '--with-barrel'],
    hook: ['--with-test'],
    context: [],
    util: ['--with-test'],
    page: ['--with-test'],
    'form-field': ['--control', 'input', '--with-test', '--with-barrel'],
  },
  next: {
    component: ['--element', 'button', '--variants', '--as-child', '--with-test', '--with-barrel'],
    'client-component': ['--element', 'nav', '--variants', '--with-barrel'],
    hook: ['--with-test'],
    context: [],
    util: ['--server-only', '--with-test'],
    route: ['--with-layout', '--with-loading', '--with-error'],
    'api-route': ['--with-test'],
    'server-action': [],
    'form-field': ['--control', 'input', '--with-test', '--with-barrel'],
  },
};

const toOptions = (args) => {
  const options = {};
  for (let i = 0; i < args.length; i++) {
    const key = args[i].slice(2);
    if (args[i + 1] && !args[i + 1].startsWith('--')) options[key] = args[++i];
    else options[key] = true;
  }
  return options;
};

async function snapshot() {
  const root = makeRepo({
    deps: { next: '^16.0.0', react: '^19.0.0', tailwindcss: '^4.0.0', 'class-variance-authority': '^0.7', '@radix-ui/react-slot': '^1', 'react-hook-form': '^7', vitest: '^2' },
    files: {
      'components.json': JSON.stringify({ style: 'new-york', aliases: { utils: '@/lib/utils', ui: '@/components/ui' } }),
      'lib/utils.ts': 'export function cn() {}\n',
      'components/ui/form.tsx': '',
      'components/ui/input.tsx': '',
    },
  });
  const out = {};
  for (const [pack, gens] of Object.entries(CASES)) {
    for (const [generator, args] of Object.entries(gens)) {
      const name = ['route', 'api-route'].includes(generator) ? 'blog/[slug]' : 'x-card';
      const { files } = await plan({ skillDir, root, pack, generator, options: { name, ...toOptions(args) } });
      out[`${pack}/${generator}`] = files.map((f) => ({ path: f.path, content: f.content }));
    }
  }
  return out;
}

test('React 19 + Tailwind 4 + Radix output matches the 0.3.0 snapshot', async () => {
  const actual = await snapshot();
  if (process.env.CODEGEN_WRITE_PARITY === '1') fs.writeFileSync(fixture, `${JSON.stringify(actual, null, 2)}\n`);
  assert.deepEqual(actual, JSON.parse(fs.readFileSync(fixture, 'utf8')));
});
