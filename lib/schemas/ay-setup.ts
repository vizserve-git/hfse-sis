import { z } from 'zod';

// Shared regex for validating AY codes. Used across the wizard API route
// and client forms. Runtime "does this AY exist?" checks go through
// `listAyCodes()` in lib/academic-year.ts (DB-backed) — this regex only
// validates format.
const AY_CODE_RE = /^AY\d{4}$/;

const AyCode = z
  .string()
  .trim()
  .toUpperCase()
  .regex(AY_CODE_RE, { message: 'Use format AY2027' });

// POST /api/sis/ay-setup — create AY
//
// The RPC derives the slug and handles copy-forward server-side;
// the client only supplies identity + label.
export const CreateAySchema = z.object({
  ay_code: AyCode,
  label: z
    .string()
    .trim()
    .min(1, 'Label required')
    .max(120, 'Label too long (120 char max)'),
});

export type CreateAyInput = z.infer<typeof CreateAySchema>;

// PATCH /api/sis/ay-setup — switch active AY
export const SwitchActiveAySchema = z.object({
  target_ay_code: AyCode,
  confirm_code: AyCode,
}).refine((v) => v.target_ay_code === v.confirm_code, {
  message: 'Confirm code must match target AY code',
  path: ['confirm_code'],
});

export type SwitchActiveAyInput = z.infer<typeof SwitchActiveAySchema>;

// DELETE /api/sis/ay-setup — delete AY
export const DeleteAySchema = z.object({
  ay_code: AyCode,
  confirm_code: AyCode,
}).refine((v) => v.ay_code === v.confirm_code, {
  message: 'Confirm code must match AY code',
  path: ['confirm_code'],
});

export type DeleteAyInput = z.infer<typeof DeleteAySchema>;

// PATCH /api/sis/ay-setup/terms/[termId] — set start/end dates on a term.
// Either field may be null (clear the value); if both are set, end must be ≥ start.
const termDate = z
  .string()
  .trim()
  .transform((s) => (s.length === 0 ? null : s))
  .refine((s) => s === null || /^\d{4}-\d{2}-\d{2}$/.test(s), {
    message: 'Use YYYY-MM-DD',
  })
  .nullable();

export const TermDatesSchema = z
  .object({
    startDate: termDate,
    endDate: termDate,
  })
  .refine((v) => !v.startDate || !v.endDate || v.startDate <= v.endDate, {
    message: 'End date must be on or after start date',
    path: ['endDate'],
  });

export type TermDatesInput = z.infer<typeof TermDatesSchema>;
