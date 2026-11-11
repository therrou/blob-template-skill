# Data tables and App Router layouts / app shells: codegen conventions (late 2026)

Research date: 2026-10-27. Primary sources: the shadcn/ui repo (`apps/v4` docs and registry, fetched raw from GitHub `main`), tanstack.com, nextjs.org docs (pages updated 2025-06 to 2026-10), reactrouter.com, the sadmann7/tablecn source, nuqs.dev, and W3C WAI-ARIA APG.

**Headline changes since 2024/25 patterns (flag these as outdated in the generator):**
1. **TanStack Table v9 is stable (announced 2026-08-04)**, and the shadcn Data Table guide has been rewritten for v9. `useReactTable` with `getCoreRowModel()`/`get*RowModel()` options and `ColumnDef<TData>` is now the v8 legacy pattern.
2. **Next.js 16 removed synchronous `params`/`searchParams`/`cookies()`/`headers()` access.** Parallel route slots now **require** `default.js`, and `middleware.ts` has been renamed to `proxy.ts`.
3. **React Router's latest release is 8.5.0, not v7.** The layout-route concepts are unchanged.
4. **shadcn docs now ship per-primitive variants** (`components/radix/*`, `components/base/*`, `components/aria/*`). The sidebar docs no longer show the "persisted state via cookie" layout example, but `sidebar.tsx` still writes the cookie.

---

## Q1. Data tables: shadcn Data Table guide structure and TanStack Table API (v8 vs v9)

### Takeaway
A generator should emit the **v9 shadcn layout**: `data-table-features.ts` (the `tableFeatures({...})` object plus `type DataTableFeatures = typeof features`), `columns.tsx` (client, built with `createColumnHelper<DataTableFeatures, T>()` and `columnHelper.columns([...])`), a generic `data-table.tsx` (client, `useTable({ features, data, columns })`, rendered with `<table.FlexRender>`), and an async server `page.tsx` that fetches data. v8 `useReactTable` code survives only through `@tanstack/react-table/legacy` (`useLegacyTable`), which is deprecated.

