import { createBureauRoute } from '@/lib/bureau/route-handler';

const route = createBureauRoute({
  key: 'bureau/aegis',
  warden: 'AEGIS',
  artifactKind: 'seal',
  riteDurationMs: 1400,
  defaultSubject: 'lay an apotropaic ward against a named threat at the gate; bind it with three sustaining conditions',
});

export const GET = route.GET;
export const POST = route.POST;
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
