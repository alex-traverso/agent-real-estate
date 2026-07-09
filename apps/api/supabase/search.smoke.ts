/**
 * Standalone smoke test for semantic property search — NOT wired into Nest DI
 * (same rationale as seed.ts). Embeds a sample free-text query and calls the
 * `search_properties_semantic` RPC against the seeded demo agency, printing
 * each match with its cosine similarity. Semantic quality is only observable
 * live, so this is the manual check for Phase 3.
 *
 * Usage: yarn workspace api search:smoke
 * Requires apps/api/.env with SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 * OPENAI_API_KEY. Run `yarn workspace api seed` first so there is data.
 *
 * The RPC's default similarity_threshold (0.7) is high for short NL queries
 * embedded with text-embedding-3-small; here we pass a low threshold on
 * purpose so the real similarity distribution is visible (useful to decide
 * whether the production default should be tuned down).
 */
import { resolve } from 'path';
import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import type { Database, Enums } from 'types';

config({ path: resolve(__dirname, '../.env') });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const EMBEDDING_MODEL =
  process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small';

// Matches the seed's demo agency (apps/api/supabase/seed.ts).
const DEMO_AGENCY_EMAIL = 'demo@agentrealestate.test';

// Edit these to try other queries against the seeded catalog.
const SAMPLE_QUERY = 'algo tranquilo con jardín para comprar';
const SAMPLE_OPERATION: Enums<'operation_type'> = 'sale';
const OBSERVE_THRESHOLD = 0.1;
const MATCH_COUNT = 8;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in apps/api/.env',
  );
  process.exit(1);
}
if (!OPENAI_API_KEY) {
  console.error(
    'Missing OPENAI_API_KEY in apps/api/.env — needed to embed the query.',
  );
  process.exit(1);
}

const supabase = createClient<Database>(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
);
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

async function embed(text: string): Promise<string> {
  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text,
  });
  const vector = response.data[0].embedding;
  return `[${vector.join(',')}]`;
}

async function main() {
  const { data: agency, error: agencyError } = await supabase
    .from('agencies')
    .select('id')
    .eq('email', DEMO_AGENCY_EMAIL)
    .maybeSingle();

  if (agencyError || !agency) {
    throw new Error(
      `Demo agency not found (${DEMO_AGENCY_EMAIL}). Run the seed first: ${
        agencyError?.message ?? 'no row'
      }`,
    );
  }
  console.log(`[search:smoke] Demo agency | id: ${agency.id}`);
  console.log(
    `[search:smoke] Query: "${SAMPLE_QUERY}" | operation: ${SAMPLE_OPERATION}`,
  );

  const queryEmbedding = await embed(SAMPLE_QUERY);
  const { data, error } = await supabase.rpc('search_properties_semantic', {
    query_embedding: queryEmbedding,
    agency_id_filter: agency.id,
    operation_filter: SAMPLE_OPERATION,
    match_count: MATCH_COUNT,
    similarity_threshold: OBSERVE_THRESHOLD,
  });

  if (error) {
    throw new Error(`RPC search_properties_semantic failed: ${error.message}`);
  }

  const matches = data ?? [];
  console.log(`[search:smoke] ${matches.length} match(es):`);
  for (const m of matches) {
    console.log(
      `  ${m.similarity.toFixed(3)}  ${m.title} — ${m.zone} — ${m.price} ${m.currency}`,
    );
  }
}

main().catch((error) => {
  console.error(
    '[search:smoke] Failed:',
    error instanceof Error ? error.message : error,
  );
  process.exit(1);
});
