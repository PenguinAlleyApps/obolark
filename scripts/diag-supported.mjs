#!/usr/bin/env node
/**
 * diag-supported.mjs — ping Circle Gateway /v1/x402/supported to see
 * exactly which networks + extras Circle advertises.
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { BatchFacilitatorClient } from '@circle-fin/x402-batching/server';

const url = process.env.CIRCLE_FACILITATOR_URL || 'https://gateway-api-testnet.circle.com';
console.log(`[diag] facilitator: ${url}`);
const facilitator = new BatchFacilitatorClient({ url });
const supported = await facilitator.getSupported();
console.log(JSON.stringify(supported, null, 2));
