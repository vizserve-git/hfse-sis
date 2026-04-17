# SIS Module (Student Information System)

> **Status:** 📋 TODO — discussion phase. Not yet scoped for a sprint. Details are deliberately open; this doc exists to anchor a planning conversation, not to dictate the build.

## Why this doc exists

HFSE currently uses **Directus** (a headless CMS / admin dashboard) as the admin UI for the admissions database. The plan is to replace it with a custom-built SIS module inside the markbook app, reading and writing the same Supabase tables that Directus touches today.

This context file captures the rough shape of the module, the decisions that have already been made (module boundary, P-Files relationship), and the open questions that need HFSE input before a sprint can be opened.

## What the SIS is for

A comprehensive records surface for admissions and registrar staff. Primary jobs-to-be-done:

- **Find a student.** Search by name, student number, enrolee number, section, level.
- **View the full record.** Demographics, family contacts, siblings, enrollment status, documents, discounts, medical/allergy flags, inquiry history.
- **Edit the record.** Update demographics, parent emails, class assignment, withdrawal status, etc.
- **Manage discounts.** Grant/revoke scholarships, sibling discounts, staff discounts, etc. (requires new `enrolment_discounts` table — not yet in the schema.)
- **Track inquiries.** SharePoint-sourced leads that precede application, plus conversion analytics (inquiry → applied → enrolled).
- **Replace Directus** as the day-to-day admissions tool. No data migration — the tables are already in Supabase.

## Access

- **Primary audience:** admissions staff, registrar
- **Admin + superadmin:** full access
- **Teachers, parents, `p-file` officer:** no access (not their workflow)

Role strategy — two options, TBD:
- (a) grant SIS to existing `registrar` / `admin` / `superadmin` roles (simpler, no new role)
- (b) add a new `sis` role for admissions staff who should see SIS but not grading (stricter, needs role-assignment UX)

## Module boundary decision

The app already has two modules: **Markbook** (grading) and **P-Files** (document verification). Two decisions have been made about where SIS fits:

### 1. SIS is a third module, not a folder in Markbook

Separate route group `/(sis)/sis/*` with its own sidebar and layout, parallel to the existing `/(p-files)/`.

**Why:**
- Different audience (admissions records vs. academic workflow) — putting SIS under `/admin/*` would crowd the markbook sidebar with unrelated concerns.
- Directus was already standalone, so users think of "the SIS" as its own tool; preserve the mental model.
- Scope grows fast — demographics, discounts, medical, scholarships, outreach logs. `/admin/admissions` can't absorb that.

### 2. P-Files stays separate — it does NOT fold into SIS

**Why:**
- The `p-file` officer has a distinct job (document verification) and shouldn't see discounts / demographics / medical records. Noise and unnecessary access surface.
- Just shipped as Sprint 8 (2026-04-17) — breaking the module boundary immediately would reset user muscle memory.
- Specialization is fine when the tasks are genuinely distinct. P-Files asks "does this student have a valid birth cert?"; SIS asks "what is this student's complete record?"

### 3. Inquiries live inside SIS, not in `/admin/admissions`

Earlier conversation considered putting SharePoint inquiries under `/admin/admissions/inquiries` as a sibling to the existing read-only pipeline dashboard. The existence of SIS changes that: inquiries belong in SIS so the full funnel (inquiry → application → enrolled → discount → document) is visible in one place.

