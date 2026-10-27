import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { CodegenError } from './errors.mjs';

async function importHelpers(file) {
  if (!fs.existsSync(file)) return {};
  const helpers = (await import(pathToFileURL(file).href)).default;
  if (!helpers || typeof helpers !== 'object') throw new CodegenError(`${file} must export default an object of helper functions.`);
  return helpers;
}

// Precedence: repo .codegen/helpers.mjs > packs/<owner>/helpers.mjs (built-ins are the render fallback).
export async function loadHelpers(skillDir, root, owner) {
  return {
    ...(await importHelpers(path.join(skillDir, 'packs', owner, 'helpers.mjs'))),
    ...(await importHelpers(path.join(root, '.codegen', 'helpers.mjs'))),
  };
}
