import { createBureauRoute } from '@/lib/bureau/route-handler';

const route = createBureauRoute({
  key: 'bureau/artemis',
  warden: 'ARTEMIS',
  artifactKind: 'tablet',
  riteDurationMs: 1400,
  defaultSubject: 'mark a quarry described only by hearsay; report tracks, last-seen, and the arrow trajectory',
});

export const GET = route.GET;
export const POST = route.POST;
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
