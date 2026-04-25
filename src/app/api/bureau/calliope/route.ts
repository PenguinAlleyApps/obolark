import { createBureauRoute } from '@/lib/bureau/route-handler';

const route = createBureauRoute({
  key: 'bureau/calliope',
  warden: 'CALLIOPE',
  artifactKind: 'parchment',
  riteDurationMs: 1800,
  defaultSubject: 'stitch a long song from raw fragments; name the joins, the cuts, and the refrain that binds it',
});

export const GET = route.GET;
export const POST = route.POST;
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
