import fs from 'node:fs';
import path from 'node:path';

const SKIPPED = new Set(['node_modules', '.git', '.agents', '.claude', '.github']);

export function listFiles(root, dir = '') {
  return fs
    .readdirSync(path.join(root, dir), { withFileTypes: true })
    .filter((entry) => !SKIPPED.has(entry.name))
    .flatMap((entry) => {
      const rel = dir ? `${dir}/${entry.name}` : entry.name;
      return entry.isDirectory() ? listFiles(root, rel) : [rel];
    })
    .sort();
}

// claude -p --output-format stream-json: one JSON message per line.
export function generatorCalls(streamJson) {
  return streamJson.split('\n').flatMap((line) => {
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      return [];
    }
    if (msg.type !== 'assistant') return [];
    return (msg.message?.content ?? [])
      .filter((block) => block.type === 'tool_use' && block.name === 'Bash' && /generate\.mjs/.test(block.input?.command ?? ''))
      .map((block) => block.input.command);
  });
}

export function evaluateCase(def, { newFiles, commands, read, tokensOk }) {
  const failures = [];
  if (def.generator) {
    const used = new RegExp(`\\s(?:${def.generator})(?=\\s|$)`);
    if (!commands.some((cmd) => used.test(cmd))) {
      failures.push(`expected a "${def.generator}" generator call, got: ${commands.join(' | ') || 'none'}`);
    }
  }
  if (def.noGenerator && commands.length) failures.push(`expected no generator call, got: ${commands.join(' | ')}`);
  if (def.noNewFiles) {
    const created = newFiles.filter((f) => new RegExp(def.noNewFiles).test(f));
    if (created.length) failures.push(`expected no new files matching ${def.noNewFiles}, got: ${created.join(', ')}`);
  }
  for (const pattern of def.newFiles ?? []) {
    if (!newFiles.some((f) => new RegExp(pattern).test(f))) failures.push(`no new file matches ${pattern}`);
  }
  for (const { file, pattern, absent } of def.contains ?? []) {
    const hit = newFiles.filter((f) => new RegExp(file).test(f)).some((f) => new RegExp(pattern).test(read(f)));
    if (hit === Boolean(absent)) failures.push(`${absent ? 'unexpected' : 'missing'} /${pattern}/ in files matching ${file}`);
  }
  if (tokensOk === false) failures.push('check-tokens failed on the new files (token violations or leftover TODO(codegen))');
  return { pass: failures.length === 0, failures };
}
