# Authentication & authorization conventions for Next.js (App Router) + TypeScript codegen, late 2026

Research date: 2026-10-27. Current versions (npm `latest` dist-tag, checked 2026-10-27 via `npm view`): `next` 16.4.3; `better-auth` 1.7.14; `next-auth` latest 4.24.15 with v5 still on `beta` tag 5.0.0-beta.32; `@clerk/nextjs` 7.9.21; `@supabase/ssr` 0.12.7; `@kinde-oss/kinde-auth-nextjs` 2.13.2; `@workos-inc/authkit-nextjs` 4.6.2; `lucia` 3.2.2 marked deprecated on npm.

## Q1. Official Next.js guidance: DAL, server-only, verifySession/getCurrentUser + cache, DTOs, per-action/per-handler checks, layouts, proxy vs middleware, CVE-2025-29927

### Takeaway
Next.js's official model (docs updated Sept–Oct 2026) is: centralize auth in a `server-only` Data Access Layer (`verifySession()`/`getUser()`/`getCurrentUser()` wrapped in React `cache`), return minimal DTOs, and re-check auth inside every Server Action and Route Handler. `proxy.ts` (the Next 16 name for middleware) is only for optional, cookie-only "optimistic" redirects. Never use layouts as the protection boundary. CVE-2025-29927 shows why middleware/proxy must never be the only guard.

