import { createBureauRoute } from '@/lib/bureau/route-handler';

const route = createBureauRoute({
  key: 'bureau/themis',
  warden: 'THEMIS',
  artifactKind: 'tablet',
  riteDurationMs: 2000,
  defaultSubject: 'weigh two contending claims on the bronze scales; name the tilt and the missing weight to level them',
});

export const GET = route.GET;
export const POST = route.POST;
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
