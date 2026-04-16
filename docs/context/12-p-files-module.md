# P-Files Module (Student Document Management)

## Overview

The P-Files module is a document completeness tracker and management tool for student enrollment documents. It lives alongside the markbook as a separate route group (`/(p-files)/`) in the same Next.js app, sharing auth and Supabase infrastructure.

**Current manual process:** Parents upload documents during enrollment via the admissions portal (`enrol.hfse.edu.sg`). Ms. Gael (admissions) collects them, forwards to the P-files person, who manually uploads to SharePoint folders organized by student name/number. No centralized tracking of what's complete vs missing.

**Goal:** Replace the manual SharePoint workflow with an in-app dashboard that reads from `ay{YY}_enrolment_documents` (already populated by parent uploads), lets staff approve/reject documents, upload on behalf of parents, and flag expired documents.

## Access

- **`p-file` role** — new role in `app_metadata.role`, dedicated to the P-files staff member
- **`superadmin`** — full access as always
- `proxy.ts` gates `/p-files/*` routes to these two roles only
- Teachers, registrar, and admin do **not** have access

## Required Documents Per Student

Two categories based on expiry behavior:

### Non-expiring documents

| Document | DB column (URL) | DB column (status) | Status flow |
|----------|----------------|-------------------|-------------|
| ID Picture | `idPicture` | `idPictureStatus` | Uploaded → Valid / Rejected |
| Birth Certificate | `birthCert` | `birthCertStatus` | Uploaded → Valid / Rejected |
| Educational Certificate | `educCert` | `educCertStatus` | Uploaded → Valid / Rejected |
| Medical Exam | `medical` | `medicalStatus` | Uploaded → Valid / Rejected |

### Expiring documents

| Document | DB column (URL) | DB column (status) | Expiry column | Status flow |
|----------|----------------|-------------------|---------------|-------------|
| Passport | `passport` | `passportStatus` | `passportExpiry` | Valid → Expired (auto) / Rejected |
| Student Pass | `pass` | `passStatus` | `passExpiry` | Valid → Expired (auto) / Rejected |
| Mother's Passport | `motherPassport` | `motherPassportStatus` | `motherPassportExpiry` | Valid → Expired (auto) / Rejected |
| Mother's Pass | `motherPass` | `motherPassStatus` | `motherPassExpiry` | Valid → Expired (auto) / Rejected |
| Father's Passport | `fatherPassport` | `fatherPassportStatus` | `fatherPassportExpiry` | Valid → Expired (auto) / Rejected |
| Father's Pass | `fatherPass` | `fatherPassStatus` | `fatherPassExpiry` | Valid → Expired (auto) / Rejected |
| Guardian's Passport | `guardianPassport` | `guardianPassportStatus` | `guardianPassportExpiry` | Valid → Expired (auto) / Rejected |
| Guardian's Pass | `guardianPass` | `guardianPassStatus` | `guardianPassExpiry` | Valid → Expired (auto) / Rejected |

### Conditional logic

- Father documents required only if `fatherEmail` is present in `ay{YY}_enrolment_applications`
- Guardian documents required only if `guardianEmail` is present in `ay{YY}_enrolment_applications`
- Mother documents always required (assumption — validate with stakeholder)

### Expiry detection

"Expired" is computed at display time: `expiryDate < today`. The `*Status` column may still say "Valid" in the DB even if the document has expired — the UI should override and show "Expired" with a warning when the expiry date has passed.

## Data Source

All document data lives in the admissions table `ay{YY}_enrolment_documents`, keyed by `studentNumber`. This table is **already populated** by parent uploads through the admissions portal. The markbook has read access via `createServiceClient()` (service-role, bypasses RLS).

### Document URL format

The `text` columns (e.g. `passport`, `birthCert`) store Supabase Storage URLs or paths. The exact format depends on how the admissions portal writes them — inspect a few rows to determine whether they're full URLs (`https://xxx.supabase.co/storage/v1/object/...`) or relative paths.

### Linking to student roster

Join path: `enrolment_documents.studentNumber` → `enrolment_applications.studentNumber` → markbook `students.student_number`. The `studentNumber` is the stable cross-year ID (CLAUDE.md Hard Rule #4).

## Module capabilities

### 1. Dashboard (read-only overview)

- Per-student completeness matrix: which documents uploaded, which missing, which expired
- Section/level filter
- Summary stats: total students, % complete, count of expired documents
- AY switcher (same pattern as admissions dashboard)

### 2. Student detail view

- All 9+ document slots with current status, file preview/download link, expiry date
- Visual indicators: green (valid), amber (uploaded/pending review), red (missing/expired/rejected)

### 3. Approve / Reject

- Staff can update `*Status` columns to "Valid" or "Rejected"
- Writes directly to `ay{YY}_enrolment_documents` via service-role client

### 4. Upload on behalf

- Staff can upload a document on a parent's behalf (e.g. parent emailed it, or brought a physical copy)
- Uploads to Supabase Storage, updates the URL column + sets status to "Uploaded"

## Architecture

### Route structure

```
app/
├── (p-files)/p-files/
│   ├── page.tsx              ← dashboard: completeness matrix
│   ├── [studentNumber]/
│   │   └── page.tsx          ← student detail: all documents
│   └── layout.tsx            ← p-files shell with own sidebar
```

### Module switcher

After login, the root `/` page (or sidebar) shows a module picker: Markbook vs P-Files. The `proxy.ts` middleware gates access by role — a `p-file` role user who tries to access `/grading` gets redirected, and vice versa for a `teacher` trying `/p-files`.

### Shared infrastructure

- Same Supabase project, same auth, same `createServiceClient()`
- Same design system (Aurora Vault tokens, shadcn components)
- Same `lib/academic-year.ts` for AY resolution
- Same `lib/supabase/admissions.ts` patterns for querying admissions tables

### New code

- `lib/p-files/documents.ts` — query helpers for `enrolment_documents` + completeness computation
- `components/p-files/` — dashboard cards, document grid, upload dialog
- `app/api/p-files/` — API routes for status updates and file uploads

## Not in scope (for now)

- Revision history / audit trail for document status changes (add if needed)
- Notification to parents when a document is rejected (could use Resend later)
- Bulk operations (approve all, export missing list)
- Integration with SharePoint (the goal is to replace SharePoint, not sync with it)
