# Admissions Dashboard

## Overview

The Admissions module of the HFSE SIS — a read-only dashboard that provides decision-making and forecasting support for the admissions team. It does not write to the admissions DB; it reads from the same Supabase admissions tables used by the student roster sync.

This module is scoped to **Phase 2** of development, after the Markbook module (Phase 1) is complete and stable.

---

## Section 1 — Applications Dashboard

### Purpose

Give the admissions team a real-time view of the application pipeline — where applications are stuck, how long they're taking, and what needs attention today.

### 1.1 Pipeline Overview

A summary card row showing counts per `applicationStatus`:

| Card                   | Metric                      |
| ---------------------- | --------------------------- |
| Submitted              | Total applications received |
| Ongoing Verification   | Currently being reviewed    |
| Processing             | In active processing        |
| Enrolled               | Successfully enrolled       |
| Enrolled (Conditional) | Conditionally enrolled      |
| Withdrawn              | Withdrawn after submission  |
| Cancelled              | Cancelled applications      |

### 1.2 Outdated Applications

Applications that have not been updated within a configurable threshold (default: 7 days).

**Logic:**

```sql
SELECT
  s."enroleeNumber",
  s."enroleeName",
  s."applicationStatus",
  s."applicationUpdatedDate",
  CURRENT_DATE - s."applicationUpdatedDate" AS days_since_update,
  s."levelApplied",
  s."classSection"
FROM public.ay2026_enrolment_status s
WHERE s."applicationStatus" NOT IN ('Enrolled', 'Cancelled', 'Withdrawn')
  AND (
    s."applicationUpdatedDate" < CURRENT_DATE - INTERVAL '7 days'
    OR s."applicationUpdatedDate" IS NULL
  )
ORDER BY days_since_update DESC NULLS FIRST;
```

Display as a sortable table with a red/amber/green indicator:

- 🔴 Red: No update in 14+ days
- 🟡 Amber: No update in 7–13 days
- 🟢 Green: Updated within 7 days

### 1.3 Day Counter Per Application

For each application, show the number of days elapsed from `created_at` to reaching "Enrolled" status (or current date if not yet enrolled).

**Logic:**

```sql
SELECT
  a."enroleeNumber",
  a."enroleeFullName",
  a."levelApplied",
  s."applicationStatus",
  a.created_at::date AS application_date,
  CASE
    WHEN s."applicationStatus" IN ('Enrolled', 'Enrolled (Conditional)')
    THEN s."applicationUpdatedDate" - a.created_at::date
    ELSE CURRENT_DATE - a.created_at::date
  END AS days_in_pipeline,
  CASE
    WHEN s."applicationStatus" IN ('Enrolled', 'Enrolled (Conditional)')
    THEN 'completed'
    ELSE 'in_progress'
  END AS pipeline_state
FROM public.ay2026_enrolment_applications a
JOIN public.ay2026_enrolment_status s
  ON a."enroleeNumber" = s."enroleeNumber"
ORDER BY days_in_pipeline DESC;
```

Display as a ranked list — longest-running open applications at the top. This highlights which applicants have been waiting the longest without resolution.

### 1.4 Average Time to Enrollment

A summary metric:

```sql
SELECT
  ROUND(AVG(
    s."applicationUpdatedDate" - a.created_at::date
  ), 1) AS avg_days_to_enrollment
FROM public.ay2026_enrolment_applications a
JOIN public.ay2026_enrolment_status s
  ON a."enroleeNumber" = s."enroleeNumber"
WHERE s."applicationStatus" IN ('Enrolled', 'Enrolled (Conditional)');
```

### 1.5 Applications by Level

Bar chart showing application counts per `levelApplied`:

- Submitted vs Enrolled comparison per level
- Helps forecast class sizes and identify under/over-subscribed levels

### 1.6 Conversion Funnel

A funnel visualization showing drop-off between stages:

```
Submitted → Ongoing Verification → Processing → Enrolled
```

Shows both count and percentage at each stage.

---

## Suggested Additional Visualizations

### For Applications

| Visualization                       | Value                                                                               |
| ----------------------------------- | ----------------------------------------------------------------------------------- |
| **Weekly application volume trend** | Line chart — are applications accelerating or slowing?                              |
| **Status breakdown by level**       | Heatmap — which levels have bottlenecks?                                            |
| **Document completion rate**        | % of applicants with all required docs submitted (from `enrolment_documents`)       |
| **Assessment outcomes**             | Pass/fail rate from `assessmentGradeMath` + `assessmentGradeEnglish`                |
| **Nationality breakdown**           | Pie chart for diversity/visa planning                                               |
| **Referral source**                 | Bar chart from `howDidYouKnowAboutHFSEIS` — which channels drive most applications? |

---

## Access Control

| Role         | Access                                          |
| ------------ | ----------------------------------------------- |
| `registrar`  | View only — applications relevant to their work |
| `admin`      | Full dashboard access                           |
| `superadmin` | Full access including data export               |
| `teacher`    | No access                                       |

---

## Technical Notes

### AY Table Switching

Like the student roster sync, this dashboard queries year-specific tables (`ay2026_*`, `ay2027_*`). The AY prefix must be configurable — do not hardcode the year.

### Read-Only

This module never writes to the admissions DB. All queries are `SELECT` only. Use the `ADMISSIONS_SUPABASE_SERVICE_KEY` with a read-only Postgres role if possible.

### Caching

Application counts and funnel metrics do not need to be real-time. Cache dashboard queries for 5–15 minutes to avoid hammering the admissions DB on every page load. Use Next.js `fetch` cache or a simple in-memory cache.

---

## Sprint Placement

This entire module is **Phase 2 / Sprint 7** — after the 6 core grading sprints are complete.

Sprint 7 tasks:

- [ ] Applications pipeline overview cards
- [ ] Outdated applications table with staleness indicators
- [ ] Day counter per application
- [ ] Average time to enrollment metric
- [ ] Applications by level bar chart
- [ ] Conversion funnel visualization
