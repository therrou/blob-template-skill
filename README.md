# blob-template-skill

An AI agent skill for **deterministic code generation**, in the spirit of plop but with no dependencies. The agent runs a bundled generator to scaffold components, hooks, routes and similar files, and then writes only the real logic. The conventions live in templates instead of prompts, so every agent produces the same structure.

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
test/                            engine tests (not shipped to repos)
evals/                           behavior evals (not shipped to repos)
```

## Adding it to a repo

1. Copy `.agents/skills/codegen/` into the repo.
2. Merge the pointer text from `AGENTS.md` into the repo's `AGENTS.md`, and copy `.github/copilot-instructions.md` and `.cursor/rules/codegen.mdc`. `CLAUDE.md` imports `AGENTS.md`.
3. Optional: customize templates for that repo in `.codegen/templates/<pack>/<template path>`.

To update, replace the skill folder with the newer version and check `CHANGELOG.md`. Overrides in `.codegen/` stay untouched.

## Using the generator directly

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

## Supported stacks

The generator detects the stack first (`generate.mjs --detect`) and picks template variants from it. Every output includes this `profile`, with where each value came from (`detected`, `default`, `config`, `flag`).

| Dimension | Values | Detected from |
|---|---|---|
| `app` | `next-app`, `next-pages`, `react-spa` | `next` in deps plus `app/` or `pages/` (both → `next-app`) |
| `next` | `13`, `14`, `15`, `16` (16 = 16+) | installed `next` major |
| `react` | `18`, `19` | installed `react` major (18 → `forwardRef`) |
| `styling` | `tailwind-3`, `tailwind-4`, `styled-components`, `emotion`, `plain` | `tailwindcss` major, else `styled-components`, else `@emotion/*` (MUI included), else `plain` |
| `primitives` | `radix`, `base`, `none` | `components.json` `style` prefix (`base-*` → Base UI `render` prop instead of `asChild`) |
| `cn` | an import path or `none` | the `cn` import in existing `components/ui/*`, then `components.json`, then `lib/utils` |
| `zod`, `table` | `3`/`4`, `8`/`9` | installed majors (used by upcoming generators) |
| `srcDir` | `true`, `false` | `src/` exists |

- Versions come from `node_modules` (walking up for monorepos), else the `package.json` range. A library that isn't installed counts as its newest supported version (source `default`).
- Older versions (React 17, Next 12, Tailwind 2, React Aria–flavoured shadcn) are refused by the generators that depend on them, with the supported values in the message.
- Override detection with `.codegen/config.json` (`{ "profile": { "app": "next-pages" } }`) or `--profile app=next-pages,react=18`. The flag wins over the file, which wins over detection. Unknown keys or values are errors.

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

Sample apps: `next-app-tw4` (Next 16, Tailwind 4, shadcn/Radix), `next-pages-tw3` (Next 14 Pages Router, React 18, Tailwind 3), `vite-react18-styled` (Vite SPA, styled-components, `src/`, a barrel), `next-base-ui` (shadcn on Base UI), `react17-legacy` (outside the support matrix).

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

Each run writes `evals/results/<date>-v<version>-<model>/`: `summary.json` (pass rate per case, cost, turns, tool calls, kept ratio) and one transcript per run. The folder is git-ignored; keep the summaries you want as a baseline.

## Roadmap

| Pack | Status |
|---|---|
| react, next | v1 |
| vue (SFC + composables + Pinia) | planned |
| liquid (Shopify sections, blocks, snippets) | planned |
| vanilla-js (ES modules, custom elements) | planned |
| aspnet-mvc-js (`wwwroot/js` view modules + `.cshtml` partials) | planned. Open question: can these repos rely on Node being installed? |

Also still to do:
- Adjust the defaults against a real company repo.
- Support the newer shadcn `field` primitive in `form-field`.
- Package as `@company/codegen` with `init` / `update` (see the 0.2.0 design doc).
