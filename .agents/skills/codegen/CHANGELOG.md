# Changelog

Update a repo's copy by replacing `.agents/skills/codegen/` with the boilerplate version.
Repo overrides live in `.codegen/templates/` and are never touched by an update.

## 0.5.1 — 2026-11-12

From the second pilot round, where the agent rewrote hook skeletons after the generator had formatted them:
- `generate.mjs --format <files>` formats any files with the repo's Prettier, so agents can format their own edits even when only `node` is allowed. SKILL.md's verify step runs it before `check-tokens`.

## 0.5.0 — 2026-11-12

From the two-repo pilot, where every generated file failed the repo's Prettier and the per-component `index.ts` clashed with both teams:

**Breaking:**
- `component`, `client-component` and `form-field` no longer write `<name>/index.ts`. Pass `--with-barrel` to get it. Without it, the line added to an existing `components/index.ts` points at the file (`./user-card/user-card`).

- Written files are formatted with the repo's own Prettier (found in `node_modules` of the root or a parent folder; never downloaded), using the repo's config and `.prettierignore`. The output's `format` is `{ tool, ok }`, or `null` when the repo has no Prettier. A Prettier failure is reported, never undoes the generation. `todo` line numbers point into the formatted file.

## 0.4.2 — 2026-11-12

Fixes from the first pilot in two real repos:
- Installing the skill no longer breaks a repo's `eslint .`: the skill's own scripts pass `no-empty` and `no-control-regex`.
- `cn` is detected when UI components live one folder deep (`ui/button/button.tsx`) and when it's imported with other names (`{ cn, focusRing }`).
- `check-tokens` no longer reports Tailwind variant selectors with brackets (`data-[state=open]:`, `group-data-[…]:`, `has-[…]:`) as arbitrary values.

## 0.4.1 — 2026-11-12

Generated files now pass ESLint as generated (typescript-eslint recommended, React hooks, jsx-a11y, Next core-web-vitals), checked on every supported stack by `npm run typecheck`:
- `hook`, `context` and Pages Router `route`: placeholder types are `Record<string, never>` instead of an empty `{}` (`no-empty-object-type`).
- App Router `route` and `api-route`: route params and `request` are marked with `void` until the TODO uses them (`no-unused-vars`), as `server-action` already did.

## 0.4.0 — 2026-10-27

**Breaking:**
- `server-action` now generates `(prevState, formData)`, the signature `useActionState` expects.
- `--as-child` is refused in CSS-in-JS repos (use `as`).
- `form-field` is refused with Base UI primitives or CSS-in-JS styling.
- Every output (and every error after detection) includes `profile`.

- Project profile: `generate.mjs --detect` shows the detected app type (Next App Router, Pages Router, React SPA), Next and React versions, styling, shadcn primitives, `cn` import, Zod and TanStack Table versions. Override with `.codegen/config.json` or `--profile key=value,…`. Versions outside the support matrix are refused with the supported values.
- pack.json: `when` and `supports` accept profile conditions (with `!value` exclusion), `out` can depend on the profile, `requires` entries can be conditional.
- Components: `forwardRef` on React 18; Base UI `render` prop via `useRender` (`@base-ui/react`) when `components.json` uses a `base-*` style; a styled-components / Emotion / MUI variant with transient `$variant`/`$size` props; `cn` imported the way existing `components/ui` files do.
- Next Pages Router: `route` writes `pages/<route>.tsx`, `api-route` writes `pages/api/<route>.ts`; App Router–only flags and `server-action` are refused there.
- `check-tokens` gains a `css-in-js` mode and reports `mode`.

## 0.3.0 — 2026-10-27

**Breaking:** `--dry-run` output renames `files` to `created`, and adds `modified`, `skipped` and `changes`. Normal runs also report `modified` and `skipped`.

- Plop-style `actions` in pack.json: `add` (with `skipIfExists`), `addMany`, `modify`, `append` (`pattern`, `unique`, `separator`) and `custom`. Every action takes `when`. `modify` and `append` take `skipIfMissing`. `files` still works and runs first.
- Paths starting with `/` are relative to the repo root and follow its `src/` layout. Content comes from `template` (a file) or `text` (inline).
- `--dry-run` runs the same pre-write checks as a real run, so a target that already exists comes back as `ok: false` with `conflicts`.
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
