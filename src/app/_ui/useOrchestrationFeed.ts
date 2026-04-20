'use client';

/**
 * useOrchestrationFeed — single source of truth for /api/orchestrate/feed.
 *
 * Polls every 5s. The Orchestrations panel, Marquee, and Agents overlay
 * all read from this hook so we make ONE fetch per interval, not three.
 *
 * Emits two window events so the SVG edge overlay + card-wash can react
 * without prop-drilling:
 *   · obolark:orch:new-completed   detail: { run: Run }
 *   · obolark:orch:inbox-updated   detail: { agent_code: string, entry }
 *
 * Cleans up the interval + listeners on unmount. Silent on network errors
 * (returns the last-known feed, never throws) — the UI shows a calm empty
 * state if the very first fetch fails.
 */
import { useEffect, useRef, useState } from 'react';
import type { OrchestrationFeed, Run, InboxEntry } from './orchestrations-types';

const POLL_MS = 5000;

const EMPTY: OrchestrationFeed = {
  state: {
    enabled: false,
    tick_round: 0,
    hourly_tick_count: 0,
    hourly_usdc_spent: 0,
    lifetime_ticks: 0,
    last_tick_at: null,
  },
  runs: [],
  inbox: {},
};

export type OrchestrationEvent =
  | { type: 'new-completed'; run: Run }
  | { type: 'inbox-updated'; agent_code: string; entry: InboxEntry };

export function useOrchestrationFeed(): {
  feed: OrchestrationFeed;
  loaded: boolean;
  error: boolean;
} {
  const [feed, setFeed] = useState<OrchestrationFeed>(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  // Track last-seen run ids + inbox timestamps so we only dispatch diff events.
  const seenRunIds = useRef<Set<number>>(new Set());
  const lastInboxAt = useRef<Map<string, string>>(new Map());
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    let cancelled = false;

    const fetchOnce = async () => {
      try {
        const res = await fetch('/api/orchestrate/feed', { cache: 'no-store' });
        if (!res.ok) {
          if (!loaded) setError(true);
          return;
        }
        const data = (await res.json()) as OrchestrationFeed;
        if (cancelled || !mounted.current) return;

        // Diff: new completed runs
        for (const run of data.runs) {
          if (run.status === 'completed' && !seenRunIds.current.has(run.id)) {
            // Only fire if we've loaded once already — skip the initial rush.
            if (loaded) {
              window.dispatchEvent(
                new CustomEvent('obolark:orch:new-completed', { detail: { run } }),
              );
            }
          }
          seenRunIds.current.add(run.id);
        }

        // Diff: inbox entries whose last_at changed
        for (const [code, entry] of Object.entries(data.inbox)) {
          const prev = lastInboxAt.current.get(code);
          if (entry.last_at && entry.last_at !== prev) {
            if (loaded && prev !== undefined) {
              window.dispatchEvent(
                new CustomEvent('obolark:orch:inbox-updated', {
                  detail: { agent_code: code, entry },
                }),
              );
            }
            lastInboxAt.current.set(code, entry.last_at);
          }
        }

        setFeed(data);
        setLoaded(true);
        setError(false);
      } catch {
        if (!loaded) setError(true);
        // Keep last-known feed on transient failure.
      }
    };

    void fetchOnce();
    const id = setInterval(fetchOnce, POLL_MS);

    return () => {
      cancelled = true;
      mounted.current = false;
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { feed, loaded, error };
}
