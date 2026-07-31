import type Anthropic from '@anthropic-ai/sdk';
import { TOOL_NAMES } from './tool-names';

export interface SearchByAddressInput {
  address: string;
  zone?: string;
}

export const searchPropertyByAddressTool: Anthropic.Tool = {
  name: TOOL_NAMES.searchByAddress,
  description:
    'Look up available properties by (partial) address or reference, optionally narrowed by zone. Use when the client names a specific address.',
  input_schema: {
    type: 'object',
    properties: {
      address: {
        type: 'string',
        description: 'Full or partial address / reference.',
      },
      zone: {
        type: 'string',
        description: 'Optional neighborhood or zone to narrow the search.',
      },
    },
    required: ['address'],
  },
};
