import { CodegenError } from './errors.mjs';

// Minimal Handlebars-like syntax:
//   {{name.pascal}}                      variable (dot paths), unknown names are errors
//   {{#if key}}…{{else}}…{{/if}}         conditional, nestable
//   {{#unless key}}…{{/unless}}
// A block tag alone on its line removes that whole line, so templates stay readable.
// Only `{{identifier.path}}` is a variable, so JSX like `style={{ color: 'red' }}` is untouched.
const BLOCK_LINE = /^[ \t]*(\{\{(?:#(?:if|unless) [\w.]+|else|\/(?:if|unless))\}\})[ \t]*\r?\n/gm;
const INNERMOST_BLOCK = /\{\{#(if|unless) ([\w.]+)\}\}((?:(?!\{\{#(?:if|unless) )[\s\S])*?)\{\{\/\1\}\}/;
const LEFTOVER_BLOCK = /\{\{(?:#(?:if|unless) |\/(?:if|unless)\}|else\}\})/;
const VARIABLE = /\{\{\s*([\w.]+)\s*\}\}/g;

function lookup(ctx, key, source) {
  const value = key.split('.').reduce((obj, part) => (obj == null ? undefined : obj[part]), ctx);
  if (value === undefined) throw new CodegenError(`Unknown template variable "${key}" in ${source}.`);
  return value;
}

export function render(template, ctx, source = 'template') {
  let out = template.replace(BLOCK_LINE, '$1');
  let match;
  while ((match = INNERMOST_BLOCK.exec(out))) {
    const [whole, kind, key, body] = match;
    const [thenPart, elsePart = ''] = body.split('{{else}}');
    const truthy = Boolean(lookup(ctx, key, source));
    const chosen = (kind === 'if') === truthy ? thenPart : elsePart;
    out = out.slice(0, match.index) + chosen + out.slice(match.index + whole.length);
  }
  if (LEFTOVER_BLOCK.test(out)) throw new CodegenError(`Unbalanced {{#if}}/{{#unless}} block in ${source}.`);
  return out.replace(VARIABLE, (_, key) => {
    const value = lookup(ctx, key, source);
    if (typeof value === 'object') throw new CodegenError(`Template variable "${key}" in ${source} is not a string.`);
    return String(value);
  });
}

export function findTodos(content) {
  return content.split('\n').flatMap((text, i) => {
    const m = /TODO\(codegen\):?\s*(.*?)\s*(?:\*\/\}?)?$/.exec(text);
    return m ? [{ line: i + 1, text: m[1] }] : [];
  });
}
