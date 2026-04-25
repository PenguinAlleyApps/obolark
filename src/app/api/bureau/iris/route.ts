import { createBureauRoute } from '@/lib/bureau/route-handler';

const route = createBureauRoute({
  key: 'bureau/iris',
  warden: 'IRIS',
  artifactKind: 'parchment',
  riteDurationMs: 1600,
  defaultSubject: 'refract a single proclamation across seven heralding bands of the agora',
});

export const GET = route.GET;
export const POST = route.POST;
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
