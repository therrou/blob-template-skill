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
export async function runActions(actions, { root, outDir, ctx, renderPath, renderText }) {
  const planned = new Map();
  const skipped = [];
  const rel = (abs) => ensureInside(root, abs);
  const read = (abs) => (planned.has(abs) ? planned.get(abs).content : fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : null);
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
    const content = read(abs);
    if (content !== null) return content;
    if (action.skipIfMissing) {
      skipped.push({ path: rel(abs), action: action.type, reason: 'missing' });
      return null;
    }
    throw new CodegenError(`${action.type}: ${rel(abs)} does not exist.`);
  };

  for (const action of actions) {
    if (action.when && !ctx[action.when]) continue;
    const abs = resolveTarget(root, outDir, renderPath(action));
    switch (action.type) {
      case 'add': {
        if (action.skipIfExists && read(abs) !== null) {
          skipped.push({ path: rel(abs), action: 'add', reason: 'exists' });
          break;
        }
        const { content, overridden } = renderText(action);
        // An add on an existing file stays a create; write() reports it as a conflict.
        planned.set(abs, { kind: 'create', abs, path: rel(abs), content, action: 'add', overridden });
        break;
      }
      case 'modify': {
        const content = existing(abs, action);
        if (content === null) break;
        const regex = compile(action);
        if (!regex.test(content)) throw new CodegenError(`modify: pattern /${action.pattern}/ not found in ${rel(abs)}.`);
        const rendered = renderText(action);
        touch(abs, action, content.replace(regex, rendered.content), { overridden: rendered.overridden, text: rendered.content });
        break;
      }
      case 'append': {
        const content = existing(abs, action);
        if (content === null) break;
        const rendered = renderText(action);
        const eol = content.includes('\r\n') ? '\r\n' : '\n';
        const text = rendered.content.replace(/\r?\n$/, '').replace(/\r?\n/g, eol);
        if ((action.unique ?? true) && content.includes(text)) {
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
