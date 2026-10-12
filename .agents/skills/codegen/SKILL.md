---
name: codegen
description: Use when adding new React or Next.js code to a repo - a component, client component, hook, context, util, page, App Router route or segment, API route handler, or server action - or when asked to scaffold, generate, or create boilerplate for one.
---

# Codegen

Scaffold new files with the bundled generator instead of writing boilerplate by hand. The generator is deterministic and encodes the team conventions. Your job is the real logic inside the generated files.

Paths below are relative to the repo root: `SKILL=.agents/skills/codegen`.

## Workflow

1. **Pick the pack.** If `next` is a dependency in `package.json`, use `next`. Otherwise, if `react` is a dependency, use `react`. For any other stack, there is no pack yet: write the code by hand following the closest `CONVENTIONS.md`.
2. **Reuse check** (components only). Search `components/ui/`, the existing component folders, and any design-system package in `package.json` for something that already does the job. If you find one, reuse or extend it, tell the user, and stop. New components compose existing primitives; they don't re-style raw HTML.
3. **Read the conventions**: `$SKILL/packs/<pack>/CONVENTIONS.md`. For next, also read the react one.
4. **Choose the generator and options**: `node $SKILL/scripts/generate.mjs --list <pack>`.
   - Next: use `component` (a Server Component) by default. Use `client-component` only for state, effects, event handlers or browser APIs.
   - Pass `--cn <import path>` when the repo has a `cn()` helper (search for `export function cn`).
   - Add `--with-test` or `--with-story` only when the user asks or the repo requires them.
5. **Generate** from the app root (the folder that holds its `package.json`), or pass `--root`:
   `node $SKILL/scripts/generate.mjs <pack> <generator> --name <name> [options]`
   - Unsure where the files will land? Run with `--dry-run` first.
   - Output of `ok: false` with `conflicts` means the files already exist. Reuse them or choose another name. Never delete files in order to regenerate them.
6. **Fill in** every item in the output's `todo` list, and remove each `TODO(codegen)` marker.
7. **Verify**: `node $SKILL/scripts/check-tokens.mjs <created and edited files>` must exit 0. Fix every violation. Then run the repo's own lint and typecheck, plus the tests if you generated any.

## Styling in one line

Tailwind with **semantic theme tokens only**. Read the theme before writing classes. Don't use arbitrary values (`p-[13px]`), color literals, or raw palette colors (`bg-blue-500`) when a semantic token exists. Details are in `packs/react/CONVENTIONS.md`. For a justified exception, put `tokens-allow: <reason>` in a comment on the same line or the line above.

## Repo overrides

To change a template for one repo, copy it from `$SKILL/packs/<pack>/templates/<path>` to `.codegen/templates/<pack>/<path>` and edit the copy. The generator prefers the copy and lists the affected files under `overridden`. Next borrows several templates from react (`@react/...` in `pack.json`), so overriding one of those means overriding the react path.

## Red flags

- You are about to hand-write a component, hook, route or action file. Run the generator instead.
- You are about to report the task done while `TODO(codegen)` markers remain, or without having run `check-tokens`.
- You are about to add `'use client'` to a page, a layout, or a large component. Extract a small client leaf instead.
- You are using `--out` to break the folder conventions without the user asking for it.
