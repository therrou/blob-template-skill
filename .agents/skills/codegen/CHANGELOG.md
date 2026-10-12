# Changelog

Update a repo's copy by replacing `.agents/skills/codegen/` with the boilerplate version.
Repo overrides live in `.codegen/templates/` and are never touched by an update.

## 0.1.0 — 2026-09-25

- Zero-dependency generator (`scripts/generate.mjs`): atomic writes, never overwrites, `--dry-run`, JSON output with `todo` list, repo overrides.
- `react` pack: component, hook, context, util, page.
- `next` pack: component (server), client-component, hook, context, util, route, api-route, server-action.
- `scripts/check-tokens.mjs`: arbitrary values, color literals, raw palette colors, leftover `TODO(codegen)` markers; reads Tailwind v4 `@theme` and v3 `tailwind.config.*`.
