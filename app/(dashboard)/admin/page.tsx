import { redirect } from 'next/navigation';

// /admin was the legacy tool-launcher. Most admin tooling moved to /markbook
// when Markbook got its own route group; /admin/admissions is the one surface
// that stayed. Send bare /admin there so old bookmarks still land usefully.
export default function AdminRedirect() {
  redirect('/admin/admissions');
}
