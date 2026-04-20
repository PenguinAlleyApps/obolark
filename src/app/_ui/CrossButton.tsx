'use client';

/**
 * CrossButton — interactive one-click crossing trigger.
 *
 * Usage: inline in each Tollkeeper row (page.tsx `[II · ENDPOINT CATALOG]`).
 * Calls POST /api/cross with the endpoint path; surfaces outcome via a
 * bottom-right toast + ledger-row pulse + floating `+1` numeral on success.
 *
 * Styling respects EO-016 + the Bureau Ledger aesthetic:
 *   · mono caps `[ CROSS ]` · no spinner · 1px indeterminate underline while
 *     settling · no rounded pills · focus outline uses var(--signal).
 *
 * Accessibility:
 *   · aria-live="polite" region announces outcome ("Settled, ORACLE, …")
 *   · focus returns to the row after success so screen-reader users don't
 *     lose place in the catalog table.
 */
import { useEffect, useRef, useState } from 'react';

type State = 'idle' | 'settling' | 'success' | 'still-mining' | 'rate-limited' | 'circuit-open' | 'error';

type Props = {
  endpoint: string;          // e.g. "/api/research"
  sellerCodename: string;    // e.g. "ORACLE"
  sellerCode: string;        // e.g. "RADAR"
  price: string;             // decimal USDC, e.g. "0.003"
  rowSelector?: string;      // optional: CSS selector for the ledger row to pulse on success
  onSettled?: () => void;    // callback to force a re-fetch of /api/state
};

type Toast = { id: number; text: string; tone: 'ok' | 'warn' | 'info' };

export default function CrossButton({
  endpoint,
  sellerCodename,
  sellerCode,
  price,
  onSettled,
}: Props) {
  const [state, setState] = useState<State>('idle');
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [pulseKey, setPulseKey] = useState(0); // bump to trigger the +1 float
  const btnRef = useRef<HTMLButtonElement>(null);
  const liveRef = useRef<HTMLDivElement>(null);

  function pushToast(text: string, tone: Toast['tone'] = 'info') {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, text, tone }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  }

  function announce(text: string) {
    if (liveRef.current) liveRef.current.textContent = text;
  }

  async function onClick() {
    if (state === 'settling') return;
    setState('settling');
    try {
      const res = await fetch('/api/cross', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-obolark-demo': '1' },
        body: JSON.stringify({ endpoint }),
      });

      if (res.status === 429) {
        const body = await res.json().catch(() => ({}));
        const text = body.window === 'day'
          ? 'demo cap reached · 20/day/IP'
          : 'demo cap reached · 5/min/IP';
        pushToast(text, 'warn');
        announce(text);
        setState('rate-limited');
        setTimeout(() => setState('idle'), 2000);
        return;
      }
      if (res.status === 503) {
        pushToast('deposit low · retry later', 'warn');
        announce('deposit low, retry later');
        setState('circuit-open');
        setTimeout(() => setState('idle'), 2000);
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        pushToast(`cross failed · ${body.detail?.slice(0, 60) ?? res.status}`, 'warn');
        announce('cross failed');
        setState('error');
        setTimeout(() => setState('idle'), 2500);
        return;
      }

      const body = await res.json();
      if (body.stillMining) {
        pushToast('still mining · check ledger in 10s', 'info');
        announce('still mining, check ledger in ten seconds');
        setState('still-mining');
      } else {
        pushToast(`settled · ${sellerCodename} · ${price} USDC`, 'ok');
        announce(`Settled, ${sellerCodename}, ${endpoint.replace('/api/', '')}, ${price} USDC`);
        setState('success');
      }
      setPulseKey((k) => k + 1);

      // Re-fetch state immediately so the LedgerTicker picks up the new row
      // without waiting for its 15s poll. We both invoke the optional callback
      // AND dispatch a DOM event — LedgerTicker / ReputationPanel listen for
      // it so we don't have to prop-drill through the server component.
      if (onSettled) onSettled();
      try {
        window.dispatchEvent(
          new CustomEvent('obolark:settled', {
            detail: { endpoint, sellerCode, txHash: body.txHash },
          }),
        );
      } catch {
        /* SSR-safe */
      }

      // Row pulse: temporarily flip data-settled=true on the first ledger row,
      // then revert (CSS keyframe runs once).
      try {
        const firstRow = document.querySelector<HTMLElement>('.ledger-row');
        if (firstRow) {
          firstRow.setAttribute('data-settled', 'true');
          setTimeout(() => firstRow.setAttribute('data-settled', 'false'), 700);
        }
      } catch {
        /* no-op */
      }

      // Return focus to button's parent row for keyboard users.
      setTimeout(() => {
        btnRef.current?.closest('tr')?.focus?.();
        setState('idle');
      }, 2500);
    } catch (err) {
      pushToast(`network · ${(err as Error).message.slice(0, 60)}`, 'warn');
      announce('network error');
      setState('error');
      setTimeout(() => setState('idle'), 2500);
    }
  }

  // Dismissable toasts respond to click.
  const dismiss = (id: number) => setToasts((prev) => prev.filter((t) => t.id !== id));

  const busy = state === 'settling';
  const label = busy ? '[ SETTLING… ]' : '[ CROSS ]';

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={onClick}
        disabled={busy}
        aria-label={`Cross ${endpoint}, pay ${price} USDC to ${sellerCodename}`}
        className="stamp-button cross-button"
        data-accent="signal"
        data-busy={busy ? 'true' : 'false'}
      >
        {label}
      </button>

      {/* +1 ghost numeral — floats up over the button on success. */}
      {pulseKey > 0 && state === 'success' && (
        <span className="cross-plus-one" key={pulseKey} aria-hidden>
          +1
        </span>
      )}

      {/* aria-live: off-screen but screen-reader-audible */}
      <div
        ref={liveRef}
        aria-live="polite"
        style={{
          position: 'absolute',
          width: 1,
          height: 1,
          padding: 0,
          margin: -1,
          overflow: 'hidden',
          clip: 'rect(0 0 0 0)',
          whiteSpace: 'nowrap',
          border: 0,
        }}
      />

      {/* Bottom-right toast stack (rendered per-button — simple + isolated). */}
      {toasts.length > 0 && (
        <div className="cross-toasts" role="status">
          {toasts.map((t) => (
            <button
              key={t.id}
              type="button"
              className="cross-toast"
              data-tone={t.tone}
              onClick={() => dismiss(t.id)}
            >
              {t.text}
            </button>
          ))}
        </div>
      )}
    </>
  );
}
