# Codegen skill

An agent skill for React and Next.js that makes your AI coding agent write code the way your team already does. The agent runs a bundled generator for the boilerplate (components, form fields, hooks, contexts, utils, pages, routes, API routes, server actions) and writes only the real logic. The conventions live in templates, not prompts, so every agent and every developer gets the same structure.

It works with Claude Code, Cursor and GitHub Copilot, needs Node 20+, and has no dependencies.

## Quick start

**1. Install**, in your app root (the folder with `package.json`):

```bash
npx github:therrou/blob-template-skill
```

This adds the skill to `.agents/skills/codegen/` and points your agents at it: a "Code generation" section in `AGENTS.md`, `@AGENTS.md` in `CLAUDE.md`, `.cursor/rules/codegen.mdc` and `.github/copilot-instructions.md`. Existing files keep their content. The section is appended once and never duplicated. Then it prints the stack it detected. Commit the added files, so the whole team gets the same skill.

**2. Let the agent fit it to your repo.** Ask:

> Get the codegen skill ready for this repo so that what it generates matches how our existing code is written.

The agent reads your existing code and proposes settings, with counts as evidence. For example: "most components are `const X = …` with `export { X }` (40 of 44 files)", or "files are named `ProductCard.tsx`". It writes `.codegen/config.json` only after you agree.

**3. Use your agent as usual.** You don't need to mention the skill:

- "Add a ProductCard component with a compact variant."
- "Add an email field to the signup form."
- "Add a useDebounce hook."
- "Add a GET API route at /api/health that is never cached."

The agent runs the generator, fills in the logic, then formats and checks the files.

## What it generates

| Pack | Generators |
|---|---|
| `next` (App or Pages Router) | `component` (Server Component), `client-component`, `form-field`, `hook`, `context`, `util`, `route` (page, layout, loading, error), `api-route`, `server-action` |
| `react` (Vite SPA) | `component`, `form-field`, `hook`, `context`, `util`, `page` |

Components get a semantic root element, cva variants and `asChild` when asked, the repo's `cn()`, and its styling: Tailwind tokens, or `theme` values in styled-components, Emotion and MUI. Tests (Vitest or Jest) and Storybook stories are optional. Try one without an agent:

```bash
node .agents/skills/codegen/scripts/generate.mjs --list next
node .agents/skills/codegen/scripts/generate.mjs next component --name ProductCard --element article --variants --dry-run
```

## Settings

`.codegen/config.json` in your repo. The setup prompt above writes it for you.

```json
{
  "exports": { "component": "const", "hook": "inline" },
  "out": { "component": "src/components/modules", "util": "src/utils" },
  "files": { "component": "pascal" },
  "profile": { "styling": "tailwind-4" }
}
```

