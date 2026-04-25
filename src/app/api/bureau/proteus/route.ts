import { createBureauRoute } from '@/lib/bureau/route-handler';

const route = createBureauRoute({
  key: 'bureau/proteus',
  warden: 'PROTEUS',
  artifactKind: 'seal',
  riteDurationMs: 2000,
  defaultSubject: 'reveal three plausible forms of an entity brought before the Bureau; name which is the true form',
});

export const GET = route.GET;
export const POST = route.POST;
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
