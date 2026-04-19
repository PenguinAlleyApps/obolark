/**
 * x402 gateway — Next.js App Router wrapper around Circle's batched-settlement
 * facilitator.
 *
 * Day 1: emit 402 PAYMENT-REQUIRED challenge per endpoint.
 * Day 2: real verify + settle via BatchFacilitatorClient; returns
 *        settlement receipt for the handler to embed in PAYMENT-RESPONSE.
 */
import { NextRequest, NextResponse } from 'next/server';
import { BatchFacilitatorClient } from '@circle-fin/x402-batching/server';
import { ARC_CONTRACTS, ARC_CHAIN_ID, ARC_NETWORK } from './arc';
import { priceOf, type EndpointKey } from './pricing';
import { getWalletByCode, getTreasury } from './agents';

export const X402_VERSION = 2 as const;

/**
 * CAIP-2 network identifier for Arc testnet (used by @x402/core and
 * Circle's facilitator to route payments).
 */
export const ARC_CAIP2 = `eip155:${ARC_CHAIN_ID}` as const;

/** Circle Gateway testnet facilitator URL. */
const DEFAULT_FACILITATOR_URL = 'https://gateway-api-testnet.circle.com';

let cachedFacilitator: BatchFacilitatorClient | null = null;
export function getFacilitator(): BatchFacilitatorClient {
  if (cachedFacilitator) return cachedFacilitator;
  const url = process.env.CIRCLE_FACILITATOR_URL || DEFAULT_FACILITATOR_URL;
  cachedFacilitator = new BatchFacilitatorClient({ url });
  return cachedFacilitator;
}

/** PAYMENT-REQUIRED body shape emitted on 402 responses. */
export type PaymentRequirements = {
  scheme: 'exact';
  network: string;           // CAIP-2, e.g. 'eip155:5042002'
  asset: `0x${string}`;      // USDC address on Arc
  amount: string;            // decimal USDC string — e.g. "0.003"
  payTo: `0x${string}`;
  maxTimeoutSeconds: number;
  resource: string;
  description: string;
  mimeType: string;
  outputSchema?: Record<string, unknown>;
  extra: {
    name: 'GatewayWalletBatched';
    version: '1';
    verifyingContract: typeof ARC_CONTRACTS.GatewayWallet;
    supervisionFee: string;
    treasuryAddress: `0x${string}`;
  };
};

export type Paid402Response = {
  x402Version: number;
  error: string;
  accepts: PaymentRequirements[];
};

/**
 * Convert decimal USDC string → smallest-unit string.
 * Arc testnet USDC uses 6 decimals for the ERC-20 (matches other chains).
 */
export function toUsdcBaseUnits(decimalAmount: string): string {
  const [intPart, fracPartRaw = ''] = decimalAmount.split('.');
  const fracPart = (fracPartRaw + '000000').slice(0, 6); // pad/truncate to 6
  const combined = `${intPart}${fracPart}`.replace(/^0+/, '') || '0';
  return combined;
}

/** Build PaymentRequirements for a given endpoint key. */
export function buildRequirements(
  key: EndpointKey,
  resourceUrl: string,
): PaymentRequirements {
  const price = priceOf(key);
  const seller = getWalletByCode(price.seller);
  const treasury = getTreasury();
  return {
    scheme: 'exact',
    network: ARC_CAIP2,
    asset: ARC_CONTRACTS.USDC,
    amount: toUsdcBaseUnits(price.price),
    payTo: seller.address,
    maxTimeoutSeconds: price.maxTimeoutSeconds,
    resource: resourceUrl,
    description: price.description,
    mimeType: 'application/json',
    extra: {
      name: 'GatewayWalletBatched',
      version: '1',
      verifyingContract: ARC_CONTRACTS.GatewayWallet,
      supervisionFee: price.supervisionFee,
      treasuryAddress: treasury.address,
    },
  };
}

