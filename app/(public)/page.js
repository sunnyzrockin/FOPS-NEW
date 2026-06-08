// Public marketing landing page.
// LandingPage lives outside app/ to dodge a Next.js dev-mode webpack module-ID
// collision between this route's file (app/app/page.js) and the authenticated
// app route's file (app/app/app/page.js) — Next.js was registering /'s default
// export as pointing at AppInner from /app, which broke /. Hosting the
// landing-page component under /components/marketing/ keeps the import path
// unambiguous.
import LandingPage from '@/components/marketing/landing-page';

export default function Home() {
  return <LandingPage />;
}
