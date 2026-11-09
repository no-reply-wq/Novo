import { ServiceWorkerRegistrar } from '@/components/runtime/ServiceWorkerRegistrar';
import { OfflineIndicator } from '@/components/runtime/OfflineIndicator';

// NOTE: Portal customers are NOT NextAuth users. They authenticate with a
// `portal_token` cookie (HMAC JWT, see src/platform/portals/auth.ts). This
// layout must therefore NOT require a NextAuth staff/tenant session — doing so
// bounced every portal customer to the company /login (including on the
// portal's own login page). Auth is enforced per-page and per-API via
// verifyPortalToken.
export default function RuntimeLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ServiceWorkerRegistrar />
      <OfflineIndicator />
      {children}
    </>
  );
}
