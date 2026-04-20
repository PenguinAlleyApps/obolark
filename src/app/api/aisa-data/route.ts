/**
 * POST /api/aisa-data — AISA data-endpoint wrapper.
 *
 * $0.002 USDC per query (x402-gated). Distinct from chat completions —
 * this wraps AISA's structured-data endpoints (Twitter, CoinGecko,
 * Financials, Prediction Markets, Perplexity, Tavily, YouTube).
 *
 * Per OBOLARK_V2_PLAN.md §W3 + discovery at https://aisa.one/docs/llms.txt:
 *
 * Accepted query formats:
 *   { query: "user_info:circle_fin" }      → GET /twitter/user-info?userName=circle_fin
 *   { query: "coin:bitcoin" }              → GET /coingecko/coin-data-by-id?id=bitcoin
 *   { query: "price:BTC" }                 → GET /coingecko/simple-price?ids=BTC
 *   { query: "trending" }                  → GET /coingecko/trending-search
 *   { query: "prices:AAPL" }               → GET /financial/prices-snapshot?symbol=AAPL
 *   { path: "/twitter/user-info", params: {...} }  → raw passthrough
 *
 * Behavior:
 *   - Forwards to AISA data host with Bearer auth (AISA_API_KEY).
 *   - Short 10s timeout — judges won't wait longer.
 *   - On AISA timeout / 5xx → returns { serviceable: false, reason }.
 *     Does NOT fall back to Featherless (different purpose per task spec).
 */
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePayment, encodeReceipt } from '@/lib/x402-gateway';
import { priceOf } from '@/lib/pricing';
import { getWalletByCode } from '@/lib/agents';
import { txUrl } from '@/lib/arc';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const AISA_DATA_HOST = process.env.AISA_DATA_HOST ?? 'https://api.aisa.one';
const AISA_DATA_TIMEOUT_MS = Number(process.env.AISA_DATA_TIMEOUT_MS ?? 10000);

const bodySchema = z.union([
  z.object({
    query: z.string().min(2).max(200),
    params: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
  }),
  z.object({
    path: z.string().regex(/^\/[a-zA-Z0-9\-\/_]+$/).max(100),
    method: z.enum(['GET', 'POST']).default('GET'),
    params: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
    body: z.record(z.string(), z.unknown()).optional(),
  }),
]);

type GateSettled = Extract<Awaited<ReturnType<typeof requirePayment>>, { kind: 'settled' }>;

type Route = {
  path: string;
  method: 'GET' | 'POST';
  params?: Record<string, string | number | boolean>;
  body?: Record<string, unknown>;
};

/**
 * Map the shorthand `query` field to an AISA route. Returns null if the
 * shorthand is unrecognized — caller returns 400.
 */
function mapQueryToRoute(
  query: string,
  extraParams?: Record<string, string | number | boolean>,
): Route | null {
  const [keyRaw, valueRaw = ''] = query.split(':', 2);
  const key = keyRaw.trim().toLowerCase();
  const value = valueRaw.trim();

  switch (key) {
    case 'user_info':
      if (!value) return null;
      return { path: '/twitter/user-info', method: 'GET', params: { userName: value, ...extraParams } };
    case 'followers':
      if (!value) return null;
      return { path: '/twitter/user-followers', method: 'GET', params: { userName: value, ...extraParams } };
    case 'tweets':
      if (!value) return null;
      return { path: '/twitter/user-last-tweets', method: 'GET', params: { userName: value, ...extraParams } };
    case 'trends':
      return { path: '/twitter/trends', method: 'GET', params: extraParams };
    case 'coin':
      if (!value) return null;
      return { path: '/coingecko/coin-data-by-id', method: 'GET', params: { id: value, ...extraParams } };
    case 'price':
      if (!value) return null;
      return { path: '/coingecko/simple-price', method: 'GET', params: { ids: value, vs_currencies: 'usd', ...extraParams } };
    case 'trending':
      return { path: '/coingecko/trending-search', method: 'GET', params: extraParams };
    case 'prices':
      if (!value) return null;
      return { path: '/financial/prices-snapshot', method: 'GET', params: { symbol: value, ...extraParams } };
    case 'earnings':
      if (!value) return null;
      return { path: '/financial/earnings', method: 'GET', params: { symbol: value, ...extraParams } };
    case 'polymarket':
      return { path: '/prediction-market/polymarket-markets', method: 'GET', params: extraParams };
    default:
      return null;
  }
}

