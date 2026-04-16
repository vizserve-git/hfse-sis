import { NextResponse, type NextRequest } from 'next/server';
import PDFMerger from 'pdf-merger-js';
import { requireRole } from '@/lib/auth/require-role';
import { requireCurrentAyCode } from '@/lib/academic-year';
import { logAction } from '@/lib/audit/log-action';
import { createServiceClient } from '@/lib/supabase/service';
import { DOCUMENT_SLOTS } from '@/lib/p-files/document-config';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB per file
const MAX_TOTAL_SIZE = 30 * 1024 * 1024; // 30 MB total

function isPdf(file: File): boolean {
  return (
    file.type === 'application/pdf' ||
    (file.name ?? '').toLowerCase().endsWith('.pdf')
  );
}

// POST /api/p-files/[enroleeNumber]/upload
// Multipart form: file(s) + slotKey + optional metadata fields.
// Single file: upload as-is. Multiple files: merge PDFs server-side.
// Writes to enrolment_documents (file URL + status) and, for expiring docs,
// enrolment_applications (passport number / pass type + expiry).
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ enroleeNumber: string }> },
) {
  const auth = await requireRole(['p-file', 'superadmin']);
  if ('error' in auth) return auth.error;

  const { enroleeNumber } = await params;

  const formData = await request.formData().catch(() => null);
  if (!formData) {
    return NextResponse.json({ error: 'invalid form data' }, { status: 400 });
  }

  const files = formData.getAll('file').filter((f): f is File => f instanceof File);
  const slotKey = formData.get('slotKey') as string | null;
  const expiryDate = formData.get('expiryDate') as string | null;
  const passportNumber = formData.get('passportNumber') as string | null;
  const passType = formData.get('passType') as string | null;

  if (files.length === 0 || !slotKey) {
    return NextResponse.json({ error: 'file and slotKey are required' }, { status: 400 });
  }

  const slot = DOCUMENT_SLOTS.find((s) => s.key === slotKey);
  if (!slot) {
    return NextResponse.json({ error: `invalid slotKey: ${slotKey}` }, { status: 400 });
  }

  if (slot.expires && !expiryDate) {
    return NextResponse.json(
      { error: 'expiryDate is required for expiring documents' },
      { status: 400 },
    );
  }

  // Validate metadata for expiring docs
  if (slot.meta?.kind === 'passport' && !passportNumber) {
    return NextResponse.json(
      { error: 'passportNumber is required for passport documents' },
      { status: 400 },
    );
  }
  if (slot.meta?.kind === 'pass' && !passType) {
    return NextResponse.json(
      { error: 'passType is required for pass documents' },
      { status: 400 },
    );
  }

  // Size limits
  let totalSize = 0;
  for (const file of files) {
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File "${file.name}" exceeds 10 MB limit` },
        { status: 400 },
      );
    }
    totalSize += file.size;
  }
  if (totalSize > MAX_TOTAL_SIZE) {
    return NextResponse.json(
      { error: 'Total file size exceeds 30 MB limit' },
      { status: 400 },
    );
  }

  // Multi-file: all must be PDFs
  if (files.length > 1) {
    const nonPdf = files.find((f) => !isPdf(f));
    if (nonPdf) {
      return NextResponse.json(
        { error: 'When uploading multiple files, all must be PDFs for merging' },
        { status: 400 },
      );
    }
  }

  const service = createServiceClient();
  const ayCode = await requireCurrentAyCode(service);
  const prefix = `ay${ayCode.replace(/^AY/i, '').toLowerCase()}`;

  // Prepare the file buffer to upload
  let uploadBuffer: Buffer;
  let contentType: string;
  let ext: string;

  if (files.length === 1) {
    // Single file — keep original format
    const file = files[0];
    uploadBuffer = Buffer.from(await file.arrayBuffer());
    contentType = file.type || 'application/octet-stream';
    ext = file.name.split('.').pop() ?? 'pdf';
  } else {
    // Multiple PDFs — merge
    try {
      const merger = new PDFMerger();
      for (const file of files) {
        const buffer = Buffer.from(await file.arrayBuffer());
        await merger.add(buffer);
      }
      uploadBuffer = await merger.saveAsBuffer() as Buffer;
      contentType = 'application/pdf';
      ext = 'pdf';
    } catch {
      return NextResponse.json(
        { error: 'Failed to merge PDFs. Please check that all files are valid PDF documents.' },
        { status: 400 },
      );
    }
  }

  // Upload to Supabase Storage
  const storagePath = `${prefix}/${enroleeNumber}/${slotKey}.${ext}`;
  const bucket = 'parent-portal';

  const { error: uploadError } = await service.storage
    .from(bucket)
    .upload(storagePath, uploadBuffer, { upsert: true, contentType });

  if (uploadError) {
    return NextResponse.json(
      { error: `storage upload failed: ${uploadError.message}` },
      { status: 500 },
    );
  }

  // Get public URL
  const { data: urlData } = service.storage.from(bucket).getPublicUrl(storagePath);
  const publicUrl = urlData.publicUrl;

  // --- Table 1: enrolment_documents (file URL + status + expiry) ---
  const docFields: Record<string, unknown> = {
    [slotKey]: publicUrl,
    [`${slotKey}Status`]: 'Valid',
  };
  if (slot.expires && expiryDate) {
    docFields[`${slotKey}Expiry`] = expiryDate;
  }

  const { error: docError } = await service
    .from(`${prefix}_enrolment_documents`)
    .update(docFields)
    .eq('enroleeNumber', enroleeNumber);

  if (docError) {
    return NextResponse.json(
      { error: `db update failed: ${docError.message}` },
      { status: 500 },
    );
  }

  // --- Table 2: enrolment_applications (passport number / pass type + expiry) ---
  if (slot.meta) {
    const appFields: Record<string, unknown> = {
      [slot.meta.expiryCol]: expiryDate,
    };
    if (slot.meta.kind === 'passport') {
      appFields[slot.meta.numberCol] = passportNumber;
    } else {
      appFields[slot.meta.numberCol] = passType;
    }

    const { error: appError } = await service
      .from(`${prefix}_enrolment_applications`)
      .update(appFields)
      .eq('enroleeNumber', enroleeNumber);

    if (appError) {
      // Best-effort: file is uploaded, warn but don't fail
      console.error(`[p-files] enrolment_applications update failed for ${enroleeNumber}:`, appError.message);
      return NextResponse.json({
        ok: true,
        url: publicUrl,
        warning: 'Document uploaded but application metadata update failed. Please update manually.',
      });
    }
  }

  // --- Audit log ---
  await logAction({
    service,
    actor: { id: auth.user.id, email: auth.user.email ?? null },
    action: 'pfile.upload',
    entityType: 'enrolment_document',
    entityId: enroleeNumber,
    context: {
      slotKey,
      label: slot.label,
      fileCount: files.length,
      merged: files.length > 1,
      expiryDate: expiryDate ?? undefined,
      ...(slot.meta?.kind === 'passport' ? { passportNumber } : {}),
      ...(slot.meta?.kind === 'pass' ? { passType } : {}),
    },
  });

  return NextResponse.json({ ok: true, url: publicUrl });
}
