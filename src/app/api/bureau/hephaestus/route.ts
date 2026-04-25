import { createBureauRoute } from '@/lib/bureau/route-handler';

const route = createBureauRoute({
  key: 'bureau/hephaestus',
  warden: 'HEPHAESTUS',
  artifactKind: 'tablet',
  riteDurationMs: 1800,
  defaultSubject: 'draw a forge order for a Bureau commission; lay anvil-strikes, temper steps, and the quench window',
});

export const GET = route.GET;
export const POST = route.POST;
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
