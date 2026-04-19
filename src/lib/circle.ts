/**
 * Circle dev-controlled wallets client — singleton for server-side use.
 *
 * Reads CIRCLE_API_KEY + CIRCLE_ENTITY_SECRET from env at boot.
 * NEVER import this in a client component (entity secret is server-only).
 */
import {
  initiateDeveloperControlledWalletsClient,
  type CircleDeveloperControlledWalletsClient,
} from '@circle-fin/developer-controlled-wallets';

let cachedClient: CircleDeveloperControlledWalletsClient | null = null;

export function getCircle(): CircleDeveloperControlledWalletsClient {
  if (cachedClient) return cachedClient;

  const apiKey = process.env.CIRCLE_API_KEY;
  const entitySecret = process.env.CIRCLE_ENTITY_SECRET;
  if (!apiKey) throw new Error('CIRCLE_API_KEY missing. Check .env.local.');
  if (!entitySecret) throw new Error('CIRCLE_ENTITY_SECRET missing. Check .env.local.');

  cachedClient = initiateDeveloperControlledWalletsClient({ apiKey, entitySecret });
  return cachedClient;
}

/** Quick guard for serverless runtimes — throws if called in Edge. */
export function assertServerRuntime(): void {
  if (typeof process === 'undefined' || !process.env.CIRCLE_API_KEY) {
    throw new Error('Circle SDK requires Node runtime; do not call from Edge/client.');
  }
}
