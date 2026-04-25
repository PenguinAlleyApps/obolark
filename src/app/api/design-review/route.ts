import { createBureauRoute } from '@/lib/bureau/route-handler';

const route = createBureauRoute({
  key: 'design-review',
  warden: 'DAEDALUS',
  artifactKind: 'parchment',
  riteDurationMs: 2400,
  defaultSubject: 'a labyrinth-plan for an interface or flow brought before the master craftsman',
});

export const GET = route.GET;
export const POST = route.POST;
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
