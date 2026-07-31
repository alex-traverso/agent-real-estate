import type { Enums } from 'types';

/**
 * Structured search criteria for PropertiesService.searchByFilters. Every
 * field is optional: the agent supplies whatever the client has expressed so
 * far, and the service applies only the filters that are present.
 */
export interface PropertyFilters {
  operation?: Enums<'operation_type'>; // 'rent' | 'sale' | 'temporary'
  type?: Enums<'property_type'>; // 'house' | 'apartment' | 'ph' | 'office' | 'land'
  // One or more neighborhoods; a property matches if its zone matches any of them.
  // Broad regions (e.g. "zona norte") are resolved by the agent into the actual
  // neighborhoods via the list_available_zones tool — never a hardcoded map.
  zones?: string[];
  rooms?: number;
  // Price only applies together with currency (comparing across currencies is
  // meaningless), so both must be provided for the price filter to take effect.
  maxPrice?: number;
  currency?: Enums<'currency_type'>; // 'ARS' | 'USD'
}
