# Icons and Dialogs/Modals in React + Next.js (App Router) + TS + Tailwind + shadcn/ui (late 2026)

## Q1. Icon library choice: lucide-react default, `iconLibrary` in components.json, alternatives

### Takeaway
Lucide is still shadcn's default icon library. `components.json` has a free-form `iconLibrary` string, and the community reports Tabler, HugeIcons, Phosphor and Remix as switchable options. A generator should read `iconLibrary` and fall back to `lucide-react` when the key is absent, not hardcode the import.

### Cited Findings
- The official components.json schema has a top-level `iconLibrary` property with type string and **no enum**. Other top-level keys are `style`, `tailwind`, `rsc`, `tsx`, `aliases` (`utils`, `components`, `ui`, `lib`, `hooks`), `menuColor`, `menuAccent`, `rtl` and `registries`. The required keys are `style`, `tailwind`, `rsc` and `aliases`. — [shadcn schema.json](https://ui.shadcn.com/schema.json)
- The components.json docs page does not document `iconLibrary` at all. `rsc: true` makes the CLI add `"use client"` to client components, and `tsx: false` emits `.jsx`. — [shadcn components.json docs](https://ui.shadcn.com/docs/components-json)
- Community sources say shadcn supports Lucide (default, `lucide-react`), Tabler (`@tabler/icons-react`), HugeIcons (`@hugeicons/react` + `@hugeicons/core-free-icons`), Phosphor (`@phosphor-icons/react`) and Remix Icon (`@remixicon/react`). They say the library is picked at create time or changed through `iconLibrary`, and that components then swap imports (for example Lucide `AlertCircle` becomes Tabler `IconAlertCircle`). These are third-party sources, not official docs. — [shadcnstudio: shadcn icons](https://shadcnstudio.com/blog/how-to-use-shadcn-icons/), [shadcnstudio: icon library](https://shadcnstudio.com/blog/shadcn-icon-library/)
- A third-party comparison says Tabler has about 5,900 icons and Lucide about 1,700, both on a 24px grid with a 2px stroke, so Tabler drops into shadcn without a visual mismatch. — [allsvgicons compare](https://www.allsvgicons.com/compare/best-svg-icons-for-shadcn-ui/)
- Lucide icons are standalone components that render an optimized inline SVG, are tree-shakable ("only imported icons are included") and fully typed. Lucide now has a "Version 1" guide and a "Migration from v0" guide. — [lucide.dev React guide](https://lucide.dev/guide/react)

### Inferences
- Naming conventions differ by library: Lucide uses bare names (`Plus`, plus `*Icon` aliases), Tabler uses `Icon*`, Phosphor uses bare names, and Remix uses `Ri*`. A generator that emits icon imports needs a per-library mapping table, or it should keep icon usage in templates minimal and parameterized.
- @radix-ui/react-icons (15x15 grid) and Heroicons still exist but no longer show up as shadcn-selectable options in what I found. Treat them as legacy or non-default. The old shadcn "default" style that used Radix icons is deprecated (see the components.json docs on the `style` default).
- Lucide v1 exists, so templates should not rely on v0-only behavior (see Gaps).

### Gaps
- I couldn't find an official shadcn page listing the allowed `iconLibrary` values or the exact `shadcn create` flags. The list above comes from third-party sources.
- I didn't verify which v0 to v1 lucide changes break things (renamed or removed icons, default `aria-hidden`).
- I didn't check Phosphor's or Heroicons' current React APIs.

## Q2. Sizing and coloring icons with Tailwind tokens, shadcn `[&_svg]` conventions

### Takeaway
Size icons with Tailwind `size-*` classes and color them through text color, since icons inherit `currentColor`. Inside shadcn components, let the parent's `[&_svg:not([class*='size-'])]:size-4` rule set the default size, and add `size-*` on the icon only to override it.

### Cited Findings
- The shadcn new-york-v4 `Button` base classes include `[&_svg]:pointer-events-none [&_svg]:shrink-0` and `[&_svg:not([class*='size-'])]:size-4`. Icon size variants are `icon` = `size-9`, `icon-sm` = `size-8`, `icon-lg` = `size-10` and `icon-xs` = `size-6` (default svg `size-3`). Button renders `data-slot="button"`, `data-variant` and `data-size`. In the Radix flavor it uses `Slot.Root` when `asChild` is set. — [shadcn button.tsx (new-york-v4)](https://raw.githubusercontent.com/shadcn-ui/ui/main/apps/v4/registry/new-york-v4/ui/button.tsx)
- Lucide exposes size, color and stroke-width as props. — [lucide.dev React guide](https://lucide.dev/guide/react)

### Inferences
- Generator rule: inside shadcn primitives (Button, DropdownMenuItem, etc.), emit `<PlusIcon />` with no size class, or `className="size-4"` only for an override. Outside them, emit `className="size-4 text-muted-foreground"`, not `size={16}` or `color=` props, so theme tokens and dark mode keep working.
- Matching on `class*='size-'` means generators must use the `size-*` utility and not `h-4 w-4`. Otherwise the parent default still applies alongside it. `h-4 w-4` is the pre-Tailwind-3.4 or older shadcn pattern and is now outdated.
- `pointer-events-none` on svg means click handlers belong on the button, never on the icon.

### Gaps
- I didn't retrieve lucide's Sizing, Color or Stroke-width subpages, so I haven't confirmed the default `size` (24), `color` (`currentColor`) or `absoluteStrokeWidth` from a fetched source. These are widely known but unverified here.

## Q3. Custom SVG icons: typing, SVGR vs inline JSX, sprites, file location

### Takeaway
I found no fetched primary source for a canonical custom-icon convention. The safest generator default is inline-JSX components typed as `ComponentProps<'svg'>` (or `LucideProps` when mixing with Lucide). Each one should set `fill`/`stroke="currentColor"`, spread props, and be decorative by default (`aria-hidden`).

### Cited Findings
- Lucide icons render inline SVG and are fully typed (the TypeScript guide covers its exported types). — [lucide.dev React guide](https://lucide.dev/guide/react)
- Lucide icons ship with `aria-hidden="true"` by default. Adding a `<title>` child or `aria-label` removes it. — [lucide accessibility](https://lucide.dev/guide/react/advanced/accessibility)

### Inferences
- To match Lucide's a11y behavior, custom icon components should default to `aria-hidden="true"` unless `aria-label` or a `title` is provided.
- File location: shadcn's older "taxonomy" example used a single `components/icons.tsx` exporting an `Icons` object. A `components/icons/` folder with one file per icon plus a barrel suits a generator better, since each file is one deterministic output and fits a "register in barrel" step. This is a design inference, not a sourced convention.
- SVGR in Next.js needs bundler config (webpack loader, or Turbopack `rules`), which adds config surface. Inline JSX components need none, which makes them the better default for a template generator.
- Sprite sheets (`<svg><use href="/sprite.svg#id"/></svg>`) cut JS bundle size for very large icon sets, but they lose per-icon tree-shaking ergonomics and need a build step. Treat them as an opt-in.

### Gaps
- I didn't fetch or confirm sources for: the shadcn taxonomy `icons.tsx` pattern, current Next.js 16 + Turbopack SVGR config, or sprite-sheet performance data.
- I didn't fetch the `LucideProps` / `LucideIcon` type names or the `Icon` + `iconNode` / `@lucide/lab` custom-icon API from the docs.

## Q4. Icon accessibility: decorative vs meaningful, icon-only buttons

### Takeaway
Icons are decorative by default (Lucide sets `aria-hidden="true"`). The accessible name goes on the interactive element (`<Button aria-label="…" size="icon">`), not on the icon. Label the icon itself only when it carries meaning on its own.

### Cited Findings
- "Lucide icons ship with `aria-hidden="true"` by default." Most icons are decorative, and exposing them adds noise. Expose an icon only if it "conveys essential meaning on its own", by adding a `<title>` child or `aria-label`, either of which removes `aria-hidden`. — [lucide accessibility](https://lucide.dev/guide/react/advanced/accessibility)
- Icon buttons should carry the label on the button, as in `<button aria-label="Go to home"><House /></button>`, so assistive technology "describe[s] the interactive element, rather than the decorative graphic inside it." — [lucide accessibility](https://lucide.dev/guide/react/advanced/accessibility)

### Inferences
- Generator rule: any template that emits `size="icon"` / `icon-sm` / `icon-lg` / `icon-xs` buttons must require an `aria-label`, or a visually hidden `<span className="sr-only">` text, as a template parameter. It should fail generation without one.

### Gaps
- I didn't check whether shadcn's own icon-button examples use `sr-only` spans or `aria-label`.

## Q5. Icon bundle size: optimizePackageImports, deep imports

### Takeaway
In Next.js, `lucide-react`, `@tabler/icons-react`, `react-icons/*`, Heroicons and `@mui/icons-material` are already optimized by default through `optimizePackageImports`. Generators should emit plain named imports and never deep imports or a config entry for these packages.

### Cited Findings
- `experimental.optimizePackageImports` (marked "Experimental" in the docs, last updated 2025-12-19) "will only load the modules you are actually using". The libraries optimized by default include `lucide-react`, `@tabler/icons-react`, `react-icons/*`, `@heroicons/react/20/solid`, `@heroicons/react/24/solid`, `@heroicons/react/24/outline`, `@mui/icons-material`, `@ant-design/icons`, `@headlessui/react` and others. Syntax: `experimental: { optimizePackageImports: ['package-name'] }`. — [Next.js optimizePackageImports](https://nextjs.org/docs/app/api-reference/config/next-config-js/optimizePackageImports)

### Inferences
- Phosphor (`@phosphor-icons/react`), HugeIcons and Remix (`@remixicon/react`) are **not** in the default list. If the project's `iconLibrary` is one of these, the generator (or setup docs) may add them to `optimizePackageImports`.
- Deep imports (such as `lucide-react/icons/x`) are an outdated workaround in Next.js projects. They break autocomplete and naming consistency.
- Avoid dynamic or by-name icon loading (lucide's "Dynamic icon component") in generated code unless the icon name is data-driven, because it defeats static tree-shaking. This is an inference, since I didn't fetch lucide's own warning.

### Gaps
- I have no bundle-size numbers.

## Q6. shadcn Dialog vs AlertDialog vs Sheet vs Drawer; Base UI / Radix change and its effect on templates

### Takeaway
This is the biggest 2026 change. **Base UI is the default primitive library for new shadcn projects (July 2026).** Radix is still supported, and React Aria is a third option. Component APIs differ: Base UI uses a `render` prop where Radix uses `asChild`. The Drawer now uses Base UI instead of vaul. A generator **must** detect the primitive flavor from the `components.json` `style` prefix (`radix-*`, `base-*`, `aria-*`) and emit `render={<Button />}` or `asChild` to match.

### Cited Findings
- July 2026, "Base UI as the Default": "New projects now use Base UI by default. Radix is still fully supported." `npx shadcn init` selects Base UI by default. "Radix is not being deprecated", and "You do not need to migrate." To keep Radix, use `shadcn init -b radix`. CI that expects Radix should add `-b radix`. Registry items without a `registry:base` config now initialize as Base UI. Migration is per component through an agent skill (`pnpm dlx skills add shadcn/ui`), and "Mechanical things get fixed everywhere (`asChild` is now `render`)." — [shadcn changelog: Base UI default](https://ui.shadcn.com/docs/changelog/2026-07-base-ui-default)
- Changelog timeline: Base UI docs (Jan 2026), Blocks for Radix and Base UI and the unified Radix UI package (Feb 2026), shadcn/cli v4 (Mar 2026), shadcn apply/preset (Apr 2026), shadcn eject and package imports/target aliases (May 2026), React Aria and Base UI as default (Jul 2026), and `cn` imported from the `cn` package in every component (Sep 2026). — [shadcn changelog](https://ui.shadcn.com/docs/changelog)
- The components.json `style` enum is `default`, `new-york`, plus `radix-|base-|aria-` × `vega|nova|maia|lyra|mira|luma|sera|rhea`. There is **no** separate "base library" key; the primitive library is encoded in the style prefix. — [shadcn schema.json](https://ui.shadcn.com/schema.json)
- The `style` key can't be changed after init, and the `default` style is deprecated. — [shadcn components.json docs](https://ui.shadcn.com/docs/components-json)
- The Dialog docs show Base UI, React Aria and Radix UI tabs. The API reference links to Base UI. Composition is `Dialog` > `DialogTrigger` + `DialogContent` > `DialogHeader` (`DialogTitle`, `DialogDescription`) + `DialogFooter`. `showCloseButton={false}` hides the built-in close button. Examples include a sticky footer and scrollable content. Content underneath is made inert. — [shadcn Dialog](https://ui.shadcn.com/docs/components/dialog)
- AlertDialog is "A modal dialog that interrupts the user with important content and expects a response". Its parts are `AlertDialogTrigger` (example: `render={<Button variant="outline" />}`), `AlertDialogContent` (`size="default" | "sm"`), `AlertDialogHeader` with `AlertDialogMedia` (optional icon/image slot), `AlertDialogTitle` and `AlertDialogDescription`, and `AlertDialogFooter` with `AlertDialogCancel` and `AlertDialogAction`. The docs show a destructive-action example using `AlertDialogAction`. — [shadcn AlertDialog](https://ui.shadcn.com/docs/components/alert-dialog)
- Drawer "now uses Base UI instead of Vaul" (`- npm install vaul` becomes `+ npm install @base-ui/react`). Migration notes: `direction` → `swipeDirection` (`down`/`up` instead of `bottom`/`top`), `asChild` → `render` (`<DrawerTrigger render={<Button variant="outline" />}>`), snap point props renamed, `onAnimationEnd` → `onOpenChangeComplete`, and no replacement for `handleOnly` or `shouldScaleBackground`. The page still documents the responsive pattern (Dialog on desktop, Drawer on mobile, "Edit Profile" example), and a Nested example imports `useIsMobile` from `@/hooks/use-mobile`. — [shadcn Drawer](https://ui.shadcn.com/docs/components/drawer)
- Base UI Dialog anatomy (`@base-ui/react/dialog`): `Root`, `Trigger`, `Portal`, `Backdrop`, `Viewport` (optional, for scrolling), `Popup`, `Title`, `Description` and `Close`. `modal` defaults to `true` (focus trap, scroll lock, outside pointer blocked). `false` allows outside interaction, and `'trap-focus'` traps focus only. Focus is controlled with `initialFocus` and `finalFocus` (boolean, ref or function). — [Base UI Dialog](https://base-ui.com/react/components/dialog)

### Inferences
- Use **AlertDialog** for destructive or irreversible confirmations. It needs an explicit Cancel or Action, and in Radix AlertDialog does not close on outside click (in Radix the AlertDialog requires a response; for Base UI I didn't verify this). Use **Dialog** for forms and general content. Use **Sheet** for side panels such as filters, navigation or detail views. Use **Drawer** for mobile bottom sheets, or the responsive Dialog/Drawer combo.
- Templates written in 2024–2025 with `<DialogTrigger asChild><Button/></DialogTrigger>` are **outdated for new (Base UI) projects**. They are still correct for `radix-*` styles and `new-york`.
- Any template importing from `vaul` or using `shouldScaleBackground` or `direction="bottom"` is outdated.
- The responsive pattern needs a media-query hook. shadcn ships `useIsMobile` in `@/hooks/use-mobile`, which a generator should reuse rather than generating a new `useMediaQuery`.
- With three flavors (base, radix, aria), a generator should either keep one template per flavor or keep templates flavor-agnostic by putting the trigger/close slot behind a helper. The smallest option is one conditional partial for the trigger: `render` vs `asChild`.

### Gaps
- I didn't fetch the Sheet docs. Sheet presumably now also uses Base UI Dialog under the hood, but that's unverified.
- I couldn't get the full responsive Dialog/Drawer code from the page (it was truncated).
- I didn't check how the React Aria flavor composes triggers (likely neither `render` nor `asChild`).
- I didn't verify whether `new-york` style projects map to Radix by default.

## Q7. Controlled vs uncontrolled; required Title/Description; forms inside dialogs

### Takeaway
Use the uncontrolled form (Trigger + Content) for simple dialogs. Use the controlled form (`open` + `onOpenChange` from `useState`) whenever the dialog must close programmatically, for example after an async form submit. Always render a Title (visually hidden if needed). Description is optional. In Radix, if you omit it, pass `aria-describedby={undefined}`.

### Cited Findings
- Radix Dialog follows the WAI-ARIA dialog pattern. A Title is "an accessible title to be announced when the dialog is opened". To hide it, wrap it in `<VisuallyHidden asChild>`. Description is optional. To remove it, omit the part and "pass `aria-describedby={undefined}` to `Dialog.Content`." — [Radix Dialog](https://www.radix-ui.com/primitives/docs/components/dialog)
- Radix: "Use the controlled props to programmatically close the Dialog after an async operation has completed". In the example, `open` lives in state, `onOpenChange` is passed to Root, and the form awaits the operation and then sets `open` to false. Keyboard: Space/Enter toggle the trigger, Tab/Shift+Tab cycle focus, and Esc closes and returns focus to the trigger. — [Radix Dialog](https://www.radix-ui.com/primitives/docs/components/dialog)
- Base UI: the dialog is uncontrolled by default, and you control it with `<Dialog.Root open={open} onOpenChange={setOpen}>`. `onOpenChange` is the recommended place for open/close side effects. Use `Dialog.Title` and `Dialog.Description` for labelling. When `modal` is `true` or `'trap-focus'`, "render `<Dialog.Close>` inside `<Dialog.Popup>` so touch screen readers can escape the popup." — [Base UI Dialog](https://base-ui.com/react/components/dialog)
- Base UI supports opening from outside the tree: `Dialog.createHandle()` passed to both `Trigger` and `Root` (detached triggers), with `open(triggerId)`, `openWithPayload(payload)` and `close()`, which work only while a Root with that handle is mounted. `Root` children can be a function receiving `{ payload }`. `actionsRef` exposes `close` and `unmount`. — [Base UI Dialog](https://base-ui.com/react/components/dialog)

### Inferences
- Generator template for a "form dialog": a `'use client'` component with `const [open, setOpen] = useState(false)` on Root, the form's success handler calling `setOpen(false)` (and resetting the form), and the submit button placed inside `DialogFooter`. Use the uncontrolled variant only when there's no async work.
- Always emit `DialogTitle`. Emit `DialogDescription` by default and make it optional through a parameter. When it's omitted on Radix, add `aria-describedby={undefined}`. Radix logs console warnings for a missing Title or Description (widely known, but not confirmed on the fetched page).
- Base UI's `createHandle` / payload covers most "global modal manager" needs natively (one dialog instance, many triggers, typed payload). That weakens the case for a store-based modal manager in Base UI projects.

### Gaps
- I didn't fetch sources on NiceModal (`@ebay/nice-modal-react`) or on Zustand-style global modal stores. Commonly cited pros are imperative `show()` returning a promise and no prop drilling. Commonly cited cons are a hidden global registry, harder SSR and type safety, and duplication of what Base UI handles provide. All of this is unverified.
- I didn't verify the exact Radix console warning text.

## Q8. Next.js App Router modals: parallel + intercepting routes; URL-driven dialogs

### Takeaway
Use parallel routes (`@modal`) plus intercepting routes (`(.)segment`) when the modal content needs a shareable or refreshable URL and back/forward should close and reopen it. Hard navigation renders the full page, not the modal. Use local state for transient UI (confirmations, quick forms).

### Cited Findings
- Intercepting conventions: `(.)` is the same level, `(..)` one level up, `(..)(..)` two levels up, and `(...)` the app root. They are based on **route segments**, not the file system, and do not count `@slot` folders. Soft navigation shows the intercepted route in a modal over the current page. A shareable URL or a refresh renders the full page with no interception. — [Next.js Intercepting Routes](https://nextjs.org/docs/app/api-reference/file-conventions/intercepting-routes) (lastUpdated 2026-10-15)
- Modal benefits: content "shareable through a URL", "Preserving context when the page is refreshed", "Closing the modal on backwards navigation" and "Reopening the modal on forwards navigation". The reference example is [nextgram](https://github.com/nextjs/nextgram). — [Next.js Parallel Routes](https://nextjs.org/docs/app/api-reference/file-conventions/parallel-routes) (lastUpdated 2026-10-15)
- Required files: `app/@auth/default.tsx` returning `null` ("ensures that the modal is not rendered when it's not active"), `app/@auth/(.)login/page.tsx` rendering `<Modal><Login/></Modal>`, and a real `app/login/page.tsx`. The layout receives the `auth` slot prop and renders it next to `children`. Opening is a plain `<Link href="/login">`. — [Next.js Parallel Routes](https://nextjs.org/docs/app/api-reference/file-conventions/parallel-routes)
- Closing: the `'use client'` Modal calls `useRouter().back()`. Alternatively, a `<Link>` closes it, but then the slot must match a `null` page: `app/@auth/page.tsx` returning `null`, or a catch-all `app/@auth/[...catchAll]/page.tsx` returning `null`. This is needed "because… client-side navigations to a route that no longer match the slot will remain visible". — [Next.js Parallel Routes](https://nextjs.org/docs/app/api-reference/file-conventions/parallel-routes)
- Separating `<Modal>` (client) from its content lets the content, forms included, stay Server Components. — [Next.js Parallel Routes](https://nextjs.org/docs/app/api-reference/file-conventions/parallel-routes)
- `default.js` is the fallback for unmatched slots on hard navigation. Without it you get a 404. `children` is an implicit slot and may also need `default.js`. If one slot at a level is dynamic, all slots at that level must be dynamic. — [Next.js Parallel Routes](https://nextjs.org/docs/app/api-reference/file-conventions/parallel-routes)

### Inferences
- A generator "route modal" action should emit four files: `@modal/default.tsx` (null), `@modal/(.)<seg>/page.tsx`, `@modal/[...catchAll]/page.tsx` (null), and a client `Modal` wrapper built on shadcn Dialog with `open` defaulting to true and `onOpenChange={(o) => !o && router.back()}`. It should also modify `layout.tsx` to accept and render the `modal` slot. Changing the layout is an append/modify step, which the repo's generator already supports.
- For the `(.)`/`(..)` prefix, compute the segment depth while ignoring `@slot` and `(group)` folders, or the interception won't match.
- URL-driven dialogs through `searchParams` (e.g. nuqs `useQueryState('dialog')`) are a lighter middle ground. They give a shareable state without a duplicate full page, at the cost of no SSR full-page fallback.

### Gaps
- I didn't fetch nuqs docs, so its API and current version are unverified.
- I didn't check Next.js 16-specific changes to parallel routes. The fetched docs are dated 2026-10-15 and show the same pattern as before, with nothing flagged as changed.

## Q9. WAI-ARIA APG requirements for dialogs (baseline a11y that templates must preserve)

### Takeaway
Modal dialogs need `role="dialog"` (or `alertdialog`), `aria-modal="true"`, and a label from a visible title (`aria-labelledby`) or `aria-label`. Focus moves in on open, is trapped while open, Esc closes, and focus returns to the invoker. For destructive confirmations, initial focus goes to the least destructive action. shadcn primitives do all of this as long as templates keep Title and Close and don't override focus wrongly.

### Cited Findings
- On open, focus moves inside. Tab and Shift+Tab stay inside. "Escape: Closes the dialog." On close, focus returns to the invoker unless it no longer exists. — [WAI-ARIA APG Dialog (Modal)](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/)
- The container has `role=dialog` and `aria-modal=true`. The label comes from `aria-labelledby` (visible title) or `aria-label`. `aria-describedby` is optional, and you should omit it when the content has lists, tables or multiple paragraphs. Mark a dialog modal only when outside interaction is truly blocked and outside content is visually obscured. — [WAI-ARIA APG Dialog (Modal)](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/)
- Initial focus: the first focusable element by default. For long content, a `tabindex="-1"` static element such as the title. For hard-to-reverse actions, the least destructive option. For informational dialogs, the most-used button (OK/Continue). — [WAI-ARIA APG Dialog (Modal)](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/)

### Inferences
- Destructive AlertDialog templates should ensure initial focus lands on Cancel. Radix AlertDialog does this by default (unverified here). On Base UI, set `initialFocus` to a Cancel ref if the default differs.
- The APG's rule to omit `aria-describedby` for rich content matches emitting `DialogDescription` only for short text. Long-body dialogs should skip it (and on Radix use `aria-describedby={undefined}`).

### Gaps
- The APG page I fetched doesn't discuss native `<dialog>`. I didn't research whether shadcn or Base UI use native `<dialog>`.
