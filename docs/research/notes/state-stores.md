# Client-side state stores (Zustand, Redux Toolkit, Jotai) in React + Next.js App Router + TypeScript, late 2026

Research date: 2026-10-27. Current versions on npm (registry `latest` tag, fetched this session): **zustand 5.0.16, @reduxjs/toolkit 2.13.0, jotai 3.0.1** — [npm registry](https://registry.npmjs.org/zustand/latest), [RTK](https://registry.npmjs.org/@reduxjs/toolkit/latest), [jotai](https://registry.npmjs.org/jotai/latest).
Note that **Jotai v3 is new (stable around Sept 2026)**. Most blog and tutorial content still describes Jotai v2.

## 1. Which library dominates, and when to use no global store at all

### Takeaway
Zustand is the most downloaded client-state library, with about 2x the downloads of RTK, and it is the survey satisfaction leader. RTK is still large because of existing apps. TanStack Query out-downloads all of them. Both the official Redux and Zustand Next.js guides say to keep global client stores small. Server data belongs in RSC/fetch or React Query, URL state belongs in searchParams (nuqs), and local state stays in useState/context. A generator should therefore make "store" opt-in, not the default.

### Cited Findings
- npm weekly downloads for the week 2026-06-25 to 2026-07-01 (the npm API returned this window when queried on 2026-10-27): **@tanstack/react-query 57.6M, zustand 40.9M, react-redux 28.4M, @reduxjs/toolkit 21.9M, jotai 5.1M, mobx 3.9M, nuqs 3.2M, valtio 1.6M** — [npm downloads API](https://api.npmjs.org/downloads/point/last-week/zustand) (same endpoint per package)
- Third-party aggregators give inconsistent figures, ranging from Zustand 5.7M to 20M and RTK 4M to 10M depending on date. All of them have Zustand ahead of RTK since 2025 — [npm-compare](https://npm-compare.com/@reduxjs/toolkit,zustand,recoil,jotai,valtio), [PkgPulse](https://www.pkgpulse.com/guides/zustand-vs-redux-toolkit-2026). Treat these as directional only.
- State of React 2025: Redux and RTK are "long the most widespread". Zustand is described as gaining ground fast and as top in user satisfaction. **1,271 respondents use zero state-management libraries.** The average is 1.7 libraries per respondent. Top pain points are excessive complexity (39 mentions) and boilerplate (30). In write-ins, TanStack Query was the most mentioned "other" state library (42), and nuqs rose 7 places — [State of React 2025, state management](https://2025.stateofreact.com/en-US/libraries/state-management/). Exact usage percentages are only in chart images and were not extractable.
- Secondary summary: 34% of respondents use no state-management library, and useContext usage is 93.6% — [certificates.dev breakdown](https://certificates.dev/blog/breaking-down-state-of-react-2025-results) (secondary source)
- Redux's official Next.js guide: "Use Redux only for globally shared, mutable data". Everything else should use Next.js state (search params, route params, form state), React context and hooks. RTK Query should be used for client-side fetching only, and server-side fetching should use `fetch` in async RSCs — [redux.js.org Next.js guide](https://redux.js.org/usage/nextjs)
- Both guides say RSCs must not read or write the store, because they can't use hooks or context — [Redux](https://redux.js.org/usage/nextjs), [Zustand Next.js guide](https://zustand.docs.pmnd.rs/learn/guides/nextjs)
- TkDodo: keep filters (client state) in Zustand and feed them into a React Query key in a custom hook (`useFilteredTodos`). Server data stays in React Query — [TkDodo, Working with Zustand](https://tkdodo.eu/blog/working-with-zustand)

### Inferences
- Default rule for a generator's prompt or docs: if the data comes from the server, generate a React Query hook or an RSC fetch instead. If it must be shareable or bookmarkable (filters, tabs, pagination), use searchParams/nuqs. If one subtree needs it, use useState or context. Emit a store only for cross-tree, client-only, mutable UI state (cart drafts, wizard state, UI prefs).
- For a new project with no existing store, default to **Zustand**. Never introduce a second store library into a project that already has one.

### Gaps
- No official State of React 2025 or State of JS 2025 usage percentages per library were extractable, because they are chart images. No 2026 survey results were found.
- The npm downloads API returned a July 2026 window rather than the latest week. Absolute numbers may be a few months stale, but the ranking is consistent across sources.

## 2. Zustand v5 conventions

### Takeaway
Use `create<State>()(...)` (curried) for a client-only SPA-style store. For Next.js App Router, use the vanilla `createStore` factory plus a `'use client'` context provider (`useState` lazy init) plus a `useXStore(selector)` hook. Export selector hooks, not the raw store. Use `useShallow` for multi-field selectors. `devtools` must be the outermost middleware.

### Cited Findings
**TypeScript**
- `create<T>()(...)`: the extra `()` exists because `T` is invariant and can't be inferred, a workaround for microsoft/TypeScript#10571. It lets you annotate `T` while middleware types are still inferred — [Zustand Advanced TypeScript](https://zustand.docs.pmnd.rs/learn/guides/advanced-typescript)
- `combine` infers state from the initial value, so you don't write an interface and **don't use the curried form**. Its `set`/`get` only know the first argument's shape. `ExtractState<typeof useStore>` gets the type — [Advanced TypeScript](https://zustand.docs.pmnd.rs/learn/guides/advanced-typescript)
- Slices are typed with `StateCreator<FullState, Mutators, [], Slice>`, for example `StateCreator<BearSlice & FishSlice, [], [], BearSlice>`. They are combined in `create<BearSlice & FishSlice>()((...a) => ({...createBearSlice(...a), ...createFishSlice(...a)}))`. With middleware, the mutators go in the 2nd generic, e.g. `[["zustand/devtools", never]]` — [Advanced TypeScript](https://zustand.docs.pmnd.rs/learn/guides/advanced-typescript)

**Middleware ordering**
- Use `devtools` "as last as possible", meaning outermost: `devtools(persist(immer(...)))`, not `immer(devtools(...))`. The reason is that devtools mutates `setState`'s type and inner middlewares would overwrite it — [Advanced TypeScript](https://zustand.docs.pmnd.rs/learn/guides/advanced-typescript)

**v5 breaking changes (flag outdated advice)**
- No default export (use `import { create } from 'zustand'`). React 18+ and TS 4.5+ are required. `create` no longer takes an equality fn: use `useShallow` or `createWithEqualityFn` from `zustand/traditional` (which needs the `use-sync-external-store` peer dependency). **Selectors that return new references can cause infinite loops**, so wrap them in `useShallow`. `setState(x, true)` requires a full state. persist no longer writes the initial state to storage at creation — [Migrating to v5](https://zustand.docs.pmnd.rs/reference/migrations/migrating-to-v5)
- Outdated: tutorials passing `shallow` as the 2nd arg to the hook (`useStore(sel, shallow)`) are v4 style. TkDodo's 2022 article itself uses that older form — [TkDodo, Working with Zustand (Nov 2022)](https://tkdodo.eu/blog/working-with-zustand)

**Selectors and actions (TkDodo)**
- Only export custom hooks and keep the store private, so consumers can't subscribe to the whole store. Prefer atomic selectors (one value per hook) because default equality is `Object.is`. Group actions in an `actions` object exposed via one hook (`useBearActions`), since actions are stable. Model actions as events and put business logic in the store. Prefer multiple small stores over slices; the author "never needed" slices — [TkDodo, Working with Zustand](https://tkdodo.eu/blog/working-with-zustand)
- Auto-selectors: `createSelectors(store)` adds `store.use.<key>()` for every top-level key, via `as any` casts. There is a separate vanilla variant using `useStore(_store, s => s[k])`. It only covers keys present at creation — [Auto-generating selectors](https://zustand.docs.pmnd.rs/learn/guides/auto-generating-selectors)

**Next.js App Router (official guide)**
- File layout: `src/stores/counter-store.ts` holds the `CounterState`, `CounterActions`, `CounterStore = State & Actions` types, `defaultInitState` and `createCounterStore(initState = defaultInitState)` using `createStore` from `zustand/vanilla`. `src/providers/counter-store-provider.tsx` (`'use client'`) holds `CounterStoreContext`, `CounterStoreProvider` and `useCounterStore(selector)`. The provider wraps `{children}` in `app/layout.tsx` — [Zustand Setup with Next.js](https://zustand.docs.pmnd.rs/learn/guides/nextjs)
- The provider uses `const [store] = useState(() => createCounterStore())`. The current docs use **useState, not useRef**. Older versions of the guide and many blogs use `useRef` — [Zustand Next.js guide](https://zustand.docs.pmnd.rs/learn/guides/nextjs). TkDodo also prefers `useState` over refs for one-time init — [TkDodo, Zustand and React Context (Apr 2024)](https://tkdodo.eu/blog/zustand-and-react-context)
- The hook throws `"useCounterStore must be used within CounterStoreProvider"` if the context is missing, then returns `useStore(ctx, selector)` — [Zustand Next.js guide](https://zustand.docs.pmnd.rs/learn/guides/nextjs)
- Why: a Next.js server handles concurrent requests, so a module-level store would be shared across users. Create per request, and initialize the client with the same data as the server to avoid hydration errors. Per-route stores (provider in a page) are possible but discouraged unless needed — [Zustand Next.js guide](https://zustand.docs.pmnd.rs/learn/guides/nextjs)
- Store-in-context also lets you initialize from props (no useEffect sync), makes testing easier and gives multiple instances. Later prop changes do not update the store — [TkDodo, Zustand and React Context](https://tkdodo.eu/blog/zustand-and-react-context)

**persist and hydration**
- `persist(fn, { name /* required, unique key */, storage: createJSONStorage(() => localStorage), partialize, version, migrate, skipHydration })`. With `skipHydration: true`, call `useStore.persist.rehydrate()` in a `useEffect` after mount. `hasHydrated()`, `onHydrate` and `onFinishHydration` are available. A Next.js mismatch ("Text content does not match server-rendered HTML") happens when a render reads storage-hydrated values. The fix is a hook that returns `undefined` on the first render and sets the value in `useEffect` — [Zustand persist docs](https://zustand.docs.pmnd.rs/reference/integrations/persisting-store-data)

### Inferences
- Generator templates for Zustand:
  - **Next.js App Router (has `app/` and `next`)**: emit two files, `stores/<name>-store.ts` (types, `default<Name>State`, `create<Name>Store(init)` via `createStore` from `zustand/vanilla`) and `providers/<name>-store-provider.tsx` (`'use client'`, context with `undefined` default, `useState` lazy init, `use<Name>Store<T>(selector: (s: <Name>Store) => T): T` that throws outside the provider). Optionally patch `app/layout.tsx` or the existing `providers.tsx`.
  - **Plain React/Vite (no SSR)**: a single `stores/use-<name>-store.ts` with `export const use<Name>Store = create<<Name>Store>()((set) => ({ ...state, ...actions }))`.
  - Keep actions inside the store, as in the docs default; TkDodo's `actions` sub-object is an optional style. Don't emit slices or `createSelectors` by default. Emit middleware only on flags, with order `devtools(persist(immer(...)))`. A persist flag implies `name` = kebab store name and `createJSONStorage(() => localStorage)`.

### Gaps
- The Zustand docs don't prescribe kebab-case vs camelCase file names beyond their example (`counter-store.ts`, `counter-store-provider.tsx`).
- The slices pattern page and the `useShallow` guide were not fetched directly; slices info comes from the Advanced TypeScript page.

## 3. Redux Toolkit 2.x conventions

### Takeaway
The official App Router pattern is `makeStore()` (no exported singleton) in `lib/store.ts`, typed hooks via `.withTypes()` in `lib/hooks.ts`, and a `'use client'` `app/StoreProvider.tsx` that creates the store with a `useState` lazy initializer. Feature slices go in `lib/features/<x>/<x>Slice.ts` (camelCase).

### Cited Findings
- `lib/store.ts`: `export const makeStore = () => configureStore({ reducer: {} })`, with `AppStore = ReturnType<typeof makeStore>`, `RootState = ReturnType<AppStore['getState']>` and `AppDispatch = AppStore['dispatch']` — [redux.js.org Next.js](https://redux.js.org/usage/nextjs)
- `lib/hooks.ts`: `useAppDispatch = useDispatch.withTypes<AppDispatch>()`, `useAppSelector = useSelector.withTypes<RootState>()`, `useAppStore = useStore.withTypes<AppStore>()`. This replaces the older `TypedUseSelectorHook` pattern — [redux.js.org Next.js](https://redux.js.org/usage/nextjs)
- `app/StoreProvider.tsx`: `'use client'`, `const [store] = useState<AppStore>(makeStore)`, `<Provider store={store}>`. Initial server data is passed as a prop and dispatched inside the lazy initializer — [redux.js.org Next.js](https://redux.js.org/usage/nextjs). **Flag: earlier versions of this guide (and most blog posts) used `useRef<AppStore>()` with `if (!storeRef.current)`. The current guide uses `useState`; `useRef` now appears only in the per-route initialization example.**
- Layout: `/app/{layout.tsx,page.tsx,StoreProvider.tsx}` and `/lib/{store.ts,hooks.ts,features/todos/todosSlice.ts}`. Feature folders are recommended — [redux.js.org Next.js](https://redux.js.org/usage/nextjs)
- Rules: no global store, RSCs don't touch the store, store only mutable global data. A singleton is fine for SPAs. Route-specific state must be reset on navigation because a layout-provided store persists across it. Use `force-dynamic` for per-user routes and `revalidatePath`/`revalidateTag` after mutations — [redux.js.org Next.js](https://redux.js.org/usage/nextjs)

### Inferences
- Generator: "store" for RTK = a new slice file `lib/features/<name>/<name>Slice.ts`. It contains `createSlice({ name, initialState, reducers })`, typed `initialState: <Name>State`, exported actions, the default reducer and selectors (`select<Name>...`, or the RTK 2 `selectors` field on createSlice). The generator then **modifies `lib/store.ts`** to register `<name>: <name>Reducer` in `reducer`. Scaffold `store.ts`, `hooks.ts` and `StoreProvider.tsx` only if they are missing.
- RTK 2's `combineSlices` / `slice.selectors` / `.withTypes()` are the current idioms. `createStore`, `TypedUseSelectorHook` and the `connect` HOC are outdated.

### Gaps
- The RTK TypeScript Quick Start and the RTK 2 migration page were not fetched this session. The `selectors` field and `combineSlices` statements above come from general knowledge of RTK 2.0 and should be verified at [redux-toolkit.js.org](https://redux-toolkit.js.org/usage/migrating-rtk-2) before encoding.

## 4. Jotai conventions

### Takeaway
Jotai uses atoms declared at module level (the atoms themselves are safe; the *store* is what must be scoped). In Next.js, wrap the app in `<Provider>` so each SSR request gets its own store instead of the implicit global default store. Use `useHydrateAtoms` for server values and guard `atomWithStorage` against SSR. v3 (Sept 2026) is ESM-only and removes `atomFamily`/`loadable` from core.

### Cited Findings
- Without a Provider, Jotai uses a global default store that is "kept alive and is shared between multiple requests", which risks bugs and security issues. A `<Provider>` scopes it per request, at the root or a subtree. Use `useHydrateAtoms` to hydrate server values. For `atomWithStorage`, guard storage with `createJSONStorage(() => typeof window !== 'undefined' ? window.sessionStorage : undefined)` or load the UI via `next/dynamic` with `ssr: false`. SWC plugins exist for Next.js — [Jotai Next.js guide](https://jotai.org/docs/guides/nextjs). The guide's Provider example is still Pages Router (`_app`). For App Router it only links a StackBlitz demo.
- Jotai v3: ESM-only (no CJS/UMD/SystemJS), `jotai/babel` removed, older Node/React/TS dropped. Removed `atomFamily` (now in the `jotai-family` package, plus `atomTree`), `loadable` (use `jotai-eager`) and the `setSelf` read arg. Described as mostly backward compatible — [InfoQ, Jotai 3 released (Sept 2026)](https://www.infoq.com/news/2026/09/jotai-3-released/)

### Inferences
- Generator: emit `atoms/<name>-atoms.ts` (or `<feature>/atoms.ts`) exporting `export const <name>Atom = atom<<Type>>(initial)` and derived atoms. For App Router, ensure a `'use client'` `providers.tsx` with `<Provider>` exists. Don't emit `atomFamily` from `jotai/utils` for v3 projects (check the major version in package.json).

### Gaps
- There is no official Jotai file-naming convention. `atoms.ts` / `*-atoms.ts` is community practice, not sourced here.
- Jotai v3 minimum React/TS versions and any Provider/useHydrateAtoms changes were not confirmed.

## 5. File naming, locations and detection for a generator

### Takeaway
Follow each library's official example layout. Detect the library from package.json dependencies, then confirm by finding the existing store or provider files and matching their naming case.

### Cited Findings
- Zustand official: `src/stores/<name>-store.ts` and `src/providers/<name>-store-provider.tsx` (kebab) — [Zustand Next.js guide](https://zustand.docs.pmnd.rs/learn/guides/nextjs)
- RTK official: `lib/store.ts`, `lib/hooks.ts`, `lib/features/<x>/<x>Slice.ts` (camelCase) and `app/StoreProvider.tsx` (PascalCase) — [redux.js.org Next.js](https://redux.js.org/usage/nextjs)
- Jotai: no official layout (see Gaps above) — [Jotai Next.js guide](https://jotai.org/docs/guides/nextjs)

### Inferences
- Detection order:
  1. If `@reduxjs/toolkit` is in deps, use RTK. Find `configureStore`/`makeStore` (usually `lib/store.ts` or `store/index.ts`) to know where to register the reducer.
  2. Else if `zustand` is in deps, use Zustand. Grep for `zustand/vanilla` + `createStore`: if found, use the provider pattern; if only `create(`, use the singleton hook pattern. Copy the existing directory (`stores/` vs `store/`) and file case.
  3. Else if `jotai` is in deps, use Jotai.
  4. If none is present, default to Zustand only if the user explicitly asks for a store; otherwise suggest React Query, nuqs or context.
- Next.js App Router detection: `next` in deps plus an `app/` or `src/app/` dir. In that case never emit module-level singleton stores read during SSR; emit the factory + provider instead. Respect the `src/` prefix and the `@/` alias from tsconfig `paths`.
- Naming per library: Zustand `use<Name>Store` hook / `create<Name>Store` factory / `<Name>StoreProvider`; RTK `<name>Slice`, `<name>Reducer`, `select<Name>`; Jotai `<name>Atom`.

### Gaps
- No large-scale survey of real-world directory naming (`store/` vs `stores/`, kebab vs camel) was found. Matching existing project conventions is an inference, not a sourced statistic.
