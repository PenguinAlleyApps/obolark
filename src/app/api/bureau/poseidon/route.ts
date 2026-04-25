import { createBureauRoute } from '@/lib/bureau/route-handler';

const route = createBureauRoute({
  key: 'bureau/poseidon',
  warden: 'POSEIDON',
  artifactKind: 'parchment',
  riteDurationMs: 1800,
  defaultSubject: 'read the tide for a crossing pending tonight; name window, obstacles, and the safe channel',
});

export const GET = route.GET;
export const POST = route.POST;
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
