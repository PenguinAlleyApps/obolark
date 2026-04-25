import { createBureauRoute } from '@/lib/bureau/route-handler';

const route = createBureauRoute({
  key: 'bureau/hermes',
  warden: 'HERMES',
  artifactKind: 'parchment',
  riteDurationMs: 1800,
  defaultSubject: 'draw the hermetic way from a petitioner who knows only a destination, not the road',
});

export const GET = route.GET;
export const POST = route.POST;
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
