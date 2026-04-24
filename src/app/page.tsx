import { redirect } from 'next/navigation';

/**
 * Root → /refresh/ (Claude Design v2 cover, static export served from /public/refresh/).
 * The live Bureau Ledger app is preserved at /bureau (moved 2026-04-24).
 */
export default function Home() {
  redirect('/refresh/index.html');
}
