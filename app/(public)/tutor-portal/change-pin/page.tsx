import { redirect } from 'next/navigation';

// The tutor PIN portal retired on 2026-09-21 (Coding Docs/26 R2, decision 2:
// "tutors sign in to the study app with the tutor role"). Every tutor's
// Teach space — today's class, the roster, attendance corrections,
// materials, assignments — lives there now, behind the same sign-in their
// students use; the study app is proxied under /learn on this host, so the
// hop is same-origin. This page (the PIN change) only points the way. The
// /api/tutor-portal/* routes stay until R4 deletes the module; nothing
// calls them.
export default function TutorPortalRetired() {
  redirect('/learn/login?teach=1');
}
