# codegen 0.4.0: project profile and targets — design

Agreed on 2026-10-27. Second of the projects that came out of the plop review. It comes before the new generator families (project 3 in the updated order), which will rely on it. Research behind it: `reports/React Next codegen conventions 2026.md`.

## Intent

The team wants one baseline that adapts to each repo. Repos differ in framework, router, React version, styling system and library versions, and some are legacy. Today the generator assumes one stack: React 19 typing, Tailwind with shadcn on Radix, `cn` from `lib/utils`, and the Next App Router. Between July and October 2026, shadcn moved to Base UI by default and moved `cn` into its own package, Next 16 shipped, and Zod 4 became the default. Templates written for one version now produce code that looks right but is wrong for the others.

This project makes the generator **detect first, then generate**. It reads a small set of named targets from the repo, lets the user or agent correct them, refuses combinations it doesn't support, and picks a template variant per target. When a library ships a breaking change later, the fix is one new variant plus its test fixture. Existing projects keep generating exactly what they did before.

## Goals

1. A **project profile**: one detection pass that yields a fixed set of named dimensions (the support matrix below), each with its value and where the value came from.
2. **Overrides**: any dimension can be set in `.codegen/config.json` or on the command line, and those win over detection.
3. **Variants**: files and actions in `pack.json` can be conditioned on profile values, so templates don't fill up with `{{#if}}` blocks for every version.
4. **Declared support**: a generator states the profile values it works with. Anything else is refused with a message naming what is supported. Nothing outside the matrix is generated on a guess.
5. **The existing generators upgraded to the matrix**:
   - React 18 component refs
   - Base UI vs Radix polymorphism
   - `cn` from the project's actual imports
   - CSS-in-JS component variants
   - the Next Pages Router
   - the server-action signature
6. **`check-tokens` gets a CSS-in-JS mode**, so styled-components and Emotion projects get the same "tokens only" guarantee as Tailwind projects.

## Non-goals

- New generator families: data fetching, stores, schemas, tables, dialogs, auth. That's the next project, built on this profile.
- React 17 or earlier, Next 12 or earlier, Tailwind 2. Decided: no support for stacks around six years old.
- Remix, Gatsby, Preact, vanilla-extract, Stitches, CSS Modules, React Aria–flavoured shadcn. These are edge cases left out.
- Older majors of data libraries: React Query v4, Zustand v4, react-redux 8. The next project will support current majors only.
- A visual or interactive setup wizard. Asking the user is a separate project.

## Anti-goals

- Generating code for a version the template wasn't written for. Refusing is always better.
- A detection miss that the user can't see or correct.
- Changing the output for any repo that 0.3.0 already handled correctly, unless this doc lists that change (Goal 5).

## Support matrix

| Dimension | Values | Detected from | Main template differences |
|---|---|---|---|
| `app` | `next-app`, `next-pages`, `react-spa` | `next` in deps plus the presence of `app/` / `src/app` vs `pages/` / `src/pages`; otherwise `react-spa` when `react` is a dep | RSC vs none, routes, data fetching |
| `next` | `13`, `14`, `15`, `16` (16 = 16 and later) | `next` major | sync vs async `params` (≤14 vs ≥15); `middleware.ts` vs `proxy.ts` (≥16, used by later generators) |
| `react` | `18`, `19` | `react` major | `forwardRef` (18) vs `ref` as a regular prop (19) |
| `styling` | `tailwind-3`, `tailwind-4`, `styled-components`, `emotion`, `plain` | `tailwindcss` major; else `styled-components`; else `@emotion/react` or `@emotion/styled` (MUI pulls these in); else `plain` | `className` + `cn` + cva vs `styled.*` with theme values. `plain` (plain CSS, Sass, CSS Modules) keeps today's `className` output: `cn` and cva only when installed, and no token check beyond `TODO(codegen)` |
| `primitives` | `radix`, `base`, `none` | `components.json` `style` prefix: `base-*` → `base`; `radix-*`, `default`, `new-york` → `radix`; no `components.json` → `none` | `asChild` + `Slot` vs a `render` prop; shadcn-only generators require not `none` |
| `cn` | an import path, or `none` | the `cn` import in existing `components/ui/*` files; then `components.json` `aliases.utils`; then `lib/utils` exporting `cn` | the import line |
| `zod` | `3`, `4` | `zod` major (3.25.x counts as `3`) | recorded only; used by schema generators next |
| `table` | `8`, `9` | `@tanstack/react-table` major | recorded only; used by the table generator next |
| `srcDir` | `true`, `false` | as today (`resolveOut`) | output paths |

**Mixed Next repos.** `next-app` and `next-pages` repos are common mid-migration (both `app/` and `pages/`). Detection then picks `next-app`, and `--profile app=next-pages` targets the Pages Router.

**Detection reads installed versions.** It takes the version from `node_modules/<pkg>/package.json` when that exists, and otherwise the lowest version in the `package.json` range. In a monorepo it walks up to parent `node_modules` folders.