### Cited Findings
- TanStack Table v9 is "finally here and stable" (announcement dated Aug 4, 2026). It introduces a tree-shakable plugin system and new state management built on TanStack Store — [TanStack blog](https://tanstack.com/blog/announcing-tanstack-table-v9)
- v9 claims up to 90% memory savings on some large tables and 40-70% speedups in sorting, filtering and aggregation — [v9 migration guide (React)](https://tanstack.com/table/v9/docs/framework/react/guide/migrating)
- Hook rename: `useReactTable(options)` becomes `useTable(options)`. `features` is a new required option, declared via `tableFeatures()`. `stockFeatures` gives v8-like "everything on" behaviour — [migration guide](https://tanstack.com/table/v9/docs/framework/react/guide/migrating.md)
- Row models moved into feature slots: `getSortedRowModel()` becomes `sortedRowModel: createSortedRowModel()`, `getFilteredRowModel()` becomes `filteredRowModel: createFilteredRowModel()`, and `getPaginationRowModel()` becomes `paginatedRowModel: createPaginatedRowModel()`. `getCoreRowModel` is automatic. Each row-model slot must come after its feature in the same `tableFeatures` call — [migration guide](https://tanstack.com/table/v9/docs/framework/react/guide/migrating.md)
- The full `sortFns`/`filterFns`/`aggregationFns` registries are deprecated, so register only what you use (e.g. `filterFns: { includesString: filterFn_includesString }`). The column option `sortingFn` is renamed `sortFn`. Slot registration replaces `declare module` augmentation — [migration guide](https://tanstack.com/table/v9/docs/framework/react/guide/migrating.md)
- Types gain a leading `TFeatures` generic: `ColumnDef<TFeatures, TData, TValue>`, `Table<TFeatures, TData>`, `Column`, `Row`, `Cell`. `createColumnHelper<typeof features, Person>()`. New `columnHelper.columns([...])` improves `TValue` inference. `RowData` is restricted to `Record<string, any> | Array<any>` — [migration guide](https://tanstack.com/table/v9/docs/framework/react/guide/migrating.md)
- State: `table.getState()` becomes `table.state` / `table.store.state` / `table.atoms.sorting.get()`. `onStateChange` is removed. Selector form: `useTable(options, (state) => ({ sorting: state.sorting }))`. Fine-grained rendering: `<table.Subscribe selector={...}>` — [migration guide](https://tanstack.com/table/v9/docs/framework/react/guide/migrating.md)
- Other breaking renames: pinning uses `'start'/'end'` instead of left/right. `enablePinning` splits into `enableColumnPinning`/`enableRowPinning`. `columnSizingInfo` becomes `columnResizing`. Destructured instance methods lose `this`. `_`-private APIs are removed — [migration guide](https://tanstack.com/table/v9/docs/framework/react/guide/migrating.md)
- `useLegacyTable` from `@tanstack/react-table/legacy` accepts the v8 API, but it is "deprecated and intended only as a temporary migration aid" and bundles all features — [migration guide](https://tanstack.com/table/v9/docs/framework/react/guide/migrating.md)
- `flexRender(...)` still works. v9 adds `<table.FlexRender header={header} />` / `cell={cell}` and a standalone `<FlexRender />` — [migration guide](https://tanstack.com/table/v9/docs/framework/react/guide/migrating.md); [shadcn data-table.mdx](https://github.com/shadcn-ui/ui/blob/main/apps/v4/content/docs/components/radix/data-table.mdx)
- shadcn guide project structure: `app/payments/{columns.tsx, data-table-features.ts, data-table.tsx, page.tsx}`. `columns.tsx` and `data-table.tsx` are client components, and `page.tsx` is a server component that fetches data. The guide says it "works for any other React framework" — [shadcn Data Table](https://ui.shadcn.com/docs/components/data-table)
- shadcn `data-table-features.ts` registers `columnFilteringFeature, columnVisibilityFeature, rowPaginationFeature, rowSelectionFeature, rowSortingFeature`, `filteredRowModel/paginatedRowModel/sortedRowModel`, `filterFns: { includesString }` and `sortFns: { alphanumeric, text }`, then exports `type DataTableFeatures = typeof features`. Its callout says "there are no more `get*RowModel` table options" — [shadcn data-table.mdx](https://github.com/shadcn-ui/ui/blob/main/apps/v4/content/docs/components/radix/data-table.mdx)
- shadcn `DataTableProps`: `interface DataTableProps<TData extends RowData> { columns: ColumnDef<DataTableFeatures, TData>[]; data: TData[] }`. The empty state is a single row with `colSpan={columns.length}`, `className="h-24 text-center"` and the text "No results.". Rows use `data-state={row.getIsSelected() && "selected"}`. The wrapper is `<div className="overflow-hidden rounded-md border">` — [shadcn data-table.mdx](https://github.com/shadcn-ui/ui/blob/main/apps/v4/content/docs/components/radix/data-table.mdx)
- Controlled state in the shadcn guide stays the same shape as v8: `const [sorting, setSorting] = React.useState<SortingState>([])` with `onSortingChange: setSorting, state: { sorting }`. Filtering, visibility and selection use the same pattern (`onColumnFiltersChange`, `onColumnVisibilityChange`, `onRowSelectionChange`) — [shadcn data-table.mdx](https://github.com/shadcn-ui/ui/blob/main/apps/v4/content/docs/components/radix/data-table.mdx)
- The guide says pagination "is already enabled" once `paginatedRowModel` is registered. Controls use `previousPage/nextPage/getCanPreviousPage/getCanNextPage/setPageSize/setPageIndex`. Row selection uses `getIsAllPageRowsSelected`, `toggleAllPageRowsSelected`, `row.toggleSelected` and `getFilteredSelectedRowModel` — [shadcn Data Table](https://ui.shadcn.com/docs/components/data-table)
- Reusable components: `components/data-table-column-header.tsx` (`DataTableColumnHeader`, props `column: Column<…Features, TData, TValue>, title`, sort and hide dropdown), `DataTablePagination` (prop `table`, selected count, rows-per-page 10–50, first/prev/next/last) and `DataTableViewOptions` (prop `table`, column-visibility dropdown). The tip says to extract to `components/ui/data-table.tsx` when reused — [shadcn Data Table](https://ui.shadcn.com/docs/components/data-table)
- Inconsistency in the docs: the reusable components type against `TasksTableFeatures` while the guide's own code uses `DataTableFeatures` — [shadcn Data Table](https://ui.shadcn.com/docs/components/data-table)
- Install: `npx shadcn@latest add table` plus `@tanstack/react-table` — [shadcn Data Table](https://ui.shadcn.com/docs/components/data-table)
- The shadcn dashboard block (`dashboard-01`) ships its own `components/data-table.tsx` alongside `app-sidebar.tsx` and `site-header.tsx` — [shadcn registry dashboard-01](https://github.com/shadcn-ui/ui/tree/main/apps/v4/registry/new-york-v4/blocks/dashboard-01)

### Inferences
- Generator template set for a "data table" entity `X`: `app/<route>/{data-table-features.ts, columns.tsx, data-table.tsx, page.tsx}`, or a shared `components/data-table/*` plus a per-entity `columns.tsx` once it is reused. Keep `features` per table, not global, because v9 tree-shakes unregistered features.
- `page.tsx` imports `columns` from a `"use client"` module and passes it to a client component. This works because the import is a client reference. The generator should **never** inline column definitions with functions into the server `page.tsx`.
- For projects pinned to `@tanstack/react-table@8`, keep a v8 template variant (`useReactTable`, `getCoreRowModel()`, `ColumnDef<TData, TValue>`, `flexRender`). The generator should detect the installed major version in package.json and choose accordingly.

### Gaps
- I did not verify whether v9 keeps `rowCount`, or any change to `manualPagination`/`manualSorting` semantics. The migration guide only shows them passed through `tableOptions()`.
- I did not confirm the exact file path that shadcn documents for `DataTablePagination` / `DataTableViewOptions` (historically `components/data-table-pagination.tsx` and `components/data-table-view-options.tsx`).

---

## Q2. Client-side vs server-side tables (manual*, URL state via nuqs, tablecn)

### Takeaway
Client-side mode means passing all rows and registering the row models. Server-side mode means `manualPagination/manualSorting/manualFiltering` plus `pageCount`, with table state in URL search params via **nuqs**. The server page parses those params with a shared parser (`createSearchParamsCache` or `createLoader` from `nuqs/server`) and streams a data promise to the client table inside `<Suspense>`. tablecn, the reference implementation, now runs on Next 16, React 19.3, TanStack Table 9 and nuqs 2.10.

### Cited Findings
- tablecn `package.json` versions: `next ^16.3.5`, `react ^19.3.0`, `@tanstack/react-table ^9.2.4`, `@tanstack/react-virtual ^3.14.13`, `nuqs ^2.10.1`, `tailwindcss ^4.3.3` — [tablecn package.json](https://github.com/sadmann7/tablecn/blob/main/package.json)
- tablecn features: server-side pagination, sorting and filtering, auto-generated filters from column definitions, Notion/Airtable-style advanced filters, a Linear-style filter menu, an action bar on row selection, and infinite scrolling with virtualization. Stack: Drizzle/Postgres and Zod. Docs live at diceui.com — [tablecn README](https://github.com/sadmann7/tablecn)
- The `useDataTable` hook (registry path `src/registry/bases/radix/hooks/use-data-table.ts`) wraps v9 `useTable` and nuqs `useQueryState(s)`. URL keys are `page`, `perPage`, `sort` (overridable via `queryKeys`). Options: `pageCount` (required for server mode), `history` (default `"replace"`), `debounceMs`, `throttleMs`, `clearOnDefault` (default false), `shallow` (default true) and `startTransition`. It sets `manualPagination/manualSorting/manualFiltering` — [tablecn use-data-table.ts](https://github.com/sadmann7/tablecn/blob/main/src/registry/bases/radix/hooks/use-data-table.ts)
- Server parsing: `src/app/lib/validations.ts` builds `createSearchParamsCache({...})` from `nuqs/server`. It spreads `getDataTableSearchParams({ columnConfigs, defaultSorting })` and declares per-column filter variants (`text`, `multiSelect`, `range`, `dateRange`) in a `columnConfigs` object typed `satisfies Partial<Record<keyof Task, DataTableColumnConfig>>` — [tablecn validations.ts](https://github.com/sadmann7/tablecn/blob/main/src/app/lib/validations.ts)
- tablecn `page.tsx`: `searchParams: Promise<SearchParams>`. An inner async component awaits `props.searchParams`, calls `searchParamsCache.parse(...)`, builds a `Promise.all([...])` of queries **without awaiting** and passes `promises` to the client `<TasksTable>`. That component is wrapped in `<Suspense fallback={<DataTableSkeleton columnCount=… cellWidths=… />}>`. The page has an `<h1 className="sr-only">` — [tablecn page.tsx](https://github.com/sadmann7/tablecn/blob/main/src/app/page.tsx)
- nuqs: loaders (`createLoader`, since 2.3.0) parse params for a page via `await loadSearchParams(searchParams)`. Caches (`createSearchParamsCache`, since 1.13.0) let nested Server Components read params with `.get()` after `parse` in the page. Neither is deprecated, and loaders do not validate (pair with Zod). Parser objects can be shared with client `useQueryStates` — [nuqs server-side docs](https://nuqs.dev/docs/server-side)

### Inferences
- Codegen rule: emit `lib/<entity>-search-params.ts` exporting the parser object, used by both `createSearchParamsCache`/`createLoader` on the server and `useQueryStates` on the client, so the URL schema has one source of truth.
- Server mode needs `shallow: false` on URL updates (so the RSC page refetches) and `startTransition` for a pending indicator. tablecn exposes both options. I did not confirm the exact nuqs docs wording (see Gaps).
- Default to client-side mode for small datasets that fit in one payload, and server-side for large or unbounded data. No source gave a numeric row threshold.

### Gaps
- The nuqs docs page did not cover `NuqsAdapter` placement (`nuqs/adapters/next/app` in the root layout), `shallow: false` semantics, or Next 16 notes. The diceui.com data-table docs returned HTTP 526, so I could not read its documented `useDataTable` API page or column `meta` schema (label, variant, options).

---

## Q3. Simple shadcn `Table` (no TanStack) and accessibility

### Takeaway
For static or read-only lists, generate plain shadcn `Table` markup with a `TableCaption`, and no TanStack dependency. For sortable headers, follow the APG pattern: a `<button>` inside `<th>`, `aria-sort` **only on the currently sorted column**, sort icons `aria-hidden`, and the sort instructions in the caption. tablecn already sets `aria-sort` reactively on `TableHead`.

### Cited Findings
- shadcn Table composition: `Table > TableCaption, TableHeader > TableRow > TableHead…, TableBody > TableRow > TableCell…` (plus a footer). The usage example includes `<TableCaption>A list of your recent invoices.</TableCaption>` and `className="text-right"` for numeric columns. Install with `npx shadcn@latest add table` — [shadcn table.mdx](https://github.com/shadcn-ui/ui/blob/main/apps/v4/content/docs/components/radix/table.mdx)
- APG sortable table: "The `aria-sort` attribute is set on the column header of the currently sorted column". When the sort changes it is removed and set on the new column. The values are "ascending"/"descending" — [WAI-ARIA APG Sortable Table](https://www.w3.org/WAI/ARIA/apg/patterns/table/examples/sortable-table/)
- APG: "the header text of sortable columns is wrapped in a `button` element", and non-sortable columns get no button. Sort icons are in a `span aria-hidden="true"`. An off-screen sort description is appended to the caption "to prevent repetitious verbosity". Icon shape should differ "in more than just color and size" — [WAI-ARIA APG Sortable Table](https://www.w3.org/WAI/ARIA/apg/patterns/table/examples/sortable-table/)
- tablecn `DataTableHeadCell` subscribes to `header.column.table.atoms.sorting`, computes `getAriaSort(sorting, column.id)` and renders `<TableHead aria-sort={ariaSort} colSpan={header.colSpan}>`. The `DataTable` accepts `aria-label`/`aria-labelledby` props passed to `<Table>`. The empty row uses `colSpan={table.getVisibleLeafColumns().length || 1}` — [tablecn data-table.tsx](https://github.com/sadmann7/tablecn/blob/main/src/registry/bases/radix/components/data-table/data-table.tsx)
- tablecn's column header uses a `DropdownMenuTrigger` as the sort/hide control, with props extending `React.ComponentProps<typeof DropdownMenuTrigger>` — [tablecn data-table-column-header.tsx](https://github.com/sadmann7/tablecn/blob/main/src/registry/bases/radix/components/data-table/data-table-column-header.tsx)

### Inferences
- The shadcn guide's basic `DataTable` sets no `aria-sort` and no caption. The generator should add `aria-sort` on `TableHead` (computed from `column.getIsSorted()`: `"asc"`→`"ascending"`, `"desc"`→`"descending"`, otherwise omit), plus an optional `caption` or `aria-label` prop. This is a cheap improvement over upstream.
- Use `colSpan={table.getVisibleLeafColumns().length}` rather than `columns.length` for the empty state, so it stays correct when columns are hidden. The shadcn snippet uses `columns.length`.
- `<TableHead>` renders `<th>`. Adding `scope="col"` is harmless and is standard HTML guidance, but no fetched source required it.

### Gaps
- I did not check whether the shadcn `TableHead` primitive sets `scope` by default.

---

## Q4. Virtualization (TanStack Virtual)

### Takeaway
Use `@tanstack/react-virtual` (`useVirtualizer`) only for very large client-side row sets or infinite scroll. tablecn pairs it with infinite scrolling. Paginated tables do not need it.

### Cited Findings
- TanStack Virtual is headless (no markup or styles) and supports vertical, horizontal or both (grid). Its core options are `count`, `getScrollElement: () => parentRef.current` and `estimateSize: () => 35` — [TanStack Virtual intro](https://tanstack.com/virtual/latest/docs/introduction)
- tablecn uses `@tanstack/react-virtual ^3.14.13` for "infinite scrolling with virtualization" — [tablecn](https://github.com/sadmann7/tablecn)

### Inferences
- Make virtualization an opt-in generator flag, not the default. It conflicts with semantic `<table>` layout (rows need absolute positioning or spacer rows) and complicates accessibility.

### Gaps
- The fetched page did not cover table-specific virtualization (the display:grid vs padding-rows technique), `overscan`, or a recommended row-count threshold.

---

## Q5. App Router layouts: layout/template, route groups, nested layouts, special files, metadata

### Takeaway
Root `app/layout.tsx` owns `<html lang>`/`<body>`, metadata and providers. Section shells go in route-group layouts (`app/(marketing)/layout.tsx`, `app/(app)/layout.tsx`). Layouts are persistent server components that cannot read `searchParams`/`pathname`. Active-link nav is a small client leaf. `params` is a `Promise` (synchronous access was removed in Next 16), and `LayoutProps<'/route'>` is the typed helper.

### Cited Findings
- Component hierarchy: `layout.js` is outermost and wraps `template.js`, `error.js`, `loading.js`, `not-found.js` and `page.js` — [Next.js layout.js](https://nextjs.org/docs/app/api-reference/file-conventions/layout)
- The root layout **must** define `<html>` and `<body>`. Do not hand-write `<title>`/`<meta>`; use the Metadata API (`export const metadata: Metadata` or `generateMetadata`) — [Next.js layout.js](https://nextjs.org/docs/app/api-reference/file-conventions/layout)
- `params` is a promise (since v15.0.0-RC): `params: Promise<{ team: string }>` with `await params`, or `use(params)` in client components. `LayoutProps<'/dashboard'>` is a global, auto-generated helper (from `next dev`/`build`/`typegen`) that also types parallel-route slots — [Next.js layout.js](https://nextjs.org/docs/app/api-reference/file-conventions/layout)
- Next.js 16: "synchronous access is fully removed" for `params`, `searchParams`, `cookies()`, `headers()` and `draftMode()`. Image-generating functions also receive `params`/`id` as promises — [Next.js 16 upgrade guide](https://nextjs.org/docs/app/guides/upgrading/version-16)
- Next.js 16 deprecates the `middleware` file and named export in favour of `proxy` (`mv middleware.ts proxy.ts`). The proxy runtime is nodejs only. PPR is opt-in via `cacheComponents: true` — [Next.js 16 upgrade guide](https://nextjs.org/docs/app/guides/upgrading/version-16)
- Layouts do not rerender on navigation and are client-cached. They cannot access search params or pathname. Use page `searchParams`, or client `useSearchParams`/`usePathname`/`useSelectedLayoutSegment(s)` in a client leaf (e.g. `NavLinks`, `Breadcrumbs`) — [Next.js layout.js](https://nextjs.org/docs/app/api-reference/file-conventions/layout)
- Layouts cannot pass data to `children`. Refetch in the page and dedupe with React `cache` (`fetch` is auto-deduped) — [Next.js layout.js](https://nextjs.org/docs/app/api-reference/file-conventions/layout)
- `loading.js` sits below `layout.js`, so it cannot cover `cookies()`/`headers()`/uncached fetches **in the layout**. Wrap that access in its own `<Suspense>` inside the layout, or move it to the page. With Cache Components enabled, unwrapped runtime access in a layout is a build-time error — [Next.js layout.js](https://nextjs.org/docs/app/api-reference/file-conventions/layout)
- Route groups `(folder)` are omitted from the URL. Use them to organise routes, to create multiple root layouts, or to opt some segments into a shared layout. Caveats: navigating across **different root layouts** causes a full page load; two groups must not resolve to the same path; without a top-level `app/layout.js`, `/` must live inside a group (e.g. `app/(marketing)/page.js`) — [Next.js Route Groups](https://nextjs.org/docs/app/api-reference/file-conventions/route-groups)
- The root layout can sit under a dynamic segment (`app/[lang]/layout.js`). Those params are readable via `next/root-params` — [Next.js layout.js](https://nextjs.org/docs/app/api-reference/file-conventions/layout)

### Inferences
- Default scaffold: `app/layout.tsx` (html/body, fonts, `metadata` with `title.template`, `<Providers>`) plus `app/(marketing)/layout.tsx` (header/footer shell) plus `app/(app)/layout.tsx` (sidebar shell). Keep a single root layout so moving between the groups is a client-side navigation. Separate root layouts per group only when the `<html>`/`<body>` really differs.
- Placement: `loading.tsx` and `error.tsx` go at each segment that fetches data (e.g. `app/(app)/dashboard/`). `not-found.tsx` goes at the app root. `template.tsx` is only for per-navigation remount needs such as enter animations or resetting state. Generated code should prefer `layout.tsx`.
- Not re-verified this session, but long-standing Next convention: `error.tsx` must be `"use client"` and receives `error`/`reset` props, and `global-error.tsx` must render its own `<html><body>`.

### Gaps
- I did not fetch the `template.js`, `loading.js`, `error.js` and `not-found.js` reference pages directly. Their specifics (e.g. the error props and any Next 16 rename) were not re-verified.

---

## Q6. App shell with shadcn Sidebar, providers, parallel routes, landmarks

### Takeaway
The app shell is `SidebarProvider > AppSidebar + SidebarInset(SiteHeader + main)` in the `(app)` group layout. The layout itself stays a server component, which lets it read the `sidebar_state` cookie for `defaultOpen`. `components/app-sidebar.tsx`, the nav and the header are small leaves, and only active-link logic needs `"use client"`. For dashboards with parallel routes in Next 16, every `@slot` (and `children`) needs a `default.tsx`.

### Cited Findings
- shadcn sidebar usage: in `app/layout.tsx`, `<SidebarProvider><AppSidebar /><main><SidebarTrigger />{children}</main></SidebarProvider>`. `components/app-sidebar.tsx` composes `Sidebar > SidebarHeader, SidebarContent > SidebarGroup…, SidebarFooter` — [shadcn sidebar.mdx](https://github.com/shadcn-ui/ui/blob/main/apps/v4/content/docs/components/radix/sidebar.mdx)
- `SidebarProvider` props: `defaultOpen`, `open`, `onOpenChange`. `Sidebar` props: `side`, `variant` (`sidebar|floating|inset`) and `collapsible` (`offcanvas|icon|none`). The `inset` variant requires wrapping main content in `SidebarInset`. `useSidebar()` returns `state, open, setOpen, openMobile, setOpenMobile, isMobile, toggleSidebar`. The shortcut is cmd/ctrl+B (`SIDEBAR_KEYBOARD_SHORTCUT = "b"`). Widths are `SIDEBAR_WIDTH` 16rem and `SIDEBAR_WIDTH_MOBILE` 18rem, or the `--sidebar-width` CSS var via `style` on the provider — [shadcn Sidebar](https://ui.shadcn.com/docs/components/sidebar)
- `components/ui/sidebar.tsx` is `"use client"`, defines `SIDEBAR_COOKIE_NAME = "sidebar_state"` and `SIDEBAR_COOKIE_MAX_AGE = 60*60*24*7`, and writes `document.cookie` on toggle. `defaultOpen` defaults to `true` — [shadcn sidebar.tsx source](https://github.com/shadcn-ui/ui/blob/main/apps/v4/registry/new-york-v4/ui/sidebar.tsx)
- The current radix sidebar docs page has **no** "persisted state / cookies" section (checked the raw mdx). The cookie-reading layout example that older docs showed is not currently documented — [shadcn sidebar.mdx](https://github.com/shadcn-ui/ui/blob/main/apps/v4/content/docs/components/radix/sidebar.mdx)
- Reading cookies in a layout is supported: `const cookieStore = await cookies()` from `next/headers` in an async layout — [Next.js layout.js](https://nextjs.org/docs/app/api-reference/file-conventions/layout)
- The canonical shadcn dashboard shell (`dashboard-01/page.tsx`) is `<SidebarProvider style={{"--sidebar-width": "calc(var(--spacing) * 72)", "--header-height": "calc(var(--spacing) * 12)"}}><AppSidebar variant="inset" /><SidebarInset><SiteHeader /><div className="flex flex-1 flex-col"><div className="@container/main …">…</div></div></SidebarInset></SidebarProvider>`. Its components are `app-sidebar`, `nav-main`, `nav-secondary`, `nav-documents`, `nav-user`, `site-header`, `section-cards` and `data-table` — [shadcn dashboard-01](https://github.com/shadcn-ui/ui/blob/main/apps/v4/registry/new-york-v4/blocks/dashboard-01/page.tsx)
- Parallel routes: `@slot` folders become layout props and do not affect the URL. If one slot at a level is dynamic, all are. Slots stream with their own loading/error. A role-conditional layout still renders **both** slots on the server, so authorize inside each slot. Tab groups use a `layout` inside a slot. Modals combine a slot with intercepting `(.)` routes — [Next.js Parallel Routes](https://nextjs.org/docs/app/api-reference/file-conventions/parallel-routes)
- Next.js 16: "All parallel route slots now require explicit `default.js` files. Builds will fail without them". Use `default.tsx` returning `null` or calling `notFound()` — [Next.js 16 upgrade guide](https://nextjs.org/docs/app/guides/upgrading/version-16)

### Inferences
- Generated `(app)/layout.tsx`: `export default async function AppLayout({ children }: LayoutProps<'/…'>)`, then `const defaultOpen = (await cookies()).get("sidebar_state")?.value !== "false"`, then `<SidebarProvider defaultOpen={defaultOpen}><AppSidebar /><SidebarInset><SiteHeader /><main id="main-content">{children}</main></SidebarInset></SidebarProvider>`. Note that `cookies()` makes the layout dynamic. With `cacheComponents`, wrap it in `<Suspense>` or omit persistence (see the Q5 citation). This snippet is my reconstruction, because the docs no longer show it.
- Landmarks: one `<header>` (SiteHeader), `<nav aria-label="Main">` inside the sidebar, and exactly one `<main id="main-content">`. Add a "Skip to content" link as the first focusable element in the root `<body>` (`href="#main-content"`, `sr-only focus:not-sr-only`). The shadcn usage example already renders `<main>`. The skip link is not in any fetched source; it is standard WCAG 2.4.1 practice.
- Providers: put a single `app/providers.tsx` (`"use client"`) with the theme provider, the nuqs `NuqsAdapter`, the query client and similar, and render it in the root layout around `{children}`. Keep `SidebarProvider` in the `(app)` group layout, not global.
- Active nav items (`isActive` on `SidebarMenuButton`) need `usePathname`, so `nav-main.tsx` is the `"use client"` leaf, not `app-sidebar.tsx` as a whole.

### Gaps
- There is no current official shadcn doc for cookie persistence; the pattern is inferred from `sidebar.tsx` plus Next `cookies()`. I did not find an official Next.js doc that prescribes `app/providers.tsx` by name.

---

## Q7. Non-Next SPA equivalent (React Router layout routes)

### Takeaway
React Router's latest is **8.5.0** (the task assumed v7). Layout routes still work the same way. In framework mode, `layout("./file.tsx", [...])` in `app/routes.ts` adds nesting without a URL segment. In data mode, it is a route object with `Component` and no `path`. Children render via `<Outlet />`, index routes use `index: true` and cannot have children, and every route nests under `app/root.tsx`.

### Cited Findings
- The reactrouter.com sidebar shows the latest version as 8.5.0 (Copy Page links to the `react-router@8.5.0` tag) — [React Router Data routing](https://reactrouter.com/start/data/routing)
- Framework mode `app/routes.ts`: `import { type RouteConfig, route, index, layout, prefix } from "@react-router/dev/routes"`. `layout()` "create[s] new nesting for their children, but [doesn't] add any segments to the URL". `prefix()` adds a path prefix without a parent route. The array ends `satisfies RouteConfig`. "Every route in `routes.ts` is nested inside the special `app/root.tsx` module" — [React Router Framework routing](https://reactrouter.com/start/framework/routing)
- The parent renders children via `import { Outlet } from "react-router"` then `<Outlet />`. The package name is `react-router`, not `react-router-dom` — [React Router Framework routing](https://reactrouter.com/start/framework/routing)
- Data mode: `createBrowserRouter([{ path: "/", Component: Root, children: [{ index: true, Component: Home }, …] }])`. "Omitting the `path` in a route creates new Nested Routes for its children without adding any segments to the URL" (e.g. `{ Component: MarketingLayout, children: [...] }`) — [React Router Data routing](https://reactrouter.com/start/data/routing)

### Inferences
- Plain-React pack mapping: the Next `(app)/layout.tsx` becomes `src/layouts/app-layout.tsx` rendering the same `SidebarProvider > AppSidebar + SidebarInset > main > <Outlet/>`, registered as a pathless route `{ Component: AppLayout, children: [...] }`. The cookie read is replaced by `SidebarProvider`'s default or `defaultOpen` read from `document.cookie`/localStorage on the client. Next `loading.tsx`/`error.tsx` map to `HydrateFallback`/`ErrorBoundary` route exports in RR.
- Because v8 is current, the generator should import from `react-router` and avoid `react-router-dom`-era patterns (`<BrowserRouter><Routes>`) for new data-mode apps.

### Gaps
- I did not read the v7 to v8 changelog, so the v8 breaking changes are unknown. I also did not fetch the `root.tsx` `Layout` export, `HydrateFallback`/`ErrorBoundary` API pages, or declarative-mode `<Route element={<Layout/>}>` docs.
