import type Anthropic from '@anthropic-ai/sdk';
import { TOOL_NAMES } from './tool-names';

export const listAvailableZonesTool: Anthropic.Tool = {
  name: TOOL_NAMES.listAvailableZones,
  description:
    'List the neighborhoods (zones) the agency currently has available. Use it when the client names a broad region or an imprecise area, then decide which of the returned neighborhoods belong to that region and search them with search_properties_by_filters.',
  input_schema: {
    type: 'object',
    properties: {},
  },
};
