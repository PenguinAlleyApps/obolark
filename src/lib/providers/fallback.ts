/**
 * Degraded-result builder + failure logger.
 *
 * When a provider call fails (timeout, 5xx, invalid output, flag off),
 * the payment has ALREADY settled onchain — we must respond 200 with a
 * clear degraded marker and log the incident for later refund.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { EndpointKey, ProviderOutcome } from './types';

const LOG_PATH = 'logs/provider-failures.json';

export function degraded<K extends EndpointKey>(
  reason: Extract<ProviderOutcome<K>, { degraded: true }>['reason'],
  echo: unknown,
): ProviderOutcome<K> {
  return {
    degraded: true,
    reason,
    echo,
    refundEligible: reason !== 'flag_disabled',
  };
}

export function logFailure(entry: {
  endpoint: EndpointKey;
  reason: string;
  at: string;
  payer?: string;
  txId?: string;
  detail?: string;
}) {
  try {
    const abs = path.resolve(process.cwd(), LOG_PATH);
    const dir = path.dirname(abs);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const existing = fs.existsSync(abs)
      ? (JSON.parse(fs.readFileSync(abs, 'utf-8')) as unknown[])
      : [];
    existing.push(entry);
    fs.writeFileSync(abs, JSON.stringify(existing, null, 2));
  } catch {
    // Logging is best-effort — never crash the route on log I/O.
  }
}
