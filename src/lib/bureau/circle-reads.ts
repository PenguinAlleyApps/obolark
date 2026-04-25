/**
 * Read-only Circle helpers exposed to HERMES-EMISSARY via Function Calling.
 *
 * NEVER expose mutation helpers here — only listings + balances + status.
 * Phantom audit: this file should not import 'createTransaction' or 'transferToken'.
 */
import { getCircle } from '../circle';

export async function getWalletBalance(walletId: string): Promise<{ usdc: string }> {
  const circle = getCircle() as unknown as { getWalletTokenBalance: (a: { id: string }) => Promise<{ data: { tokenBalances: Array<{ token: { symbol: string }; amount: string }> } }> };
  const r = await circle.getWalletTokenBalance({ id: walletId });
  const usdc = r.data.tokenBalances.find((t) => t.token.symbol === 'USDC');
  return { usdc: usdc?.amount ?? '0' };
}

export async function getTxStatus(txHash: string): Promise<{ state: string; txHash: string; amount: string | null }> {
  const circle = getCircle() as unknown as { getTransaction: (a: { id: string }) => Promise<{ data: { transaction: { state: string; txHash: string; amounts?: string[] } } }> };
  const r = await circle.getTransaction({ id: txHash });
  return { state: r.data.transaction.state, txHash: r.data.transaction.txHash, amount: r.data.transaction.amounts?.[0] ?? null };
}

export async function listRecentTxs(walletId: string, _limit = 10): Promise<Array<{ id: string; state: string; txHash: string }>> {
  const circle = getCircle() as unknown as { listTransactions: (a: { walletIds: string[]; pageSize: number }) => Promise<{ data: { transactions: Array<{ id: string; state: string; txHash: string }> } }> };
  const r = await circle.listTransactions({ walletIds: [walletId], pageSize: 10 });
  return r.data.transactions.slice(0, 10);
}
