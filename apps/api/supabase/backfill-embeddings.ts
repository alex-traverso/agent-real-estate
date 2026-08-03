/**
 * One-off backfill: generates embeddings for properties that were inserted
 * directly via SQL (e.g. the Supabase SQL Editor) and therefore have no
 * embedding yet. Reuses the same text template and model as seed.ts so the
 * stored vectors stay consistent with the rest of the catalog.
 *
 * Usage: yarn workspace api backfill-embeddings [agencyId]
 * Requires apps/api/.env to have SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 * and OPENAI_API_KEY set.
 */
import { resolve } from 'path';
import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import type { Database } from 'types';
import { buildPropertyEmbeddingInput } from '../src/embeddings/embedding-input';

config({ path: resolve(__dirname, '../.env') });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const EMBEDDING_MODEL =
  process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in apps/api/.env',
  );
  process.exit(1);
}
if (!OPENAI_API_KEY) {
  console.error('Missing OPENAI_API_KEY in apps/api/.env');
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
  return `[${response.data[0].embedding.join(',')}]`;
}

async function main() {
  const agencyId = process.argv[2];

  let query = supabase.from('properties').select('*').is('embedding', null);
  if (agencyId) {
    query = query.eq('agency_id', agencyId);
  }

  const { data: properties, error } = await query;

  if (error) {
    throw new Error(`Failed to load properties: ${error.message}`);
  }
  if (!properties || properties.length === 0) {
    console.log(
      '[backfill] No properties without an embedding. Nothing to do.',
    );
    return;
  }

  console.log(
    `[backfill] Generating embeddings for ${properties.length} properties...`,
  );

  for (const property of properties) {
    const embedding = await embed(buildPropertyEmbeddingInput(property));
    const { error: updateError } = await supabase
      .from('properties')
      .update({ embedding })
      .eq('id', property.id);

    if (updateError) {
      throw new Error(
        `Failed to update property ${property.id}: ${updateError.message}`,
      );
    }
    console.log(`[backfill]   ✓ ${property.title}`);
  }

  console.log(`[backfill] Done — updated ${properties.length} properties`);
}

main().catch((error) => {
  console.error(
    '[backfill] Failed:',
    error instanceof Error ? error.message : error,
  );
  process.exit(1);
});
