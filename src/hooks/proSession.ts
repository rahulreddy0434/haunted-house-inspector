/**
 * Page-lifetime flag shared by `useProJobs` and `useProJob`: true once any Pro
 * response has succeeded. A 401 while the flag is set means the session ended
 * (show the form with the "session ended" notice); a 401 before that is a
 * first visit (show the plain form). Module-level so it survives navigation
 * between `/pro` and `/pro/jobs/[id]` without a reload.
 *
 * Call `resetProSession()` on logout and between tests.
 */
let hadSession = false;

export function hadProSession(): boolean {
  return hadSession;
}

export function markProSession(): void {
  hadSession = true;
}

export function resetProSession(): void {
  hadSession = false;
}
