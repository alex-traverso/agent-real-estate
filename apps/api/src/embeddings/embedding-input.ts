/**
 * The property → text template used for semantic search *indexing*. The seed
 * generates each property's stored embedding from exactly this text, so the
 * template must live in one place: both the standalone seed and any future
 * re-indexing path import it. If the composition changes, every stored
 * embedding must be regenerated for cosine similarity to stay meaningful.
 *
 * The client-query side does NOT reuse this template — a free-text query is
 * embedded as-is (see EmbeddingsService.generateEmbedding).
 */

/** Structural subset of a property row needed to build its embedding text. */
export interface EmbeddableProperty {
  title: string;
  description?: string | null;
  zone: string;
  type: string;
  operation: string;
  rooms?: number | null;
  bedrooms?: number | null;
  parking?: boolean | null;
}

export function buildPropertyEmbeddingInput(
  property: EmbeddableProperty,
): string {
  const parts = [
    property.title,
    property.description ?? '',
    `Zona: ${property.zone}.`,
    `Tipo: ${property.type}.`,
    `Operación: ${property.operation}.`,
    property.rooms ? `${property.rooms} ambientes.` : '',
    property.bedrooms ? `${property.bedrooms} dormitorios.` : '',
    property.parking ? 'Con cochera.' : '',
  ];
  return parts.filter(Boolean).join(' ');
}
