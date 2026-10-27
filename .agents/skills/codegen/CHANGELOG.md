# Changelog

Update a repo's copy by replacing `.agents/skills/codegen/` with the boilerplate version.
Repo overrides live in `.codegen/templates/` and are never touched by an update.

## 0.3.0 — 2026-10-27

**Breaking:** `--dry-run` output renames `files` to `created`, and adds `modified`, `skipped` and `changes`. Normal runs also report `modified` and `skipped`.

- Plop-style `actions` in pack.json: `add` (with `skipIfExists`), `addMany`, `modify`, `append` (`pattern`, `unique`, `separator`) and `custom`. Every action takes `when`. `modify` and `append` take `skipIfMissing`. `files` still works and runs first.
- Paths starting with `/` are relative to the repo root and follow its `src/` layout. Content comes from `template` (a file) or `text` (inline).
- All-or-nothing now covers edits: if any step fails, created files are removed and edited files are restored. A file that changed between planning and writing is refused.
- Template helpers (`{{kebab title}}`; built-ins plus `packs/<pack>/helpers.mjs` and `.codegen/helpers.mjs`) and partials (`{{> name}}`, `{{> @pack/name}}`, in `templates/_partials/`). Names gain `snake` and `constant`.
- `component`, `client-component` and `form-field` add `export * from './<name>';` to the output folder's `index.ts` when that barrel exists. Override `barrel/export.ts.tpl` to change its style.

## 0.2.0 — 2026-10-12

**Breaking:** `component` and `client-component` now require `--element <tag>`. Add it to any scripted calls.

- Components: `--element` (semantic root from an allowlist, with typed props and a11y notes), `--variants` (cva), `--as-child` (Radix Slot).
- New `form-field` generator (react and next): react-hook-form field on the shadcn form primitives, `--control input|textarea|select|checkbox`.
- `cn()` is auto-detected from `components.json` or `lib/utils`; `--cn` only overrides.
- Missing packages or shadcn primitives fail with `missing`, `missingUi` and an `install` command; nothing is written.
- Boolean flags reject values (`--as-child false` is an error, not "on").
- A repo override in `.codegen/templates/` that predates a flag (e.g. a 0.1.0 `component.tsx.tpl` used with `--variants`) is refused with an error instead of generating broken files. Update the override from the skill template.
- pack.json: options support `required`, `choices` and `requires`; generators support `requires` and `requiresUi`.
- Copilot pointer (`.github/copilot-instructions.md`); README documents lint-staged/CI enforcement and recommended ESLint rules.
- Behavior evals (`npm run eval`, not shipped).

## 0.1.0 — 2026-09-25

- Zero-dependency generator (`scripts/generate.mjs`): atomic writes, never overwrites, `--dry-run`, JSON output with `todo` list, repo overrides.
- `react` pack: component, hook, context, util, page.
- `next` pack: component (server), client-component, hook, context, util, route, api-route, server-action.
- `scripts/check-tokens.mjs`: arbitrary values, color literals, raw palette colors, leftover `TODO(codegen)` markers; reads Tailwind v4 `@theme` and v3 `tailwind.config.*`.
