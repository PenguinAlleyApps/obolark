import { createBureauRoute } from '@/lib/bureau/route-handler';

const route = createBureauRoute({
  key: 'bureau/atlas',
  warden: 'ATLAS',
  artifactKind: 'tablet',
  riteDurationMs: 1800,
  defaultSubject: 'apportion the burden of an unnamed Bureau build across foundation, superstructure, and crowning',
});

export const GET = route.GET;
export const POST = route.POST;
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
