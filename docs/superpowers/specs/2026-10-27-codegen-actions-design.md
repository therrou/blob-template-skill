# codegen 0.3.0: plop-style actions, helpers, partials — design

Agreed on 2026-10-27. First of six projects that grew out of a review against plop (see "Roadmap context" at the end). This is the source of truth for the 0.3.0 plan.

## Intent

The team wants every developer and agent to build things the same way. Each project still keeps its own libraries and setup. The generator encodes that shared way. Today a generator can only **create** files, so anything that touches an existing file stays manual and drifts between developers: registering an export in a barrel, wiring a provider, adding a route. Plop solves this with a small set of actions. This project brings those actions in, with the guarantees this generator already has: zero dependencies, JSON output, all-or-nothing writes, no writes outside the repo root.

Later projects need this one. New generator families (data fetching, stores, dialogs, auth) have to edit existing files, and shared template parts (partials) keep their templates small.

## Goals

1. A generator describes its work as an ordered list of **actions**: `add`, `addMany`, `modify`, `append`, `custom`.
2. Templates can call **helpers** (`{{kebab x}}`) and include **partials** (`{{> name}}`), both built-in and pack-defined. A repo can add its own helpers.
3. Every run stays **all-or-nothing**: the whole run is planned in memory, and if any action fails, nothing on disk changes. If a write fails partway through, created files are removed and modified files are restored.
4. `--dry-run` shows exactly what would be created, modified and skipped.
5. One built-in use that proves the actions in real generators: components and form fields register themselves in an existing `components/index.ts` barrel.

## Non-goals

- Interactive prompts. Input stays as CLI flags. Asking the user when the agent is unsure is project 3.
- Repo-defined generators and repo defaults (a repo `.codegen/` config). That belongs to the install/customization project.
- Move, rename or delete actions. They belong with the structure check (project 5).
- Any npm dependency (no Handlebars, no glob library).
- New generator families. That is project 2.

## Anti-goals (a failure even if it "works")

- A `modify` or `append` that silently does nothing because its pattern did not match.
- A run that leaves the repo half-changed.
- An action that writes outside the repo root.
- A template syntax change that breaks existing templates or JSX (`style={{ color: 'red' }}` must stay untouched).

## Design

### Actions in pack.json

