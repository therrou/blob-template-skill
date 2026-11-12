// Pure parts of the generated-code type check: which generator calls to make, and how to read tsc output.

const pascal = (s) => s.replace(/(^|[-/[\]])(\w)/g, (_, __, c) => c.toUpperCase()).replace(/\W/g, '');

const COMPONENT_COMBOS = [[], ['--variants'], ['--as-child'], ['--variants', '--as-child']];

// Every generator of a pack with its options. `generators` is the `--list <pack>` output for that pack.
// Unsupported combinations are left in on purpose: the generator refuses them and the run reports them as skipped.
export function matrix(pack, generators) {
  const calls = [];
  const add = (generator, name, ...opts) => calls.push([pack, generator, '--name', name, ...opts]);
  for (const [generator, def] of Object.entries(generators)) {
    const opts = def.options ?? {};
    const test = opts['with-test'] ? ['--with-test'] : [];
    const barrel = opts['with-barrel'] ? ['--with-barrel'] : [];
    if (opts.element) {
      for (const element of opts.element.choices) {
        COMPONENT_COMBOS.forEach((combo, i) => {
          const extra = i === 0 ? [...test, ...(opts['with-story'] ? ['--with-story'] : [])] : [];
          // Barrels on every combo: the index.ts re-exports change with --variants.
          add(generator, `${pascal(generator)}${pascal(element)}${combo.map((o) => pascal(o.slice(2))).join('')}`, '--element', element, ...combo, ...extra, ...barrel);
        });
      }
    } else if (opts.control) {
      for (const control of opts.control.choices) add(generator, `${pascal(control)}Field`, '--control', control, ...test, ...barrel);
    } else if (generator === 'route') {
      add(generator, 'dashboard', ...['with-layout', 'with-loading', 'with-error'].filter((o) => opts[o]).map((o) => `--${o}`));
      add(generator, 'blog/[slug]');
      add(generator, 'shop/[...path]');
    } else if (generator === 'api-route') {
      add(generator, 'health', ...test);
      add(generator, 'users/[id]', ...test);
    } else {
      add(generator, generator === 'hook' ? 'use-thing' : `${generator}-thing`, ...test);
      if (opts['server-only']) add(generator, `server-${generator}`, '--server-only');
    }
  }
  return calls;
}

// `path/file.tsx(12,5): error TS2322: message` lines; continuation lines are appended to the message.
export function parseTscErrors(output) {
  const errors = [];
  for (const line of output.split('\n')) {
    const m = /^(.+?)\((\d+),(\d+)\): error (TS\d+): (.*)$/.exec(line);
    if (m) errors.push({ file: m[1], line: Number(m[2]), code: m[4], message: m[5] });
    else if (errors.length && /^\s+\S/.test(line)) errors.at(-1).message += `\n${line.trimEnd()}`;
  }
  return errors;
}

// `eslint --format json` output, as the same { file, line, code, message } shape plus severity (2 error, 1 warning).
export function parseEslint(json, root) {
  if (!json.trim()) return [];
  return JSON.parse(json).flatMap((result) =>
    result.messages.map((m) => ({
      file: result.filePath.startsWith(root) ? result.filePath.slice(root.length + 1).split('\\').join('/') : result.filePath,
      line: m.line ?? 0,
      code: m.ruleId ?? 'eslint',
      message: m.message,
      severity: m.severity,
    })),
  );
}

// Pins each error on the generator call that created (or last edited) its file; anything else is the sample app's own code.
export function attribute(errors, filesByCall) {
  const owner = new Map();
  for (const { call, files } of filesByCall) for (const f of files) owner.set(f, call);
  return errors.map((e) => ({ ...e, call: owner.get(e.file) ?? null }));
}
