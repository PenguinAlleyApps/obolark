/**
 * Provider types — shared across the AISA client, personas, budgets,
 * and per-route dispatchers. Each endpoint has a distinct structured
 * output schema so clients consume results programmatically.
 */
import { z } from 'zod';

export type EndpointKey =
  | 'research'
  | 'design-review'
  | 'qa'
  | 'security-scan'
  | 'audit';

export const researchSchema = z.object({
  verdict: z.enum(['supported', 'mixed', 'unsupported']),
  claims: z.array(z.object({
    statement: z.string(),
    source: z.string().nullish(),
    confidence: z.number().min(0).max(1),
  })).max(5),
  summary: z.string().max(320),
});

export const designReviewSchema = z.object({
  verdict: z.enum(['ship', 'revise', 'reject']),
  findings: z.array(z.object({
    severity: z.enum(['blocker', 'major', 'minor']),
    rule: z.string(),
    note: z.string(),
  })).max(8),
  confidence: z.number().min(0).max(1),
});

export const qaSchema = z.object({
  verdict: z.enum(['pass', 'needs-tests', 'fail']),
  testCases: z.array(z.object({
    name: z.string(),
    steps: z.array(z.string()).max(6),
    expected: z.string(),
    priority: z.enum(['P0', 'P1', 'P2']),
  })).max(6),
  confidence: z.number().min(0).max(1),
});

export const securityScanSchema = z.object({
  verdict: z.enum(['clear', 'concerns', 'critical']),
  findings: z.array(z.object({
    cwe: z.union([z.string(), z.number()]).transform((v) => String(v)).nullish(),
    severity: z.enum(['info', 'low', 'medium', 'high', 'critical']),
    exploit: z.string(),
    mitigation: z.string(),
  })).max(6),
  confidence: z.number().min(0).max(1),
});

export const auditSchema = z.object({
  verdict: z.enum(['approved', 'conditional', 'rejected']),
  gates: z.object({
    correctness: z.enum(['pass', 'fail', 'n/a']),
    economics: z.enum(['pass', 'fail', 'n/a']),
    safety: z.enum(['pass', 'fail', 'n/a']),
    provenance: z.enum(['pass', 'fail', 'n/a']),
  }),
  conditions: z.array(z.string()).max(6),
  confidence: z.number().min(0).max(1),
});

export const outputSchemas = {
  research: researchSchema,
  'design-review': designReviewSchema,
  qa: qaSchema,
  'security-scan': securityScanSchema,
  audit: auditSchema,
} as const;

export type EndpointResult<K extends EndpointKey> = z.infer<typeof outputSchemas[K]>;

/**
 * Discriminated union returned by `runProvider()`. Callers either get a real
 * LLM result or a degraded stub — the payment has already settled onchain so
 * we NEVER throw out of the provider call path.
 */
export type ProviderOutcome<K extends EndpointKey> =
  | {
      degraded: false;
      result: EndpointResult<K>;
      model: string;
      tokens: { input: number; output: number };
      latencyMs: number;
    }
  | {
      degraded: true;
      reason:
        | 'flag_disabled'
        | 'provider_timeout'
        | 'provider_error'
        | 'rate_limited'
        | 'invalid_output'
        | 'input_rejected';
      echo: unknown;
      refundEligible: boolean;
    };
