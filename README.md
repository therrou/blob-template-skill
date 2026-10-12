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
AGENTS.md, CLAUDE.md, .cursor/rules/codegen.mdc   pointers so each agent finds the skill
test/                            engine tests (not shipped to repos)
```

## Adding it to a repo

1. Copy `.agents/skills/codegen/` into the repo.
2. Merge the pointer text from `AGENTS.md` into the repo's `AGENTS.md`. `CLAUDE.md` imports `AGENTS.md`, and Cursor reads `.cursor/rules/codegen.mdc`.
3. Optional: customize templates for that repo in `.codegen/templates/<pack>/<template path>`.

To update, replace the skill folder with the newer version and check `CHANGELOG.md`. Overrides in `.codegen/` stay untouched.

## Using the generator directly

```bash
node .agents/skills/codegen/scripts/generate.mjs --list next
node .agents/skills/codegen/scripts/generate.mjs next component --name UserCard --cn @/lib/utils
node .agents/skills/codegen/scripts/generate.mjs next route --name "blog/[slug]" --with-loading --with-error
node .agents/skills/codegen/scripts/generate.mjs next api-route --name "users/[id]" --with-test --dry-run
node .agents/skills/codegen/scripts/check-tokens.mjs src/components/user-card
```

Guarantees:
- The generator never overwrites. If any target file exists, nothing is written.
- Paths outside the repo root are rejected.
- Unknown flags are errors.
- Output is always JSON.
- It detects `src/`, Vitest or Jest, the Storybook framework, and the Next major version (sync or async `params`).

## Template syntax

`{{name.pascal}}`, `{{name.camel}}`, `{{name.kebab}}`, plus `{{#if x}}…{{else}}…{{/if}}` and `{{#unless x}}`. A block tag alone on a line removes that line. Unknown variables are errors. Mark anything the agent must finish with `TODO(codegen): <instruction>`. The generator reports these markers, and `check-tokens` fails until they're gone.

## Adding a pack or generator

1. Create `packs/<pack>/pack.json`. See `packs/next/pack.json` for every field: `out`, `options`, `files[].when`, `vars`, `strip`, `nameKind: "route"`.
2. Add `templates/` and a `CONVENTIONS.md`.
3. Add tests in `test/generate.test.mjs`, then run `npm test`.

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
- Run behavior evals: check that agents given this skill run the generator instead of hand-writing files.
