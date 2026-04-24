import type { RefObject } from 'react';

export type Agent = { agent: string; code: string; dept: string; role: string; address: string; accountType?: string; codename?: string; epithet?: string };
export type Endpoint = { path: string; seller: string; price: string; supervisionFee: string; description: string };
export type Receipt = { endpoint: string; receipt: { payer: string; amount: string; network: string; transactionHash: string }; result?: string; at: string };
export type SellerReputation = { count: number; avgScore: number; lastTxHashes: string[] };
export type ArchiveEntry = Receipt & { source: string };
export type CeremonyArgs = { agentCode: string; serviceLabel: string; scope: 'roster' | 'orch' };
export type UnfurlArgs = { code: string; codename: string; anchor: HTMLElement };

export type TabIIProps = { endpoints: Endpoint[]; agents: Agent[]; arcscanBase: string };
export type TabIIIProps = {
  recentCalls: Receipt[];
  endpoints: Endpoint[];
  agents: Agent[];
  registryAddress: string | null;
  arcscanBase: string;
};
export type TabIVProps = {
  agents: Agent[];
  endpoints: Endpoint[];
  reputation: Record<string, SellerReputation>;
  deptGroups: Array<[string, Agent[]]>;
  sellerCodes: Set<string>;
  rosterRef: RefObject<HTMLDivElement | null>;
  ceremony: CeremonyArgs | null;
  unfurl: UnfurlArgs | null;
  onHire: (code: string, serviceLabel: string) => void;
  onGlyphHover: (args: UnfurlArgs | null) => void;
  onCeremonyClear: (code: string) => void;
  serviceLabelFor: (code: string) => string;
};
export type TabVProps = {
  reputation: Record<string, SellerReputation>;
  registryAddress: string | null;
  agents: Agent[];
  endpoints: Endpoint[];
  arcscanBase: string;
};
export type TabVIProps = {
  archive: ArchiveEntry[];
  endpoints: Endpoint[];
  agents: Agent[];
  arcscanBase: string;
};
// TabVII + TabVIII use local Props definitions (OrchestrationFeed + arcscanBase
// respectively) — moved-in-place from standalone components, not ported to the
// scaffolded TabXxxProps shape.
