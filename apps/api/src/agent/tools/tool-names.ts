/**
 * Canonical tool names shared by the tool schemas and the AgentService dispatch,
 * so the two never drift. These strings are the `name` Claude uses in `tool_use`.
 */
export const TOOL_NAMES = {
  searchByFilters: 'search_properties_by_filters',
  searchSemantic: 'search_properties_semantic',
  searchByAddress: 'search_property_by_address',
  saveLead: 'save_lead',
  escalateToAdvisor: 'escalate_to_advisor',
} as const;
