import { createBureauRoute } from '@/lib/bureau/route-handler';

const route = createBureauRoute({
  key: 'bureau/urania',
  warden: 'URANIA',
  artifactKind: 'parchment',
  riteDurationMs: 2000,
  defaultSubject: 'cast the star chart of an unfinished piece into three celestial houses and one constellation',
});

export const GET = route.GET;
export const POST = route.POST;
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
