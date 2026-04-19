/**
 * CircleBatchSigner — adapter that implements @circle-fin/x402-batching's
 * `BatchEvmSigner` interface using Circle's dev-controlled wallet MPC
 * signature API instead of a raw private key.
 *
 * The signer NEVER touches key material — every `signTypedData` call is
 * delegated to Circle's `/v1/w3s/developer/sign/typedData` endpoint.
 * This is why Obolark can safely operate 22 wallets in parallel: Circle
 * MPC custodies the keys, Obolark only holds the entity secret which lives
 * in Node process env + 1Password.
 *
 * Server-side only (needs entity secret).
 */
import type { BatchEvmSigner } from '@circle-fin/x402-batching';
import type { Address, Hex } from 'viem';
import { getCircle } from './circle';
import { getWalletByCode, type WalletRecord } from './agents';

/**
 * Safely convert an arbitrary EIP-712 message object into JSON where
 * BigInt values are serialized as decimal strings. Circle's sign API
 * takes the full typed-data payload as a JSON string, and raw JSON.stringify
 * throws on BigInt.
 */
function bigintSafeStringify(obj: unknown): string {
  return JSON.stringify(obj, (_key, value) => {
    if (typeof value === 'bigint') return value.toString();
    return value;
  });
}

export class CircleBatchSigner implements BatchEvmSigner {
  readonly address: Address;
  readonly walletId: string;
  readonly agentCode: string;

  private constructor(wallet: WalletRecord) {
    this.address = wallet.address;
    this.walletId = wallet.walletId;
    this.agentCode = wallet.code;
  }

  static forAgent(code: string): CircleBatchSigner {
    const wallet = getWalletByCode(code);
    return new CircleBatchSigner(wallet);
  }

  async signTypedData(params: {
    domain: {
      name: string;
      version: string;
      chainId: number;
      verifyingContract: Address;
    };
    types: Record<string, Array<{ name: string; type: string }>>;
    primaryType: string;
    message: Record<string, unknown>;
  }): Promise<Hex> {
    const circle = getCircle();

    // Circle expects the full EIP-712 payload (domain + types + primaryType + message)
    // as a single JSON string. We MUST include `EIP712Domain` in types if it's not
    // already there; most libraries add it implicitly but Circle's MPC signer
    // requires it explicitly.
    const typesWithDomain = {
      EIP712Domain: [
        { name: 'name', type: 'string' },
        { name: 'version', type: 'string' },
        { name: 'chainId', type: 'uint256' },
        { name: 'verifyingContract', type: 'address' },
      ],
      ...params.types,
    };

    const payload = {
      domain: params.domain,
      types: typesWithDomain,
      primaryType: params.primaryType,
      message: params.message,
    };

    const data = bigintSafeStringify(payload);

    const res = await circle.signTypedData({
      walletId: this.walletId,
      data,
      memo: `Obolark · ${this.agentCode} signing x402 TransferWithAuthorization`,
    });

    const sig = res.data?.signature as Hex | undefined;
    if (!sig) {
      throw new Error(
        `Circle signTypedData returned no signature (wallet ${this.walletId})`,
      );
    }
    // Circle returns 0x-prefixed 65-byte hex
    if (!sig.startsWith('0x')) {
      throw new Error(`Unexpected signature format: ${sig.slice(0, 12)}...`);
    }
    return sig;
  }
}
