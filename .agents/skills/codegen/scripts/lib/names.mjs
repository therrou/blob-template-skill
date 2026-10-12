import { CodegenError } from './errors.mjs';

const VALID_NAME = /^[A-Za-z][A-Za-z0-9 _-]*$/;

export function toWords(input) {
  return input
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((w) => w.toLowerCase());
}

export function nameCases(words) {
  const pascal = words.map((w) => w[0].toUpperCase() + w.slice(1)).join('');
  return { pascal, camel: pascal[0].toLowerCase() + pascal.slice(1), kebab: words.join('-') };
}

// `strip` removes a redundant leading/trailing word, e.g. "useToggle" -> "toggle"
// for hooks, so templates can add the prefix back consistently.
export function parseName(raw, strip = []) {
  if (typeof raw !== 'string' || !VALID_NAME.test(raw)) {
    throw new CodegenError(`Invalid name "${raw}": use letters, digits, spaces, "-" or "_", starting with a letter.`);
  }
  let words = toWords(raw);
  if (words.length > 1 && strip.includes(words[0])) words = words.slice(1);
  if (words.length > 1 && strip.includes(words.at(-1))) words = words.slice(0, -1);
  return { raw, ...nameCases(words) };
}
