# Codegen skill: beta guide (0.9.0)

Thanks for trying this. The skill gives your AI coding agent a generator for React and Next.js files: components, form fields, hooks, contexts, utils, pages, routes, API routes and server actions. The generator writes the skeleton in your repo's style, and the agent writes the real logic. The goal is code that looks like your team wrote it, on the first try.

You need about 10 minutes to set it up. Then use your agent as you normally would.

## Before you start

**Supported stacks**
- Next.js 13–16 (App or Pages Router), or React 18/19 with Vite
- Tailwind 3/4, styled-components, Emotion or MUI, or plain CSS
- shadcn on Radix or Base UI, optionally
- Node 20 or newer

**Where it has been tested**
- Claude Code, on three real Next.js projects plus the eval suite.

**Where it hasn't**
- Cursor and GitHub Copilot: the instruction files are included, but nobody has run them yet.
- A real Vite / React SPA: only test fixtures so far.

If you use one of these, your feedback is the most valuable.

**What it won't do**
- **Overwrite files.** If a file exists, nothing is written.
- **Install anything without asking.** Missing packages come with an install command, and the agent asks you first.
- **Change your config silently.** It suggests settings and writes them only if you agree.
- **Touch anything outside your repo.**

To remove it, delete the folders you copied in.

## 1. Install

Copy these from the folder you were sent into the root of your app, the folder that holds its `package.json`.

| Copy | To |
|---|---|
| `.agents/skills/codegen/` (the whole folder) | `.agents/skills/codegen/` |
| `.cursor/rules/codegen.mdc` (Cursor only) | `.cursor/rules/codegen.mdc` |
| `.github/copilot-instructions.md` (Copilot only) | add its text to yours, or copy it if you have none |

Then add this to your `AGENTS.md`, or create one. Claude Code reads it through `CLAUDE.md`, so make sure `CLAUDE.md` contains the line `@AGENTS.md`.

```markdown
## Code generation

Before creating any React or Next.js component, form field, hook, context, util, page, route, API route or server action, read and follow `.agents/skills/codegen/SKILL.md`. Scaffold with its generator instead of writing boilerplate by hand.
```

Check that it runs:

```bash
node .agents/skills/codegen/scripts/generate.mjs --detect
```

You should get JSON describing your stack (`profile`) and your code's conventions (`conventions`). If a value under `profile` looks wrong, note it for your feedback.

## 2. Let the agent set it up for your repo

Start with this prompt:

> Get the codegen skill ready for this repo so that what it generates matches how our existing code is written.

The agent reads your existing code and proposes settings for `.codegen/config.json`, with counts as evidence. For example:
- "most components are `const X = …` with `export { X }` (40 of 44 files)"
- "components live in `src/components/modules`"
- "files are named `ProductCard.tsx`"

Accept, change or reject each one. If something doesn't match how your team works, that's feedback we want.

## 3. Use your agent normally

Ask for what you'd ask for anyway. For example:

- "Add a ProductCard component with a compact variant."
- "Add an email field to the signup form."
- "Add a useDebounce hook."
- "Add a GET API route at /api/health that is never cached."
- "Add a blog/[slug] route with a loading state."

You don't need to mention the skill. The agent should run the generator, fill in the logic, then format and check the files. If it writes boilerplate by hand instead, tell us.

To see what the generator would do without the agent, use a dry run:

```bash
node .agents/skills/codegen/scripts/generate.mjs --list next
node .agents/skills/codegen/scripts/generate.mjs next component --name ProductCard --element article --variants --dry-run
```

## 4. Settings you can change

`.codegen/config.json` in your repo:

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
| `files` | component file names | `folder` (default, `product-card/product-card.tsx`), `flat`, `pascal` (`ProductCard.tsx`), `pascal-folder` |
| `profile` | correct a detected value | see the `--detect` output |

To change a template itself for your repo, copy it into `.codegen/templates/`. See the README for details.

## 5. Send feedback

Anything is useful: something it got wrong, something it got right, something it should do but doesn't. To make a problem reproducible, include:

```
Repo / stack:      (e.g. Next 15 App Router, Tailwind 4, shadcn, react-hook-form)
Agent:             (Claude Code / Cursor / Copilot, and model if you know it)
What you asked:    (the prompt)
What happened:     (files created, where, and what was wrong)
What you expected: (how your team would have written it, or a link to a similar existing file)
--detect output:   (node .agents/skills/codegen/scripts/generate.mjs --detect)
Generator command: (the generate.mjs line the agent ran, if any)
```

Especially useful:
- files in the wrong folder or with the wrong name;
- a style your team doesn't use;
- the agent ignoring the skill;
- a stack it refused but should support.

## Known limits

- **Form fields** are generated only for shadcn Form (react-hook-form). If your repo has its own form components or uses TanStack Form or Formik, the generator says so and the agent writes the field by hand, following your existing fields.
- **Context file names** (e.g. `cart-provider.tsx`) aren't configurable yet. Use a template override.
- **Agent sandboxes:** if your agent can't run `npx` (some sandboxes block it), it may report that lint or typecheck didn't run. Run them yourself before committing.
- **Not supported yet:** React 17 and older, Next 12 and older, Tailwind 2, React Aria–flavoured shadcn, and non-React stacks.
