/**
 * Arc testnet chain + token constants.
 *
 * Sources:
 *  - https://docs.arc.network/arc/references/connect-to-arc
 *  - https://docs.arc.network/arc/references/contract-addresses
 */
import { defineChain } from 'viem';

export const ARC_CHAIN_ID = 5042002 as const;
export const ARC_RPC = 'https://rpc.testnet.arc.network';
export const ARC_EXPLORER = 'https://testnet.arcscan.app';

/** Canonical Arc testnet contract addresses (verbatim from docs). */
export const ARC_CONTRACTS = {
  USDC:           '0x3600000000000000000000000000000000000000' as const,
  EURC:           '0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a' as const,
  USYC:           '0xe9185F0c5F296Ed1797AaE4238D26CCaBEadb86C' as const,
  Permit2:        '0x000000000022D473030F116dDEE9F6B43aC78BA3' as const,
  Multicall3:     '0xcA11bde05977b3631167028862bE2a173976CA11' as const,
  GatewayWallet:  '0x0077777d7EBA4688BDeF3E311b846F25870A19B9' as const,
  GatewayMinter:  '0x0022222ABE238Cc2C7Bb1f21003F0a260052475B' as const,
} as const;

export const ARC_NETWORK = 'arc-testnet' as const;

/** viem Chain for Arc testnet. USDC is the native gas token. */
export const arcTestnet = defineChain({
  id: ARC_CHAIN_ID,
  name: 'Arc Testnet',
  network: ARC_NETWORK,
  nativeCurrency: {
    // On Arc the "native currency" is USDC (18 decimals at the gas layer).
    name: 'USDC',
    symbol: 'USDC',
    decimals: 18,
  },
  rpcUrls: {
    default: { http: [ARC_RPC] },
    public:  { http: [ARC_RPC] },
  },
  blockExplorers: {
    default: {
      name: 'Arcscan',
      url:  ARC_EXPLORER,
    },
  },
  testnet: true,
});

export function txUrl(hash: string): string {
  return `${ARC_EXPLORER}/tx/${hash}`;
}

export function addressUrl(address: string): string {
  return `${ARC_EXPLORER}/address/${address}`;
}
