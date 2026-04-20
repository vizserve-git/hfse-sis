# HFSE SIS

Student Information System for **HFSE International School, Singapore**. It replaces manual Google Sheets grading plus scattered Directus / Google Drive records under a single `studentNumber`-keyed profile. The app is organised into four modules:

- **Markbook** — teachers enter raw scores; the server computes quarterly grades, enforces locking with audit trail, and produces printable report cards.
- **P-Files** — student document repository with revision history (passports, birth certs, medical, parent / guardian passes).
- **Admissions** — read-only pipeline analytics over the shared admissions tables.
- **Records** — day-to-day records management (profile, family, stage pipeline, discount codes, document validation) — replaces Directus. Routes live under `/records/*`; related admin tooling (AY setup, approvers) at `/sis/*`.

One registrar, ~90 students × 4 terms × ~12 subjects. Volume is small; correctness and auditability are not.

## Stack

- **Next.js 16** (App Router, Turbopack, TypeScript)
- **Supabase** (Postgres + Auth) — single shared project, also hosts the admissions tables
- **Tailwind CSS v4** (`@theme inline` in `app/globals.css` — no `tailwind.config.*`)
- **shadcn/ui** primitives + Radix UI (Dialog, Select, Checkbox, Tooltip, Label)
- **Vercel** deployment target
- Report cards use the browser's **Print / Save as PDF**; a Python/WeasyPrint service was planned originally and deferred — see `docs/sprints/development-plan.md` Sprint 6.

## Repository layout

The Next.js project lives at the repo root. The `app/` directory below is the Next.js **App Router**, not a wrapper subdirectory. Vercel's **Root Directory** should be left blank (or `./`).

```
hfse-markbook/
├── CLAUDE.md                   ← contract: hard rules, stack conventions, gotchas
├── AGENTS.md                   ← short Next 16 warning for AI tools
├── README.md                   ← this file
├── proxy.ts                    ← Next 16 middleware — auth + role gate (renamed from middleware.ts)
├── package.json
├── next.config.ts
├── tsconfig.json
├── app/                        ← App Router (one route group per module)
│   ├── (auth)/login/
│   ├── (dashboard)/            ← neutral shell: / (role-redirect + module picker), /account, /admin/admissions
│   ├── (markbook)/markbook/    ← grading, report-cards, sections, sync-students, change-requests, audit-log
│   ├── (p-files)/p-files/      ← student document repository + audit log
│   ├── (records)/records/      ← Records module: students, discount-codes, audit-log
│   ├── (sis)/sis/              ← SIS Admin hub: AY setup, approver management
│   ├── (parent)/parent/        ← parent portal SSO landing
│   ├── api/                    ← all route handlers
│   ├── globals.css             ← single source of truth for design tokens
│   └── layout.tsx
├── components/
│   ├── ui/                     ← shadcn primitives + DatePicker + DateTimePicker + PageShell
│   ├── grading/                ← score-entry-grid, letter-grade-grid, lock-toggle, totals-editor
│   ├── admin/                  ← teacher-assignments-panel, publish-window-panel, publication-status
│   ├── admissions/             ← pipeline + funnel + outdated-applications charts
│   ├── p-files/                ← completeness-table, upload-dialog, history-dialog
│   ├── sis/                    ← Records UI + dashboard widgets + SIS admin UI
│   └── {markbook,parent,p-files,records,sis}-sidebar.tsx + module-switcher.tsx
├── lib/
│   ├── supabase/               ← client / server / service / middleware clients
│   ├── auth/                   ← role gate, route gate, NAV_BY_ROLE
│   ├── compute/                ← quarterly.ts + annual.ts (both with self-tests)
│   ├── audit/                  ← grade change diffing
│   └── sync/                   ← admissions → grading sync
├── hooks/
├── types/
├── supabase/
│   ├── migrations/             ← 001 initial schema → 013 approver assignments
│   └── seed.sql                ← AY2026 reference data
└── docs/
    ├── context/                ← project-overview, grading system, schema, API routes, design system
    └── sprints/development-plan.md
```

## Hard rules (the short version)

These come from `CLAUDE.md` — read that file before writing code.

1. **Formula must return 93** on the canonical P1 Patience × Math test case. `lib/compute/quarterly.ts` self-tests at module load.
2. **All grade computation is server-side.** Clients send raw scores, never computed values.
3. **Blank ≠ zero.** `null` means "did not take", `0` means "took it, scored zero".
4. **`studentNumber` is the only stable student ID** — `enroleeNumber` resets each AY, never cross-link with it.
5. **Post-lock edits require `approval_reference`** + append one row per changed field to `grade_audit_log`.
6. **Grade entries and audit logs are append-only.** Withdrawn students stay in `section_students` with `enrollment_status='withdrawn'`.
7. **Design system is binding.** All colors/fonts/radii come from `app/globals.css` (App Router root) via shadcn semantic tokens — never hardcode hex/oklch, never use `slate-*`/`zinc-*`/`gray-*`. See `docs/context/09-design-system.md`.