The existing `/admin/admissions` pipeline dashboard can stay where it is (it's the high-level analytics hero) or get merged into SIS as a tab later. Defer this call until SIS scope firms up.

## Cross-module data contract

Three modules share the admissions tables. The rule: **each table has one primary writer.**

| Table | SIS | P-Files | Markbook |
|---|---|---|---|
| `ay{YY}_enrolment_applications` | **Write** (demographics, parent emails) | Write (passport# / pass type via upload dialog — Key Decision #34) | Read (parent→student lookup) |
| `ay{YY}_enrolment_status` | **Write** (class assignment, withdrawal, etc.) | Read | Read (filter enrolled) |
| `ay{YY}_enrolment_documents.{slotKey}` (URL) | Read | **Write** (canonical file URL) | — |
| `ay{YY}_enrolment_documents.{slotKey}Status` | **Write** (approve / reject — validation call) | Write on staff upload (sets to `'Valid'`) | — |
| `ay{YY}_enrolment_documents.{slotKey}Expiry` | Read / edit | **Write** (from upload dialog metadata) | — |
| `p_file_revisions` | Read (historical context per student) | **Write** (appended on replace, Key Decision #36) | — |
| `enrolment_discounts` *(new)* | **Write** (exclusive) | — | — |
| Inquiries *(source TBD)* | **Write** (exclusive) | — | — |

Coordination notes:
- **Document validation (approve/reject) is SIS's job, not P-Files's.** P-Files is a repository — it shows files, archives prior versions, and never mutates a status to `Rejected`. SIS is the sole writer of "rejected" and is the intended surface to send a document back to the parent for re-upload.
- SIS must NOT re-implement document upload — it links out to P-Files for that. An "Upload / Replace" button in SIS's Documents tab should open the P-Files student detail page.
- The P-Files upload route already co-writes passport number / pass type to `enrolment_applications` (Key Decision #34). SIS write forms on the same fields need to respect that shared surface — use zod schemas in `lib/schemas/` if this ever becomes contentious.
- `enrolment_status.classSection` is the liveness signal used by Markbook's roster sync (`lib/sync/students-planner.ts`). SIS should never null this out silently — withdrawal should go through a dedicated flow that updates `applicationStatus='Withdrawn'` and flags the student clearly.

## Open questions for HFSE discussion

These need answers before a sprint opens:

- [ ] **Directus feature parity** — what exactly does the admissions team do in Directus today? List every workflow so the MVP scope is grounded, not invented. (Student edit? Discount grant? Bulk status update? Reports?)
- [ ] **`enrolment_discounts` schema** — what columns? Per-student rows? Discount type enum? Amount vs percentage? Validity window? Approval workflow? Who grants? Who revokes? Audit trail?
- [ ] **Inquiries data source** — SharePoint list, API, CSV export, or something else? Credentials still blocked (same blocker as Sprint 7 Part B). Can a `enrolment_inquiries` table in Supabase serve as the SIS-native store, with SharePoint → Supabase as a one-way sync?
- [ ] **Role model** — option (a) reuse existing roles, or option (b) add a new `sis` role? If (b), who assigns it and via what UI?
- [ ] **Student lifecycle edits** — who can change `applicationStatus`? `classSection`? Should section reassignment trigger a grade-entry migration, or is that a manual process?
- [ ] **Write safety** — some admissions columns (e.g. `studentNumber`, `enroleeNumber`) are stable IDs referenced by other tables. Should SIS allow edits, prevent them, or require an audit-logged override?
- [ ] **Medical / allergy / sensitive fields** — do all admissions staff see these, or is there a sub-role (nurse? counsellor?) with extra access?
- [ ] **Parent account link** — SIS surfaces parent emails, but parent auth lives in Supabase. Should SIS also manage parent invite / re-invite? Magic-link password reset?
- [ ] **Bulk operations** — Directus probably supports bulk edit/export. Does SIS need that on day one, or can it ship single-row-first?
- [ ] **Reporting** — beyond the existing admissions dashboard (Sprint 7 Part A), does SIS need its own reports? Enrollment counts by grade? Discount totals? Demographic breakdowns?
- [ ] **Migration path from Directus** — cutover date? Dual-run period? Any Directus-created data that isn't in the admissions tables (e.g. Directus user accounts, permissions)?
- [ ] **Admissions dashboard (`/admin/admissions`) fate** — keep as-is, move into SIS as a tab, or leave for admin/superadmin oversight while SIS serves operational staff?

## Out of scope (until explicitly pulled in)

- Parent-facing SIS surface (parents see their own child's record) — separate feature, not in the first cut
- SMS / email sequences / outreach automation — if inquiries grow into a CRM, that's a later phase
- Timetable / scheduling
- Fee billing and payment processing (distinct from discounts — "discount" is a record on the student; "billing" is a transactional system)

## Practical build sketch (when ready)

Just to anchor the discussion — not a commitment:

1. Add `sis` route group: `app/(sis)/sis/*` with own layout + sidebar. Pattern-match `(p-files)`.
2. Module switcher (`components/module-switcher.tsx`) extends to 3 options. Already a shadcn `Select` — 3 items is fine.
3. Hero page: `/sis` = student list with search, AY switcher, level/section filters, `@tanstack/react-table` (reuse the existing patterns).
4. Detail page: `/sis/[studentNumber]` with tabs — Profile / Family / Enrollment / Discounts / Documents (read-only summary, link to P-Files) / Inquiry history.
5. Write forms: RHF + zod + shadcn `Form` per existing convention (Key Decision #20). Schemas in `lib/schemas/`.
6. Audit log: new actions (`sis.student.update`, `sis.discount.grant`, etc.), new entity type (`student_record`?), written via existing `logAction()`. Route `/sis/audit-log` with a module-scoped view (same split pattern as `/p-files/audit-log`).
7. Migration SQL for `enrolment_discounts` + any inquiries table. Start a new numbered migration file in `supabase/migrations/`.

## References

- Existing admissions reference: `docs/context/06-admissions-integration.md`
- Admissions dashboard (Sprint 7 Part A): `docs/context/08-admission-dashboard.md`
- Parent portal DDL + admissions table shapes: `docs/context/10-parent-portal.md`
- P-Files module (sibling architecture): `docs/context/12-p-files-module.md`
- Performance patterns (apply to SIS): `docs/context/11-performance-patterns.md`
- Module switcher implementation: `components/module-switcher.tsx`