function buildUrl(path: string, params?: Record<string, string | number | boolean>): string {
  const url = new URL(path, AISA_DATA_HOST);
  if (params) {
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  }
  return url.toString();
}

async function forwardToAisa(route: Route): Promise<
  | { ok: true; status: number; data: unknown; latencyMs: number }
  | { ok: false; reason: 'timeout' | 'http_5xx' | 'http_4xx' | 'fetch_failed' | 'no_key'; detail: string; status?: number }
> {
  const key = process.env.AISA_API_KEY;
  if (!key) return { ok: false, reason: 'no_key', detail: 'AISA_API_KEY missing' };

  const t0 = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), AISA_DATA_TIMEOUT_MS);

  const url = buildUrl(route.path, route.params);
  let res: Response;
  try {
    res = await fetch(url, {
      method: route.method,
      signal: ctrl.signal,
      headers: {
        Authorization: `Bearer ${key}`,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: route.method === 'POST' && route.body ? JSON.stringify(route.body) : undefined,
    });
  } catch (err) {
    clearTimeout(timer);
    const e = err as Error;
    if (e.name === 'AbortError') {
      return { ok: false, reason: 'timeout', detail: `AISA data request exceeded ${AISA_DATA_TIMEOUT_MS}ms` };
    }
    return { ok: false, reason: 'fetch_failed', detail: e.message };
  }
  clearTimeout(timer);

  const latencyMs = Date.now() - t0;
  const text = await res.text().catch(() => '');
  let data: unknown = text;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    /* keep raw text */
  }

  if (!res.ok) {
    if (res.status >= 500) return { ok: false, reason: 'http_5xx', detail: `AISA ${res.status}: ${text.slice(0, 200)}`, status: res.status };
    return { ok: false, reason: 'http_4xx', detail: `AISA ${res.status}: ${text.slice(0, 200)}`, status: res.status };
  }

  return { ok: true, status: res.status, data, latencyMs };
}

export async function POST(req: NextRequest) {
  const gate = await requirePayment('aisa-data', req);
  if (gate.kind === 'challenge') return gate.response;
  if (gate.kind === 'error') return gate.response;

  let parsed;
  try {
    parsed = bodySchema.safeParse(await req.json());
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', issues: parsed.error.issues }, { status: 400 });
  }

  const price = priceOf('aisa-data');
  const seller = getWalletByCode(price.seller);
  const started = Date.now();

  // Resolve route — shorthand `query` or raw `path`.
  let route: Route | null;
  if ('query' in parsed.data) {
    route = mapQueryToRoute(parsed.data.query, parsed.data.params);
    if (!route) {
      return NextResponse.json(
        {
          error: 'Unrecognized query shorthand',
          hint: 'Supported: user_info:<user>, followers:<user>, tweets:<user>, trends, coin:<id>, price:<id>, trending, prices:<sym>, earnings:<sym>, polymarket. Or POST { path: "/...", method, params, body }.',
        },
        { status: 400 },
      );
    }
  } else {
    route = {
      path: parsed.data.path,
      method: parsed.data.method,
      params: parsed.data.params,
      body: parsed.data.body,
    };
  }

  // USE_REAL_PROVIDERS guard.
  if (process.env.USE_REAL_PROVIDERS !== 'true') {
    return NextResponse.json(
      buildResponse({
        serviceable: false,
        degraded: true,
        reason: 'flag_disabled',
        detail: 'USE_REAL_PROVIDERS is off — AISA data forwarding skipped.',
        route, data: null, upstreamLatencyMs: null,
        gate, price, seller, latencyMs: Date.now() - started,
      }),
      { status: 200, headers: receiptHeaders(gate.receipt) },
    );
  }

  const upstream = await forwardToAisa(route);

  if (upstream.ok) {
    return NextResponse.json(
      buildResponse({
        serviceable: true,
        degraded: false,
        route,
        data: upstream.data,
        upstreamLatencyMs: upstream.latencyMs,
        gate, price, seller, latencyMs: Date.now() - started,
      }),
      { status: 200, headers: receiptHeaders(gate.receipt) },
    );
  }

  // Mark serviceable=false on AISA outage; do NOT retry via Featherless
  // (different purpose). Returns 200 so payment stays settled and the
  // caller can inspect `serviceable` without parsing error envelopes.
  return NextResponse.json(
    buildResponse({
      serviceable: false,
      degraded: true,
      reason: upstream.reason,
      detail: upstream.detail,
      route, data: null, upstreamLatencyMs: null,
      gate, price, seller, latencyMs: Date.now() - started,
    }),
    { status: 200, headers: receiptHeaders(gate.receipt) },
  );
}

