# Folder structure, types/constants files, and Zod schemas in React + Next.js (App Router) + TypeScript (state as of 2026-10-27)

Package versions checked with `npm view` on 2026-10-27: `next` 16.4.3, `typescript` 7.0.2, `zod` 4.6.7, `@hookform/resolvers` 6.0.1, `@t3-oss/env-nextjs` 0.13.11, `valibot` 1.5.0, `arktype` 2.2.9 (direct registry query, run locally).

## 1. Folder structure: feature-based vs type-based, sharing rule, barrel files

### Takeaway
Next.js itself takes no position on structure. It offers three strategies and the building blocks (`src/`, `_private` folders, `(group)` route groups, safe colocation). The most-cited community convention is bulletproof-react's feature-based layout: `src/features/<name>/{api,components,hooks,types,utils,...}` plus shared top-level `components/ hooks/ lib/ types/ utils/ config/`, with one-way imports shared -> features -> app and no imports between features. The convention has moved firmly against barrel (`index.ts`) files in app code. A generator should therefore emit direct-path imports and should not create `index.ts` files unless the project already uses them.

### Cited Findings
**Next.js official (docs lastUpdated 2026-07-21)**
- Top-level folders: `app` (App Router), `pages` (Pages Router), `public`, and an optional `src` folder. The `src` folder "separates application code from project configuration files which mostly live in the root of a project." — [Next.js Project Structure](https://nextjs.org/docs/app/getting-started/project-structure)
- The request-interception file is now `proxy.ts` (top-level). The table no longer lists `middleware.ts`, so a generator should not scaffold `middleware.ts` for Next 16+. — [Next.js Project Structure](https://nextjs.org/docs/app/getting-started/project-structure)
- "Next.js is **unopinionated** about how you organize and colocate your project files." The docs list three strategies: (1) "Store project files outside of `app`", which keeps `app` purely for routing; (2) "Store project files in top-level folders inside of `app`"; (3) "Split project files by feature or route", with "globally shared application code in the root `app` directory" and specific code inside the route segments that use it. "The simplest takeaway is to choose a strategy that works for you and your team and be consistent across the project." — [Next.js Project Structure](https://nextjs.org/docs/app/getting-started/project-structure)
- "`components` and `lib` folders [are] generalized placeholders, their naming has no special framework significance and your projects might use other folders like `ui`, `utils`, `hooks`, `styles`." — [Next.js Project Structure](https://nextjs.org/docs/app/getting-started/project-structure)
- Colocation: "a route is **not publicly accessible** until a `page.js` or `route.js` file is added", so "project files can be **safely colocated** inside route segments." — [Next.js Project Structure](https://nextjs.org/docs/app/getting-started/project-structure)
- Private folders: `_folderName` opts "the folder and all its subfolders" out of routing. Examples given are `app/blog/_components/Post.tsx` and `app/blog/_lib/data.ts`. They are useful for separating UI logic from routing and "Avoiding potential naming conflicts with future Next.js file conventions." — [Next.js Project Structure](https://nextjs.org/docs/app/getting-started/project-structure)
- Route groups: `(folderName)` is left out of the URL. It is used to organize routes by section or team (e.g. `(marketing)`, `(shop)`) and to give a subset of routes its own layout, including multiple root layouts. — [Next.js Project Structure](https://nextjs.org/docs/app/getting-started/project-structure)
- Routing file names: `layout`, `page`, `loading`, `not-found`, `error`, `global-error`, `route` (`.js`/`.ts` only), `template`, `default`. — [Next.js Project Structure](https://nextjs.org/docs/app/getting-started/project-structure)

**bulletproof-react (alan2207)**
- `src/` tree: `app` (routes, `app.tsx`, `provider.tsx`, `router.tsx`), `assets`, `components` (shared), `config` (global config, exported env), `features`, `hooks` (shared), `lib` (preconfigured reusable libraries), `stores`, `testing`, `types` (shared types), `utils`. — [bulletproof-react project-structure.md](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md)
- Feature folder: `src/features/<feature>/{api, assets, components, hooks, stores, types, utils}`. "You don't need all of these folders for every feature." A top-level `api` folder can hold widely shared API calls. — [bulletproof-react](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md)
- On cross-feature imports: "It might not be a good idea to import across the features." Features are composed at the app level instead. This is enforced with the ESLint rule `import/no-restricted-paths`, using one zone per feature. — [bulletproof-react](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md)
- Unidirectional rule: "the features can only import from shared parts and the app can import from features and shared parts". `src/components|hooks|lib|types|utils` cannot import from `src/features` or `src/app`. — [bulletproof-react](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md)
- Barrels: these were once recommended, but "it can cause issues for Vite to do tree shaking", so bulletproof-react now recommends direct imports. — [bulletproof-react](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md)
- The guide has no Next.js-specific tree. It notes that the `app` folder "might differ based on the meta framework used." — [bulletproof-react](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md)

**When to share (colocation)**
- Kent C. Dodds (2019): "Place code as close to where it's relevant as possible". He also cites Dan Abramov's "Things that change together should be located as close as reasonable" and warns against "reusable" utility files kept away from the code that uses them. The article states no explicit "lift when N consumers" rule. — [Kent C. Dodds, Colocation](https://kentcdodds.com/blog/colocation)

**Barrel files**
- TkDodo, "Please Stop Using Barrel Files" (2024-07-26):
  - Barrels cause circular imports. He recommends the `import/no-cycle` lint rule.
  - They slow dev because every re-exported module is loaded synchronously.
  - They give no real privacy.
  - In one Next.js project, removing internal barrels took module count from more than 11k to about 3.5k (-68%); page start had been 5-10 s.
  - `optimizePackageImports` only works on "real" barrels. A single `export const foo = 5` in the barrel disables it.
  - The only place he accepts barrels is a library's entry point.
  - [TkDodo](https://tkdodo.eu/blog/please-stop-using-barrel-files)
- Vercel's numbers: importing popular React packages costs "200~800ms"; `optimizePackageImports` gave a "15%~70%" dev speedup (e.g. `@material-ui/icons` 10.2 s -> 2.9 s), about 28% faster builds, and "up to 40% faster cold starts". — [Vercel blog](https://vercel.com/blog/how-we-optimized-package-imports-in-next-js)
- `experimental.optimizePackageImports` is still badged **Experimental** (docs lastUpdated 2025-12-19). It is described for *packages*. Libraries optimized by default include `lucide-react`, `date-fns`, `lodash-es`, `@mui/material`, `@mui/icons-material`, `@headlessui/react`, `@heroicons/react/*`, `recharts`, `react-icons/*`, `rxjs`, `antd`, `@tabler/icons-react`, `effect`, `@effect/*`, and others. — [Next.js optimizePackageImports](https://nextjs.org/docs/app/api-reference/config/next-config-js/optimizePackageImports)

### Inferences
- Deterministic defaults a generator can encode, while detecting the project's actual choice:
  - Detect `src/`: if `src/app` exists, root = `src/`.
  - Detect strategy: a `features/` directory means feature-based; `app/**/_components` means route-split.
  - Feature module path: `<root>/features/<kebab-name>/{components,hooks,api,types.ts|types/,utils}`.
  - Shared: `<root>/components`, `<root>/hooks`, `<root>/lib`, `<root>/types`, `<root>/config`.
  - Route-local, non-routable files: `app/<segment>/_components/`, `_lib/`.
- A defensible "move to shared" rule: code is used by two or more features, or by a feature plus app-level code. This follows from bulletproof-react's no-cross-feature-imports rule (sharing becomes *required* once a second feature needs the code) combined with colocation-by-default. No source states a numeric threshold; this is my synthesis.
- Barrels: the generator should not create them by default. If the project already has an `index.ts` barrel in the target folder, append to it. This matches the repo's existing "register in an existing barrel" behavior (commit 83468ee).
- Next 16 renamed middleware to `proxy.ts`. Any route or middleware template must branch on the Next major version.

### Gaps
- I did not check whether `optimizePackageImports` works on local (in-project) barrels. Neither the docs nor the Vercel post say so.
- I did not fetch Robin Wieruch's or Feature-Sliced Design's structure guides. FSD (`app/pages/widgets/features/entities/shared` layers) is a known alternative but was not verified this session.

## 2. Types: location, `type` vs `interface`, enums vs unions / `as const`, naming, deriving from schemas

### Takeaway
Shared types go in `<root>/types/`; feature-scoped types go in `features/<f>/types` (bulletproof-react). Two authorities disagree on `type` vs `interface`. typescript-eslint's stylistic default is `interface`; Matt Pocock (Total TypeScript) defaults to `type` and uses `interface` only for `extends`. The generator must detect the project's choice, for example from the `@typescript-eslint/consistent-type-definitions` config. Enums are on the way out: the TS handbook suggests `as const` objects, and `erasableSyntaxOnly` (TS 5.8+) flags enums as errors. Generate `as const` objects plus a derived union, and derive data types from Zod schemas with `z.infer` instead of duplicating them.

### Cited Findings
- bulletproof-react puts shared types in `src/types` and feature types in `src/features/<f>/types`. — [bulletproof-react](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md)
- typescript-eslint `consistent-type-definitions`: the default option is `'interface'`, and the rule is in the `stylistic` shared config. Rationale: "Interfaces are the prevailing, most common style in TypeScript." — [typescript-eslint](https://typescript-eslint.io/rules/consistent-type-definitions/)
- Matt Pocock: "I'd recommend you use `type` by default. It's a little more flexible and a little less surprising." Also: "Interfaces are still my recommendation for object inheritance". `extends` interfaces are cached by name, while `&` intersections are not. Declaration merging "can lead to really confusing bugs." — [Total TypeScript](https://www.totaltypescript.com/type-vs-interface-which-should-you-use)
- TS Handbook, "Objects vs Enums": "In modern TypeScript, you may not need an enum when an object with `as const` could suffice". The pattern is `const ODirection = { Up: 0, ... } as const; type Direction = typeof ODirection[keyof typeof ODirection];`. The argument for it: "it keeps your codebase aligned with the state of JavaScript." — [TS Handbook: Enums](https://www.typescriptlang.org/docs/handbook/enums.html)
- `erasableSyntaxOnly` (TS 5.8) flags enums, namespaces, and class parameter properties as errors. Matt Pocock: "I think the TypeScript team is looking toward a future where these syntaxes will no longer be used" (written around Jan 2025). — [Total TypeScript: erasableSyntaxOnly](https://www.totaltypescript.com/erasable-syntax-only); [TS 5.8 announcement](https://devblogs.microsoft.com/typescript/?p=4631)
- Node's type stripping cannot handle enums, which need a JS transform. — [SitePoint on TS 5.8 / Node](https://www.sitepoint.com/typescript-58-migration-erasable-syntax-node-23-production/) (secondary source; sources disagree on the exact Node version where stripping became default)
- Zod 4 deprecates `z.nativeEnum()`; pass the enum (or object) directly to `z.enum()`. — [Zod v4 changelog](https://zod.dev/v4/changelog)
- The `npm` latest `typescript` is 7.0.2 (registry query, 2026-10-27), i.e. the native (Go) compiler line. — npm registry

### Inferences
- Generator defaults:
  - Use `type` aliases for props and data shapes, unless the project lint config sets `consistent-type-definitions: ['error', 'interface']` or the existing code is mostly interfaces.
  - Name props `<Component>Props`; this is common practice but not verified with a source this session.
  - Use no `I` prefix.
  - Use string-literal unions or an `as const` object plus `type X = (typeof X)[keyof typeof X]`. Never generate `enum` (it breaks under `erasableSyntaxOnly` and Node type stripping).
- For any entity that has a Zod schema, emit `export type User = z.infer<typeof userSchema>` next to the schema. Do not write a separate hand-written type.
- `types.ts` per feature (single file) vs `types/` folder: bulletproof-react uses a folder, but a single `types.ts` is a reasonable default for small features. Detect which one already exists.

### Gaps
- I did not fetch typescript-eslint `naming-convention` or the TypeScript team's coding guidelines for the "no `I` prefix" rule. The convention is widely held, but this session has no citation for it.
- I found no authoritative source for the `Props` suffix naming. Treat it as community convention.
- I did not verify whether TS 7 changes any defaults relevant here (e.g. `erasableSyntaxOnly` default).

## 3. Constants: file naming, location, casing, `as const`, `satisfies`

### Takeaway
I found no authoritative consensus source this session. The best grounded pieces are bulletproof-react's `src/config` (global config and exported env) and the TS handbook's `as const` object pattern. Casing (UPPER_SNAKE vs camelCase) is a project-detected choice.

### Cited Findings
- bulletproof-react `src/config`: "global configuration, exported env variables". — [bulletproof-react](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md)
- `as const` objects as the enum replacement, with a derived union type. — [TS Handbook: Enums](https://www.typescriptlang.org/docs/handbook/enums.html)
- Next.js lists `lib`, `utils`, etc. as arbitrary placeholder names. — [Next.js Project Structure](https://nextjs.org/docs/app/getting-started/project-structure)

### Inferences
- Generator default: `<root>/lib/constants.ts` (shared) or `features/<f>/constants.ts` (feature), with `export const X = {...} as const`. When a value must conform to a type but keep its literal types, use `satisfies` (e.g. `as const satisfies Record<Status, string>`).
- Casing: detect from existing code. Common practice is UPPER_SNAKE for primitive module-level constants (`MAX_UPLOAD_MB`) and PascalCase or camelCase for `as const` lookup objects that double as types (`Status` / `Status` type). Do not hardcode one.
- Env-derived constants belong in `env.ts` (see section 4), not in `constants.ts`.

### Gaps
- I did not fetch sources on `satisfies` (TS 4.9 release notes) or on UPPER_SNAKE vs camelCase (e.g. typescript-eslint `naming-convention` examples, Google TS style guide). Claims above about casing are unsourced common practice.

## 4. Zod: version, file and schema naming, shared form/server schema, env validation, boundary parsing, alternatives

### Takeaway
Zod 4 has been the `"zod"` root export since 4.0.0 (2025-07-08); the latest is 4.6.7. Import from `"zod"`. `"zod/v4"` still works permanently but is only needed for packages that must support both v3 and v4. Many APIs changed from v3, and the official Next.js forms guide (updated 2026-10-06) still shows Zod 3 APIs, so a generator must not copy it verbatim. Share one schema between `zodResolver` and the server action, but type `useForm` with input and output types. Validate env with `@t3-oss/env-nextjs` in `src/env.ts`, imported from `next.config.ts`. Standard Schema lets the same code accept Valibot or ArkType through `standardSchemaResolver` and t3-env.

### Cited Findings
**Version and imports**
- "The package root (`"zod"`) now exports Zod 4" (update dated July 8, 2025). `"zod/v4"` and `"zod/v4-mini"` imports "will continue to work forever". `"zod/mini"` is the new Mini path, and `"zod/v3"` exports Zod 3. — [Zod versioning](https://zod.dev/v4/versioning)
- Latest `zod` on npm is 4.6.7 (registry query, 2026-10-27). Earlier datapoints: 4.3.6 as of 2026-01-22, 4.4.0 around 2026-04-29. — npm registry; [SourceForge mirror](https://sourceforge.net/projects/zod.mirror/files/v4.4.0/)

**Zod 3 -> 4 changes a generator must emit correctly**
- `message` is replaced by `error`. `invalid_type_error`, `required_error`, and `errorMap` are dropped.
- Top-level formats replace string methods: `z.email()`, `z.uuid()`, `z.url()` instead of `z.string().email()`.
- `z.strictObject()` / `z.looseObject()` replace `.strict()` / `.passthrough()`. `.merge()` is deprecated in favor of `.extend()`.
- `z.record(key, value)` requires two arguments.
- `z.nativeEnum` is replaced by `z.enum`.
- `.default()` now short-circuits on `undefined` and must match the *output* type; `.prefault()` gives the old behavior.
- `z.coerce.*` input type is now `unknown`.
- `z.function()` is no longer a schema.
- [Zod v4 changelog](https://zod.dev/v4/changelog)
- Error formatting: `z.flattenError(err)` returns `{ formErrors, fieldErrors }` for flat forms. `z.treeifyError()` returns nested errors. `z.prettifyError()` returns a string. `z.formatError()` is "Deprecated. Use `z.treeifyError()` instead." — [Zod error formatting](https://zod.dev/error-formatting)
- **Outdated official example:** the Next.js Forms guide (lastUpdated 2026-10-06) still writes `z.string({ invalid_type_error: 'Invalid Email' })` and `validatedFields.error.flatten().fieldErrors`. These are Zod 3 APIs. The guide recommends server-side validation "with a schema validation library like Zod or Valibot" via `schema.safeParse(...)`, returning errors to `useActionState`. It also warns: "Always verify authentication and authorization inside each Server Action." — [Next.js Forms guide](https://nextjs.org/docs/app/guides/forms)

**react-hook-form**
- `import { zodResolver } from '@hookform/resolvers/zod'` works with `zod` or `'zod/v4'`. Either omit the generics (types are inferred) or pass all three: `useForm<z.input<typeof schema>, unknown|any, z.output<typeof schema>>({ resolver: zodResolver(schema) })`. A single generic `useForm<T>` conflicts with the resolver. A field with `.default()` is optional in `z.input` but required in `z.output`/`z.infer`. — [@hookform/resolvers README](https://github.com/react-hook-form/resolvers)
- `standardSchemaResolver` from `@hookform/resolvers/standard-schema` accepts any Standard Schema validator. — [@hookform/resolvers README](https://github.com/react-hook-form/resolvers)
- Latest `@hookform/resolvers` is 6.0.1 (registry, 2026-10-27).

**Env validation (t3-env)**
- File: `src/env.ts`, imported as `~/env`. A split `src/env/server.ts` + `src/env/client.ts` is recommended if variable names are sensitive.
- API: `createEnv({ server: { DATABASE_URL: z.url() }, client: { NEXT_PUBLIC_...: z.string().min(1) }, experimental__runtimeEnv: {...client vars only} })` for Next >= 13.4.4. Use `runtimeEnv` (strict) for older versions.
- "We recommend you importing your newly created file in your `next.config.js`." For Next 16+ this is a plain `import "./app/env"`; older versions use jiti.
- Any Standard Schema validator works.
- [t3-env Next.js docs](https://env.t3.gg/docs/nextjs)

**Standard Schema**
- Standard Schema is "a set of interfaces that standardize the provision and consumption of shared functionality in the TypeScript ecosystem". Its helper types `StandardSchemaV1.InferInput<S>` / `InferOutput<S>` are library-agnostic. The landing page does not list implementers. — [standardschema.dev](https://standardschema.dev/)
- Latest versions: `valibot` 1.5.0, `arktype` 2.2.9 (registry, 2026-10-27).

### Inferences
- Schema file naming: no official Zod convention was found. Pragmatic generator default is colocated `features/<f>/schemas.ts` (or `schema.ts`), or `<name>.schema.ts` next to the form/action. Detect `*.schema.ts` vs `schemas/` in the existing code.
- Schema naming: `camelCase` + `Schema` suffix (`createUserSchema`). Derive types next to it: `export type CreateUserInput = z.input<typeof createUserSchema>` and `export type CreateUser = z.output<typeof createUserSchema>` (or `z.infer`, which equals output).
- Shared schema pattern: the schema file must have no `'use server'` or `'use client'` directive, so both the client form (`zodResolver(schema)`) and the server action (`schema.safeParse(Object.fromEntries(formData))`) can import it. Re-validate on the server and return `z.flattenError(result.error).fieldErrors` to `useActionState`.
- Boundary parsing: run `schema.parse`/`safeParse` on `fetch` JSON in route handlers, server actions, and API clients. Do not cast with `as`.
- Abstraction for alternatives: detect the installed validator (zod / valibot / arktype) from `package.json`. Emit `standardSchemaResolver` and `StandardSchemaV1.InferOutput` when not using Zod, or always if the generator wants one code path. Use `zodResolver` + `z.infer` for Zod projects, since that is the dominant idiom.
- Detect `zod` major version: `^3` needs v3 syntax (`message`, `z.string().email()`); `^4` needs v4 syntax. Projects pinned to `zod@3.25.x` can use `"zod/v4"`.
- Env: emit `src/env.ts` (or `env.ts` without `src`) with `createEnv`, and add `import "./src/env"` to `next.config.ts` (Next 16 needs no jiti). Server-only secrets go under `server`; `NEXT_PUBLIC_*` go under `client` and in `experimental__runtimeEnv`.

### Gaps
- I did not verify on its own docs page whether `@hookform/resolvers` 6.x dropped Zod 3 support or changed resolver typing.
- I could not confirm the exact list of Standard Schema implementers or consumers (tRPC, TanStack Form, next-safe-action) from a primary source this session.
- I did not verify t3-env details for `shared`, `emptyStringAsUndefined`, or `NEXT_PUBLIC_` prefix enforcement; the fetched page does not cover them.
- No official "schema file naming" convention exists in the Zod docs as far as I found.
