import fs from 'node:fs';
import path from 'node:path';

import { resolveOut } from './detect.mjs';
import { CodegenError } from './errors.mjs';

export function ensureInside(root, target) {
  const rel = path.relative(root, target);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new CodegenError(`Refusing to write outside the repo root: ${target}`);
  }
  return rel.split(path.sep).join('/');
}

// "index.ts" is relative to the generator's output dir; "/app/layout.tsx" is relative to the root,
// with its first directory following the repo's src/ convention.
export function resolveTarget(root, outDir, rendered) {
  let abs;
  if (rendered.startsWith('/')) {
    const segments = rendered.slice(1).split('/');
    if (segments.length >= 2) segments[0] = resolveOut(root, segments[0]);
    abs = path.resolve(root, ...segments);
  } else {
    abs = path.resolve(outDir, rendered);
  }
  ensureInside(root, abs);
  return abs;
}

function compile(action) {
  try {
    return new RegExp(action.pattern, 'm');
  } catch (err) {
    throw new CodegenError(`${action.type} ${action.path}: invalid pattern (${err.message}).`);
  }
}

// Runs actions in order against an in-memory view of the files. Nothing touches the disk here.
export async function runActions(actions, { root, outDir, ctx, renderPath, renderText, renderString, listTemplates, loadCustom }) {
  const planned = new Map();
  const skipped = [];
  const rel = (abs) => ensureInside(root, abs);
  const read = (abs, action) => {
    if (planned.has(abs)) return planned.get(abs).content;
    if (!fs.existsSync(abs)) return null;
    if (!fs.statSync(abs).isFile()) throw new CodegenError(`${action?.type ?? 'custom'}: ${rel(abs)} is not a file.`);
    return fs.readFileSync(abs, 'utf8');
  };
  const touch = (abs, action, content, { overridden = false, text } = {}) => {
    const entry = planned.get(abs) ?? (fs.existsSync(abs) ? { kind: 'modify', before: fs.readFileSync(abs, 'utf8') } : { kind: 'create' });
    planned.set(abs, {
      ...entry,
      abs,
      path: rel(abs),
      content,
      action: action.type,
      overridden: Boolean(entry.overridden) || overridden,
      ...(text !== undefined && { text: (entry.text ? `${entry.text}\n` : '') + text }),
    });
  };
  const existing = (abs, action) => {
    const content = read(abs, action);
    if (content !== null) return content;
    if (action.skipIfMissing) {
      skipped.push({ path: rel(abs), action: action.type, reason: 'missing' });
      return null;
    }
    throw new CodegenError(`${action.type}: ${rel(abs)} does not exist.`);
  };

  const add = (action) => {
    const abs = resolveTarget(root, outDir, renderPath(action));
    if (action.skipIfExists && read(abs, action) !== null) {
      skipped.push({ path: rel(abs), action: action.type, reason: 'exists' });
      return;
    }
    const { content, overridden } = renderText(action);
    // An add on an existing file stays a create; write() reports it as a conflict.
    planned.set(abs, { kind: 'create', abs, path: rel(abs), content, action: action.type, overridden });
  };

  for (const action of actions) {
    if (action.when && !ctx[action.when]) continue;
    if (action.type === 'add') {
      add(action);
      continue;
    }
    if (action.type === 'addMany') {
      for (const file of listTemplates(action)) add({ ...action, type: 'addMany', ...file });
      continue;
    }
    if (action.type === 'custom') {
      const changes = await (await loadCustom(action))(ctx, {
        read: (p) => read(resolveTarget(root, outDir, p)),
        exists: (p) => read(resolveTarget(root, outDir, p)) !== null,
        render: (text, c = ctx) => renderString(text, c, `custom ${action.module}`),
      });
      if (!Array.isArray(changes) || !changes.every((c) => typeof c?.path === 'string' && typeof c?.content === 'string')) {
        throw new CodegenError(`custom ${action.module} must return an array of { path, content }.`);
      }
      for (const change of changes) touch(resolveTarget(root, outDir, change.path), action, change.content);
      continue;
    }
    const abs = resolveTarget(root, outDir, renderPath(action));
    switch (action.type) {
      case 'modify': {
        const content = existing(abs, action);
        if (content === null) break;
        const regex = compile(action);
        if (!regex.test(content)) throw new CodegenError(`modify: pattern /${action.pattern}/ not found in ${rel(abs)}.`);
        const rendered = renderText(action);
        const match = regex.exec(content);
        touch(abs, action, content.replace(regex, rendered.content), { overridden: rendered.overridden, text: match[0].replace(regex, rendered.content) });
        break;
      }
      case 'append': {
        const content = existing(abs, action);
        if (content === null) break;
        const rendered = renderText(action);
        const eol = content.includes('\r\n') ? '\r\n' : '\n';
        const text = rendered.content.replace(/\r?\n$/, '').replace(/\r?\n/g, eol);
        // At end of file, compare whole lines so a commented-out copy doesn't count as present.
        const lf = (v) => v.replace(/\r\n/g, '\n');
        const present = action.pattern !== undefined ? content.includes(text) : `\n${lf(content)}\n`.includes(`\n${lf(text)}\n`);
        if ((action.unique ?? true) && present) {
          skipped.push({ path: rel(abs), action: 'append', reason: 'already present' });
          break;
        }
        let next;
        if (action.pattern !== undefined) {
          const match = compile(action).exec(content);
          if (!match) throw new CodegenError(`append: pattern /${action.pattern}/ not found in ${rel(abs)}.`);
          const at = match.index + match[0].length;
          next = content.slice(0, at) + (action.separator ?? '\n').replace(/\r?\n/g, eol) + text + content.slice(at);
        } else {
          next = (content && !content.endsWith('\n') ? content + eol : content) + text + eol;
        }
        touch(abs, action, next, { overridden: rendered.overridden, text });
        break;
      }
      default:
        throw new CodegenError(`Unknown action type "${action.type}".`);
    }
  }
  return { files: [...planned.values()], skipped };
}
