# React conventions

These are the defaults behind the templates. They apply to every React-based pack (react and next).

## Files and naming

| Kind | Location | File | Export |
|---|---|---|---|
| Component | `components/<kebab>/` | `<kebab>.tsx` + `index.ts` | `export function PascalCase` |
| Form field | `components/<kebab>/` | `<kebab>.tsx` + `index.ts` | `export function PascalCase` |
| Hook | `hooks/` | `use-<kebab>.ts` | `export function useThing` |
| Context | `contexts/` | `<kebab>-context.tsx` | `ThingProvider`, `useThing` |
| Util | `utils/` (react), `lib/` (next) | `<kebab>.ts` | `export function camelCase` |
| Test / story | next to the source | `<kebab>.test.tsx`, `<kebab>.stories.tsx` | |

- Folders use `src/` when the repo has one.
- File names are kebab-case, which avoids case-sensitivity bugs between macOS and Linux CI.
- Use **named exports only**. The exceptions are files that a framework requires to have a default export (Next `page`/`layout`/`error`, Storybook `meta`).
- Don't add a repo-wide barrel (`components/index.ts`), because barrels break tree-shaking. The per-folder `index.ts` is fine.

## Components

- Type props with `type XProps = ComponentProps<'el'> & { ... }`, and forward `className` and `...props`. Don't use `React.FC`.
- **The root element is a decision, not a default.** Pick the semantic element (`--element`): `button` for actions (with `type="button"` unless it submits), `a` for navigation (`href` is required), `nav`/`section`/`article`/`aside`/`header`/`footer` for regions, `ul`/`ol` + `li` for lists, `h1`–`h6` for headings. `div`/`span` are for layout only and never get `onClick`.
- Name landmarks when a page has more than one of a kind (`aria-label` on `nav`, `aria-labelledby` on `section`). Icon-only buttons need `aria-label`.
- **Variants** use `cva` (`--variants`): a `variant` and a `size` key with semantic-token classes, `defaultVariants`, `VariantProps` in the props type, and `<name>Variants` exported for reuse (e.g. styling a link like the component).
- **Polymorphism** uses `asChild` with Radix `Slot` (`--as-child`), never an `as` prop.
- One component per file. Sub-parts that are only used here go in the same folder. No compound components (`Card.Header`); export separate components instead.
- Compose existing primitives (`components/ui/*`, the design-system package) before writing raw HTML.
- Keep components presentational. Data fetching belongs in pages, loaders or hooks.

## Forms

- react-hook-form + zod: the schema lives with the form (`zodResolver(schema)`), never inside fields.
- Each field is a `form-field` component on the shadcn form primitives (`FormField`, `FormItem`, `FormLabel`, `FormControl`, `FormDescription`, `FormMessage`), which wire `id`, `aria-describedby` and `aria-invalid`. Don't hand-wire them.
- Fields read `control` from `useFormContext()`, so render them inside `<Form {...form}>`. Pass the form values type for a typed `name`: `<EmailField<SignupValues> name="email" label="Email" />`.
- Set `type` and `autoComplete` on text inputs.

## Hooks

- Use a `use` prefix and a typed return value.
- Clean up every effect, subscription, timer and listener.
- Keep returned callbacks stable (`useCallback`) when consumers may put them in dependency arrays.
- Don't reach for effects to derive state; compute it during render.

## Context

- Use context for state that is shared and changes rarely. Keep it as low in the tree as possible.
- The guarded hook throws when it's used outside the provider. Memoize the value when it contains objects or functions.

## Utils

- Pure, typed and framework-free. If a util needs React, it's a hook.

## Styling: Tailwind and design tokens

1. **Read the theme first.** Tailwind v4 defines it in `@theme { --color-*, --spacing-*, --radius-* }` in the global CSS. Tailwind v3 defines it in `theme`/`theme.extend` in `tailwind.config.*`. The design-system package may also export tokens.
2. **Use semantic tokens**: `bg-primary`, `text-muted-foreground`, `border-border`, `rounded-lg`, `gap-4`.
3. **Arbitrary values are not allowed** (`p-[13px]`, `text-[15px]`, `bg-[#1a2b3c]`), with two exceptions:
   - values that reference tokens (`w-[var(--sidebar-width)]`, `h-(--header-height)`)
   - a commented `tokens-allow: <reason>`
4. **Raw palette colors are not allowed** (`bg-blue-500`) when the theme defines semantic colors.
5. **No color literals** in `className` or `style`.
6. Merge classes with `cn()` when the repo has it. Express variants as data (for example a `variant` prop mapped to classes, or `cva` if the repo uses it), not as string concatenation.
7. `scripts/check-tokens.mjs` enforces rules 3–5 and flags leftover `TODO(codegen)` markers.

## Tests (only when requested)

- Use Testing Library and query the way users do: `getByRole`, then `getByLabelText`, then `getByText`. Use `getByTestId` only as a last resort.
- Test behavior (interactions, states), not implementation details.
