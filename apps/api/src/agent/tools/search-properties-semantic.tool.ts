import type Anthropic from '@anthropic-ai/sdk';
import type { Enums } from 'types';
import { TOOL_NAMES } from './tool-names';

export interface SearchSemanticInput {
  queryText: string;
  operation: Enums<'operation_type'>;
  matchCount?: number;
}

export const searchPropertiesSemanticTool: Anthropic.Tool = {
  name: TOOL_NAMES.searchSemantic,
  description:
    'Semantic search for vague or natural-language descriptions (e.g. "algo tranquilo con jardín"). Requires the operation type.',
  input_schema: {
    type: 'object',
    properties: {
      queryText: {
        type: 'string',
        description: "The client's free-text description of what they want.",
      },
      operation: {
        type: 'string',
        enum: ['rent', 'sale', 'temporary'],
        description: 'Operation type the client wants.',
      },
      matchCount: {
        type: 'integer',
        description: 'Optional number of results to return (default 5).',
      },
    },
    required: ['queryText', 'operation'],
  },
};
