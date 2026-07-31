import type Anthropic from '@anthropic-ai/sdk';
import { TOOL_NAMES } from './tool-names';
import { LEAD_FIELDS_SCHEMA, type SaveLeadToolInput } from './save-lead.tool';

/** Escalation input: the lead fields plus an optional human-readable reason. */
export interface EscalateToAdvisorInput extends SaveLeadToolInput {
  reason?: string;
}

export const escalateToAdvisorTool: Anthropic.Tool = {
  name: TOOL_NAMES.escalateToAdvisor,
  description:
    'Escalate the conversation to a human advisor: saves the lead and emails the advisor. Use when the client asks for a person, when you cannot help, or on a technical failure. The phone number is captured automatically.',
  input_schema: {
    type: 'object',
    properties: {
      ...LEAD_FIELDS_SCHEMA,
      reason: {
        type: 'string',
        description: 'Short reason for escalating (for the advisor).',
      },
    },
  },
};
