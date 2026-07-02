/**
 * /signup — REDIRECTED. Public self-signup is closed while FOPS is in
 * waitlist mode. This page permanently redirects any inbound
 * (bookmarks, search-engine indexed URLs, marketing referrals) to the
 * landing page's waitlist section.
 *
 * When we re-open signup, restore the original client form from git
 * history (commit: pre-waitlist-launch). The API route
 * `/api/auth/signup` is also closed and returns 403 — both must be
 * re-opened together.
 */
import { redirect } from 'next/navigation';

export default function SignupRedirect() {
  redirect('/#waitlist');
}
