// OpenAI embedding model. text-embedding-3-small outputs 1536 dimensions,
// which must match the properties.embedding VECTOR(1536) column and the
// search_properties_semantic RPC. Overridable via OPENAI_EMBEDDING_MODEL.
export const DEFAULT_EMBEDDING_MODEL = 'text-embedding-3-small';
