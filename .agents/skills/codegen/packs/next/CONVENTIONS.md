# Next.js conventions (App Router)

Read `../react/CONVENTIONS.md` first. Everything in it applies here. These are the Next-specific rules.

## Server Components first

- Everything is a Server Component unless it needs state, effects, event handlers, or browser APIs.
- Put `'use client'` on the **smallest leaf** that needs it, never on a page or layout. Pass server-fetched data down as plain, serializable props.
- Server-only code (secrets, DB, server SDKs) lives in `lib/` with `import 'server-only'` (`util --server-only`).
- Hooks and context are client-only. The generator marks them accordingly.
- Form fields are Client Components (the generator marks them). Keep the form itself a small client leaf and submit to a Server Action.

## Routes (`app/`)

- Route folders are kebab-case. The special files are `page`, `layout`, `loading`, `error` and `not-found`, each with a default export.
- Fetch data in the page (a Server Component), in parallel where possible (`Promise.all`).
- Next 15+: `params` and `searchParams` are Promises, so `await` them. The generator detects the Next version from `package.json`.
- `loading.tsx` shows a skeleton that matches the layout. `error.tsx` is a client component that reports the error and offers `reset`.
- Static titles use `export const metadata`. Titles that depend on params use `generateMetadata`.
- Use route groups `(name)` to organize folders without affecting the URL.

## Mutations

- Use Server Actions (`'use server'`) for mutations triggered from the UI. Every action must:
  1. validate input with the repo's schema library
  2. check authentication and authorization
  3. mutate
  4. call `revalidatePath` or `revalidateTag`
  5. return a typed result instead of throwing for expected failures
- Use Route Handlers (`app/api/**/route.ts`) only for external consumers: webhooks, third parties, mobile clients.

## Tests

- Unit-test sync components, client components, hooks, utils and route handlers.
- Async Server Components, pages and server actions are covered by e2e tests (Playwright), not unit tests.
