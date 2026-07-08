/**
 * Standalone seed script — NOT wired into Nest DI on purpose (see plan notes).
 * Inserts one demo agency and a set of fictitious properties, each with a
 * real embedding generated via OpenAI's text-embedding-3-small, so both
 * `search_properties_by_filters` and `search_properties_semantic` have
 * something meaningful to query against once those tools exist.
 *
 * Usage: yarn workspace api seed
 * Requires apps/api/.env to have SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 * and OPENAI_API_KEY set.
 */
import { resolve } from 'path';
import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import type { Database, TablesInsert } from 'types';

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
  console.error(
    'Missing OPENAI_API_KEY in apps/api/.env — needed to generate property embeddings.',
  );
  process.exit(1);
}

const supabase = createClient<Database>(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
);
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

const DEMO_AGENCY: TablesInsert<'agencies'> = {
  name: 'Inmobiliaria Demo',
  email: 'demo@agentrealestate.test',
  phone: '+541112345678',
};

type SeedProperty = Omit<TablesInsert<'properties'>, 'agency_id' | 'embedding'>;

// Same shape of text a future `EmbeddingsService` should build for an
// incoming client query, so cosine similarity between query and property
// embeddings is comparable. Keep this template in sync if it changes.
function buildEmbeddingInput(property: SeedProperty): string {
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

const SEED_PROPERTIES: SeedProperty[] = [
  {
    title: 'Departamento luminoso 3 ambientes en Palermo',
    type: 'apartment',
    operation: 'sale',
    price: 185000,
    currency: 'USD',
    rooms: 3,
    bedrooms: 2,
    bathrooms: 1,
    total_area: 75,
    covered_area: 70,
    zone: 'Palermo',
    address: 'Av. Santa Fe 4200',
    description:
      'Departamento a nuevo, muy luminoso, balcón al frente, cocina integrada y placares en ambas habitaciones. A metros del Botánico.',
    parking: false,
    available: true,
  },
  {
    title: 'Casa 5 ambientes con pileta en Nordelta',
    type: 'house',
    operation: 'sale',
    price: 420000,
    currency: 'USD',
    rooms: 5,
    bedrooms: 4,
    bathrooms: 3,
    total_area: 450,
    covered_area: 280,
    zone: 'Nordelta',
    address: 'Barrio Los Castores',
    description:
      'Casa de dos plantas con pileta, parque amplio, quincho con parrilla y cochera para 3 autos. Ideal familia grande.',
    parking: true,
    available: true,
  },
  {
    title: 'Monoambiente en alquiler en Belgrano',
    type: 'apartment',
    operation: 'rent',
    price: 320000,
    currency: 'ARS',
    rooms: 1,
    bedrooms: 1,
    bathrooms: 1,
    total_area: 32,
    covered_area: 30,
    zone: 'Belgrano',
    address: 'Cabildo 2100',
    description:
      'Monoambiente a estrenar, cocina con isla, muy luminoso, apto profesional. Edificio con laundry y SUM.',
    parking: false,
    available: true,
  },
  {
    title: 'PH 3 ambientes con patio en Villa Crespo',
    type: 'ph',
    operation: 'sale',
    price: 165000,
    currency: 'USD',
    rooms: 3,
    bedrooms: 2,
    bathrooms: 1,
    total_area: 90,
    covered_area: 65,
    zone: 'Villa Crespo',
    address: 'Malabia 500',
    description:
      'PH de dos plantas con patio propio, ideal para quienes buscan tranquilidad y espacio verde sin salir de la ciudad.',
    parking: false,
    available: true,
  },
  {
    title: 'Oficina en alquiler en Microcentro',
    type: 'office',
    operation: 'rent',
    price: 1200,
    currency: 'USD',
    rooms: 4,
    bathrooms: 2,
    total_area: 120,
    covered_area: 120,
    zone: 'Microcentro',
    address: 'Av. Corrientes 800',
    description:
      'Piso de oficinas con recepción, 3 despachos privados y sala de reuniones. Edificio con seguridad 24hs.',
    parking: false,
    available: true,
    hoa_fees: 450,
  },
  {
    title: 'Lote en venta en Pilar del Este',
    type: 'land',
    operation: 'sale',
    price: 95000,
    currency: 'USD',
    total_area: 600,
    zone: 'Pilar',
    address: 'Barrio Pilar del Este',
    description:
      'Lote en esquina, listo para construir, dentro de barrio cerrado con seguridad y club house.',
    parking: false,
    available: true,
  },
  {
    title: 'Departamento 1 ambiente en alquiler en Recoleta',
    type: 'apartment',
    operation: 'rent',
    price: 280000,
    currency: 'ARS',
    rooms: 1,
    bedrooms: 1,
    bathrooms: 1,
    total_area: 28,
    covered_area: 26,
    zone: 'Recoleta',
    address: 'Av. Callao 1500',
    description:
      'Estudio muy cuidado, amoblado, a pasos del subte D. Ideal para estudiantes o profesionales solos.',
    parking: false,
    available: true,
  },
  {
    title: 'Casa quinta temporal en Mar del Plata',
    type: 'house',
    operation: 'temporary',
    price: 90000,
    currency: 'ARS',
    rooms: 4,
    bedrooms: 3,
    bathrooms: 2,
    total_area: 300,
    covered_area: 150,
    zone: 'Mar del Plata',
    address: 'Barrio Los Troncos',
    description:
      'Casa con parque y quincho a 10 cuadras del mar, alquiler por temporada de verano, apta mascotas.',
    parking: true,
    available: true,
  },
  {
    title: 'Departamento 2 ambientes en Caballito',
    type: 'apartment',
    operation: 'sale',
    price: 110000,
    currency: 'USD',
    rooms: 2,
    bedrooms: 1,
    bathrooms: 1,
    total_area: 48,
    covered_area: 45,
    zone: 'Caballito',
    address: 'Av. Rivadavia 5200',
    description:
      'Departamento en piso alto con vista despejada, cocina separada y balcón. A 3 cuadras del Parque Rivadavia.',
    parking: false,
    available: true,
  },
  {
    title: 'PH en alquiler en Villa Urquiza',
    type: 'ph',
    operation: 'rent',
    price: 380000,
    currency: 'ARS',
    rooms: 3,
    bedrooms: 2,
    bathrooms: 1,
    total_area: 70,
    covered_area: 60,
    zone: 'Villa Urquiza',
    address: 'Triunvirato 4300',
    description:
      'PH interno, muy silencioso, con patio y parrilla propia. A metros de la estación de tren.',
    parking: false,
    available: true,
  },
  {
    title: 'Casa 4 ambientes en San Isidro',
    type: 'house',
    operation: 'sale',
    price: 210000000,
    currency: 'ARS',
    rooms: 4,
    bedrooms: 3,
    bathrooms: 2,
    total_area: 250,
    covered_area: 180,
    zone: 'San Isidro',
    address: 'Barrio Las Lomas',
    description:
      'Casa estilo inglés con jardín, garage doble y dependencia de servicio. Zona residencial muy tranquila.',
    parking: true,
    available: true,
  },
  {
    title: 'Departamento de lujo 4 ambientes en Puerto Madero',
    type: 'apartment',
    operation: 'sale',
    price: 650000,
    currency: 'USD',
    rooms: 4,
    bedrooms: 3,
    bathrooms: 2,
    total_area: 140,
    covered_area: 130,
    zone: 'Puerto Madero',
    address: 'Juana Manso 1200',
    description:
      'Departamento a estrenar con vista al río, amenities de primer nivel: piscina, spa y gimnasio. Cochera incluida.',
    parking: true,
    available: true,
    hoa_fees: 800,
  },
];

async function embed(text: string): Promise<string> {
  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text,
  });
  const vector = response.data[0].embedding;
  return `[${vector.join(',')}]`;
}

