import { createBureauRoute } from '@/lib/bureau/route-handler';

const route = createBureauRoute({
  key: 'research',
  warden: 'ORACLE',
  artifactKind: 'scroll',
  riteDurationMs: 2400,
  defaultSubject: 'a question for the Pythia laid at the altar without elaboration',
});

export const GET = route.GET;
export const POST = route.POST;
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
