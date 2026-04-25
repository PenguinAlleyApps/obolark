import { createBureauRoute } from '@/lib/bureau/route-handler';

const route = createBureauRoute({
  key: 'security-scan',
  warden: 'THANATOS',
  artifactKind: 'tablet',
  riteDurationMs: 2000,
  defaultSubject: 'a soul brought before the psychopomp for a reading of its unpaid weights',
});

export const GET = route.GET;
export const POST = route.POST;
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
