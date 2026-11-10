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

// Fixtures are tiny, so the snapshot keeps whole contents.
export function snapshot(root) {
  return new Map(listFiles(root).map((f) => [f, fs.readFileSync(path.join(root, f), 'utf8')]));
}

export function diffSnapshots(before, after) {
  const newFiles = [...after.keys()].filter((f) => !before.has(f));
  const modifiedFiles = [...after.keys()].filter((f) => before.has(f) && before.get(f) !== after.get(f));
  return { newFiles, modifiedFiles };
}

const parseLines = (streamJson) =>
  streamJson.split('\n').flatMap((line) => {
    try {
      return [JSON.parse(line)];
    } catch {
      return [];
    }
  });

// Exploring the generator is fine (even in the reuse case); only real generation counts.
const LOOK_ONLY = /\s--(?:list|help|dry-run|detect)\b/;

// claude -p --output-format stream-json: one JSON message per line.
export function generatorCalls(streamJson) {
  return parseLines(streamJson).flatMap((msg) => {
    if (msg.type !== 'assistant') return [];
    return (msg.message?.content ?? [])
      .filter((block) => block.type === 'tool_use' && block.name === 'Bash' && /generate\.mjs/.test(block.input?.command ?? ''))
      .map((block) => block.input.command)
      .filter((command) => !LOOK_ONLY.test(command));
  });
}

// The final `result` message: the agent's last answer plus cost and turn counts.
export function runStats(streamJson) {
  const result = parseLines(streamJson).findLast((msg) => msg.type === 'result');
  const toolCalls = parseLines(streamJson)
    .filter((msg) => msg.type === 'assistant')
    .reduce((n, msg) => n + (msg.message?.content ?? []).filter((b) => b.type === 'tool_use').length, 0);
  if (!result) return { finalText: '', toolCalls, hasResult: false };
  return {
    finalText: result.result ?? '',
    toolCalls,
    hasResult: true,
    isError: Boolean(result.is_error),
    turns: result.num_turns,
    costUsd: result.total_cost_usd,
    durationMs: result.duration_ms,
  };
}

// The generator arguments of one shell command, so the call can be replayed in a clean fixture.
// Stops at the first shell operator; drops --root (the replay sets it) and look-only flags.
export function generatorArgs(command) {
  const tokens = [];
  for (const m of command.matchAll(/'([^']*)'|"((?:[^"\\]|\\.)*)"|(&&|\|\||[;|>])|(\S+)/g)) {
    if (m[3]) {
      if (tokens.includes('__GEN__')) break;
      tokens.length = 0;
      continue;
    }
    const value = m[1] ?? m[2] ?? m[4];
    tokens.push(/generate\.mjs$/.test(value) ? '__GEN__' : value);
  }
  const start = tokens.indexOf('__GEN__');
  if (start < 0) return null;
  const args = [];
  const rest = tokens.slice(start + 1);
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === '--root') i++;
    else if (rest[i].startsWith('--root=') || /^\d*>/.test(rest[i])) continue;
    else args.push(rest[i]);
  }
  return args;
}

// Share of the generator's skeleton lines the agent kept. TODO lines are meant to be replaced and punctuation-only
// lines (`);`, `}`) match anything, so neither counts.
// A low value means the agent rewrote the generated file instead of filling it in.
// null when the skeleton is too small to say (hooks, API routes: nearly every line is a placeholder).
const MIN_COUNTED_LINES = 8;
export function keptRatio(generated, final) {
  const lines = generated
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => /\w/.test(l) && !l.includes('TODO(codegen)'));
  if (lines.length < MIN_COUNTED_LINES) return null;
  const pool = new Map();
  for (const l of final.split('\n').map((x) => x.trim())) pool.set(l, (pool.get(l) ?? 0) + 1);
  let kept = 0;
  for (const l of lines) {
    if (pool.get(l)) {
      kept++;
      pool.set(l, pool.get(l) - 1);
    }
  }
  return kept / lines.length;
}

// Function and const exports (not types: placeholder types are meant to change). `default` for the default export.
const EXPORT = /export\s+(default\s+)?(?:async\s+)?(?:function\*?\s*(\w+)?|const\s+(\w+))/g;
const exportsOf = (src) => new Set([...src.matchAll(EXPORT)].map((m) => (m[1] ? 'default' : (m[2] ?? m[3]))));

