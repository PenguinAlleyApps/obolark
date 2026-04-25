import { createBureauRoute } from '@/lib/bureau/route-handler';

const route = createBureauRoute({
  key: 'audit',
  warden: 'ARGUS',
  artifactKind: 'parchment',
  riteDurationMs: 2400,
  defaultSubject: 'an unspecified span of recent ledger activity laid before the hundred-eyed watcher',
});

export const GET = route.GET;
export const POST = route.POST;
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
