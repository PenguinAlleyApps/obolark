import { createBureauRoute } from '@/lib/bureau/route-handler';

const route = createBureauRoute({
  key: 'bureau/helios',
  warden: 'HELIOS',
  artifactKind: 'tablet',
  riteDurationMs: 1800,
  defaultSubject: 'survey a horizon at four cardinal hours and name what shines and what hides at each',
});

export const GET = route.GET;
export const POST = route.POST;
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
