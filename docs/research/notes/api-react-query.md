# API client / services layer and TanStack Query conventions (React + Next.js App Router + TS, late 2026)

## 1. API client: fetch wrapper vs axios vs ky/ofetch; typed errors; zod; server-only; generated OpenAPI clients; where Next.js wants you to fetch

### Takeaway
Default to a thin typed wrapper over native `fetch` (`lib/api-client.ts`) because only native `fetch` gets Next.js server extensions (`cache`, `next.revalidate`, `next.tags`, render-pass memoization). For new Next.js projects the official recommendation is a server-only Data Access Layer (`data/*.ts` with `import 'server-only'`) that does authz and returns minimal DTOs. When an OpenAPI spec exists, a generator (hey-api, orval, openapi-fetch, Kubb) should replace hand-written fetchers.

### Cited Findings
**Next.js data-fetching guidance**
- Next.js lists three approaches and says to pick one and not mix them: external HTTP APIs (existing large apps), a **Data Access Layer (recommended for new projects)**, and component-level data access (prototypes only). — [Next.js Data Security](https://nextjs.org/docs/app/guides/data-security)
- A DAL should "only run on the server", "perform authorization checks", and "return safe, minimal Data Transfer Objects (DTOs)". The doc examples use the file names `data/auth.ts` (`getCurrentUser = cache(async () => …)`), `data/user-dto.tsx` (`import 'server-only'`, `getProfileDTO(slug)`), `data/user.ts`, and `data/posts.ts`. — [Next.js Data Security](https://nextjs.org/docs/app/guides/data-security)
- "Only the Data Access Layer should access `process.env`." — [Next.js Data Security](https://nextjs.org/docs/app/guides/data-security)
- `import 'server-only'` makes it a build error to import the module in a client environment. Next handles it internally, but you may install the npm package if lint rules flag the import. — [Next.js Data Security](https://nextjs.org/docs/app/guides/data-security)
- Mutations go through Server Actions. The recommended split is a thin `app/actions.ts` (`'use server'`, e.g. `deletePostAction` → calls the DAL → `revalidatePath('/posts')`) and the auth/authz/db logic in a `server-only` DAL. Actions are reachable by direct POST, so they must re-check authn and authz, validate input, and return only what the UI needs (e.g. `{ success: true }`). — [Next.js Data Security](https://nextjs.org/docs/app/guides/data-security)
- In Server Components, fetch with `fetch` or an ORM directly. In Client Components, use React `use()` with a promise passed from a Server Component, or "a community library like SWR or React Query". — [Next.js Fetching Data](https://nextjs.org/docs/app/getting-started/fetching-data)
- "`fetch` requests are not cached by default." Cache with `use cache`, or wrap the component in `<Suspense>` to stream. Identical GET `fetch` calls are memoized within a render pass. For non-fetch data access (ORM), wrap the function in `React.cache`. — [Next.js Fetching Data](https://nextjs.org/docs/app/getting-started/fetching-data)
- The extended `fetch` options are `cache: 'force-cache' | 'no-store'` (default is "auto no cache"), `next: { revalidate: false | 0 | number }`, and `next: { tags: [...] }` for `revalidateTag`. Memoization applies to GET requests with the same URL and options, but not inside Route Handlers. — [Next.js fetch API reference](https://nextjs.org/docs/app/api-reference/functions/fetch)
- Cache Components (`cacheComponents: true` plus `partialPrefetching: true`) is on by default in new `create-next-app` apps and shipped in Next 16.0.0. `'use cache'` can be data-level (top of a function such as `getUsers()`) or UI-level, and should be paired with `cacheLife(...)` and optionally `cacheTag(...)`. `'use cache: private'` is for functions that read cookies or headers, and `'use cache: remote'` uses a durable shared handler. Older apps use the "Caching and Revalidating (Previous Model)" guide. — [Next.js Caching](https://nextjs.org/docs/app/getting-started/caching)

**HTTP client library choice**
- Native fetch has no dependency but does not throw on non-2xx responses and has no built-in retries or timeouts. ky is a small fetch-based client with retries, suited to code shared between server, client and edge. axios is larger (estimates range from about 13.5KB to 40KB gzipped) and justified mainly in legacy or existing axios codebases. — [reintech](https://reintech.io/blog/axios-vs-fetch-vs-ky-http-client-comparison-2026), [pkgpulse axios vs ky](https://www.pkgpulse.com/guides/axios-vs-ky-2026), [pkgpulse alternatives](https://www.pkgpulse.com/guides/axios-alternatives-2026-got-ky-undici) (third-party blogs; size numbers disagree)
- bulletproof-react recommends a single pre-configured API client instance (`src/lib/api-client.ts`) using native fetch or axios, graphql-request, or apollo-client. Each request gets its own declaration containing a request/response type plus validation schema, a fetcher that uses the client, and a hook. — [bulletproof-react api-layer](https://github.com/alan2207/bulletproof-react/blob/master/docs/api-layer.md)

**Generated OpenAPI clients**
- openapi-typescript + openapi-fetch: types only, a runtime of about 6KB, no runtime payload validation. Orval: batteries included (React Query/SWR/axios hooks, mocks, and zod from one config). Kubb: a composable plugin engine. hey-api/openapi-ts: a full SDK generator with several runtime client options. Star counts as of 2026-10-01: openapi-typescript 8,387, Orval 6,491, Kubb 1,812. — [pistack comparison](https://www.pistack.xyz/posts/2026-10-01-orval-vs-kubb-vs-openapi-typescript-typescript-client-generators/), [dev.to comparison](https://dev.to/nyaomaru/which-openapi-codegen-should-you-choose-openapi-typescript-vs-hey-api-vs-orval-vs-kubb-100p), [pkgpulse](https://www.pkgpulse.com/guides/orval-vs-openapi-typescript-vs-kubb-openapi-client-2026) (secondary sources)
- The hey-api TanStack Query plugin (`plugins: ['@tanstack/react-query']` in `openapi-ts.config.ts`, example output dir `src/client`, file `react-query.gen.ts`) generates `<op>Options()` (queryOptions), `<op>QueryKey()`, `<op>InfiniteOptions()` (only when a pagination param is detected), `<op>InfiniteQueryKey()`, and `<op>Mutation()` (mutationOptions). Usage: `useQuery({ ...getPetByIdOptions({ path: { petId: 1 } }) })` and `useMutation({ ...addPetMutation() })`. — [hey-api TanStack Query plugin](https://heyapi.dev/openapi-ts/plugins/tanstack-query)

### Inferences
- Generator default: emit `lib/api-client.ts` as a native-fetch wrapper. Each method builds the URL from a base URL env var (`API_URL` on the server, `NEXT_PUBLIC_API_URL` on the client; Next only exposes `NEXT_PUBLIC_*` to the browser per the security doc), sets JSON headers, throws a typed `ApiError extends Error { status, data }` on `!res.ok`, and accepts an optional zod schema to `.parse()` the JSON. It passes through `RequestInit` so callers can set `next: { tags }` and `cache`.
- Emit server-side fetchers or DAL functions in `data/<resource>.ts` (or `features/<f>/server/*.ts`) with `import 'server-only'`, read auth from `cookies()`, and return DTOs.
- Do not emit axios unless `axios` is already in package.json, since axios bypasses Next's fetch caching extensions (inferred from the fetch reference describing only the extended native `fetch`). Same rule for ky and ofetch: reuse them if present.
- If package.json has `@hey-api/openapi-ts`, `orval`, `openapi-fetch`/`openapi-react-query`, or `@kubb/*`, the generator should not hand-write fetchers for spec'd endpoints. It should only emit thin feature wrappers that spread the generated `xxxOptions()` and add invalidation.
- Treat zod parsing at the boundary as the default for hand-written fetchers. bulletproof uses zod for input schemas, and openapi-fetch does no runtime validation (the source notes this as a gap).

### Gaps
- I did not verify an official ofetch/Next.js recommendation. Sources only mention ofetch in passing.
- I did not fetch hey-api's client list (client-fetch, client-next, client-axios, client-ky, client-ofetch) or orval's output naming (`useGetPets`, `getGetPetsQueryOptions`, …). Verify against their docs before encoding exact names.
- No authoritative source prescribes the exact shape of an `ApiError` class. It is a community convention.
- I did not fetch the `revalidateTag` vs `updateTag` semantics page (Next 16 `/docs/app/getting-started/revalidating`).

## 2. React Query v5 conventions

### Takeaway
The dominant v5 convention is per-feature `queryOptions()` factories that co-locate key and `queryFn` (TkDodo), keys ordered from generic to specific, and `useQuery(xxxQueries.detail(id))` used directly in components rather than thin custom hooks. bulletproof-react uses one file per operation (`api/get-discussions.ts` exports `getDiscussions` + `getDiscussionsQueryOptions` + `useDiscussions`). Mutations use `useMutation` + `invalidateQueries` in `onSuccess`, with cache-level optimistic updates via `onMutate`/rollback/`onSettled`.

### Cited Findings
- `queryOptions` is a no-op at runtime but gives type safety. One object works for `useQuery`, `useSuspenseQuery`, and `queryClient.prefetchQuery`, typos like `stallTime` get caught, and `getQueryData(x.queryKey)` is typed. — [TkDodo: The Query Options API](https://tkdodo.eu/blog/the-query-options-api)
- "Separating QueryKey from QueryFunction was a mistake." The recommended factory returns `queryOptions` per entry, e.g. `list: (filters) => queryOptions({ queryKey: [...todoQueries.lists(), filters], queryFn })`, keeping key-only entries for hierarchy and invalidation. — [TkDodo: The Query Options API](https://tkdodo.eu/blog/the-query-options-api)
- Custom hooks that only wrap `useQuery` "won't be my first choice for abstractions". Calling `useQuery(queryOptions)` directly is fine, and hooks are justified only when they add logic. — [TkDodo: The Query Options API](https://tkdodo.eu/blog/the-query-options-api)
- Key factory (original post): `todoKeys = { all: ['todos'] as const, lists: () => [...todoKeys.all, 'list'] as const, list: (filters) => [...todoKeys.lists(), { filters }] as const, details: () => [...todoKeys.all, 'detail'] as const, detail: (id) => [...todoKeys.details(), id] as const }`. Always use array keys, order them generic to specific, use one factory per feature, and co-locate keys in `features/<feature>/queries.ts`. (The post was last updated 2022-04-23 and predates queryOptions.) — [TkDodo: Effective React Query Keys](https://tkdodo.eu/blog/effective-react-query-keys)
- bulletproof-react (Next.js app) `features/discussions/api/get-discussions.ts` contains: fetcher `getDiscussions({ page })`, `getDiscussionsQueryOptions({ page })` with key `['discussions', { page }]`, and `useDiscussions({ page, queryConfig })` wrapping `useQuery`. `create-discussion.ts` contains: `createDiscussionInputSchema` (zod), `createDiscussion` (POST via shared `api` client), and `useCreateDiscussion({ mutationConfig })`, which invalidates the discussions query in `onSuccess` and then calls the user's `onSuccess`. — [bulletproof get-discussions.ts](https://github.com/alan2207/bulletproof-react/blob/master/apps/nextjs-app/src/features/discussions/api/get-discussions.ts), [bulletproof create-discussion.ts](https://github.com/alan2207/bulletproof-react/blob/master/apps/nextjs-app/src/features/discussions/api/create-discussion.ts)
- File naming in bulletproof is kebab-case and verb-first under `features/<f>/api/` (`get-discussions.ts`, `create-discussion.ts`). — [bulletproof api-layer](https://github.com/alan2207/bulletproof-react/blob/master/docs/api-layer.md)
- Optimistic updates come in two forms. The UI form renders `variables` while `isPending`, and `useMutationState({ filters: { mutationKey } })` reads them from elsewhere. The cache form does `onMutate` → `cancelQueries` → snapshot → `setQueryData` → return the snapshot, then `onError` rolls back and `onSettled` calls `invalidateQueries`. Use the UI form when only one place shows the result. In current v5, callbacks receive a trailing `context` containing `client`: `onMutate(vars, context)`, `onError(err, vars, onMutateResult, context)`, `onSettled(data, err, vars, onMutateResult, context)`. — [TanStack Optimistic Updates](https://tanstack.com/query/latest/docs/framework/react/guides/optimistic-updates)
- **Outdated v4 patterns to flag:** positional args (now a single object), `cacheTime` (now `gcTime`), `isLoading` for first load (now `isPending`), `useErrorBoundary` (now `throwOnError`), `keepPreviousData: true` (now `placeholderData: keepPreviousData`), `<Hydrate>` (now `<HydrationBoundary>`), `onSuccess`/`onError` on queries (removed), `suspense: true` (now `useSuspenseQuery`/`useSuspenseInfiniteQuery`/`useSuspenseQueries`). Infinite queries require `initialPageParam`. `dehydrateQueries` is replaced by `shouldDehydrateQuery`. — [TanStack v5 migration](https://tanstack.com/query/latest/docs/framework/react/guides/migrating-to-v5)

### Inferences
- Recommended generator output per feature (`features/<f>/api/` or `features/<f>/queries.ts`):
  - `<f>Keys`/`<f>Queries` factory: `all`, `lists()`, `list(params)` → `queryOptions`, `details()`, `detail(id)` → `queryOptions`.
  - Fetchers `get<Resources>`, `get<Resource>`, `create<Resource>`, `update<Resource>`, `delete<Resource>` using `apiClient`.
  - Mutation hooks `useCreate<Resource>` etc. that wrap `useMutation` and run `queryClient.invalidateQueries({ queryKey: <f>Queries.lists() })` in `onSuccess`, accepting an optional `mutationConfig` (bulletproof shape).
  - Query hooks (`use<Resources>`) are optional. Emitting both the queryOptions and a thin hook (bulletproof) is the safest deterministic choice, with the hook allowed to be skipped via a flag (TkDodo).
- Pick one of two file-layout styles: bulletproof's one-file-per-operation (`get-user.ts`) or TkDodo's per-feature `queries.ts`. Detect from existing files (`features/*/api/get-*.ts` vs `**/queries.ts`).
- Use `infiniteQueryOptions` for paginated lists, with `initialPageParam` and `getNextPageParam` required.

### Gaps
- I did not verify the `mutationOptions()` helper in `@tanstack/react-query` (I believe it was added in a later v5 minor; the optimistic-updates page does not mention it). Check the reference before emitting it.
- I did not fetch @lukemorales/query-key-factory docs. Its `createQueryKeys('users', { detail: (id) => ({ queryKey: [id], queryFn }) })` shape is from memory and unverified. TkDodo's queryOptions approach makes it largely unnecessary.
- The exact `useSuspenseQuery` error-handling conventions (`QueryErrorResetBoundary`, `throwOnError`) were not fetched.

## 3. App Router integration (providers, getQueryClient, prefetch + HydrationBoundary, streaming)

### Takeaway
The official pattern is `app/get-query-client.ts` (a new client per request on the server, a singleton in the browser, `staleTime: 60_000`, pending queries dehydrated), a `'use client'` `providers.tsx` wrapping `QueryClientProvider`, and Server Components that `void queryClient.prefetchQuery(opts)` and render `<HydrationBoundary state={dehydrate(queryClient)}>` around client components that call `useSuspenseQuery(opts)`.

### Cited Findings
- `getQueryClient`: on the server (`isServer` / `environmentManager.isServer()` in the current docs) always `makeQueryClient()`; in the browser reuse a module-level `browserQueryClient` so a suspend during the initial render does not throw the client away. `makeQueryClient` sets `staleTime: 60 * 1000` so the client does not refetch immediately. — [TanStack Advanced SSR](https://tanstack.com/query/latest/docs/framework/react/guides/advanced-ssr)
- Streaming: `dehydrate: { shouldDehydrateQuery: (query) => defaultShouldDehydrateQuery(query) || query.state.status === 'pending', shouldRedactErrors: () => false }` (so Next can detect dynamic-page errors). The Server Component calls `void queryClient.prefetchQuery(...)` without awaiting, and the client calls `useSuspenseQuery`, which picks up the streamed promise. `useQuery` would not suspend and so would not SSR the content. — [TanStack Advanced SSR](https://tanstack.com/query/latest/docs/framework/react/guides/advanced-ssr)
- Don't create the client with `useState` unless a Suspense boundary sits between the provider and suspending components. Put `getQueryClient` in its own file (`app/get-query-client.ts`) shared by server and client. — [TanStack Advanced SSR](https://tanstack.com/query/latest/docs/framework/react/guides/advanced-ssr)
- Use Server Components only to prefetch, and do not render `queryClient` data on the server, because it drifts from client refetches. Don't call Server Actions from `queryFn` (they run serially). Use them for mutations and use API routes or tRPC for client fetching. Each nested Server Component may create and dehydrate its own client, or share one via `cache()`, at the cost of re-serializing the whole cache. — [TanStack Advanced SSR](https://tanstack.com/query/latest/docs/framework/react/guides/advanced-ssr)
- For non-JSON data, configure `dehydrate.serializeData` and `hydrate.deserializeData` in `defaultOptions`. — [TanStack Advanced SSR](https://tanstack.com/query/latest/docs/framework/react/guides/advanced-ssr)

### Inferences
- Generator scaffolds: `app/get-query-client.ts` (or `lib/query-client.ts`), `app/providers.tsx` (`'use client'`, `QueryClientProvider` plus optional devtools), and the root `layout.tsx` wrapping children in `<Providers>`. A route page pattern:
  ```tsx
  // app/users/page.tsx (Server Component)
  const qc = getQueryClient(); void qc.prefetchQuery(userQueries.list())
  return <HydrationBoundary state={dehydrate(qc)}><UserList/></HydrationBoundary>
  ```
  `UserList` is a `'use client'` component using `useSuspenseQuery(userQueries.list())`.
- The queryOptions object must be importable from both server and client, so feature `queries.ts` files must not import `server-only`. Server-only DAL fetchers are a separate path and cannot serve as `queryFn` for client refetches.

### Gaps
- `@tanstack/react-query-next-experimental` (`ReactQueryStreamedHydration`) status in 2026 was not checked.
- How React Query composes with Next 16 `use cache` / Cache Components was not covered by the sources fetched (the Next "client-side data fetching" guide link was not fetched).

## 4. Alternatives: SWR, RTK Query, tRPC + React Query, Server Actions + useActionState; detection from package.json

### Takeaway
Detect the data library from package.json and mirror its idioms. SWR uses URL-string keys, a `fetcher`, `useSWR`, and `useSWRMutation` + `mutate`. tRPC v11 uses `@trpc/tanstack-react-query` with `useTRPC()` + `trpc.x.queryOptions()` and emits no fetchers. Without a client data library, emit a Server-Component fetch/DAL plus Server Actions (`'use server'` + `revalidatePath`/`revalidateTag`) consumed with `useActionState`.

### Cited Findings
- SWR: `useSWR(key, fetcher)`, where keys are usually URL strings (e.g. `'/api/user'`) or arrays like `['item', 123]`. `useSWRMutation(key, (url, { arg }) => …)` returns `{ trigger, isMutating }`, shares the cache with `useSWR`, and `populateCache` defaults to false. Global `mutate` comes from `useSWRConfig()`, and the bound `mutate` from `useSWR`. Options include `optimisticData`, `rollbackOnError`, `populateCache`, and `revalidate`. — [SWR Mutation docs](https://swr.vercel.app/docs/mutation)
- The Next.js docs show SWR in a `'use client'` component with `const fetcher = (url) => fetch(url).then(r => r.json())`. — [Next.js Fetching Data](https://nextjs.org/docs/app/getting-started/fetching-data)
- tRPC's TanStack React Query integration (`@trpc/tanstack-react-query`): `const trpc = useTRPC()`, then `useQuery(trpc.greeting.queryOptions({ name }))`, `useMutation(trpc.x.mutationOptions({ onSuccess }))`, and `trpc.x.queryKey()`, `pathKey()`, `pathFilter()`, `queryFilter()`, `infiniteQueryOptions()`, `mutationKey()`, `subscriptionOptions()`. Invalidate with `queryClient.invalidateQueries(trpc.x.queryFilter())`. The classic integration is a separate "Classic" doc. — [tRPC TanStack React Query usage](https://trpc.io/docs/client/tanstack-react-query/usage)
- Server Actions for mutations: a thin `'use server'` action delegates to the DAL, then `revalidatePath`. `server-only` works in `'use server'` files even when the action is imported into a Client Component for `useActionState`. — [Next.js Data Security](https://nextjs.org/docs/app/guides/data-security)
- TanStack advises against Server Actions as `queryFn` but endorses them for mutations. — [TanStack Advanced SSR](https://tanstack.com/query/latest/docs/framework/react/guides/advanced-ssr)

### Inferences
Detection table for the generator (dependency to mode):
- `@tanstack/react-query` (v5 if `^5`) → queryOptions factories + `useSuspenseQuery`/`useQuery` + `useMutation`/invalidate. `^4` or `react-query` (v3) → flag as outdated and do not emit v5-only APIs.
- `@trpc/tanstack-react-query` → emit router procedures plus components using `useTRPC().x.queryOptions()`. `@trpc/react-query` alone → classic `trpc.x.useQuery()` style.
- `swr` → `use<Resource>()` wrapping `useSWR('/api/…', fetcher)` and `useSWRMutation` for writes, with keys as API URLs.
- `@reduxjs/toolkit` with existing `createApi` → add endpoints to the existing api slice via `injectEndpoints` (not verified in this research, see Gaps).
- `@hey-api/openapi-ts`, `orval`, `openapi-react-query`, `@kubb/*` → use generated options and don't hand-write fetchers.
- None of the above → Server Component fetch via DAL (`data/<r>.ts`, `server-only`) plus `app/<route>/actions.ts` Server Actions, and a form using `useActionState`.

### Gaps
- I did not fetch RTK Query docs (`createApi`, `injectEndpoints`, generated `useGetXQuery` hook naming, `providesTags`/`invalidatesTags`), so its conventions above are unverified.
- I did not fetch React's `useActionState` docs or the Next forms guide for the exact `(prevState, formData)` signature.
- I did not fetch `openapi-react-query` (`$api.useQuery('get', '/path')`) docs.
