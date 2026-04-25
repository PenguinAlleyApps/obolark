import { createBureauRoute } from '@/lib/bureau/route-handler';

const route = createBureauRoute({
  key: 'bureau/prometheus',
  warden: 'PROMETHEUS',
  artifactKind: 'scroll',
  riteDurationMs: 2400,
  defaultSubject: 'find a fire worth taking from a rival hearth; weigh the eagle-debt that comes with it',
});

export const GET = route.GET;
export const POST = route.POST;
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
