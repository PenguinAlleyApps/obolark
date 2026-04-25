/**
 * Shared Bureau route handler — every monetized warden endpoint uses this.
 *
 * Responsibilities:
 *  - 402 / settle via requirePayment() (skipped when X-PREVIEW: true header set)
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
  warden: string;
  artifactKind: 'parchment' | 'seal' | 'tablet' | 'scroll';
  riteDurationMs: number;
  defaultSubject: string;
};

const bodySchema = z.object({ subject: z.string().min(3).max(400).optional() });

type Receipt = {
  network: string;
  payer: string;
  transactionHash?: string;
};

const PREVIEW_RECEIPT: Receipt = {
  network: 'arc-testnet (preview)',
  payer: 'PREVIEW',
};

export function createBureauRoute(opts: BureauRouteOpts) {
  async function POST(req: NextRequest) {
    // Preview path — dashboard "hire" demo. Runs the LLM persona without
    // x402 settlement so the modal can render a lore-accurate artifact
    // without requiring the visitor to hold an EOA + sign EIP-3009. The
    // real paid path is unaffected (no X-PREVIEW header → 402 as before).
    // Disable in prod by setting NEXT_PUBLIC_ALLOW_PREVIEW=false.
    const isPreview =
      req.headers.get('x-preview') === 'true' &&
      process.env.NEXT_PUBLIC_ALLOW_PREVIEW !== 'false';

    let receipt: Receipt = PREVIEW_RECEIPT;
    let receiptHeader: string | null = null;
    if (!isPreview) {
      const gate = await requirePayment(opts.key, req);
      if (gate.kind === 'challenge') return gate.response;
      if (gate.kind === 'error') return gate.response;
      receipt = gate.receipt;
      receiptHeader = encodeReceipt(gate.receipt);
    }

    let parsedBody = bodySchema.safeParse({});
    try {
      const json = await req.json().catch(() => ({}));
      parsedBody = bodySchema.safeParse(json);
    } catch {
      // ignore — fall through to default subject
    }
    const subject =
      parsedBody.success && parsedBody.data.subject
        ? parsedBody.data.subject
        : opts.defaultSubject;

    const price = priceOf(opts.key);
    const seller = getWalletByCode(price.seller);

    let artifact: ReturnType<typeof silenceArtifact>;
    let provider = 'aisa';
    let model = '';
    let latencyMs = 0;
    let degraded = false;
    let degradedReason: string | undefined;
    let degradedDetail: string | null = null;
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
        degradedDetail = outcome.detail ?? null;
        artifact = silenceArtifact({
          warden: opts.warden,
          artifactKind: opts.artifactKind,
          riteDurationMs: opts.riteDurationMs,
        });
      } else {
        artifact = outcome.artifact as typeof artifact;
      }
    } catch (err) {
      // Final safety: NEVER throw post-settlement. Emit silence.
      degraded = true;
      degradedReason = 'provider_error';
      degradedDetail = (err as Error).message?.slice(0, 200) ?? null;
      artifact = silenceArtifact({
        warden: opts.warden,
        artifactKind: opts.artifactKind,
        riteDurationMs: opts.riteDurationMs,
      });
      // eslint-disable-next-line no-console
      console.error(`[bureau:${opts.key}] post-settle catch:`, (err as Error).message);
    }

    const headers: Record<string, string> = {};
    if (receiptHeader) {
      headers['PAYMENT-RESPONSE'] = receiptHeader;
      headers['X-PAYMENT-RESPONSE'] = receiptHeader;
    }

    return NextResponse.json(
      {
        ok: true,
        agent: opts.warden,
        seller: { address: seller.address, walletId: seller.walletId, code: price.seller },
        paid: {
          scheme: isPreview ? 'preview' : 'exact',
          network: receipt.network,
          amount: isPreview ? '0' : price.price,
          supervisionFee: isPreview ? '0' : price.supervisionFee,
          payer: receipt.payer,
          transactionHash: receipt.transactionHash ?? null,
          txExplorer: receipt.transactionHash ? txUrl(receipt.transactionHash) : null,
        },
        artifact,
        provider,
        model,
        latencyMs,
        preview: isPreview,
        ...(degraded ? { degraded: true, degradedReason, degradedDetail } : { degraded: false }),
        at: new Date().toISOString(),
      },
      { status: 200, headers },
    );
  }

  function GET() {
    const price = priceOf(opts.key);
    const seller = getWalletByCode(price.seller);
    return NextResponse.json({
      endpoint: `/api/${opts.key}`,
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
      body: 'POST { "subject": "..." } with PAYMENT-SIGNATURE header. Default subject is provided if omitted. X-PREVIEW: true header skips settlement (demo path).',
      output: 'BureauArtifact { warden, artifact_kind, subject, body (per-warden), writ, rite_duration_ms }',
    });
  }

  return { GET, POST };
}
