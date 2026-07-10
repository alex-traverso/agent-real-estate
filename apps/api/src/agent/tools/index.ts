import type Anthropic from '@anthropic-ai/sdk';
import { searchPropertiesByFiltersTool } from './search-properties-by-filters.tool';
import { searchPropertiesSemanticTool } from './search-properties-semantic.tool';
import { searchPropertyByAddressTool } from './search-property-by-address.tool';
import { saveLeadTool } from './save-lead.tool';
import { escalateToAdvisorTool } from './escalate-to-advisor.tool';

/** Every tool Luca can call, passed to the Claude Messages API. */
export const ALL_TOOLS: Anthropic.Tool[] = [
  searchPropertiesByFiltersTool,
  searchPropertiesSemanticTool,
  searchPropertyByAddressTool,
  saveLeadTool,
  escalateToAdvisorTool,
];

export { TOOL_NAMES } from './tool-names';
export type { SearchByFiltersInput } from './search-properties-by-filters.tool';
export type { SearchSemanticInput } from './search-properties-semantic.tool';
export type { SearchByAddressInput } from './search-property-by-address.tool';
export type { SaveLeadToolInput } from './save-lead.tool';
export type { EscalateToAdvisorInput } from './escalate-to-advisor.tool';