export function challenge402(
  key: EndpointKey,
  resourceUrl: string,
): NextResponse<Paid402Response> {
  const reqs = buildRequirements(key, resourceUrl);
  const body: Paid402Response = {
    x402Version: X402_VERSION,
    error: 'PAYMENT-SIGNATURE header required',
    accepts: [reqs],
  };
  const encoded = Buffer.from(JSON.stringify(reqs)).toString('base64');
  const headers = new Headers({
    'content-type': 'application/json',
    'PAYMENT-REQUIRED': encoded,
    'X-PAYMENT-REQUIRED': encoded, // legacy alias
  });
  return new NextResponse(JSON.stringify(body, null, 2), {
    status: 402,
    headers,
  });
}

export function extractPaymentSignature(req: NextRequest): string | null {
  return (
    req.headers.get('payment-signature') ||
    req.headers.get('x-payment') ||
    null
  );
}

/** Verify + settle outcome returned from `requirePayment`. */
export type SettlementReceipt = {
  ok: true;
  payer: string;
  amount: string;
  network: string;
  transactionHash?: string;
};

/**
 * Production gate. Reads PAYMENT-SIGNATURE header, verifies + settles via
 * Circle's BatchFacilitatorClient. Returns either a 402 challenge response
 * (for the route to return directly) or a SettlementReceipt (for the route
 * to embed in PAYMENT-RESPONSE).
 */
export async function requirePayment(
  key: EndpointKey,
  req: NextRequest,
): Promise<
  | { kind: 'challenge'; response: NextResponse<Paid402Response> }
  | { kind: 'settled'; receipt: SettlementReceipt; requirements: PaymentRequirements }
  | { kind: 'error'; response: NextResponse }
> {
  const url = new URL(req.url);
  const resourceUrl = `${url.origin}${url.pathname}`;
  const sigHeader = extractPaymentSignature(req);
  const requirements = buildRequirements(key, resourceUrl);

  if (!sigHeader) {
    return { kind: 'challenge', response: challenge402(key, resourceUrl) };
  }

  // Decode base64 payload → PaymentPayload
  let paymentPayload: unknown;
  try {
    const decoded = Buffer.from(sigHeader, 'base64').toString('utf-8');
    paymentPayload = JSON.parse(decoded);
  } catch {
    return {
      kind: 'error',
      response: NextResponse.json(
        { error: 'Invalid PAYMENT-SIGNATURE: not valid base64 JSON' },
        { status: 400 },
      ),
    };
  }

  const facilitator = getFacilitator();

  // 1. Verify
  let verifyRes;
  try {
    verifyRes = await facilitator.verify(
      paymentPayload as Parameters<typeof facilitator.verify>[0],
      requirements as unknown as Parameters<typeof facilitator.verify>[1],
    );
  } catch (err) {
    return {
      kind: 'error',
      response: NextResponse.json(
        { error: 'verify failed', detail: (err as Error).message },
        { status: 502 },
      ),
    };
  }
  if (!verifyRes.isValid) {
    return {
      kind: 'error',
      response: NextResponse.json(
        { error: 'payment invalid', reason: verifyRes.invalidReason },
        { status: 402 },
      ),
    };
  }

  // 2. Settle
  let settleRes;
  try {
    settleRes = await facilitator.settle(
      paymentPayload as Parameters<typeof facilitator.settle>[0],
      requirements as unknown as Parameters<typeof facilitator.settle>[1],
    );
  } catch (err) {
    return {
      kind: 'error',
      response: NextResponse.json(
        { error: 'settle failed', detail: (err as Error).message },
        { status: 502 },
      ),
    };
  }
  if (!settleRes.success) {
    return {
      kind: 'error',
      response: NextResponse.json(
        { error: 'settle rejected', reason: settleRes.errorReason },
        { status: 402 },
      ),
    };
  }

  const receipt: SettlementReceipt = {
    ok: true,
    payer: settleRes.payer ?? verifyRes.payer ?? 'unknown',
    amount: requirements.amount,
    network: settleRes.network ?? requirements.network,
    transactionHash: settleRes.transaction,
  };
  return { kind: 'settled', receipt, requirements };
}

/** Encode SettlementReceipt for PAYMENT-RESPONSE header. */
export function encodeReceipt(receipt: SettlementReceipt): string {
  return Buffer.from(JSON.stringify(receipt)).toString('base64');
}
