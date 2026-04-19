# Third-Party Notices

Obolark is MIT-licensed. The following third-party sources are incorporated or referenced in this repository. This file exists to satisfy due-diligence for our downstream users and to document which licenses apply to which code.

## ERC-8004 Solidity Reference Implementation

- **Source:** [`ChaosChain/trustless-agents-erc-ri`](https://github.com/ChaosChain/trustless-agents-erc-ri)
- **License:** MIT (repo LICENSE) with `SPDX-License-Identifier: CC0-1.0` on individual Solidity files
- **Commit pin:** _(to be set when we copy — update this file with the exact SHA)_
- **Usage:** Identity + Reputation registry contracts, adapted to our namespace. Validation registry out of scope.
- **Attribution:** preserved `SPDX-License-Identifier: CC0-1.0` on each copied file per source convention.

## Not Adopted (referenced only)

- [`vyperlang/erc-8004-vyper`](https://github.com/vyperlang/erc-8004-vyper) — **AGPL-3.0**. Not compatible with our MIT license. Reviewed for coverage comparison only. Zero lines copied.
- [`vyperlang/vyper-agentic-payments`](https://github.com/vyperlang/vyper-agentic-payments) — MIT. Hackathon-sponsor-linked Vyper scaffold. Reviewed for inspiration; no code adopted (we chose Solidity + Node stack).
- [`vyperlang/circle-titanoboa-sdk`](https://github.com/vyperlang/circle-titanoboa-sdk) — MIT. Python analog to `@circle-fin/x402-batching`. Possible future cameo for multi-language interop proof.

## Dependencies (JavaScript / TypeScript)

Full list in [`package.json`](./package.json). Notable licenses:

- `@circle-fin/developer-controlled-wallets` — Apache-2.0
- `@circle-fin/x402-batching` — Apache-2.0
- `viem` — MIT
- `next` — MIT
- `react` / `react-dom` — MIT
- `tailwindcss` — MIT
- `pino` — MIT
- `zod` — MIT
- `react-force-graph-2d` — MIT

All MIT/Apache/BSD — no copyleft contamination.

## Fonts

Per [VISUAL_SIGNATURE.md](../modules/hackathons/agentic-economy-arc/VISUAL_SIGNATURE.md) (internal brand spec):
- **Space Grotesk** — SIL OFL (Florian Karsten · Google Fonts)
- **Inter** — SIL OFL (Rasmus Andersson)
- **Monaspace Neon** — SIL OFL (GitHub Next)
- **JetBrains Mono** (fallback) — Apache-2.0

All self-hostable, no tracking.

## Assets

_To be populated as assets are added (logo, icons, illustrations)._