A generator gets an `actions` array. The existing `files` array stays valid: each entry is shorthand for an `add` action, and `files` runs before `actions` when both are present. Every action supports `when` (same semantics as today's `files[].when`: a context key that must be truthy).

**Paths** are rendered templates:
- By default, relative to the generator's output directory (`out`, or `--out`).
- A path starting with `/` is **root-relative**: `/app/layout.tsx`. Its first directory goes through the same `src/` rule as `out` (`resolveOut`), so `/app/layout.tsx` lands on `src/app/layout.tsx` in a repo that uses `src/app`. This is how actions reach files elsewhere, such as a layout or a router, and it still works when `--out` is passed.
- `custom` changes follow the same rules.
- Every path is still checked to be inside the root.

So with `--out components/forms`, the barrel append targets `components/forms/index.ts`: the barrel of the folder being written into. That is intended.

**Template content** has two forms:
- `template`: a template **file**, referenced exactly as today (pack-relative, `@pack/...` borrowing, repo override in `.codegen/templates/`, override check, listed under `overridden`).
- `text`: an **inline** template string, for one-liners that no repo needs to restyle.

Each action takes exactly one of them. `files[].template` keeps its current meaning.

| Action | Fields | Behavior |
|---|---|---|
| `add` | `path`, `template`, `skipIfExists?` | Creates a file. If the file exists: error (conflict), or skipped when `skipIfExists`. |
| `addMany` | `templates` (a template directory), `path` (base directory) | Adds every `*.tpl` under the directory, keeping its relative layout. File and directory names are rendered too (`{{name.kebab}}.tsx.tpl` → `user-card.tsx`), and the `.tpl` suffix is dropped. Same conflict rule as `add`. A repo override applies per file. |
| `modify` | `path`, `pattern`, `template` | Reads the file, replaces the **first** match of `pattern` (a JS regex source string, `m` flag) with the rendered template. `$&`, `$1`… work as in `String.replace`. If the pattern does not match: error. |
| `append` | `path`, `pattern?`, `template`, `unique?` (default `true`), `separator?` (default `"\n"`) | Inserts the rendered template after the first match of `pattern`, or at the end of the file when there is no pattern. When `unique` is set and the rendered text is already in the file, the action is skipped (re-running a generator does not duplicate lines). A pattern that does not match is an error. |
| `custom` | `module` | Runs `export default function (ctx, api)` from a `.mjs` file in the pack (`packs/<pack>/actions/`). It **returns** a list of changes (`{ path, content }`, a create or a full replacement). It never writes itself, so dry-run, conflicts and rollback still apply. `api` exposes `read(path)` (sees earlier planned changes), `exists(path)`, `render(template, ctx)`. |

Shared by `modify` and `append`:
- `skipIfMissing?`: when the target file does not exist, skip instead of failing. Default: error.
- They operate on the **planned** content. An earlier action in the same run (e.g. `add` with `skipIfExists`, then `append` to it) is visible to later ones.

Actions run in order. A file touched by several actions is written once, with its final content.

### Templates: helpers and partials

- **Helpers**: `{{helper path}}`, one argument, a context path. Built-ins: `pascal`, `camel`, `kebab`, `snake`, `constant` (UPPER_SNAKE), `lower`, `upper`. Names also get `name.snake` and `name.constant`, because constants files (project 2) need them. Pack helpers live in `packs/<pack>/helpers.mjs`. Repo helpers live in `.codegen/helpers.mjs`. Both export an object of `(value) => string` functions. Precedence: repo, then pack, then built-in. An unknown helper is an error, like an unknown variable.
- **Partials**: `{{> partial-name}}` inserts `packs/<pack>/templates/_partials/<partial-name>.tpl`, rendered with the same context. `{{> @react/partial-name}}` borrows from another pack. Repo overrides apply (`.codegen/templates/<pack>/_partials/...`). Partials can nest. A cycle is an error.
- **Resolution follows the template's owner.** A template borrowed with `@react/...` resolves its partials and pack helpers from `react`, even when the `next` pack runs it, the same way the template itself is borrowed. Repo overrides of partials live under the owner (`.codegen/templates/react/_partials/...`). Repo helpers always win. The partial a template sees never depends on which pack runs it, so borrowed templates can't break.
- **Syntax safety**: a helper call is only `{{word path}}`, where both are identifiers or dot paths. JSX object literals contain `:` or `,`, so they never match. Existing templates render unchanged.

### Execution and safety

1. Validate options (unchanged).
2. Build the context (unchanged), add helpers and partials.
3. Plan: walk the actions in order against an in-memory view of the file system. Each step records `{ path, kind: create | modify, before?, after }` or a skip with its reason.
4. Check: every path is inside the root. Every create targets a path that doesn't exist on disk (unless skipped). Every modify has a target file.
5. Write: creates use the `wx` flag. A modify re-reads the file and fails if it changed since planning. On any failure: delete created files and empty dirs, and restore modified files from `before`.

### Output

```json
{
  "ok": true,
  "created": ["components/user-card/user-card.tsx", "components/user-card/index.ts"],
  "modified": ["components/index.ts"],
  "skipped": [{ "path": "components/index.ts", "action": "append", "reason": "already present" }],
  "overridden": [],
  "todo": [ … ],
  "next": [ … ]
}
```

`--dry-run` returns the same keys plus `changes`: for each modified file, the inserted or replaced text (not a full diff). `todo` covers created files and the text inserted into modified files. The old `files` key in dry-run output is replaced by `created`. That is a breaking change for scripted callers and is noted in the CHANGELOG.

### First real use: barrel registration

`component`, `client-component` and `form-field` (react and next) get an `append` action on `index.ts` in the generator's output directory. Its template file is `export * from './{{name.kebab}}';`, so a repo can override the quote and semicolon style. The action has `skipIfMissing: true`. Repos with a `components/index.ts` barrel get the export. Repos without one see no change, because the generator doesn't create a barrel the repo doesn't use. **My call.**

### Docs and release

- `SKILL.md` step 5 and 6: read `created`, `modified` and `skipped`. Run `check-tokens` on created **and** modified files.
- README "Adding a pack or generator": document actions, helpers and partials, with one example per action.
- `VERSION` 0.3.0, CHANGELOG entry (breaking: dry-run `files` → `created`).
- Tests: one engine test per action, including its error paths. Plus: rollback restores a modified file, `unique` append is idempotent, helper and partial precedence, a partial cycle is an error, JSX `{{ }}` is untouched, `custom` cannot write outside the root, `files` still works.

## Calls I made (not discussed)

- `custom` actions return changes instead of writing, so they keep dry-run and rollback. Plop lets them do anything.
- `modify` and `append` fail by default when the pattern or file is missing. `skipIfMissing` is opt-in.
- Helpers take one argument. Plop allows several. One covers casing, and more can come when a template needs it.
- Repo-level helpers are in. Repo-level generators wait for the customization project.
- The barrel append only runs when a barrel already exists.
- Paths are out-relative by default, and a leading `/` makes them root-relative, with the `src/` rule applied.
- `template` is a file (overridable), and `text` is inline.
- Borrowed templates resolve partials and helpers from the pack that owns them.

## Left to the builder

Internal module layout, the in-memory file-system shape, exact error messages, and the format of dry-run `changes`.

## Roadmap context

1. **Actions, helpers, partials** (this doc).
2. New generator families: types/constants, zod schemas, API clients/services, React Query, stores, icons, dialogs, tables, layouts, auth. Each one adapts to the libraries the project already uses.
3. Split or inline: the generator decides whether a piece goes in its own file, and asks the user when unsure (the user's points 3 and 4).
4. Deterministic design-system check: `check-tokens` accepts only classes defined in the theme.
5. Structure check: files are in the right place, run in CI, and catch moved or hand-written files.
6. Distribution: one central skill repo, and each developer installs it with the template sets their project needs, plus repo customization (`.codegen/` config, repo generators, defaults).
