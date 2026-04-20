/**
 * Circle Developer-Controlled Wallets client — single process-wide instance.
 * Reuses the same CIRCLE_API_KEY + CIRCLE_ENTITY_SECRET the x402 path uses.
 */
import { initiateDeveloperControlledWalletsClient } from '@circle-fin/developer-controlled-wallets';

type Client = ReturnType<typeof initiateDeveloperControlledWalletsClient>;
let cached: Client | null = null;

export function getCircle(): Client {
  if (cached) return cached;
  const apiKey = process.env.CIRCLE_API_KEY;
  const entitySecret = process.env.CIRCLE_ENTITY_SECRET;
  if (!apiKey) throw new Error('CIRCLE_API_KEY missing');
  if (!entitySecret) throw new Error('CIRCLE_ENTITY_SECRET missing');
  cached = initiateDeveloperControlledWalletsClient({ apiKey, entitySecret });
  return cached;
}

/**
 * USDC tokenId lookup (Circle-side opaque id, not the ERC-20 address).
 * Cached after first lookup since it never changes for a given wallet set.
 */
let usdcTokenId: string | null = null;

export async function getUsdcTokenId(probeWalletId: string): Promise<string> {
  if (usdcTokenId) return usdcTokenId;
  const client = getCircle();
  const bal = await client.getWalletTokenBalance({ id: probeWalletId });
  const tokens = bal.data?.tokenBalances ?? [];
  const usdc = tokens.find((b) => (b.token?.symbol ?? '').toUpperCase() === 'USDC');
  if (!usdc?.token?.id) throw new Error('USDC token not found on probe wallet');
  usdcTokenId = usdc.token.id;
  return usdcTokenId;
}
