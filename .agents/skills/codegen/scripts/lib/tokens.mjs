import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { resolveProfile } from './profile.mjs';

const IGNORED_DIRS = new Set(['node_modules', '.git', '.next', 'dist', 'build', 'out', 'coverage', '.turbo', 'storybook-static']);
const SCANNED_EXTENSIONS = new Set(['.tsx', '.jsx', '.ts', '.js', '.mjs', '.vue', '.svelte', '.astro', '.html', '.liquid', '.mdx', '.cshtml']);

const PALETTE = 'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose';
const COLOR_UTILITIES = 'bg|text|border(?:-[trblxy])?|ring|ring-offset|outline|fill|stroke|from|via|to|decoration|divide|accent|caret|shadow|placeholder';
const VARIANTS = '(?:[a-z0-9-]+(?:-\\[[^\\]\\s]+\\])?:)*';

const RULES = [
  {
    rule: 'arbitrary-value',
    message: 'Arbitrary value: use a theme token (spacing, color, radius, font size). If none fits, add a tokens-allow comment with the reason.',
    // (?!:) because `data-[state=open]:`, `has-[…]:` and `group-data-[…]:` are variant selectors, not values.
    regex: new RegExp(`(?<![\\w-])${VARIANTS}!?-?[a-z][a-z0-9-]*-\\[[^\\]\\s]+\\](?!:)`, 'g'),
    // var(--token) and the v4 (--token) shorthand reference tokens, so they are fine.
    allow: (m) => /-\[(?:[a-z-]+:)?var\(--/.test(m),
  },
  {
    rule: 'color-literal',
    message: 'Hard-coded color: use a semantic color token class instead.',
    // (?<!\[) skips literals inside arbitrary values, which arbitrary-value already reports.
    regex: /(?<!\[)(?:#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab)\([^)]*\))/g,
    // Only in lines that style something, to avoid flagging URL fragments and ids.
    lineFilter: /class|style|color|background|fill|stroke|border|shadow/i,
  },
  {
    rule: 'palette-color',
    message: 'Raw palette color: use the semantic token (e.g. bg-primary, text-muted-foreground) from the theme.',
    regex: new RegExp(`(?<![\\w-])${VARIANTS}(?:${COLOR_UTILITIES})-(?:${PALETTE})-(?:50|[1-9]00|950)(?:\\/\\d+)?(?![\\w-])`, 'g'),
    needsSemanticTheme: true,
  },
  {
    rule: 'codegen-todo',
    message: 'Unresolved generator placeholder: implement it and remove the marker.',
    regex: /TODO\(codegen\)/g,
  },
];

const ALLOW_COMMENT = /tokens-allow:\s*[A-Za-z]/;

function walk(target, files = []) {
  const stat = fs.statSync(target);
  if (stat.isFile()) {
    if (SCANNED_EXTENSIONS.has(path.extname(target))) files.push(target);
    return files;
  }
  for (const entry of fs.readdirSync(target)) {
    if (!IGNORED_DIRS.has(entry)) walk(path.join(target, entry), files);
  }
  return files;
}

function findThemeCss(root) {
  const found = [];
  const visit = (dir, depth) => {
    if (depth > 4) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (IGNORED_DIRS.has(entry.name) || entry.name.startsWith('.')) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(full, depth + 1);
      else if (entry.name.endsWith('.css') && fs.readFileSync(full, 'utf8').includes('@theme')) found.push(full);
    }
  };
  visit(root, 0);
  return found;
}

function blockAt(text, openIndex) {
  let depth = 0;
  for (let i = openIndex; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}' && --depth === 0) return text.slice(openIndex, i + 1);
  }
  return text.slice(openIndex);
}

function flattenColorKeys(obj, prefix = '') {
  return Object.entries(obj ?? {}).flatMap(([key, value]) => {
    const name = key === 'DEFAULT' ? prefix : prefix ? `${prefix}-${key}` : key;
    return value && typeof value === 'object' ? flattenColorKeys(value, name) : name ? [name] : [];
  });
}

// Tailwind v4: --color-* inside @theme blocks. Tailwind v3: theme(.extend).colors in tailwind.config.*.
export async function loadTheme(root) {
  const colors = new Set();
  const sources = [];
  const warnings = [];
  let resetsPalette = false;

  for (const file of findThemeCss(root)) {
    const css = fs.readFileSync(file, 'utf8');
    for (const m of css.matchAll(/@theme\b[^{]*\{/g)) {
      const block = blockAt(css, m.index + m[0].length - 1);
      for (const [, name] of block.matchAll(/--color-([\w-]+)\s*:/g)) colors.add(name);
      if (/--color-\*\s*:\s*initial/.test(block)) resetsPalette = true;
    }
    sources.push(path.relative(root, file));
  }

  for (const name of ['tailwind.config.ts', 'tailwind.config.mts', 'tailwind.config.js', 'tailwind.config.mjs', 'tailwind.config.cjs']) {
    const file = path.join(root, name);
    if (!fs.existsSync(file)) continue;
    try {
      const mod = await import(pathToFileURL(file).href);
      const config = mod.default ?? mod;
      for (const key of [...flattenColorKeys(config.theme?.colors), ...flattenColorKeys(config.theme?.extend?.colors)]) colors.add(key);
      if (config.theme?.colors) resetsPalette = true;
      sources.push(name);
    } catch (err) {
      warnings.push(`Could not load ${name} (${err.message.split('\n')[0]}); palette colors are not checked against it.`);
    }
  }

  const palette = new RegExp(`^(?:${PALETTE})-`);
  const semantic = resetsPalette || [...colors].some((c) => !palette.test(c) && !/^(?:white|black|transparent|current|inherit)$/.test(c));
  if (!sources.length) warnings.push('No Tailwind theme found (@theme block or tailwind.config.*): palette colors are allowed.');
  return { colors, sources, semantic, warnings };
}

function isPaletteToken(match, colors) {
  const m = new RegExp(`(?:${PALETTE})-(?:50|[1-9]00|950)`).exec(match);
  return m && colors.has(m[0]);
}

// CSS-in-JS: styled/css template literals, and style objects (sx/css/style props, styled(x)(…), css(…)).
const TEMPLATE_OPEN = /\b(?:styled(?:\.\w+|\([^)]*\))(?:\.attrs\((?:[^()]|\([^()]*\))*\))?(?:<[^`]*>)?|css|keyframes|createGlobalStyle)`/g;
const OBJECT_OPEN = /\b(?:sx|css|style)=(\{)|\bstyled(?:\.\w+|\([^)]*\))(\()|\bcss(\()/g;
const THEME_REF = /\btheme\s*[.[(]/;
const CLOSE = { '(': ')', '{': '}' };
const CSS_RULES = [
  {
    rule: 'css-font-literal',
    message: 'Hard-coded font size or weight: use a theme value (theme.typography / theme.fontSizes).',
    regex: /\b(?:font-size|fontSize|font-weight|fontWeight)\s*:\s*['"]?\d[\w.]*/g,
  },
  {
    rule: 'css-color-literal',
    message: 'Hard-coded color: use a theme color.',
    regex: /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab)\([^)]*\)/g,
  },
  {
    rule: 'css-length-literal',
    message: 'Hard-coded length: use theme spacing, sizes or breakpoints (0 and 1px are fine).',
    regex: /(?<![\w.-])\d*\.?\d+(?:px|rem|em)\b/g,
    allow: (m) => m === '1px' || Number.parseFloat(m) === 0,
  },
];

// Splits on `;` and on commas that aren't inside parentheses (so rgba(0, 0, 0) stays whole).
function declarations(scope) {
  const out = [];
  const stack = [];
  let current = '';
  for (const ch of scope) {
    if (ch === '(' || ch === '{') stack.push(ch);
    else if ((ch === ')' || ch === '}') && stack.length) stack.pop();
    if (ch === ';' || (ch === ',' && stack.at(-1) !== '(')) {
      out.push(current);
      current = '';
    } else current += ch;
  }
  return [...out, current];
}

function firstOpener(text, from) {
  const found = [];
  for (const regex of [TEMPLATE_OPEN, OBJECT_OPEN]) {
    regex.lastIndex = from;
    const m = regex.exec(text);
    if (m) found.push(m);
  }
  return found.sort((a, b) => a.index - b.index)[0];
}

// Collects the CSS text of each line. Contexts: 'tpl' (template CSS), 'expr' (${…} JS, never CSS),
// 'brace' (JS braces inside an expression), and object styles counted by their opening bracket.
function cssScopes(lines) {
  const stack = [];
  let object = null; // { open, depth }
  return lines.map((text) => {
    let scope = '';
    let i = 0;
    while (i < text.length) {
      if (object) {
        const ch = text[i];
        if (ch === object.open) object.depth++;
        else if (ch === CLOSE[object.open] && --object.depth === 0) {
          object = null;
          i++;
          continue;
        }
        scope += ch;
        i++;
        continue;
      }
      if (!stack.length) {
        const m = firstOpener(text, i);
        if (!m) break;
        if (m[0].endsWith('`')) {
          stack.push('tpl');
          i = m.index + m[0].length;
        } else {
          const bracket = m[1] ?? m[2] ?? m[3];
          object = { open: bracket, depth: 1 };
          i = m.index + m[0].length;
        }
        scope += ' ';
        continue;
      }
      const ch = text[i];
      const top = stack.at(-1);
      if (top === 'tpl') {
        if (ch === '`') stack.pop();
        else if (ch === '$' && text[i + 1] === '{') {
          stack.push('expr');
          scope += ' ';
          i++;
        } else scope += ch;
      } else if (ch === '`') stack.push('tpl');
      else if (ch === '{') stack.push('brace');
      else if (ch === '}') stack.pop();
      i++;
    }
    return scope;
  });
}

// A declaration that references `theme` (theme.x, theme[...], theme(...)) is fine.
function cssInJsViolations(file, lines) {
  const violations = [];
  cssScopes(lines).forEach((scope, i) => {
    if (!scope.trim() || ALLOW_COMMENT.test(lines[i]) || (i > 0 && ALLOW_COMMENT.test(lines[i - 1]))) return;
    for (const declaration of declarations(scope)) {
      if (THEME_REF.test(declaration)) continue;
      for (const { rule, message, regex, allow } of CSS_RULES) {
        const match = [...declaration.matchAll(regex)].map((m) => m[0]).find((m) => !allow?.(m));
        if (match) {
          violations.push({ file, line: i + 1, rule, match, message });
          break;
        }
      }
    }
  });
  return violations;
}

export function checkFile(file, content, theme, mode = 'tailwind') {
  if (mode === 'css-in-js') {
    const todo = RULES.find((r) => r.rule === 'codegen-todo');
    const lines = content.split('\n');
    const todos = lines.flatMap((text, i) => [...text.matchAll(todo.regex)].map(([match]) => ({ file, line: i + 1, rule: todo.rule, match, message: todo.message })));
    return [...cssInJsViolations(file, lines), ...todos].sort((a, b) => a.line - b.line);
  }
  const lines = content.split('\n');
  const violations = [];
  lines.forEach((text, i) => {
    if (ALLOW_COMMENT.test(text) || (i > 0 && ALLOW_COMMENT.test(lines[i - 1]))) return;
    for (const { rule, message, regex, allow, lineFilter, needsSemanticTheme } of RULES) {
      if (lineFilter && !lineFilter.test(text)) continue;
      if (needsSemanticTheme && !theme.semantic) continue;
      for (const [match] of text.matchAll(regex)) {
        if (allow?.(match)) continue;
        if (rule === 'palette-color' && isPaletteToken(match, theme.colors)) continue;
        violations.push({ file, line: i + 1, rule, match, message });
      }
    }
  });
  return violations;
}

export async function checkTokens(root, targets) {
  const { dims } = resolveProfile(root);
  const mode = ['styled-components', 'emotion'].includes(dims.styling.value) ? 'css-in-js' : 'tailwind';
  const theme = await loadTheme(root);
  if (mode === 'css-in-js') theme.warnings = theme.warnings.filter((w) => !w.startsWith('No Tailwind theme found'));
  const files = targets.flatMap((t) => walk(path.resolve(root, t)));
  const violations = files.flatMap((abs) =>
    checkFile(path.relative(root, abs).split(path.sep).join('/'), fs.readFileSync(abs, 'utf8'), theme, mode),
  );
  return {
    ok: violations.length === 0,
    mode,
    checkedFiles: files.length,
    theme: { sources: theme.sources, colorTokens: [...theme.colors].sort(), semantic: theme.semantic },
    warnings: theme.warnings,
    violations,
  };
}