async function main() {
  console.log('[seed] Upserting demo agency...');
  const { data: agency, error: agencyError } = await supabase
    .from('agencies')
    .upsert(DEMO_AGENCY, { onConflict: 'email' })
    .select()
    .single();

  if (agencyError || !agency) {
    throw new Error(`Failed to upsert demo agency: ${agencyError?.message}`);
  }
  console.log(`[seed] Demo agency ready | id: ${agency.id}`);

  console.log('[seed] Clearing previous demo properties...');
  const { error: deleteError } = await supabase
    .from('properties')
    .delete()
    .eq('agency_id', agency.id);

  if (deleteError) {
    throw new Error(
      `Failed to clear previous demo properties: ${deleteError.message}`,
    );
  }

  console.log(
    `[seed] Generating embeddings for ${SEED_PROPERTIES.length} properties...`,
  );
  const rows: TablesInsert<'properties'>[] = [];
  for (const property of SEED_PROPERTIES) {
    const embedding = await embed(buildEmbeddingInput(property));
    rows.push({ ...property, agency_id: agency.id, embedding });
    console.log(`[seed]   ✓ ${property.title}`);
  }

  console.log('[seed] Inserting properties...');
  const { error: insertError } = await supabase.from('properties').insert(rows);

  if (insertError) {
    throw new Error(`Failed to insert seed properties: ${insertError.message}`);
  }

  console.log(
    `[seed] Done — inserted ${rows.length} properties for agency ${agency.id}`,
  );
}

main().catch((error) => {
  console.error(
    '[seed] Failed:',
    error instanceof Error ? error.message : error,
  );
  process.exit(1);
});
