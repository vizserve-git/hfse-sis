# 11 — Performance Patterns

The playbook for making pages feel fast in this app. Apply to every new feature. Adopted 2026-04-18 after a pass that cut per-nav auth latency from ~200–500ms to ~1–5ms and cached/parallelized the dashboard + grading list.

## 1. Auth on the hot path

- **Middleware uses `getClaims()`, not `getUser()`.** `lib/supabase/middleware.ts` calls `supabase.auth.getClaims()`, which verifies the JWT signature locally against the cached JWKS — no network round-trip per navigation. `proxy.ts` reads role via `getRoleFromClaims(claims)` from `lib/auth/roles.ts`.
- **`proxy.ts` matcher excludes `/api/*`.** API routes authenticate themselves via `requireRole()` inside each handler. Running the proxy on them was pure overhead.
- **Page / server-component code: prefer `getClaims()` too.** Claims include `sub` (user id), `email`, `app_metadata`, `user_metadata` — that's almost always all you need. References: `app/(dashboard)/page.tsx`, `app/(dashboard)/grading/page.tsx`.
- **API routes stay on `requireRole()`** (which currently calls `getUser()` under the hood). Not on the nav hot path; migrating is a separate, optional pass.
- **Tradeoff:** claims reflect token state at issue time. A role change in `app_metadata` lands after the next token refresh (~1h). Fine for this app — staff roles are effectively static.
- **Caveat:** `getClaims()` only performs local verification when the Supabase project uses asymmetric JWT signing keys (default for new projects since 2024). With legacy HS256 keys, `auth-js` silently falls back to a network `getUser()` call. Verify under Auth → JWT Keys if the win doesn't materialize.

## 2. Server-component data fetching

- **Default to parallel.** Two sequential `await supabase.from(...)` calls in a page is a bug. Use `Promise.all([...])`. Dependent queries run in waves — fetch IDs first, then the dependent counts in a single second-wave `Promise.all`. Reference: `app/(dashboard)/page.tsx::loadStatsUncached`.
- **Combine count + rows in one query** when both are needed: `.select('id', { count: 'exact' })` returns the rows *and* the exact count in a single round-trip. Don't issue a separate `head: true` count query next to a rows query against the same table.
- **Cache what's safe.** School-wide, service-client reads → wrap in `unstable_cache` with a short TTL and a descriptive tag. References:
  - `app/(dashboard)/page.tsx::loadStats` — 60s TTL, tag `dashboard-stats`.
  - `lib/admissions/dashboard.ts` — 10min TTL, tag `admissions-dashboard:${ayCode}`.
- **Don't cache RLS-scoped queries.** Rows differ per user; caching creates either cross-contamination risk or degenerates into per-user cache slots with no real win. Just parallelize them. Reference: `app/(dashboard)/grading/page.tsx`.
- **Top-level parallelization.** Even cached calls should overlap with other fetches. Kick off multiple independent `Promise`s and `await Promise.all([...])` — don't pay for them serially. Reference: `app/(dashboard)/page.tsx` (`loadStats` + `getPipelineCounts` + `getOutdatedApplications` all in one `Promise.all`).
- **Tag invalidation (future):** when freshness matters more than 60s, call `revalidateTag('dashboard-stats')` from the mutating API route. Not wired yet — current TTL covers it.

## 3. Loading UX

- **Every route segment with >1 server fetch on first paint needs a `loading.tsx`.** Without one, Next.js sits on the previous page until the RSC work resolves. Navigation feels broken even when it isn't.
- **Reuse `Skeleton`** from `components/ui/skeleton.tsx` and wrap in `PageShell` so the sidebar frame doesn't jump.
- **Tailor the shape to the page** (card grid, table rows, document). A generic spinner is worse than a well-matched skeleton because the layout shifts when real content arrives.
- **Shared skeletons** live next to the component they mirror. Reference: `components/report-card/report-card-skeleton.tsx` is reused by both `app/(dashboard)/report-cards/[studentId]/loading.tsx` and `app/(parent)/parent/report-cards/[studentId]/loading.tsx`.
- **Skip `loading.tsx`** on static-ish pages (login, account, forms with no server fetching) — it adds visual noise for no gain.

## 4. Client-side data (TanStack Query)

- **Not adopted app-wide.** RSC + `unstable_cache` handles almost everything this app does. Adding a client-side query lib to RSC pages gives you nothing and costs bundle size.
- **One legitimate candidate:** the grading grid autosave (`components/grading/score-entry-grid.tsx`). Optimistic updates, retry/rollback, and dedupe would be a genuine UX win there. Targeted refactor only — don't spread it to RSC pages.

## 5. Checklist before shipping a new feature

Before marking any new page or feature done, walk through:

- [ ] No `getUser()` calls in middleware or server-component page code — use `getClaims()`.
- [ ] Any two sequential `await supabase.from(...)` collapsed into `Promise.all`.
- [ ] Combined `select('id', { count: 'exact' })` anywhere you need both rows and count against the same table.
- [ ] School-wide / service-client reads wrapped in `unstable_cache` with a descriptive tag.
- [ ] `loading.tsx` added for any new route segment with real server-side fetching.
- [ ] Mutating API routes that touch cached data call `revalidateTag(...)` (when freshness matters more than the TTL).
- [ ] Per-cell autosave, optimistic updates, or retry logic? Consider TanStack Query; otherwise stay on raw state.
