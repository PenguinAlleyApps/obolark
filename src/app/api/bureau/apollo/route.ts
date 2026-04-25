import { createBureauRoute } from '@/lib/bureau/route-handler';

const route = createBureauRoute({
  key: 'bureau/apollo',
  warden: 'APOLLO',
  artifactKind: 'parchment',
  riteDurationMs: 1800,
  defaultSubject: 'set the meter, the key, and the dramatis personae for an unrehearsed choros that opens at dusk',
});

export const GET = route.GET;
export const POST = route.POST;
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
