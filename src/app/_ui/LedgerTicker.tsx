'use client';
import { useEffect, useState } from 'react';

type Receipt = {
  endpoint: string;
  receipt: { payer: string; amount: string; network: string; transactionHash: string };
  result?: string;
  at: string;
};

export default function LedgerTicker({ initial }: { initial: Receipt[] }) {
  const [rows, setRows] = useState(initial);

  useEffect(() => {
    const tick = async () => {
      try {
        const res = await fetch('/api/state', { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        if (Array.isArray(data.recentCalls)) setRows(data.recentCalls);
      } catch {
        // Silent fail — panel will retain last known rows
      }
    };
    const id = setInterval(tick, 15000);
    return () => clearInterval(id);
  }, []);

  if (rows.length === 0) {
    return (
      <div className="font-mono text-sm text-[var(--muted)] py-6">
        No settled calls yet — hit an endpoint with PAYMENT-SIGNATURE to populate.
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <div
        className="grid font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--muted)] py-1 border-b"
        style={{ gridTemplateColumns: '110px 160px 100px 120px 1fr', borderColor: 'var(--grid-line)' }}
      >
        <span>TIME</span>
        <span>ROUTE</span>
        <span className="text-right">AMOUNT</span>
        <span>PAYER</span>
        <span>CIRCLE TX</span>
      </div>
      {rows.map((r, i) => {
        const time = new Date(r.at).toLocaleTimeString();
        const base = (Number(r.receipt.amount) / 1_000_000).toFixed(6);
        return (
          <div
            key={`${r.receipt.transactionHash}-${i}`}
            className="ledger-row"
            data-settled={i === 0 ? 'true' : 'false'}
            style={{ gridTemplateColumns: '110px 160px 100px 120px 1fr' }}
          >
            <span className="text-[var(--muted)]">{time}</span>
            <span className="font-bold">{r.endpoint}</span>
            <span className="text-right" data-numeric>
              {base}
            </span>
            <span>{r.receipt.payer.slice(0, 10)}…</span>
            <span className="truncate text-[var(--muted)]">{r.receipt.transactionHash}</span>
          </div>
        );
      })}
    </div>
  );
}
