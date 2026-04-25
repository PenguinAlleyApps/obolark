/**
 * Shared Bureau route handler — every monetized warden endpoint uses this.
 *
 * Responsibilities:
 *  - 402 / settle via requirePayment()
 *  - Parse {subject?: string} body (default subject from constant)
 *  - Call runArtifactProvider() with persona + Zod-validated body shape
 *  - On any provider failure → emit silenceArtifact() (NEVER throw post-settle)
 *  - Return artifact + receipt + headers
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { requirePayment, encodeReceipt } from '@/lib/x402-gateway';
import { priceOf, type EndpointKey } from '@/lib/pricing';
import { getWalletByCode } from '@/lib/agents';
import { txUrl } from '@/lib/arc';
import { runArtifactProvider, silenceArtifact } from '@/lib/providers/artifact-provider';

export type BureauRouteOpts = {
  key: EndpointKey;
  warden: string;                                            // upper-case codename
  artifactKind: 'parchment' | 'seal' | 'tablet' | 'scroll';
  riteDurationMs: number;
  defaultSubject: string;                                    // when body { subject } absent
};

const bodySchema = z.object({ subject: z.string().min(3).max(400).optional() });

export function createBureauRoute(opts: BureauRouteOpts) {
  async function POST(req: NextRequest) {
    const gate = await requirePayment(opts.key, req);
    if (gate.kind === 'challenge') return gate.response;
    if (gate.kind === 'error') return gate.response;

    let parsedBody = bodySchema.safeParse({});
    try {
      const json = await req.json().catch(() => ({}));
      parsedBody = bodySchema.safeParse(json);
    } catch {
      // ignore — fall through to default
    }
    const subject = parsedBody.success && parsedBody.data.subject ? parsedBody.data.subject : opts.defaultSubject;

    const price = priceOf(opts.key);
    const seller = getWalletByCode(price.seller);

    let artifact: ReturnType<typeof silenceArtifact>;
    let provider = 'aisa';
    let model = '';
    let latencyMs = 0;
    let degraded = false;
    let degradedReason: string | undefined;
    try {
      const outcome = await runArtifactProvider({
        key: opts.key,
        warden: opts.warden,
        artifactKind: opts.artifactKind,
        riteDurationMs: opts.riteDurationMs,
        subject,
      });
      provider = outcome.provider;
      model = outcome.model;
      latencyMs = outcome.latencyMs;
      if (outcome.degraded) {
        degraded = true;
        degradedReason = outcome.reason;
        artifact = silenceArtifact({ warden: opts.warden, artifactKind: opts.artifactKind, riteDurationMs: opts.riteDurationMs });
      } else {
        artifact = outcome.artifact as typeof artifact;
      }
    } catch (err) {
      // Final safety: NEVER throw post-settlement. Emit silence.
      degraded = true;
      degradedReason = 'provider_error';
      artifact = silenceArtifact({ warden: opts.warden, artifactKind: opts.artifactKind, riteDurationMs: opts.riteDurationMs });
      // eslint-disable-next-line no-console
      console.error(`[bureau:${opts.key}] post-settle catch:`, (err as Error).message);
    }

    return NextResponse.json(
      {
        ok: true,
        agent: opts.warden,
        seller: { address: seller.address, walletId: seller.walletId, code: price.seller },
        paid: {
          scheme: 'exact',
          network: gate.receipt.network,
          amount: price.price,
          supervisionFee: price.supervisionFee,
          payer: gate.receipt.payer,
          transactionHash: gate.receipt.transactionHash,
          txExplorer: gate.receipt.transactionHash ? txUrl(gate.receipt.transactionHash) : null,
        },
        artifact,
        provider,
        model,
        latencyMs,
        ...(degraded ? { degraded: true, degradedReason } : { degraded: false }),
        at: new Date().toISOString(),
      },
      {
        status: 200,
        headers: {
          'PAYMENT-RESPONSE': encodeReceipt(gate.receipt),
          'X-PAYMENT-RESPONSE': encodeReceipt(gate.receipt),
        },
      },
    );
  }

  function GET() {
    const price = priceOf(opts.key);
    const seller = getWalletByCode(price.seller);
    return NextResponse.json({
      endpoint: `/api/${opts.key.startsWith('bureau/') ? opts.key : opts.key}`,
      method: 'POST',
      warden: opts.warden,
      artifact_kind: opts.artifactKind,
      pricing: {
        amount: price.price,
        supervisionFee: price.supervisionFee,
        currency: 'USDC',
        network: 'arc-testnet (eip155:5042002)',
      },
      seller: { agent: price.seller, address: seller.address },
      description: price.description,
      body: 'POST { "subject": "..." } with PAYMENT-SIGNATURE header. Default subject is provided if omitted.',
      output: 'BureauArtifact { warden, artifact_kind, subject, body (per-warden), writ, rite_duration_ms }',
    });
  }

  return { GET, POST };
}