function buildResponse(args: {
  serviceable: boolean;
  route: Route;
  data: unknown;
  upstreamLatencyMs: number | null;
  gate: GateSettled;
  price: ReturnType<typeof priceOf>;
  seller: ReturnType<typeof getWalletByCode>;
  latencyMs: number;
} & (
  | { degraded: false }
  | { degraded: true; reason: 'flag_disabled' | 'no_key' | 'timeout' | 'http_5xx' | 'http_4xx' | 'fetch_failed'; detail: string }
)) {
  return {
    ok: true,
    serviceable: args.serviceable,
    agent: 'RADAR',
    seller: { address: args.seller.address, walletId: args.seller.walletId, code: args.price.seller },
    paid: {
      scheme: 'exact',
      network: args.gate.receipt.network,
      amount: args.price.price,
      supervisionFee: args.price.supervisionFee,
      payer: args.gate.receipt.payer,
      transactionHash: args.gate.receipt.transactionHash,
      txExplorer: args.gate.receipt.transactionHash ? txUrl(args.gate.receipt.transactionHash) : null,
    },
    route: { path: args.route.path, method: args.route.method, params: args.route.params ?? null },
    data: args.data,
    upstreamLatencyMs: args.upstreamLatencyMs,
    latencyMs: args.latencyMs,
    ...(args.degraded
      ? { degraded: true as const, reason: args.reason, detail: args.detail }
      : { degraded: false as const }),
    at: new Date().toISOString(),
  };
}

function receiptHeaders(receipt: GateSettled['receipt']): HeadersInit {
  return {
    'PAYMENT-RESPONSE': encodeReceipt(receipt),
    'X-PAYMENT-RESPONSE': encodeReceipt(receipt),
  };
}

export async function GET() {
  const price = priceOf('aisa-data');
  const seller = getWalletByCode(price.seller);
  return NextResponse.json({
    endpoint: '/api/aisa-data',
    method: 'POST',
    pricing: {
      amount: price.price,
      supervisionFee: price.supervisionFee,
      currency: 'USDC',
      network: 'arc-testnet (eip155:5042002)',
    },
    seller: { agent: price.seller, address: seller.address },
    description: price.description,
    upstream: AISA_DATA_HOST,
    body: {
      shorthand: '{ "query": "user_info:<user>" | "coin:<id>" | "price:<id>" | "prices:<sym>" | "trending" | "polymarket" | "trends" | "earnings:<sym>" }',
      raw: '{ "path": "/twitter/user-info", "method": "GET"|"POST", "params": {...}, "body": {...} }',
    },
    output: '{ serviceable: boolean, route, data, upstreamLatencyMs }',
    note: 'On AISA outage returns serviceable:false (does NOT fall back — chat fallback lives in /api/cross pipeline).',
  });
}
