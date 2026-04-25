import { createBureauRoute } from '@/lib/bureau/route-handler';

const route = createBureauRoute({
  key: 'bureau/plutus',
  warden: 'PLUTUS',
  artifactKind: 'tablet',
  riteDurationMs: 1600,
  defaultSubject: 'reckon a complex obol-flow through the Bureau and name any leak in the count',
});

export const GET = route.GET;
export const POST = route.POST;
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