## Roles

Stored in Supabase `app_metadata.role`. One of: `teacher`, `registrar`, `school_admin`, `admin`, `superadmin`, `p-file`. (Parents are null-role Supabase Auth users routed to `/parent/*` by `proxy.ts`.) `admin` is narrow — grade-change approval pool (principals / academic head). `school_admin` handles school operations (AY setup, Records, discounts). `superadmin` is reserved for destructive / IT / CEO-level ops. See `CLAUDE.md` KD #39.

Route-level access is enforced by `proxy.ts`; UI nav is driven by `NAV_BY_ROLE` in `lib/auth/roles.ts`.

Teacher row-level scoping uses the `teacher_assignments` table (`user × section × subject × role`) with two role values: `form_adviser` (one per section) and `subject_teacher` (one per section × subject).

## Getting started

### 1. Install

```bash
npm install
```

### 2. Environment

Copy the example and fill in your Supabase project values:

```bash
cp .env.local.example .env.local
```

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_KEY=        # server-only, bypasses RLS — never expose to the browser
PDF_SERVICE_URL=             # reserved, leave blank
```

### 3. Database

Apply migrations in order to your Supabase project. Either via CLI:

```bash
supabase db push
```

Or by pasting each file from `supabase/migrations/` into the Supabase SQL editor in order (001 → 002 → 003 → 004 → 005). Then run `supabase/seed.sql` for AY2026 reference data (levels, subjects, sections, terms, subject_configs).

### 4. Create your first user

Supabase dashboard → Authentication → Users → invite by email. After the user sets a password, open their row and set `app_metadata` to:

```json
{ "role": "registrar" }
```

(Or `teacher` / `admin` / `superadmin`.)

### 5. Run

```bash
npm run dev
```

Open `http://localhost:3000`. You'll be redirected to `/login`.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Dev server (Turbopack) |
| `npm run build` | Production build — also runs the `quarterly.ts` self-test at module load; a failing test aborts the build |
| `npm run start` | Serve a production build locally |
| `npm run lint` | ESLint |

## Next.js 16 gotchas

These differ from Next 15 and from typical training data. If something looks wrong, consult `node_modules/next/dist/docs/`.

- **`middleware.ts` is renamed to `proxy.ts`**. The exported function must be named `proxy`. See `proxy.ts` at the repo root.
- `cookies()`, `headers()`, `params`, `searchParams` are **async** — always `await`.
- Use `@supabase/ssr`, never the deprecated `@supabase/auth-helpers-nextjs`.
- Use `next/navigation` for redirects in server components, never `next/router`.

## Deployment

Target is **Vercel**, with **Root Directory left blank** (repo root is the Next.js project). Environment variables required in Vercel: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_KEY` (mark as sensitive). After the first deploy, update Supabase → Authentication → URL Configuration to add the Vercel domain as both the Site URL and a redirect URL — otherwise `/api/auth/callback` will reject the login redirect.

Full deploy checklist (git init, Vercel project creation, Supabase redirect URLs, smoke test): see the deployment notes in `docs/sprints/development-plan.md` Sprint 6.

## Reference docs

| Doc | Read when… |
|---|---|
| `CLAUDE.md` | Every task — contract for what ships |
| `docs/sprints/development-plan.md` | Status snapshot + current sprint |
| `docs/context/01-project-overview.md` | Onboarding |
| `docs/context/02-grading-system.md` | Grade computation or formula |
| `docs/context/03-workflow-and-roles.md` | Permissions, locking, workflow |
| `docs/context/04-database-schema.md` | DB tables / queries |
| `docs/context/05-report-card.md` | Report card UI / PDF |
| `docs/context/06-admissions-integration.md` | Admissions sync |
| `docs/context/07-api-routes.md` | API contracts |
| `docs/context/09-design-system.md` | Any UI work — tokens, components, forbidden patterns |
| `docs/context/10-parent-portal.md` | Parent portal handoff + admissions DDL reference |
| `docs/context/11-performance-patterns.md` | Any new page — auth / cache / parallel / loading checklist |
| `docs/context/12-p-files-module.md` | P-Files module — document types, upload flow, revisions |
| `docs/context/13-sis-module.md` | Records module — profile / family / stage / discount / validation |
| `docs/context/14-modules-overview.md` | Cross-module work — architecture hub, data contract |
| `docs/context/15-markbook-module.md` | Grading / report-card / attendance — module scope doc |
