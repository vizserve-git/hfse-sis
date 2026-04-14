# Parent Portal Integration

Reference for how HFSE Markbook integrates with the existing HFSE parent portal. Read this before touching anything under `app/(parent)/`, `lib/supabase/admissions.ts`, or the `report_card_publications` migration.

## The parent portal is a separate codebase

The HFSE parent portal (where parents enrol, add, review, edit, and update their student applications) is a **separate Next.js project** maintained outside this repo. It shares the same Supabase project with the HFSE Markbook — which is how the markbook reaches parent data without parents needing a second account.

This repo has **no code for** enrolment, application editing, document upload, or any other parent-portal feature. The markbook only serves report cards to parents and relies on the parent portal to do everything else.

## Shared Supabase project

Both systems point at the same Supabase project. The grading schema tables (`academic_years`, `terms`, `levels`, `subjects`, `students`, `section_students`, `grading_sheets`, `grade_entries`, `grade_audit_log`, `report_card_comments`, `attendance_records`, `teacher_assignments`, `audit_log`, `report_card_publications`) live in `public` and are owned by this repo's migrations.

The **admissions tables** that the parent portal owns live in the same Supabase project but are managed by the parent portal's own migrations. The markbook reads from them as a foreign schema would — we never `ALTER`, `INSERT`, `UPDATE`, or `DELETE` any admissions row from this repo.

## Parent identity: no role = parent

Both systems authenticate against the **same `auth.users` table**.

- **Staff** (teacher / registrar / admin / superadmin) have their role set in `app_metadata.role` via `getUserRole()` in `lib/auth/roles.ts`.
- **Parents** have **no** `app_metadata.role`. A signed-in user with a null role is treated as a parent.

This is enforced in two layers:

1. **`proxy.ts`** — the middleware branches on `getUserRole()`. Null-role users are allowed only on `/parent/*`, `/account`, and `/login`; any other path redirects to `/parent`.
2. **`app/(parent)/layout.tsx`** — the parent route group's layout re-checks that `role === null` and redirects staff-role users back to `/`.

Never add `'parent'` to the `Role` type — it would break this heuristic and require schema-level role storage that neither system needs.

## Parent → student linkage: via admissions emails

The link between a parent Supabase account and a student is **implicit** via email match against the admissions tables:

- A parent signs in with, say, `jane.smith@example.com`
- `lib/supabase/admissions.ts::getStudentsByParentEmail()` queries `ay{YY}_enrolment_applications` with `.or('motherEmail.eq.jane.smith@example.com,fatherEmail.eq.jane.smith@example.com')`
- Every matching row is a child linked to this parent for the given academic year
- The child's `studentNumber` from admissions is then resolved to a `students.id` in the grading schema via `students.student_number`

**This means the parent's account email must exactly match an entry in `motherEmail` or `fatherEmail` in admissions.** There is no manual link table. If a parent wants to update their email, they do it in the parent portal (which writes back to `ay{YY}_enrolment_applications`), and the markbook picks up the new email on their next login.

**`fatherEmail` may be null** in admissions — the `.or(...)` query handles this correctly.

## Admissions tables the markbook reads

Three admissions tables are referenced by this repo. The column set below is **not authoritative** — it's just what this repo assumes exists. The parent portal owns the real DDL; paste it in the section below when you next refactor this doc so this file matches production reality.

### `ay{YY}_enrolment_applications`

Used by: `lib/supabase/admissions.ts::fetchAdmissionsRoster()`, `getStudentsByParentEmail()`, `lib/sync/students.ts`.

Columns this repo reads:

| Column | Type (assumed) | Used for |
|---|---|---|
| `enroleeNumber` | text | Join key to `ay{YY}_enrolment_status` |
| `studentNumber` | text | Stable cross-year student ID (Hard Rule #4) |
| `lastName`, `firstName`, `middleName` | text | Name sync |
| `motherEmail` | text | Parent auth lookup (required) |
| `fatherEmail` | text, nullable | Parent auth lookup (optional) |

### `ay{YY}_enrolment_status`

Used by: `fetchAdmissionsRoster()`, `getStudentsByParentEmail()`.

| Column | Used for |
|---|---|
| `enroleeNumber` | Join to applications |
| `classLevel` | Section level label (e.g. "Primary 1") |
| `classSection` | Section name (may contain typos — normalized in `lib/sync/section-normalizer.ts`) |
| `classAY` | AY code |
| `applicationStatus` | Filter out `"Cancelled"` / `"Withdrawn"` |

### `ay{YY}_enrolment_documents`

Used by the parent portal for document upload. **This repo does not read from it**, but it's listed here for completeness because it's part of the same admissions bundle. If future markbook features need to reference documents (e.g. "show uploaded birth certificate"), add the column shape here first.

## TODO: paste real admissions DDL

```sql
-- TODO: paste the actual CREATE TABLE statements from the parent portal's
-- migrations for ay2026_enrolment_applications, ay2026_enrolment_status, and
-- ay2026_enrolment_documents. Keep this in sync whenever the parent portal
-- bumps its schema. The markbook only relies on the columns listed above,
-- but having the full schema here makes drift visible.
```

## RLS consequences

The parent portal operates on admissions tables that live outside this repo's RLS domain. This repo's migrations 004/005 gate the **grading** tables; they do not touch admissions.

- `report_card_publications` has a **parent-read RLS policy** (`rcp_parent_read`) that allows any null-role authenticated user to SELECT all rows. The real gate is at the application layer: `app/(parent)/parent/page.tsx` and `app/(parent)/parent/report-cards/[studentId]/page.tsx` verify parent↔student via `getStudentsByParentEmail()` before fetching anything.
- Every query for grading data inside the parent route group uses the **service-role client** (`createServiceClient()`) because parents' cookie-bound clients cannot read `students`, `section_students`, `grading_sheets`, or `grade_entries` under migration 005.

Never change this to "parents read directly via RLS." The parent↔student relationship lives in admissions, which Postgres RLS policies in this repo cannot see. Keeping the gate in application code is the only workable option.

## What the parent flow actually does, step-by-step

1. Parent visits the markbook URL (the same URL staff use).
2. `/login` is public. Parent enters Supabase email + password.
3. On success, `proxy.ts` detects `getUserRole() === null` and redirects to `/parent`.
4. `/parent` page calls `getStudentsByParentEmail(user.email, 'AY2026')`.
5. For each admissions row returned, the server resolves `studentNumber` → grading `students.id` via the service-role client.
6. For each student, the server finds their current-AY `section_students` enrolment and any `report_card_publications` on that section.
7. Per term, the server computes whether each publication is `active` / `scheduled` / `expired` based on `publish_from` / `publish_until` vs `now()`.
8. The page renders one card per child with a "View report card" link per active publication.
9. Clicking the link goes to `/parent/report-cards/{studentId}`, which re-runs the parent→student verification and re-checks the publication window, then renders the shared `<ReportCardDocument>` via `buildReportCard()` (also using the service-role client).
10. Parent presses `Ctrl+P` to print / save as PDF — the print CSS in `components/report-card/report-card-document.tsx` produces the same paper layout the staff view uses.

## Out of scope

- **Parent self-service**: no enrolment, no application editing, no document upload, no profile edit in this repo. Parents do all of that in the parent portal.
- **Email notifications**: when the registrar publishes a window, parents are not emailed. They navigate to the URL on their own. Wiring Resend / SMTP / WhatsApp is a future sprint.
- **Cross-AY history**: parents only see current-AY report cards. Historical term cards are not exposed.
- **Account linking UI**: parents cannot "add another child" from within the markbook — the link is purely via email in admissions.
