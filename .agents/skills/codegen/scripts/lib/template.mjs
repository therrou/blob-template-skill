import { CodegenError } from './errors.mjs';
import { nameCases, toWords } from './names.mjs';

// Minimal Handlebars-like syntax:
//   {{name.pascal}}                      variable (dot paths), unknown names are errors
//   {{kebab title}}                      helper call with one context path
//   {{> partial}} / {{> @pack/partial}}  partial, rendered with its owner's env
//   {{#if key}}…{{else}}…{{/if}}         conditional, nestable
//   {{#unless key}}…{{/unless}}
// A block tag alone on its line removes that whole line, so templates stay readable.
// Only `{{identifier.path}}` / `{{helper path}}` are expressions, so JSX like `style={{ color: 'red' }}` is untouched.
const BLOCK_LINE = /^[ \t]*(\{\{(?:#(?:if|unless) [\w.]+|else|\/(?:if|unless))\}\})[ \t]*\r?\n/gm;
const INNERMOST_BLOCK = /\{\{#(if|unless) ([\w.]+)\}\}((?:(?!\{\{#(?:if|unless) )[\s\S])*?)\{\{\/\1\}\}/;
const LEFTOVER_BLOCK = /\{\{(?:#(?:if|unless) |\/(?:if|unless)\}|else\}\})/;
const PARTIAL = /\{\{>\s*(@?[\w./-]+)\s*\}\}/g;
// `{{helper path}}` or `{{path}}`, in one pass so substituted values are never scanned again.
const EXPRESSION = /\{\{\s*(?:([A-Za-z]\w*)\s+)?([\w.]+)\s*\}\}/g;
const PLACEHOLDER = /\u0000P(\d+)\u0000/g;

const casing = (key) => (value) => nameCases(toWords(value))[key] ?? '';
export const BUILT_IN_HELPERS = {
  pascal: casing('pascal'),
  camel: casing('camel'),
  kebab: casing('kebab'),
  snake: casing('snake'),
  constant: casing('constant'),
  lower: (value) => value.toLowerCase(),
  upper: (value) => value.toUpperCase(),
};

function lookup(ctx, key, source) {
  const value = key.split('.').reduce((obj, part) => (obj == null ? undefined : obj[part]), ctx);
  if (value === undefined) throw new CodegenError(`Unknown template variable "${key}" in ${source}.`);
  return value;
}

function scalar(ctx, key, source) {
  const value = lookup(ctx, key, source);
  if (typeof value === 'object') throw new CodegenError(`Template variable "${key}" in ${source} is not a string.`);
  return String(value);
}

export function render(template, ctx, source = 'template', env = {}, stack = []) {
  // Partials become placeholders and are rendered last, so a partial in a false branch is never loaded.
  const partials = [];
  let out = template.replace(PARTIAL, (_, ref) => `\u0000P${partials.push(ref) - 1}\u0000`);
  out = out.replace(BLOCK_LINE, '$1');
  let match;
  while ((match = INNERMOST_BLOCK.exec(out))) {
    const [whole, kind, key, body] = match;
    const [thenPart, elsePart = ''] = body.split('{{else}}');
    const truthy = Boolean(lookup(ctx, key, source));
    const chosen = (kind === 'if') === truthy ? thenPart : elsePart;
    out = out.slice(0, match.index) + chosen + out.slice(match.index + whole.length);
  }
  if (LEFTOVER_BLOCK.test(out)) throw new CodegenError(`Unbalanced {{#if}}/{{#unless}} block in ${source}.`);
  out = out.replace(EXPRESSION, (_, name, key) => {
    if (!name) return scalar(ctx, key, source);
    const helper = env.helpers?.[name] ?? BUILT_IN_HELPERS[name];
    if (!helper) throw new CodegenError(`Unknown template helper "${name}" in ${source}.`);
    return String(helper(scalar(ctx, key, source)));
  });
  return out.replace(PLACEHOLDER, (_, i) => {
    const ref = partials[i];
    if (stack.includes(ref)) throw new CodegenError(`Partial cycle: ${[...stack, ref].join(' -> ')}`);
    const partial = env.partial?.(ref);
    if (!partial) throw new CodegenError(`Unknown partial "${ref}" in ${source}.`);
    // The placeholder's own line break follows it, so drop the partial file's final newline.
    return render(partial.text, ctx, partial.source, partial.env, [...stack, ref]).replace(/\r?\n$/, '');
  });
}

export function findTodos(content) {
  return content.split('\n').flatMap((text, i) => {
    const m = /TODO\(codegen\):?\s*(.*?)\s*(?:\*\/\}?)?$/.exec(text);
    return m ? [{ line: i + 1, text: m[1] }] : [];
  });
}