### Cited Findings
**Three concepts and library-first advice**
- The auth guide splits the problem into Authentication, Session Management and Authorization, and recommends a library: "for increased security and simplicity, we recommend using an authentication library." The page was last updated 2026-09-16. — [Next.js Authentication guide](https://nextjs.org/docs/app/guides/authentication)
- The guide's listed auth libraries are Auth0, Better Auth, Clerk, Descope, Kinde, Logto, NextAuth.js, Ory, Stack Auth, Supabase, Stytch and WorkOS. Its listed session libraries are iron-session and Jose. — [Next.js Authentication guide](https://nextjs.org/docs/app/guides/authentication)
- With Cache Components enabled, reading the session follows separate rules, documented in "Authentication with Cache Components" (`/docs/app/guides/authentication-with-cache-components`). — [Next.js Authentication guide](https://nextjs.org/docs/app/guides/authentication)

**Canonical hand-rolled file layout (from the docs examples)**
- `app/lib/definitions.ts` holds the Zod `SignupFormSchema` and a `FormState` type. The examples use Zod 4 syntax (`z.email({ error })`). — [Next.js Authentication guide](https://nextjs.org/docs/app/guides/authentication)
- `app/actions/auth.ts` holds the `signup(state: FormState, formData: FormData)` and `logout()` Server Actions. They validate with `safeParse`, return `{ errors: validatedFields.error.flatten().fieldErrors }` on failure, call `createSession(user.id)`, then `redirect('/profile')`. — [Next.js Authentication guide](https://nextjs.org/docs/app/guides/authentication)
- `app/ui/signup-form.tsx` is a `'use client'` component using `const [state, action, pending] = useActionState(signup, undefined)`. — [Next.js Authentication guide](https://nextjs.org/docs/app/guides/authentication)
- `app/lib/session.ts` starts with `import 'server-only'` and uses `jose` `SignJWT`/`jwtVerify` (HS256, 7d expiry) with `SESSION_SECRET` from env. It exports `encrypt`, `decrypt`, `createSession`, `updateSession` and `deleteSession`. — [Next.js Authentication guide](https://nextjs.org/docs/app/guides/authentication)
- Recommended cookie options are `httpOnly: true, secure: true, expires, sameSite: 'lax', path: '/'`, set on the server via `await cookies()`. The session payload should hold "the **minimum**, unique user data … such as the user's ID, role" and no PII. — [Next.js Authentication guide](https://nextjs.org/docs/app/guides/authentication)
- `app/lib/dal.ts` contains `import 'server-only'` plus `export const verifySession = cache(async () => { ... if (!session?.userId) redirect('/login'); return { isAuth: true, userId: session.userId } })` and `getUser = cache(async () => ...)`. `getUser` selects explicit columns: "Explicitly return the columns you need rather than the whole user object". — [Next.js Authentication guide](https://nextjs.org/docs/app/guides/authentication)
- **Important caveat for generators:** "React's `cache` deduplicates within a React render pass. Server Actions and Route Handlers are not part of a render pass, so the wrapper does nothing and every call runs the function." — [Next.js Authentication guide](https://nextjs.org/docs/app/guides/authentication)
- `app/lib/dto.ts` (`server-only`) shows a `getProfileDTO(slug)` using colocated `canSeeUsername(viewer)` / `canSeePhoneNumber(viewer, team)` predicates. Fields come back as `null` when the viewer is not allowed to see them. — [Next.js Authentication guide](https://nextjs.org/docs/app/guides/authentication)

**Data security guide (updated 2026-10-06)**
- There are three data-access approaches: HTTP APIs (large existing apps), a Data Access Layer ("For new projects, we recommend creating a dedicated Data Access Layer"), and component-level access (prototypes only). "We recommend choosing one data fetching approach and avoiding mixing them." — [Next.js Data Security guide](https://nextjs.org/docs/app/guides/data-security)
- A DAL should "Only run on the server", "Perform authorization checks" and "Return safe, minimal Data Transfer Objects (DTOs)". Only the DAL should access `process.env` secrets. — [Next.js Data Security guide](https://nextjs.org/docs/app/guides/data-security)
- The example layout is `data/auth.ts` with `export const getCurrentUser = cache(async () => { ... return new User(decodedToken.id) })`. The comment there says "Use classes to avoid accidentally passing the whole object to the client". `data/user-dto.tsx` starts with `import 'server-only'`. — [Next.js Data Security guide](https://nextjs.org/docs/app/guides/data-security)
- "A page-level authentication check does not extend to the Server Actions defined within it. Always re-verify inside the action." The guide also requires an ownership check to prevent IDOR (`if (post.authorId !== session.user.id) throw new Error('Forbidden')`). — [Next.js Data Security guide](https://nextjs.org/docs/app/guides/data-security)
- Recommended mutation pattern: auth, authz and the DB write live in a `server-only` DAL file (`data/posts.ts`). The `'use server'` action stays thin (`await deletePost(postId); revalidatePath('/posts')`). "You can use `import 'server-only'` in both the Data Access Layer and the `"use server"` file itself." — [Next.js Data Security guide](https://nextjs.org/docs/app/guides/data-security)
- Server Action return values are serialized to the client. Return `{ success: true }` instead of the DB record. — [Next.js Data Security guide](https://nextjs.org/docs/app/guides/data-security)
- Server Actions are "reachable via direct POST request". Secure action IDs and dead-code elimination exist, but "you should still treat Server Actions as reachable via direct POST requests and verify authentication and authorization inside each one." — [Next.js Data Security guide](https://nextjs.org/docs/app/guides/data-security)
- Taint APIs (`experimental_taintObjectReference`, `experimental_taintUniqueValue`, enabled by `experimental.taint: true`) are an extra layer only. Logout must be a Server Action, never a render side-effect. — [Next.js Data Security guide](https://nextjs.org/docs/app/guides/data-security)
- Audit checklist: database packages and env vars are not imported outside the DAL; `"use client"` props are not overly broad; `"use server"` files re-authorize, check ownership and filter return values; `[param]` folders are validated; extra scrutiny goes to `proxy.ts` and `route.ts`. — [Next.js Data Security guide](https://nextjs.org/docs/app/guides/data-security)

**Layouts**
- "Due to Partial Rendering, be cautious when doing checks in Layouts as these don't re-render on navigation." Also, "A layout also does not control whether the rest of the route renders… a layout that hides or swaps them does not stop them from running or from appearing in the RSC Payload." — [Next.js Authentication guide](https://nextjs.org/docs/app/guides/authentication)
- "A common pattern in SPAs is to `return null` in a layout … This pattern is **not recommended**." Fetch `getUser()` in the layout, but put the check in the DAL. — [Next.js Authentication guide](https://nextjs.org/docs/app/guides/authentication)
- Streaming advice: a top-level `await` on the DAL in a layout blocks `{children}`. Move it into a nested Server Component wrapped in `<Suspense>`. "Client Components can't import the DAL"; pass data as props or through context. — [Next.js Authentication guide](https://nextjs.org/docs/app/guides/authentication)

**Route Handlers and Server Components**
- Route Handler pattern: `verifySession()`, then return `401` when unauthenticated and `403` when the role is wrong. Treat handlers "with the same security considerations as public-facing API endpoints". — [Next.js Authentication guide](https://nextjs.org/docs/app/guides/authentication)
- Leaf components can do role checks (`AdminActions` returns `null` when the role is not admin). Any Server Actions they call must still check auth themselves. — [Next.js Authentication guide](https://nextjs.org/docs/app/guides/authentication)

**Proxy (formerly middleware)**
- "The `middleware` file convention is deprecated and has been renamed to `proxy`." Version history: in v16.0.0 "Middleware is deprecated and renamed to Proxy. Proxy defaults to the Node.js runtime". Node runtime was experimental in 15.2 and stable in 15.5. — [Next.js proxy.js reference](https://nextjs.org/docs/app/api-reference/file-conventions/proxy)
- The file exports either a default function or a named `proxy`, plus an optional `config.matcher`. "The `runtime` config option is not available in Proxy files." The codemod is `npx @next/codemod@canary middleware-to-proxy .`. — [Next.js proxy.js reference](https://nextjs.org/docs/app/api-reference/file-conventions/proxy)
- "We recommend users avoid relying on Middleware unless no other options exist." — [Next.js proxy.js reference](https://nextjs.org/docs/app/api-reference/file-conventions/proxy)
- Server Functions are POSTs to the hosting route, so "a Proxy matcher that excludes a path will also skip Server Function calls on that path… Always verify authentication and authorization inside each Server Function rather than relying on Proxy alone." — [Next.js proxy.js reference](https://nextjs.org/docs/app/api-reference/file-conventions/proxy)
- Proxy runs on every route including prefetches, so it should "only read the session from the cookie (optimistic checks), and avoid database checks". It "should not be your only line of defense". Its legitimate unique use is protecting static, shared-data routes, which a request-time DAL cannot. — [Next.js Authentication guide](https://nextjs.org/docs/app/guides/authentication)

**CVE-2025-29927**
- Root cause: an internal recursion-guard header, `x-middleware-subrequest`, was trusted when supplied by the client, so requests carrying it skipped Middleware. Impact was limited to self-hosted `next start` / `output: 'standalone'`; Vercel, Netlify, Cloudflare Workers and static exports were not affected. — [Vercel postmortem](https://vercel.com/blog/postmortem-on-next-js-middleware-bypass)
- Patched in 15.2.3 and 14.2.25 (Mar 17–18, 2025), 13.5.9 (Mar 22) and 12.3.5 (Mar 23). The fix validates the header and strips it when invalid. The workaround was to filter the header at the edge or WAF. — [Vercel postmortem](https://vercel.com/blog/postmortem-on-next-js-middleware-bypass); [Wiz CVE entry](https://www.wiz.io/fr-fr/vulnerability-database/cve/cve-2025-29927)
- Lesson stated by Vercel: "We do not recommend Middleware to be the sole method of protecting routes in your application." — [Vercel postmortem](https://vercel.com/blog/postmortem-on-next-js-middleware-bypass)
- A related low-severity issue, CVE-2025-30218, was found during remediation: a subrequest ID was sent to other hosts. — [Vercel changelog](https://vercel.com/changelog/cve-2025-30218-5DREmEH765PoeAsrNNQj3O)

### Inferences
- Generator rule: every emitted `'use server'` file and `route.ts` gets an explicit `await verifySession()` (or the library equivalent) inside each exported function. A page or layout check never counts as coverage.
- Generator rule: emit DAL and DTO files with `import 'server-only'` as the first line, and wrap session readers in `cache()`. Do not assume `cache` dedupes in actions or handlers.
- Generator rule: emit a `proxy.ts` only when the project's `next` major is 16 or higher, otherwise `middleware.ts` with `export function middleware`. The proxy only reads the cookie and redirects, with no DB calls. Mark it optional.
- Generator rule: for a "protected layout", emit a layout that calls `getUser()` for display only, inside `<Suspense>`. The actual guard goes in each `page.tsx` or DAL function.
- Outdated patterns to flag: Pages Router `getServerSession(req, res, authOptions)` (NextAuth v4), middleware-only protection, `return null` in a layout as a guard, and `export const runtime` in proxy.

### Gaps
- I did not fetch the "Authentication with Cache Components" guide, so the exact rules for `'use cache'` with per-user data are not captured.
- The 2023 blog post "How to think about security in Next.js" was not re-fetched. Its content appears to have been folded into the Data Security guide quoted above.

## Q2. Library landscape (2026): status, canonical files, reading the session per context, protecting routes

### Takeaway
Better Auth is the de-facto default open-source choice. Auth.js/NextAuth was handed to the Better Auth team in Sept 2025, its v5 is still `beta` on npm and it is in maintenance mode, and Better Auth itself joined Vercel in July 2026. Lucia is deprecated as a library. Managed providers (Clerk, Supabase, Kinde, WorkOS) all now document `proxy.ts` for Next 16 and `middleware.ts` for 15 and below. Each has a distinctive server helper that a generator must use instead of hand-rolled cookie decoding.

### Cited Findings
**Status**
- Auth.js announcement (2025-09-22): Auth.js is now maintained by the Better Auth team. Existing users can continue; security patches and urgent issues will still be handled; for new projects Better Auth is "strongly recommended" unless you need something like stateless sessions without a database. — [Better Auth blog: Auth.js joins Better Auth](https://www.better-auth.com/blog/authjs-joins-better-auth); [GitHub discussion #13252](https://github.com/nextauthjs/next-auth/discussions/13252)
- The authjs.dev banner reads "now part of **Better Auth**", the sidebar has a "Migrate to Better Auth" page, and the footer reads "Auth.js © Better Auth Inc. - 2026". — [authjs.dev installation](https://authjs.dev/getting-started/installation?framework=next.js)
- Better Auth joined Vercel on 2026-07-07. Vercel "shares our commitment to keeping auth open source, framework and platform agnostic". Auth.js maintenance for security fixes continues; no end-of-life date is given. — [Better Auth blog: Better Auth joins Vercel](https://better-auth.com/blog/better-auth-joins-vercel)
- npm on 2026-10-27: `next-auth` `latest` = 4.24.15 and `beta` = 5.0.0-beta.32, so v5 was never promoted to latest. `better-auth` `latest` = 1.7.14. — npm registry (`npm view next-auth dist-tags`, `npm view better-auth dist-tags`)
- Lucia: v3 was deprecated by March 2025 and the project became a learning resource on implementing auth from scratch. The companion resource is The Copenhagen Book. The npm package `lucia@3.2.2` carries the deprecation message "Please see https://lucia-auth.com/lucia-v3/migrate". — [Lucia GitHub README (mirror)](https://github.com/JH365/lucia); [DEV: Lucia Auth is getting deprecated](https://dev.to/gaundergod/lucia-auth-is-getting-deprected-4g7); npm registry

**Auth.js / NextAuth v5 (`next-auth@beta`)**
- `auth.ts` at the project root contains `export const { handlers, signIn, signOut, auth } = NextAuth({ providers: [] })`. — [authjs.dev installation](https://authjs.dev/getting-started/installation?framework=next.js)
- `app/api/auth/[...nextauth]/route.ts` re-exports `GET`/`POST` from `handlers` (`export const { GET, POST } = handlers`). — [authjs.dev installation](https://authjs.dev/getting-started/installation?framework=next.js)
- Optional `proxy.ts` (Next 16+): `export { auth as proxy } from "@/auth"`. Older Next versions use `export { auth as middleware }` in `middleware.ts`. Per the docs, this keeps the session alive by refreshing its expiry. `AUTH_SECRET` is the only mandatory env var (`npx auth secret`). — [authjs.dev installation](https://authjs.dev/getting-started/installation?framework=next.js)
- The Next.js data-security guide uses Auth.js-style `const session = await auth(); if (!session?.user) throw new Error('Unauthorized')` inside Server Actions and DAL mutations. — [Next.js Data Security guide](https://nextjs.org/docs/app/guides/data-security)

**Better Auth**
- `lib/auth.ts` exports `auth = betterAuth({...})`. `app/api/auth/[...all]/route.ts` contains `export const { GET, POST } = toNextJsHandler(auth);` (from `better-auth/next-js`). The docs recommend keeping the `/api/auth/[...all]` path. — [Better Auth Next.js integration](https://www.better-auth.com/docs/integrations/next)
- `lib/auth-client.ts` imports `createAuthClient` from `better-auth/react` (not the base package). — [Better Auth Next.js integration](https://www.better-auth.com/docs/integrations/next)
- `nextCookies()` from `better-auth/next-js` is required so that `auth.api.signInEmail` and similar calls in Server Actions set cookies: "make sure this is the last plugin in the array". — [Better Auth Next.js integration](https://www.better-auth.com/docs/integrations/next)
- Server Components and Server Actions read the session with `await auth.api.getSession({ headers: await headers() })`, then `redirect('/sign-in')` when it is null. — [Better Auth Next.js integration](https://www.better-auth.com/docs/integrations/next)
- In proxy, Next 16's `proxy.ts` (Node runtime) can do a full `auth.api.getSession` check. The cookie-only `getSessionCookie` from `better-auth/cookies` is faster but "anyone can manually create a cookie to bypass it". Next 15.2+ needs `middleware.ts` with `runtime: "nodejs"` for full validation; Next 13–15.1 runs on Edge, so cookie checks only. — [Better Auth Next.js integration](https://www.better-auth.com/docs/integrations/next)
- Caveat: RSCs can't set cookies, so the cookie cache refreshes only when a Server Action or Route Handler runs. — [Better Auth Next.js integration](https://www.better-auth.com/docs/integrations/next)

**Clerk (`@clerk/nextjs`, latest 7.9.21)**
- The file is "`proxy.ts` on Next.js 16+, `middleware.ts` on 15 and below" and calls `clerkMiddleware()` from `@clerk/nextjs/server`. Scaffold it with `npx -y clerk@latest init`. — [Clerk Next.js quickstart](https://clerk.com/docs/nextjs/getting-started/quickstart)
- "`ClerkProvider` goes inside `<body>`, not wrapping `<html>`." The UI uses `SignInButton`, `SignUpButton`, `UserButton` and `<Show when="signed-in" | "signed-out">`; wrap `<Show>` in `<Suspense>` because it reads the request. — [Clerk Next.js quickstart](https://clerk.com/docs/nextjs/getting-started/quickstart)
- `auth()` is async ("Always `await auth()`"), server-only and App Router-only. It works in Server Components, Route Handlers and Server Actions, and requires `clerkMiddleware`. Pattern: `const { isAuthenticated, redirectToSignIn, userId } = await auth(); if (!isAuthenticated) return redirectToSignIn()`. — [Clerk auth() reference](https://clerk.com/docs/reference/nextjs/app-router/auth)
- `auth.protect({ role | permission | has, unauthenticatedUrl, unauthorizedUrl })` returns `Auth` when allowed. It returns a 404 when authenticated but unauthorized, and redirects to sign-in when unauthenticated (401 for Server Actions). With Cache Components, call it inside `<Suspense>`. — [Clerk auth() reference](https://clerk.com/docs/reference/nextjs/app-router/auth)
- `currentUser()` returns the Backend User. Each call hits `GET /v1/users/{id}`, which "counts toward the Backend API request rate limit". Prefer `useUser()` on the client. Don't pass the full object to the client because it includes `privateMetadata`. — [Clerk currentUser() reference](https://clerk.com/docs/reference/nextjs/app-router/current-user)

**Supabase (`@supabase/ssr`)**
- Env vars are `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`; the publishable key replaces the old anon key in current docs. Helpers live in `lib/supabase/` (`client.ts` with `createBrowserClient`; `server.ts` with an async `createClient()` using `createServerClient` and `cookies: { getAll, setAll }`, where `setAll` is wrapped in try/catch because Server Components cannot write cookies). — [Supabase SSR Next.js guide](https://supabase.com/docs/guides/auth/server-side/nextjs); [Supabase creating a client](https://supabase.com/docs/guides/auth/server-side/creating-a-client?framework=nextjs)
- `lib/supabase/proxy.ts` exports `updateSession(request)`, which calls `supabase.auth.getClaims()` and returns the `supabaseResponse` built by `setAll`. The root `proxy.ts` (16+) or `middleware.ts` (15 and below) calls it. On Next ≤15, "a `proxy.ts` file is never called, so sessions never refresh". — [Supabase SSR Next.js guide](https://supabase.com/docs/guides/auth/server-side/nextjs)
- "*Never* trust `supabase.auth.getSession()` inside server code such as Proxy." "Always use `supabase.auth.getClaims()` to protect pages and user data." `getClaims` verifies the JWT signature, locally via cached JWKS on asymmetric-key projects. `getUser` does a network round-trip for the freshest user record. — [Supabase SSR Next.js guide](https://supabase.com/docs/guides/auth/server-side/nextjs)
- Note: the extracted Supabase code above was partly reconstructed by the fetch tool from the page's description, since the code blocks were not in the extracted text. Treat exact bodies as indicative. — [Supabase creating a client](https://supabase.com/docs/guides/auth/server-side/creating-a-client?framework=nextjs)

**Kinde (`@kinde-oss/kinde-auth-nextjs`)**
- `app/api/auth/[kindeAuth]/route.ts` contains `export const GET = handleAuth()` (from `/server`). `proxy.ts` (or legacy `middleware.ts`) uses `withAuth` from `/middleware` with `publicPaths`. On the server, `getKindeServerSession()` provides `isAuthenticated`, `getUser` and `getPermission`. UI uses `LoginLink`/`LogoutLink` (from `/components`); the client hook is `useKindeBrowserClient`; `KindeProvider` is optional. — [Kinde Next.js SDK](https://docs.kinde.com/developer-tools/sdks/backend/nextjs-sdk/)

**WorkOS AuthKit (`@workos-inc/authkit-nextjs`)**
- `proxy.ts` uses `authkitProxy()`, or `authkit(request)` when composing with other logic. `app/layout.tsx` wraps the app in `AuthKitProvider` (required). `app/callback/route.ts` contains `export const GET = handleAuth()`. `app/login/route.ts` redirects to `getSignInUrl()`. — [WorkOS AuthKit Next.js](https://workos.com/docs/user-management/nextjs)
- On the server, `const { user } = await withAuth({ ensureSignedIn: true })`. On the client, `useAuth` from `@workos-inc/authkit-nextjs/components`. Sign-out is `signOut()` called from a Server Action form and needs a Sign-out URI configured in the dashboard. — [WorkOS AuthKit Next.js](https://workos.com/docs/user-management/nextjs)

### Inferences
Per-library "read session" cheat-sheet for a generator (server contexts = Server Component, Server Action, Route Handler):

| Library | Detect (package.json dep) | Server read | Guard idiom | Client read | Sign-in/out | Route mount |
|---|---|---|---|---|---|---|
| Hand-rolled (Next docs) | `jose` / `iron-session`, no auth lib | `verifySession()` from `lib/dal.ts` | `verifySession()` redirects | props from server parent | own Server Actions `login`/`logout` | none |
| Auth.js v5 | `next-auth` (`^5` / beta) | `await auth()` from `@/auth` | `if (!session?.user) redirect(...)` | (see Gaps) | `signIn()`/`signOut()` from `@/auth` in Server Actions | `app/api/auth/[...nextauth]/route.ts` |
| Better Auth | `better-auth` | `auth.api.getSession({ headers: await headers() })` | null → `redirect('/sign-in')` | `authClient` from `lib/auth-client.ts` | `auth.api.signInEmail` in actions + `nextCookies()`; or `authClient.signIn.*` | `app/api/auth/[...all]/route.ts` |
| Clerk | `@clerk/nextjs` | `await auth()` / `currentUser()` | `await auth.protect({ role })` | `useUser()` | Clerk components | none (proxy only) |
| Supabase | `@supabase/ssr` | `(await createClient()).auth.getClaims()` | no claims → redirect | `createBrowserClient` | `supabase.auth.signInWith*` | proxy `updateSession` required |
| Kinde | `@kinde-oss/kinde-auth-nextjs` | `getKindeServerSession().isAuthenticated()/getUser()` | redirect | `useKindeBrowserClient` | `LoginLink`/`LogoutLink` | `app/api/auth/[kindeAuth]/route.ts` |
| WorkOS | `@workos-inc/authkit-nextjs` | `withAuth()` | `withAuth({ ensureSignedIn: true })` | `useAuth` | `getSignInUrl()` / `signOut()` | `app/callback/route.ts` |

- For Auth.js, detect v4 vs v5 by the semver of `next-auth`. If v4 (`^4`), the project likely uses `getServerSession(authOptions)` / `[...nextauth]` with `authOptions`. A generator should either support it as legacy or warn, and should never emit v4 patterns in new code.
- Supabase uniquely requires the proxy file for session refresh. It is not optional, unlike Better Auth and Auth.js where proxy is optional or optimistic.

### Gaps
- Not verified from source in this pass:
  - Auth.js client-side API (`SessionProvider`/`useSession` from `next-auth/react`).
  - Clerk `createRouteMatcher` + `auth.protect()` inside `clerkMiddleware` for route-level protection.
  - Clerk's `has()` / `sessionClaims` details.
  - The full Supabase SSR code bodies (the fetched page omitted the code blocks).
- I did not check whether Better Auth has published a Lucia-like deprecation notice for `next-auth` v4, or a formal EOL date for Auth.js. None was found in the announcement posts.
- Better Auth's default env var names (`BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`) were not verified in this pass.

## Q3. Authorization: role/permission checks in the DAL, colocated `can()` helpers, avoiding leaks to client components

### Takeaway
Put authorization predicates next to the data, inside `server-only` DAL/DTO modules. Check both role and resource ownership (IDOR) in every mutation. Return field-level DTOs, and pass only minimal props to `'use client'` components. Managed providers offer role/permission primitives (Clerk `auth.protect({ role, permission })`, Kinde `getPermission`) that should be called from the same DAL position.

### Cited Findings
- Colocated predicate pattern: `canSeeUsername(viewer)` and `canSeePhoneNumber(viewer, team) { return viewer.isAdmin || team === viewer.team }` live in `server-only` DTO modules and gate each returned field. — [Next.js Authentication guide](https://nextjs.org/docs/app/guides/authentication); [Next.js Data Security guide](https://nextjs.org/docs/app/guides/data-security)
- Authorization is distinct from authentication: "does this user have permission to act on this specific resource?" The guide's example is an ownership check that throws `Forbidden`. — [Next.js Data Security guide](https://nextjs.org/docs/app/guides/data-security)
- Optimistic vs secure checks: optimistic checks read cookie session data and are for UI show/hide and redirects; secure checks read session data from the DB and are for sensitive data and actions. — [Next.js Authentication guide](https://nextjs.org/docs/app/guides/authentication)
- Client-component leak prevention: "BAD: This is a bad props interface because it accepts way more data than the Client Component needs." Sanitize to public fields before passing data down. Taint APIs are a backstop. — [Next.js Data Security guide](https://nextjs.org/docs/app/guides/data-security)
- `getCurrentUser` is cached so it is read where needed, not passed around: this "discourages passing it from Server Component to Server Component which minimizes risk of passing it to a Client Component." — [Next.js Data Security guide](https://nextjs.org/docs/app/guides/data-security)
- In Clerk, `auth.protect({ role, permission })` returns 404 for authenticated but unauthorized users. Don't ship `currentUser()` objects to the client because they contain `privateMetadata`. — [Clerk auth() reference](https://clerk.com/docs/reference/nextjs/app-router/auth); [Clerk currentUser() reference](https://clerk.com/docs/reference/nextjs/app-router/current-user)
- Route Handler status convention: `401` when there is no session, `403` when the role is wrong. — [Next.js Authentication guide](https://nextjs.org/docs/app/guides/authentication)

### Inferences
- A generator's "auth guard helper" should emit, in `lib/dal.ts` (or `data/auth.ts`):
  - `getCurrentUser` / `verifySession`, cached and `server-only`.
  - `requireUser()`, which redirects (for pages) or throws (for actions).
  - `requireRole(role)`.
  - An optional `can(user, action, resource)` that is pure and colocated, so it can be unit-tested.
  - For actions, throw `Error('Unauthorized')`/`Error('Forbidden')` rather than redirecting. For handlers, return a 401/403 `Response`.
- Emitted DAL functions should select explicit columns and return plain DTO objects. Generated client components should take narrow prop types such as `{ name: string }`, never `User`.

### Gaps
- I did not research third-party RBAC/ABAC libraries (CASL, Permit.io, Better Auth's `admin` / `organization` / access-control plugins) in this pass.

## Q4. Detecting the auth library and the minimal files to emit

### Takeaway
Detect the library from `package.json` dependencies (and the `next` major for proxy vs middleware). Then emit the library-native helper instead of a generic one. The minimal sets below follow each vendor's documented layout.

### Cited Findings
- Package names to detect: `next-auth` (Auth.js; v5 = `beta` tag), `better-auth`, `@clerk/nextjs`, `@supabase/ssr`, `@kinde-oss/kinde-auth-nextjs`, `@workos-inc/authkit-nextjs`. The deprecated `lucia` should be flagged. — [authjs.dev](https://authjs.dev/getting-started/installation?framework=next.js); [Better Auth](https://www.better-auth.com/docs/integrations/next); [Clerk quickstart](https://clerk.com/docs/nextjs/getting-started/quickstart); [Supabase SSR](https://supabase.com/docs/guides/auth/server-side/nextjs); [Kinde](https://docs.kinde.com/developer-tools/sdks/backend/nextjs-sdk/); [WorkOS](https://workos.com/docs/user-management/nextjs); npm registry
- Proxy file naming depends on the Next version (16+ uses `proxy.ts`; ≤15 uses `middleware.ts` with a `middleware` export). This is stated by Next.js, Clerk, Supabase, Better Auth and Auth.js docs. A wrong filename silently disables the file, as the Supabase warning about ≤15 shows. — [Next.js proxy reference](https://nextjs.org/docs/app/api-reference/file-conventions/proxy); [Supabase SSR](https://supabase.com/docs/guides/auth/server-side/nextjs)
- For the "no library" fallback, Next.js's own layout is `app/lib/session.ts`, `app/lib/dal.ts`, `app/lib/definitions.ts`, `app/actions/auth.ts` and `app/ui/*-form.tsx`, using `jose` and `server-only`. — [Next.js Authentication guide](https://nextjs.org/docs/app/guides/authentication)
- Sign-in form convention: a `'use client'` form, `useActionState(action, undefined)` returning `[state, action, pending]`, Zod validation in the Server Action, field errors from `error.flatten().fieldErrors`, and a submit button disabled while `pending`. — [Next.js Authentication guide](https://nextjs.org/docs/app/guides/authentication)

### Inferences
Detection order (first match wins): `@clerk/nextjs` → `@supabase/ssr` → `better-auth` → `next-auth` (split on major: ≥5 means v5, otherwise legacy v4 with a warning) → `@kinde-oss/kinde-auth-nextjs` → `@workos-inc/authkit-nextjs` → `lucia` (warn that it is deprecated, then treat as hand-rolled) → fallback to hand-rolled `jose`. Also detect `src/` vs root, and the `@/` alias, from tsconfig `paths`. Read the existing `auth.ts`/`lib/auth.ts` location rather than assuming it.

Minimal emits per template:
- **Protected page** (`app/<route>/page.tsx`, async Server Component):
  - Hand-rolled: `await verifySession()`.
  - Auth.js: `const session = await auth(); if (!session?.user) redirect('/api/auth/signin' | '/login')`.
  - Better Auth: `getSession({ headers: await headers() })`, then redirect.
  - Clerk: `await auth.protect()`.
  - Supabase: `getClaims()`, then redirect.
  - Kinde: `isAuthenticated()`.
  - WorkOS: `withAuth({ ensureSignedIn: true })`.
  - In all cases, no auth guard lives in `layout.tsx`. With Cache Components on, wrap the dynamic part in `<Suspense>`.
- **Auth guard helper** (`lib/dal.ts`, `import 'server-only'`): `getCurrentUser = cache(...)` wrapping the library call above, plus `requireUser()`, `requireRole()` and a DTO mapper. For managed providers this is a thin wrapper, so the rest of the app never imports the vendor SDK directly. That keeps vendor swaps local; this design choice is my inference, not something the vendor docs say.
- **Sign-in form**:
  - Hand-rolled, Auth.js and Better Auth: a client form plus a `'use server'` action file that validates with Zod and calls `signIn(...)` / `auth.api.signInEmail(...)`. Better Auth needs `nextCookies()` registered.
  - Clerk: emit `<SignIn />` / `<SignInButton />` usage instead of a custom form.
  - Kinde: `LoginLink`.
  - WorkOS: a `login/route.ts` redirecting to `getSignInUrl()`.
  - Supabase: a Server Action calling `supabase.auth.signInWithPassword` via the server client.
- **Sign-out**: always a Server Action, or the library component, bound to a `<form action>`. Never a GET or a render side effect.
- **Proxy**: emit only if missing. It is optional and optimistic for hand-rolled, Auth.js and Better Auth; required for Supabase (session refresh) and Clerk (`clerkMiddleware` is required for `auth()`); used for route protection by Kinde and WorkOS.

### Gaps
- No vendor documents an official "detection" scheme. The detection order above is my design inference.
- I did not verify exact sign-in API signatures for Supabase `signInWithPassword` or Better Auth `signInEmail({ body: {...}, headers })` in this pass.
