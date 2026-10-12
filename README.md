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
- The generator never overwrites. If any target file exists, nothing is written.
- Paths outside the repo root are rejected.
- Unknown flags are errors.
- Output is always JSON.
- Missing packages or shadcn primitives are an error with `missing`, `missingUi` and an `install` command; nothing is written.
- It detects `src/`, Vitest or Jest, the Storybook framework, the Next major version (sync or async `params`), the shadcn `components.json` aliases, `cn()`, and Radix Slot.

## Template syntax

`{{name.pascal}}`, `{{name.camel}}`, `{{name.kebab}}`, plus `{{#if x}}…{{else}}…{{/if}}` and `{{#unless x}}`. A block tag alone on a line removes that line. Unknown variables are errors. Mark anything the agent must finish with `TODO(codegen): <instruction>`. The generator reports these markers, and `check-tokens` fails until they're gone.

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

1. Create `packs/<pack>/pack.json`. See `packs/next/pack.json` for every field: `out`, `options` (with `required`, `choices` and `requires`), `files[].when`, `vars`, `strip`, `nameKind: "route"`, `requires` and `requiresUi`.
2. Add `templates/` and a `CONVENTIONS.md`.
3. Add tests in `test/generate.test.mjs` (engine features in `test/engine.test.mjs`), then run `npm test`.

## Behavior evals

`npm run eval` checks the main assumption: that an agent with this skill runs the generator instead of hand-writing files. It copies `evals/fixture/` (a minimal Next + shadcn app) to a temp folder per case, runs `claude -p` with the case prompt, and checks the new files, the generator calls and `check-tokens`. It costs tokens and isn't deterministic, so it runs by hand, not in CI.

```bash
npm run eval                      # all cases
npm run eval -- --case reuse-button --keep
```

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
