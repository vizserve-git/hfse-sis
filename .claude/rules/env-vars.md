---
name: env-vars
description: Required and optional env vars (Supabase, Resend, parent portal URL). Read when touching .env.local, auth/Supabase plumbing, or Resend emails.
load: on-demand
---

<!-- Stable rule. NOT auto-loaded. Read via the Read tool when relevant. Edit only with explicit user approval. -->

## Environment variables

`.env.local` at repo root:

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_KEY` (server-only, bypasses RLS).
- `NEXT_PUBLIC_PARENT_PORTAL_URL` — per-environment, see `10-parent-portal.md`.
- `RESEND_API_KEY` (server-only); `RESEND_FROM_EMAIL` optional.
- `PDF_SERVICE_URL` reserved, currently unused.
