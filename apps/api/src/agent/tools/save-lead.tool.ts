import type Anthropic from '@anthropic-ai/sdk';
import type { Enums } from 'types';
import { TOOL_NAMES } from './tool-names';

/**
 * Lead fields Claude may supply. The client's `phone` is NOT here — it is
 * captured from the conversation context and injected by AgentService, so the
 * agent can never fabricate or misattribute it.
 */
export interface SaveLeadToolInput {
  name?: string;
  budgetMin?: number;
  budgetMax?: number;
  currency?: Enums<'currency_type'>;
  operationType?: Enums<'operation_type'>;
  preferredZone?: string;
  rooms?: number;
  propertyId?: string;
  notes?: string;
}

/** Reusable JSON-schema fragment for the lead fields (shared with escalate). */
export const LEAD_FIELDS_SCHEMA: Record<string, unknown> = {
  name: { type: 'string', description: 'Client name, if given.' },
  budgetMin: { type: 'number', description: 'Minimum budget.' },
  budgetMax: { type: 'number', description: 'Maximum budget.' },
  currency: {
    type: 'string',
    enum: ['ARS', 'USD'],
    description: 'Budget currency.',
  },
  operationType: {
    type: 'string',
    enum: ['rent', 'sale', 'temporary'],
    description: 'Operation the client wants.',
  },
  preferredZone: { type: 'string', description: 'Zone the client is after.' },
  rooms: { type: 'integer', description: 'Rooms (ambientes) wanted.' },
  propertyId: {
    type: 'string',
    description: 'Id of a specific property the client is interested in.',
  },
  notes: {
    type: 'string',
    description: 'Any extra context worth passing to the advisor.',
  },
};

export const saveLeadTool: Anthropic.Tool = {
  name: TOOL_NAMES.saveLead,
  description:
    "Save a qualified lead once you understand what the client needs and have asked for their full name. The client's phone number is captured automatically — never ask for it. If the client has not given their name yet, ask for it first instead of calling this tool.",
  input_schema: {
    type: 'object',
    properties: {
      ...LEAD_FIELDS_SCHEMA,
      name: {
        type: 'string',
        description:
          "The client's full name exactly as they gave it in the conversation. Required — never invent or guess it.",
      },
    },
    // Only `save_lead` requires a name (not `LEAD_FIELDS_SCHEMA` itself, which
    // `escalate_to_advisor` also uses and where a name must stay optional —
    // escalation must still work when the client refuses to give one).
    required: ['name'],
  },
};
