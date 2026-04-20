/**
 * Shared types for the Orchestrations UI (VII tab + marquee + overlay).
 * Kept in its own file so Atlas and Pixel reference the same contract.
 * If the shape changes, change it HERE — both ends recompile.
 */

export type RunStatus =
  | 'pending'
  | 'paying'
  | 'waiting_response'
  | 'post_processing'
  | 'completed'
  | 'failed';

export type Run = {
  id: number;
  created_at: string;
  tick_round: number;
  buyer_code: string;
  buyer_codename: string;
  seller_code: string;
  seller_codename: string;
  seller_endpoint: string;
  price_usdc: string;
  status: RunStatus;
  seller_response_preview: string | null;
  post_process_output: string | null;
  tx_hash: string | null;
  feedback_tx_hash: string | null;
  duration_ms: number | null;
};

export type InboxEntry = {
  agent_code: string;
  agent_codename: string;
  last_output: string | null;
  last_output_preview: string | null;
  last_tx_hash: string | null;
  last_at: string | null;
  status: 'idle' | 'working' | 'pending';
  total_paid_usdc: number;
  total_received_usdc: number;
  lifetime_runs: number;
};

export type OrchestrationFeed = {
  state: {
    enabled: boolean;
    tick_round: number;
    hourly_tick_count: number;
    hourly_usdc_spent: number;
    lifetime_ticks: number;
    last_tick_at: string | null;
  };
  runs: Run[];
  inbox: Record<string, InboxEntry>;
};

export const ACTIVE_STATUSES: RunStatus[] = [
  'pending',
  'paying',
  'waiting_response',
  'post_processing',
];

export function isActive(status: RunStatus): boolean {
  return ACTIVE_STATUSES.includes(status);
}

/**
 * Returns the most recent active run (or null if all runs are settled).
 * "Active" = not completed AND not failed.
 */
export function pickCurrentRun(runs: Run[]): Run | null {
  for (const r of runs) {
    if (isActive(r.status)) return r;
  }
  return null;
}
