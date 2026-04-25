import { createBureauRoute } from '@/lib/bureau/route-handler';

const route = createBureauRoute({
  key: 'bureau/hestia',
  warden: 'HESTIA',
  artifactKind: 'tablet',
  riteDurationMs: 1600,
  defaultSubject: 'census the hearth at the watch-house; name what burns and the one fuel still missing tonight',
});

export const GET = route.GET;
export const POST = route.POST;
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
