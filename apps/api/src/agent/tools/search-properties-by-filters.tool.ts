import type Anthropic from '@anthropic-ai/sdk';
import type { PropertyFilters } from '../../properties/types/property-filters.type';
import { TOOL_NAMES } from './tool-names';

/** Input for the structured-filter search tool (maps 1:1 to PropertyFilters). */
export type SearchByFiltersInput = PropertyFilters;

export const searchPropertiesByFiltersTool: Anthropic.Tool = {
  name: TOOL_NAMES.searchByFilters,
  description:
    'Search available properties by structured criteria (operation, property type, zone, rooms, max price). Use when the client gives concrete filters.',
  input_schema: {
    type: 'object',
    properties: {
      operation: {
        type: 'string',
        enum: ['rent', 'sale', 'temporary'],
        description: 'Operation type the client wants.',
      },
      type: {
        type: 'string',
        enum: ['house', 'apartment', 'ph', 'office', 'land'],
        description: 'Property type.',
      },
      zone: { type: 'string', description: 'Neighborhood or zone.' },
      rooms: {
        type: 'integer',
        description: 'Number of rooms (ambientes).',
      },
      maxPrice: {
        type: 'number',
        description: 'Maximum price. Only applied together with currency.',
      },
      currency: {
        type: 'string',
        enum: ['ARS', 'USD'],
        description: 'Currency of maxPrice.',
      },
    },
  },
};
