---
name: codegen
description: Use when adding new React or Next.js code to a repo - a component, client component, form field, hook, context, util, page, App Router route or segment, API route handler, or server action - or when asked to scaffold, generate, or create boilerplate for one.
---

# Codegen

Scaffold new files with the bundled generator instead of writing boilerplate by hand. The generator is deterministic and encodes the team conventions. Your job is the real logic inside the generated files.

Paths below are relative to the repo root: `SKILL=.agents/skills/codegen`.

## Workflow

1. **Detect the stack, then pick the pack.** Run `node $SKILL/scripts/generate.mjs --detect` and read `profile`: app type, Next and React versions, styling (Tailwind 3/4, styled-components, Emotion/MUI, plain), shadcn primitives (Radix/Base UI), `cn` import, Zod and TanStack Table versions.
   - Use `next` when `profile.app` is `next-app` or `next-pages`, otherwise `react`. For any other stack there is no pack yet: write the code by hand following the closest `CONVENTIONS.md`.
   - If a value is wrong (e.g. a migration in progress), set it in `.codegen/config.json` (`{ "profile": { "styling": "emotion" } }`) and tell the user, or pass `--profile key=value` for one run.
   - Repo conventions also live in `.codegen/config.json`: `"out": { "util": "src/utils" }` sets a generator's folder, and `"exports": "const"` writes components as `const X = …` with `export { X }` and a local props type. If existing components or folders clearly follow another convention, propose the setting to the user.
2. **Reuse check** (components only). Search `components/ui/`, the existing component folders, and any design-system package in `package.json` for something that already does the job. If you find one, reuse or extend it, tell the user, and stop. New components compose existing primitives; they don't re-style raw HTML.
3. **Read the conventions**: `$SKILL/packs/<pack>/CONVENTIONS.md`. For next, also read the react one.
4. **Choose the generator and options**: `node $SKILL/scripts/generate.mjs --list <pack>`.
   - Next: use `component` (a Server Component) by default. Use `client-component` only for state, effects, event handlers or browser APIs.
   - Components need `--element`: the most meaningful semantic root (`button` for actions, `a` for navigation, `nav`/`section`/`article`/`aside`/`header`/`footer` for regions, `ul`/`ol` for lists, `h1`–`h6` for headings). Use `div` only when nothing else fits; never put click handlers on it.
   - Add `--variants` when the component has visual variants or sizes (cva), and `--as-child` when callers need to render it as their own element (e.g. a link styled as a button).
   - Form inputs: use `form-field --control input|textarea|select|checkbox`, not `component`.
   - `cn()` is detected automatically; pass `--cn <import path>` only to override.
   - Add `--with-test` or `--with-story` only when the user asks or the repo requires them.
   - Components and form fields get no `index.ts` by default. Add `--with-barrel` only when the existing component folders have their own `index.ts`.
5. **Generate** from the app root (the folder that holds its `package.json`), or pass `--root`:
   `node $SKILL/scripts/generate.mjs <pack> <generator> --name <name> [options]`
   - Unsure where the files will land? Run with `--dry-run` first.
   - The output lists `created`, `modified` (existing files the generator edited, such as a barrel) and `skipped`.
   - When the repo has Prettier installed, the written files are formatted with it; `format` in the output says so. `format.ok: false` means Prettier failed on them: the files are written; fix the cause and format them in step 7.
   - An error from a `modify` or `append` step means the target file isn't in the shape the generator expects. Tell the user; don't hand-edit around it.
   - An error saying something "is not supported" means the stack or option is outside the support matrix. Tell the user; don't hand-write around it.
   - Output of `ok: false` with `conflicts` means the files already exist. Reuse them or choose another name. Never delete files in order to regenerate them.
   - Output of `ok: false` with `missing` / `missingUi` means a package or shadcn primitive is missing. Show the user the `install` command and ask before running it, then rerun the generator.
6. **Fill in** every item in the output's `todo` list, and remove each `TODO(codegen)` marker.
7. **Verify**, on every file you created, generated or edited:
   - `node $SKILL/scripts/generate.mjs --format <files>` formats them with the repo's Prettier (`format: null` means the repo has none).
   - `node $SKILL/scripts/check-tokens.mjs <files>` must exit 0. Fix every violation.
   - Then run the repo's own lint and typecheck, plus the tests if you generated any. Fix lint errors in your code; don't disable the rule.
   - Run each check as its own command. Don't chain them with `;` or `&&`: if one part of a chain needs approval and is denied, none of it runs.

## Styling in one line

In CSS-in-JS repos (styled-components, Emotion, MUI): **`theme` values only**, no hard-coded colors, lengths or font sizes. Otherwise Tailwind with **semantic theme tokens only**. Read the theme before writing classes. Don't use arbitrary values (`p-[13px]`), color literals, or raw palette colors (`bg-blue-500`) when a semantic token exists. Details are in `packs/react/CONVENTIONS.md`. For a justified exception, put `tokens-allow: <reason>` in a comment on the same line or the line above.

## Repo overrides

To change a template for one repo, copy it from `$SKILL/packs/<pack>/templates/<path>` to `.codegen/templates/<pack>/<path>` and edit the copy. The generator prefers the copy and lists the affected files under `overridden`. Next borrows several templates from react (`@react/...` in `pack.json`), so overriding one of those means overriding the react path.

## Red flags

- You are about to hand-write a component, hook, route or action file. Run the generator instead.
- You are about to report the task done while `TODO(codegen)` markers remain, or without having run `--format` and `check-tokens`.
- You are about to add `'use client'` to a page, a layout, or a large component. Extract a small client leaf instead.
- You are about to pick `--element div` for something users click, or a list, heading or landmark.
- You are about to install a package or shadcn primitive without asking the user.
- You are using `--out` to break the repo's folder conventions. Use it to follow them (e.g. `components/ui` vs `components/modules`), or set `out` in `.codegen/config.json`.