**When there is no signal at all** (for example `react` isn't a dependency, as in a bare repo), the dimension falls back to its newest supported value (`react` 19, `next` 16), with source `"default"`. That keeps 0.3.0's behavior for repos it already handled, and the output shows the guess. `unknown` is used only when a signal exists but can't be read (an unparseable version range), and generators that need that dimension refuse.

**Out of range is refused.** For example, React 17, Next 12, Tailwind 2, or a `components.json` style with the `aria-` prefix. Any generator that depends on that dimension refuses with: `<dimension> <found> is not supported (supported: …). Set it in .codegen/config.json if detection is wrong.` Generators that don't depend on it (e.g. `util`) still run.

## Design

### Profile and overrides

- **Precedence**: `--profile` on the command line > `.codegen/config.json` `profile` > detection.
- **Command line**: `--profile app=next-pages,styling=emotion` (comma-separated `key=value` pairs). An unknown key or value is an error that lists the allowed ones.
- **Repo file**: `.codegen/config.json` is `{ "profile": { "styling": "emotion" } }`. It is the first use of a repo config file. Repo generators and defaults will extend it in the distribution project. Unknown top-level keys are errors, so typos surface.
- **Templates** see the profile as `profile.<dim>`, plus a boolean map `profileIs.<dim>.<value>` (the same pattern as `controlIs`). Examples: `{{#if profileIs.react.18}}`, `{{#if profileIs.styling.emotion}}`.
- **Output**: every JSON result, success or error, includes `profile`, mapping each dimension to `{ value, source: "detected" | "config" | "flag" }`.
- **Inspection**: `generate.mjs --detect [--root …]` prints just the profile, so an agent can check the stack before it chooses a generator.

### Variants and declared support in pack.json

- **`when` gains an object form**: `"when": { "styling": ["styled-components", "emotion"], "react": "18" }`. Every key must match, and an array means any of its values. The string form keeps working (a truthy context key). `when` works on `files` entries and on actions.
- **`supports` on a generator**: `"supports": { "styling": ["tailwind-3", "tailwind-4"], "primitives": ["radix", "base"] }`. The generator refuses if the profile is outside these lists, and the message names the dimension, the value found and the supported values. When `supports` is absent, the generator accepts any profile value except `unknown` for dimensions its templates reference. Since that is hard to compute, the builder may instead require `supports` on every generator; see "Left to the builder".
- **Template variants are files**: a variant gets its own template file selected by `when`. Example: `component/component.tsx.tpl` for Tailwind and `component/component.styled.tsx.tpl` for CSS-in-JS. Small differences stay as `{{#if profileIs…}}` blocks or partials. **The rule of thumb**: if more than about a third of a template differs, make a separate variant file.

### Upgrading the existing generators

1. **Component refs (`react`)**:
   - React 19 keeps today's output: `ref` arrives as a regular prop, since `ComponentProps<'el'>` includes it.
   - React 18 wraps the component in `forwardRef<HTMLElement…, Props>` and sets `displayName`.
   - This lives in one partial, so every component-like template shares it.
2. **Polymorphism (`primitives`)**:
   - `radix` keeps `Slot` + `asChild`, with the package detected as today.
   - `base` emits Base UI's `render` prop instead of `asChild`. The builder verifies the API **once, while building**, against the current stable Base UI 1.x docs and package (`@base-ui/react`, using `useRender` or its documented equivalent). It then pins that package as the `requires` of `--as-child` on `base`, the same way Radix is pinned today. If the builder can't verify it, `--as-child` on `base` is refused with a message, and the rest of the component still generates.
   - `none` with `--as-child` uses Radix Slot if it is installed, as today; otherwise it fails with an install hint, as today.
3. **`cn`**: detect from existing `components/ui/*` imports first, as in the matrix. `--cn` still overrides.
4. **CSS-in-JS component variant** (`styling` = `styled-components` or `emotion`). A separate template:
   - `styled.<element>` (or `styled('<element>')` for Emotion) with values read from `theme` (`${({ theme }) => theme…}`).
   - The import follows the library: `styled-components`, `@emotion/styled`, or `@mui/material/styles` when `@mui/material` is installed, so MUI repos get MUI's typed `theme.palette…`. Same template, different import line, picked by a detected `mui` flag in the context (not a matrix dimension).
   - Visual variants become transient props (`$variant`, `$size`) instead of cva.
   - No `cn` or `className` merging.
   - In `next-app`, the file is always `'use client'`, because CSS-in-JS needs client rendering in the App Router.
   - `--variants` and `--element` behave as today. `--as-child` is refused, because CSS-in-JS uses the `as` prop; the template documents `as` in a TODO instead.
5. **`form-field`** declares `supports: { primitives: ["radix"], styling: ["tailwind-3", "tailwind-4"] }`. It is refused elsewhere, because its template is built on the Radix-era shadcn `form.tsx` (`FormControl` as a `Slot`, `onValueChange`, `onCheckedChange`). A Base UI variant waits until that API is verified, and the newer shadcn `field` primitive is already on the roadmap.
6. **Next Pages Router (`app = next-pages`)**:
   - `component`: no RSC notes and no `'use client'`.
   - `client-component`: same output as `component`.
   - `route`: emits `pages/<route>.tsx`, where dynamic segments become `[slug].tsx` and an index becomes `index.tsx`. It is a default-exported page with typed props and a TODO for `getServerSideProps`/`getStaticProps`. `--with-layout`, `--with-loading` and `--with-error` are refused, because the Pages Router doesn't have them.
   - `api-route`: emits `pages/api/<route>.ts` with a `NextApiRequest`/`NextApiResponse` handler.
   - `server-action`: refused, because Server Actions need the App Router.
7. **`react-spa`**: the `react` pack, unchanged apart from items 1–4.
8. **Server action signature**:
   - `(prevState: State, formData: FormData)`, so it works with `useActionState`.
   - The TODOs stay.
   - **Breaking change** for anyone already calling a generated action with `(formData)`. It only affects newly generated files.
9. **Pack selection** stays `next` or `react` (no renames, so commands and `.codegen/templates/<pack>` overrides keep working). The profile picks the variant inside the pack, and `SKILL.md` step 1 says to run `--detect` first.

### check-tokens: CSS-in-JS mode

When `styling` is `styled-components` or `emotion`, `check-tokens` also scans styled template literals (`styled.x\`…\``, `styled(X)\`…\``, `css\`…\``), object styles passed to `styled`, and `sx={{…}}` / `css={{…}}` props. It flags:
- color literals (hex, `rgb()`, `hsl()`, `oklch()`)
- `px`, `rem` and `em` lengths other than `0` and `1px`
- numeric font sizes and font weights

Values that reference `theme` (`theme.…`, `({ theme }) =>`) are allowed. `tokens-allow:` works as today. Tailwind rules keep running for Tailwind projects. In CSS-in-JS projects only the CSS-in-JS rules and the `TODO(codegen)` rule run. The theme object is not evaluated: the rule is "reference the theme", not "use a key that exists". That is a known limit, noted in the README.

### Docs, tests, release

- **Tests**:
  - Fixture repos per dimension value. A detection test covers each matrix row, including `unknown` and refused values, and one covers config/flag precedence.
  - A matrix test renders the component across `react` × `styling` × `primitives` × `--variants`/`--as-child`, extending today's element matrix test.
  - Pages Router route and api-route tests.
  - CSS-in-JS check-tokens tests.
  - A test that 0.3.0 output is unchanged for a default React 19 + Tailwind 4 + Radix repo.
- **SKILL.md**: run `--detect` first; read `profile` in every output; how to correct detection; what a refusal means (tell the user and don't hand-write around it).
- **README**: the support matrix, `.codegen/config.json`, `when` objects, `supports`, the CSS-in-JS token rules and their limits.
- **CHANGELOG / VERSION 0.4.0.** Breaking changes:
  - server-action signature
  - `--as-child` refused on CSS-in-JS
  - `form-field` refused without shadcn
  - output gains `profile`
- **Evals**: bump the fixture's `next` to `^16` (it pins `^15.1.0` today), keeping React 19 + Tailwind 4. Keep its `components.json` style coherent with whichever primitives it pins.

## Calls I made (not discussed)

1. The profile is overridden through one `--profile key=value,…` flag and `.codegen/config.json`, not one flag per dimension, which keeps the option list small.
2. Pack names stay `react` and `next`; a pack name doesn't encode the app type.
3. Mixed Next repos default to the App Router.
4. Installed versions win over the `package.json` range.
5. CSS-in-JS covers styled-components and Emotion, with MUI treated as Emotion. CSS Modules is out.
6. `--as-child` is refused for CSS-in-JS (use `as`) and for Base UI if its API can't be verified.
7. `form-field` stays shadcn-only.
8. The CSS-in-JS token check requires theme references but does not check that theme keys exist.
9. Repos with no Tailwind or CSS-in-JS get `styling: plain`, which is today's output, instead of being refused.
10. Dimensions with no signal fall back to the newest supported value, shown with source `default`.
11. Base UI polymorphism is verified once while building, not per repo.
12. `form-field` is Radix + Tailwind only for now.
13. MUI repos import `styled` from `@mui/material/styles`.
14. `zod` and `table` are detected now, ahead of the generators that will use them, so the profile is complete in one release.

## Left to the builder

- **Code layout**: the internal module layout (e.g. `lib/profile.mjs`) and the exact error wording.
- **`supports` for generators that declare none**: whether such a generator infers its dimensions from its templates, or every generator must declare `supports`. Requiring it is acceptable.
- **CSS-in-JS rule internals**: how the rules find template literals and object styles. Regex over lines is acceptable if the tests cover the common shapes.
- **Template wording**: exact template text, kept consistent with the existing templates.

## Updated roadmap

1. ~~Actions, helpers, partials~~ (0.3.0, done)
2. **Project profile and targets** (this doc)
3. New generator families on top of the profile: types/constants, zod schemas, API client/DAL, React Query, stores, icons, dialogs, tables, layouts, auth (proxy vs middleware)
4. Split or inline, and asking the user when unsure
5. Theme-aware token check (classes must exist in the theme)
6. Structure check in CI (also covers moved files)
7. Distribution: central repo, per-developer install, repo config (extends `.codegen/config.json`)