| Key | What it sets | Values |
|---|---|---|
| `exports` | export style per generator | `function` (default), `const` (`const X = …` + `export { X }`), `inline` (`export const x = …`) |
| `out` | folder per generator | any folder in the repo |
| `files` | component file names | `folder` (default, `product-card/product-card.tsx`), `flat` (`product-card.tsx`), `pascal` (`ProductCard.tsx`), `pascal-folder` (`ProductCard/ProductCard.tsx`) |
| `profile` | corrects a detected value | see `generate.mjs --detect` and [Supported stacks](#supported-stacks) |

To change a template for one repo, copy it into `.codegen/templates/<pack>/<template path>` and edit the copy.

## What it won't do

- **Overwrite files.** If a file it would create exists, nothing is written.
- **Install packages without asking.** Missing packages or shadcn primitives come back as an install command, and the agent asks you first.
- **Change your settings silently.** It suggests settings and writes them only on a yes.
- **Generate for a stack it doesn't support.** It says why, instead of guessing. For a form system other than shadcn Form (your own form components, TanStack Form, Formik), it points the agent at your existing fields.

## Updating and removing

Run the install command again to update. It replaces `.agents/skills/codegen/` and never touches `.codegen/`. To pin a release, add its tag, e.g. `npx github:therrou/blob-template-skill#v1.0.0`. Each release's changes are in [`CHANGELOG.md`](.agents/skills/codegen/CHANGELOG.md) and on the [Releases](https://github.com/therrou/blob-template-skill/releases) page.

To remove it, delete `.agents/skills/codegen/` and the "Code generation" section from your agent instruction files.

## Feedback

[Open an issue](https://github.com/therrou/blob-template-skill/issues/new?template=feedback.md). The template asks for your stack, agent, prompt, what happened and the `--detect` output, which is usually enough to reproduce a problem. Especially useful: files in the wrong folder or with the wrong name, a style your team doesn't use, or the agent ignoring the skill.

Tested most with Claude Code, on three production Next.js codebases and an eval suite. Cursor, Copilot and Vite SPAs are supported, but there's less real-world evidence yet, so reports from those setups help most.

## Supported stacks

The generator detects the stack first (`generate.mjs --detect`) and picks template variants from it. Every output includes this `profile`, with where each value came from (`detected`, `default`, `config`, `flag`).

| Dimension | Values | Detected from |
|---|---|---|
| `app` | `next-app`, `next-pages`, `react-spa` | `next` in deps plus `app/` or `pages/` (both → `next-app`) |
| `next` | `13`, `14`, `15`, `16` (16 = 16+) | installed `next` major |
| `react` | `18`, `19` | installed `react` major (18 → `forwardRef`) |
| `styling` | `tailwind-3`, `tailwind-4`, `styled-components`, `emotion`, `plain` | `tailwindcss` major, else `styled-components`, else `@emotion/*` (MUI included), else `plain` |
| `primitives` | `radix`, `base`, `none` | `components.json` `style` prefix (`base-*` → Base UI `render` prop instead of `asChild`); without it, what the ui folder's files import. The ui folder is the `components.json` alias, else `components/ui`, else `app/components/ui` |
| `forms` | `shadcn`, `tanstack-form`, `formik`, `custom`, `none` | `components/ui/form.tsx` (shadcn Form), else `@tanstack/react-form` or `formik` in deps, else a `components/ui/form(s)/` folder. `form-field` runs on `shadcn` and `none` only; otherwise its error names the repo's form folder |
| `cn` | an import path or `none` | the `cn` import in the existing ui folder (a relative `./utils` becomes its alias path), then `components.json`, then `lib/utils` |
| `zod`, `table` | `3`/`4`, `8`/`9` | installed majors (used by upcoming generators) |
| `srcDir` | `true`, `false` | `src/` exists |

- Versions come from `node_modules` (walking up for monorepos), else the `package.json` range. A library that isn't installed counts as its newest supported version (source `default`).
- Older versions (React 17, Next 12, Tailwind 2, React Aria–flavoured shadcn) are refused by the generators that depend on them, with the supported values in the message.
- Override detection with `.codegen/config.json` (`{ "profile": { "app": "next-pages" } }`) or `--profile app=next-pages,react=18`. The flag wins over the file, which wins over detection. Unknown keys or values are errors.
- The same file sets repo conventions: `"out": { "util": "src/utils" }` (a generator's folder, relative to the root; `--out` still wins) and `"exports"`. `"const"` writes components and form fields as `const X = …` + `export { X }` with a local props type. A map sets the style per generator, e.g. `{ "component": "const", "hook": "inline", "util": "const", "route": "const" }`. Styles are `function` (default), `const` (one export list, or `export default X` for route files) and `inline` (`export const x = …`; not for components). API route handlers stay `export async function GET`.
- `"files"` sets the file layout of component, client-component and form-field: `folder` (default, `my-card/my-card.tsx`), `flat` (`my-card.tsx`), `pascal` (`MyCard.tsx`) or `pascal-folder` (`MyCard/MyCard.tsx`). Tests, stories and the parent `index.ts` follow it; `--with-barrel` needs a folder layout.
- `--detect` also reads the existing code and returns `conventions`: per-generator style and folder counts, component file layouts (the shadcn ui folder excluded), and under `suggest` the config values that are clear (at least 5 files, at least twice as common as each alternative) and not set yet. The agent proposes them to the user; nothing is written automatically.
- Not supported yet: context file names other than `x-context.tsx` (use a template override) and non-React stacks (see the roadmap).

## Using the generator directly

Agents call the generator for you; these commands are for trying it out or scripting.

```bash
node .agents/skills/codegen/scripts/generate.mjs --list next
node .agents/skills/codegen/scripts/generate.mjs next component --name UserCard --element article
node .agents/skills/codegen/scripts/generate.mjs next client-component --name CtaButton --element button --variants --as-child
node .agents/skills/codegen/scripts/generate.mjs next form-field --name EmailField --control input
node .agents/skills/codegen/scripts/generate.mjs next route --name "blog/[slug]" --with-loading --with-error
node .agents/skills/codegen/scripts/generate.mjs next api-route --name "users/[id]" --with-test --dry-run
node .agents/skills/codegen/scripts/check-tokens.mjs src/components/user-card
```

Guarantees:
- The generator never overwrites. If any file it would create exists, nothing is written.
- Runs are all-or-nothing, including edits to existing files: if any step fails, created files are removed and edited files are restored.
- Paths outside the repo root are rejected.
- Unknown flags are errors.
- Output is always JSON.
- Missing packages or shadcn primitives are an error with `missing`, `missingUi` and an `install` command; nothing is written.
- It detects `src/`, Vitest or Jest, the Storybook framework, the Next major version (sync or async `params`), the shadcn `components.json` aliases, `cn()`, and Radix Slot.

## Template syntax

`{{name.pascal}}`, `{{name.camel}}`, `{{name.kebab}}`, `{{name.snake}}`, `{{name.constant}}`, plus `{{#if x}}…{{else}}…{{/if}}` and `{{#unless x}}`. A block tag alone on a line removes that line. Unknown variables are errors.

- **Helpers**: `{{kebab title}}` calls a helper with one variable. Built-ins: `pascal`, `camel`, `kebab`, `snake`, `constant`, `lower`, `upper`. A pack adds its own in `packs/<pack>/helpers.mjs` and a repo in `.codegen/helpers.mjs` (`export default { name: (value) => string }`). Repo helpers win over pack helpers, which win over built-ins.
- **Partials**: `{{> name}}` inserts `packs/<pack>/templates/_partials/<name>.tpl`, and `{{> @react/name}}` borrows one from another pack. A template always uses the partials and helpers of the pack that owns it, even when another pack borrows it. A repo overrides a partial like any template: `.codegen/templates/<pack>/_partials/<name>.tpl`. Mark anything the agent must finish with `TODO(codegen): <instruction>`. The generator reports these markers, and `check-tokens` fails until they're gone.

## Token rules for CSS-in-JS

In styled-components and Emotion repos, `check-tokens` runs in `css-in-js` mode. Inside styled template literals (`styled.x\`…\``, `styled.x.attrs(…)\`…\``, `css\`…\``, nested ones included) and style objects (`sx={{…}}`, `css={{…}}`, `style={{…}}`, `styled(x)({…})`, `styled(x)(({ theme }) => ({…}))`, `css({…})`), it flags hard-coded colors, lengths other than `0` and `1px` (media queries included: use theme breakpoints), and numeric font sizes and weights. Values inside `${…}` interpolations are code, not CSS, and object declarations that reference `theme.` are fine. It checks that the theme is used, not that the key exists in the theme.

## Enforcing it outside the agent

The agent runs `check-tokens` because `SKILL.md` tells it to. To catch hand-written code too, add one or both of these to the repo.

Pre-commit with lint-staged (in `package.json`):

```json
"lint-staged": {
  "*.{ts,tsx}": "node .agents/skills/codegen/scripts/check-tokens.mjs"
}
```

GitHub Actions (on pull requests):

```yaml
- uses: actions/checkout@v4
  with:
    fetch-depth: 0
- run: |
    git diff --name-only --diff-filter=ACM origin/${{ github.base_ref }}...HEAD -- '*.ts' '*.tsx' \
      | xargs -r node .agents/skills/codegen/scripts/check-tokens.mjs
```

Recommended existing ESLint rules that match the conventions:

| Convention | Rule |
|---|---|
| Named exports only | `import/no-default-export`, turned off for `app/**/{page,layout,loading,error,not-found,template,default}.tsx`, `*.stories.tsx` and config files |
| Kebab-case file names | `unicorn/filename-case` with `{ case: 'kebabCase' }` |
| Accessibility | `plugin:jsx-a11y/recommended` (`click-events-have-key-events`, `no-static-element-interactions`, `anchor-is-valid`) |
| Tailwind class hygiene | `eslint-plugin-tailwindcss` or `eslint-plugin-better-tailwindcss` (`no-contradicting-classname`, `no-unregistered-classes`) |

# Developing the skill

## What's inside

```
.agents/skills/codegen/          ← copy this folder into a repo
  SKILL.md                       agent workflow (Agent Skills format)
  VERSION, CHANGELOG.md
  scripts/generate.mjs           generator CLI (Node ≥ 20, no dependencies)
  scripts/check-tokens.mjs       design-token and leftover-placeholder checker
  packs/react/                   pack.json + templates/ + CONVENTIONS.md
  packs/next/                    (borrows react templates via "@react/...")
AGENTS.md, CLAUDE.md, .cursor/rules/codegen.mdc, .github/copilot-instructions.md
                                 pointers so each agent finds the skill
bin/install.mjs                  the npx installer and updater
test/                            engine tests (not shipped to repos)
evals/                           behavior evals (not shipped to repos)
```

## Adding a pack or generator

1. Create `packs/<pack>/pack.json`. See `packs/next/pack.json` for every field: `out`, `options` (with `required`, `choices` and `requires`), `files[].when`, `actions`, `vars`, `strip`, `nameKind: "route"`, `requires` and `requiresUi`.
2. Add `templates/` and a `CONVENTIONS.md`.
3. Add tests in `test/generate.test.mjs` (engine features in `test/engine.test.mjs`), then run `npm test`.

### Actions

`files` creates files. `actions` does everything else, in order, after `files`, in the spirit of plop:

| Type | Example | What it does |
|---|---|---|
| `add` | `{ "type": "add", "path": "{{name.kebab}}.ts", "template": "util/util.ts.tpl", "skipIfExists": true }` | Creates a file. An existing file is a conflict, unless `skipIfExists`. |
| `addMany` | `{ "type": "addMany", "templates": "feature", "path": "{{name.kebab}}" }` | Creates every `.tpl` under `templates/feature/`, keeping its layout. File names are templates too, and `.tpl` is dropped. |
| `modify` | `{ "type": "modify", "path": "/app/layout.tsx", "pattern": "(<body[^>]*>)", "text": "$1<{{name.pascal}}Provider>" }` | Replaces the first match. `$1`/`$&` work as in `String.replace`. |
| `append` | `{ "type": "append", "path": "index.ts", "template": "barrel/export.ts.tpl", "skipIfMissing": true }` | Adds a line at the end of the file, or after the first `pattern` match. `separator` (default: a newline) goes between the match and the text, and only applies to pattern inserts; at the end of the file the text is always added as whole lines. With `unique` (default `true`) it skips text that is already there. |
| `custom` | `{ "type": "custom", "module": "register-route.mjs" }` | Runs `packs/<pack>/actions/register-route.mjs`: `export default (ctx, { read, exists, render }) => [{ path, content }]`. It returns changes and never writes, so dry-run and rollback still apply. |

- Every action and `files` entry takes `when`: a context key that must be true, or a profile condition such as `{ "styling": ["styled-components", "emotion"] }` or `{ "app": "!next-pages" }` (every key must match; `!` excludes a value).
- A generator or an option can declare `supports` with the same shape (`"supports": { "app": ["!next-pages"] }`). Outside it, the run is refused with the supported values. `out` can be `[{ "when": {…}, "out": "pages" }, { "out": "app" }]` (first match wins), and a `requires` entry can be `{ "package": "@base-ui/react", "when": { "primitives": "base" } }`.
- Templates see `profile.<dim>`, `profileIs.<dim>.<value>`, `mui` and `cssInJs`.
- `path` is relative to the generator's output folder. A leading `/` makes it relative to the repo root, and its first folder follows the repo's `src/` layout (`/app/layout.tsx` → `src/app/layout.tsx`).
- Content comes from exactly one of `template` (a file, which repos can override) or `text` (inline).
- `modify` and `append` fail when the file or the pattern is missing. `skipIfMissing` skips instead.
- Output lists `created`, `modified` and `skipped`, and `--dry-run` adds `changes` with the text each edit inserts.

## Behavior evals

`npm run eval` checks the main assumption: an agent with this skill runs the generator instead of hand-writing files, keeps what it generated, and stops when it should. Each run copies one sample app from `evals/fixtures/` to a temp folder, runs `claude -p` with the case prompt, and checks the result. It costs tokens and isn't deterministic, so it runs by hand, several times per case, not in CI.

Sample apps: `next-app-tw4` (Next 16, Tailwind 4, shadcn/Radix), `next-pages-tw3` (Next 14 Pages Router, React 18, Tailwind 3), `vite-react18-styled` (Vite SPA, styled-components, `src/`, a barrel), `next-base-ui` (shadcn on Base UI), `vite-react19-emotion` (Emotion with a typed theme; only the type check uses it so far), `react17-legacy` (outside the support matrix).

Each case in `evals/cases.json` picks a `fixture` and a `prompt`, then any of these checks:

| Field | Checks |
|---|---|
| `generator` / `noGenerator` | a generator call was (or wasn't) made |
| `newFiles` / `noNewFiles` | new files that must (or must not) exist |
| `modified` / `noModified` | existing files that must (or must not) be edited |
| `contains` | `{ file, pattern, absent? }` over new and edited files |
| `answer` | the agent's final message matches (e.g. it says why it stopped, or asks before installing) |
| `minKept` | share of the generated skeleton the agent must keep (default 0.4, only for skeletons of 8+ real lines). Each generator call is replayed in a clean copy and compared; generated function and const exports must also survive in every file |
| `dryRun` / `dryRunError` | used only by `npm test`, which checks every case against its sample app without an agent |

`check-tokens` runs on every new or edited file. A timeout or crash is reported as such, not as a wrong answer.

```bash
npm run eval -- --runs 3 --jobs 4            # every case three times, four at a time
npm run eval -- --case reuse-button --keep   # keep the temp folder to inspect it
npm run eval -- --fixture next-pages-tw3 --model sonnet
npm run eval -- --compare evals/results/<a>/summary.json evals/results/<b>/summary.json
```

Each run writes `evals/results/<date>-v<version>-<model>/`: `summary.json` (pass rate per case, cost, turns, tool calls, kept ratio) and one transcript per run. The folder is git-ignored. Baselines worth keeping live in `evals/baselines/` (`v0.4.0-sonnet.json`, `v0.4.1-haiku.json`, `v0.5.1-sonnet.json` and `v0.7.1-sonnet.json`, all 48/48; `v0.8.0-haiku.json`, 52/54 over 18 cases); compare a new run against one with `--compare`.

## Generated-code type check

`npm run typecheck` checks that what the generator writes compiles against the real packages. It covers twelve stacks: the supported sample apps in `evals/fixtures/`, an MUI variant of the Emotion app, and pinned copies for the oldest supported versions (Next 13.0 Pages Router with Tailwind 3.0, Next 13.4 App Router, both on React 18.2) and for Next 15, plus three with per-generator `"exports"` maps (const and inline, checked file by file), two of which also set `"files"` layouts (file names checked). For each one it:

1. Installs the app's dependencies, plus types, vitest, Testing Library and Storybook. They are cached in `~/.cache/codegen-typecheck/` and reinstalled only when the dependency list changes, so the first run needs network.
2. Runs every generator in a fresh copy, with every `--element` and every `--variants` / `--as-child` combination, plus `--with-test` and `--with-story`. That's about 200 calls and 480 files per Next stack.
3. Runs `tsc --noEmit` in strict mode, then ESLint on the generated files (typescript-eslint recommended, React hooks including the React Compiler rules, jsx-a11y, and the Next core-web-vitals rules on Next stacks). Each error is reported under the generator call that wrote the file. Lint warnings are listed but don't fail the run.

Combinations the generator refuses (for example, `--as-child` with styled-components) are reported as skipped, not failed. No agent is involved, so it costs no tokens. The full run takes about four minutes once the dependencies are cached.

```bash
npm run typecheck
npm run typecheck -- --stack next-pages-tw3 --keep   # keep the workspace to inspect it
```

The form-field primitives (`select`, `checkbox`, `textarea`) are added as thin Radix re-exports, not the full shadcn sources.

## Roadmap

| Pack | Status |
|---|---|
| react, next | v1 |
| vue (SFC + composables + Pinia) | planned |
| liquid (Shopify sections, blocks, snippets) | planned |
| vanilla-js (ES modules, custom elements) | planned |
| aspnet-mvc-js (`wwwroot/js` view modules + `.cshtml` partials) | planned. Open question: can these repos rely on Node being installed? |

Also still to do:
- Support the newer shadcn `field` primitive in `form-field`.
