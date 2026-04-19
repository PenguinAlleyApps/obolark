/**
 * x402 gateway — thin Next.js App Router wrapper around Circle's
 * batched-settlement facilitator scheme.
 *
 * Day-1 scope: emit the 402 PAYMENT-REQUIRED challenge per endpoint,
 * wire settle() plumbing so Day-2 buyer signing completes the loop.
 *
 * Server-side only. Do not import from client components.
 */
import { NextRequest, NextResponse } from 'next/server';
import { ARC_CONTRACTS, ARC_NETWORK } from './arc';
import { priceOf, type EndpointKey } from './pricing';
import { getWalletByCode, getTreasury } from './agents';

export const X402_VERSION = 2 as const;

/** PAYMENT-REQUIRED body shape emitted on 402 responses. */
export type PaymentRequirements = {
  scheme: 'exact';
  network: typeof ARC_NETWORK;
  asset: `0x${string}`;      // USDC on Arc
  amount: string;            // decimal USDC string — e.g. "0.003"
  payTo: `0x${string}`;      // seller agent address
  maxTimeoutSeconds: number;
  resource: string;          // absolute URL of the endpoint
  description: string;
  mimeType: string;
  outputSchema?: Record<string, unknown>;
  extra: {
    /** Circle batching identifier — triggers batched gas-free settlement */
    name: 'GatewayWalletBatched';
    version: '1';
    verifyingContract: typeof ARC_CONTRACTS.GatewayWallet;
    /** Supervision fee routed to PAco treasury */
    supervisionFee: string;
    treasuryAddress: `0x${string}`;
  };
};

export type Paid402Response = {
  x402Version: number;
  error: 'X-PAYMENT header required' | 'PAYMENT-SIGNATURE header required';
  accepts: PaymentRequirements[];
};

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
    network: ARC_NETWORK,
    asset: ARC_CONTRACTS.USDC,
    amount: price.price,
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

/** Return a 402 challenge response. */
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
  const headers = new Headers({
    'content-type': 'application/json',
    // Both legacy and canonical header names for maximum client compat.
    'PAYMENT-REQUIRED': Buffer.from(JSON.stringify(reqs)).toString('base64'),
    'X-PAYMENT-REQUIRED': Buffer.from(JSON.stringify(reqs)).toString('base64'),
  });
  return new NextResponse(JSON.stringify(body, null, 2), {
    status: 402,
    headers,
  });
}

/** Read paid-by signature from request headers if present. */
export function extractPaymentSignature(req: NextRequest): string | null {
  return (
    req.headers.get('payment-signature') ||
    req.headers.get('x-payment') ||
    null
  );
}

/**
 * Minimal Day-1 "paid or not" gate. Returns null if request is paid
 * (route handler should proceed). Returns a 402 NextResponse if unpaid.
 *
 * Day-2 will upgrade this to actually verify+settle via the Circle
 * facilitator; for Day-1 we accept any non-empty signature as a placeholder
 * and log it so the smoke test can prove the 402 → 200 flow is wired.
 */
export function requirePayment(
  key: EndpointKey,
  req: NextRequest,
): NextResponse<Paid402Response> | null {
  const sig = extractPaymentSignature(req);
  const url = new URL(req.url);
  const resourceUrl = `${url.origin}${url.pathname}`;
  if (!sig || sig.length < 4) {
    return challenge402(key, resourceUrl);
  }
  // Day-1 placeholder acceptance — DAY-2 TODO: verify + settle via facilitator
  return null;
}