// Exports the generator wrote that the final file no longer has: the shape callers rely on was changed by hand.
export function lostExports(generated, final) {
  const kept = exportsOf(final);
  return [...exportsOf(generated)].filter((name) => !kept.has(name));
}

// Filling in a skeleton legitimately rewrites the props type and signature (~50% kept); a hand rewrite keeps ~0-20%.
const DEFAULT_MIN_KEPT = 0.4;

const re = (pattern, flags) => new RegExp(pattern, flags);

// status: 'ok' | 'timeout' | 'error'. A timeout or crash is reported as such, never as a wrong answer.
export function evaluateCase(def, { status = 'ok', newFiles, modifiedFiles = [], commands, read, tokensOk, finalText = '', drift = [] }) {
  if (status === 'timeout') return { pass: false, failures: ['timed out'] };
  if (status === 'error') return { pass: false, failures: ['agent run crashed or produced no result'] };

  const failures = [];
  if (def.generator) {
    const used = re(`\\s(?:${def.generator})(?=\\s|$)`);
    if (!commands.some((cmd) => used.test(cmd))) {
      failures.push(`expected a "${def.generator}" generator call, got: ${commands.join(' | ') || 'none'}`);
    }
  }
  if (def.noGenerator && commands.length) failures.push(`expected no generator call, got: ${commands.join(' | ')}`);
  if (def.noNewFiles) {
    const created = newFiles.filter((f) => re(def.noNewFiles).test(f));
    if (created.length) failures.push(`expected no new files matching ${def.noNewFiles}, got: ${created.join(', ')}`);
  }
  if (def.noModified) {
    const changed = modifiedFiles.filter((f) => re(def.noModified).test(f));
    if (changed.length) failures.push(`expected no edits to files matching ${def.noModified}, got: ${changed.join(', ')}`);
  }
  for (const pattern of def.newFiles ?? []) {
    if (!newFiles.some((f) => re(pattern).test(f))) failures.push(`no new file matches ${pattern}`);
  }
  for (const pattern of def.modified ?? []) {
    if (!modifiedFiles.some((f) => re(pattern).test(f))) failures.push(`no edited file matches ${pattern}`);
  }
  const touched = [...newFiles, ...modifiedFiles];
  for (const { file, pattern, absent } of def.contains ?? []) {
    const hit = touched.filter((f) => re(file).test(f)).some((f) => re(pattern).test(read(f)));
    if (hit === Boolean(absent)) failures.push(`${absent ? 'unexpected' : 'missing'} /${pattern}/ in files matching ${file}`);
  }
  if (def.answer && !re(def.answer, 'i').test(finalText)) failures.push(`final answer does not match /${def.answer}/i`);
  const minKept = def.minKept ?? DEFAULT_MIN_KEPT;
  for (const { file, kept, lost = [] } of drift) {
    if (lost.length) failures.push(`${file}: generated exports ${lost.join(', ')} are gone, rewritten by hand`);
    if (kept !== null && kept < minKept) failures.push(`${file}: kept ${Math.round(kept * 100)}% of the generated skeleton (min ${minKept * 100}%), rewritten by hand`);
  }
  if (tokensOk === false) failures.push('check-tokens failed on the new or edited files (token violations or leftover TODO(codegen))');
  return { pass: failures.length === 0, failures };
}

// Pass rate per case across two result files, e.g. 0.4.0 vs 0.5.0 or two models.
export function compareResults(a, b) {
  const ids = [...new Set([...Object.keys(a.cases), ...Object.keys(b.cases)])].sort();
  const rate = (c) => (c ? `${c.passed}/${c.runs}` : '-');
  const rows = ids.map((id) => {
    const [x, y] = [a.cases[id], b.cases[id]];
    const delta = x && y ? y.passed / y.runs - x.passed / x.runs : 0;
    return `${delta < 0 ? '↓' : delta > 0 ? '↑' : ' '} ${id.padEnd(28)} ${rate(x).padStart(5)} → ${rate(y)}`;
  });
  const cost = (r) => Object.values(r.cases).flatMap((c) => c.results).reduce((s, x) => s + (x.costUsd ?? 0), 0);
  rows.push('', `cost: $${cost(a).toFixed(2)} → $${cost(b).toFixed(2)}`);
  return rows.join('\n');
}
