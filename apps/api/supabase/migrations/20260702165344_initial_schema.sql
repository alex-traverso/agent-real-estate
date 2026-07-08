-- Initial schema for Agent Real Estate
-- Source of truth for design decisions: .agents/DB.md

-- ============================================================
-- Extensions
-- ============================================================
create extension if not exists vector with schema extensions;

-- ============================================================
-- Enums
-- ============================================================
create type property_type as enum ('house', 'apartment', 'ph', 'office', 'land');
create type operation_type as enum ('rent', 'sale', 'temporary');
create type currency_type as enum ('ARS', 'USD');
create type lead_status as enum ('new', 'contacted', 'closed');
create type conversation_status as enum ('active', 'closed', 'escalated');

-- ============================================================
-- Tables
-- ============================================================

create table agencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  phone TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Join table between Supabase Auth users and agencies.
-- Not listed under .agents/DB.md "Tables", but required by the RLS
-- policies documented in that same file (they subquery agency_users
-- to resolve which agency the requesting advisor belongs to).
create table agency_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE (agency_id, user_id)
);

create table properties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  type property_type NOT NULL,
  operation operation_type NOT NULL,
  price NUMERIC NOT NULL,
  currency currency_type NOT NULL DEFAULT 'USD',
  rooms INTEGER,
  bedrooms INTEGER,
  bathrooms INTEGER,
  total_area NUMERIC,
  covered_area NUMERIC,
  zone TEXT NOT NULL,
  address TEXT,
  description TEXT,
  parking BOOLEAN DEFAULT FALSE,
  hoa_fees NUMERIC,
  available BOOLEAN DEFAULT TRUE,
  embedding VECTOR(1536), -- OpenAI text-embedding-3-small dimensions
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

create table leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  name TEXT,
  phone TEXT NOT NULL,
  operation_type operation_type,
  preferred_zone TEXT,
  budget_min NUMERIC,
  budget_max NUMERIC,
  currency currency_type,
  rooms INTEGER,
  property_id UUID REFERENCES properties(id) ON DELETE SET NULL,
  status lead_status DEFAULT 'new',
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

create table conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  phone TEXT NOT NULL,
  messages JSONB NOT NULL DEFAULT '[]',
  status conversation_status DEFAULT 'active',
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  message_count INTEGER DEFAULT 0,
  last_message_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

create table rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  phone TEXT NOT NULL,
  window_start TIMESTAMP WITH TIME ZONE NOT NULL,
  message_count INTEGER DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================
-- Indexes
-- ============================================================

create index idx_agency_users_agency_id on agency_users(agency_id);
create index idx_agency_users_user_id on agency_users(user_id);

create index idx_properties_agency_id on properties(agency_id);
create index idx_properties_agency_operation on properties(agency_id, operation);
create index idx_properties_agency_zone on properties(agency_id, zone);
create index idx_properties_available on properties(agency_id, available) where available = true;

create index idx_leads_agency_id on leads(agency_id);
create index idx_leads_agency_status on leads(agency_id, status);
create index idx_leads_property_id on leads(property_id);

create index idx_conversations_agency_phone on conversations(agency_id, phone);
create index idx_conversations_active on conversations(agency_id, phone, status) where status = 'active';
create index idx_conversations_lead_id on conversations(lead_id);

create index idx_rate_limits_phone_window on rate_limits(agency_id, phone, window_start);

-- pgvector: HNSW index for fast approximate nearest neighbor search
create index idx_properties_embedding on properties using hnsw (embedding vector_cosine_ops);

-- ============================================================
-- Semantic search RPC
-- ============================================================

create or replace function search_properties_semantic(
  query_embedding VECTOR(1536),
  agency_id_filter UUID,
  operation_filter operation_type,
  match_count INTEGER DEFAULT 5,
  similarity_threshold FLOAT DEFAULT 0.7
)
returns table (
  id UUID,
  title TEXT,
  type property_type,
  operation operation_type,
  price NUMERIC,
  currency currency_type,
  rooms INTEGER,
  zone TEXT,
  address TEXT,
  description TEXT,
  parking BOOLEAN,
  hoa_fees NUMERIC,
  similarity FLOAT
)
language sql
security invoker
set search_path = 'public, extensions'
as $$
  select
    p.id,
    p.title,
    p.type,
    p.operation,
    p.price,
    p.currency,
    p.rooms,
    p.zone,
    p.address,
    p.description,
    p.parking,
    p.hoa_fees,
    1 - (p.embedding operator(extensions.<=>) query_embedding) as similarity
  from public.properties p
  where
    p.agency_id = agency_id_filter
    and p.operation = operation_filter
    and p.available = true
    and p.embedding is not null
    and 1 - (p.embedding operator(extensions.<=>) query_embedding) >= similarity_threshold
  order by p.embedding operator(extensions.<=>) query_embedding
  limit match_count;
$$;

-- ============================================================
-- Row Level Security
-- The backend (NestJS) uses the service_role key and bypasses RLS,
-- enforcing agency_id at the query level instead (see CLAUDE.md).
-- These policies protect the admin panel, which authenticates via
-- Supabase Auth using the anon/authenticated role.
-- ============================================================

alter table agencies enable row level security;
alter table agency_users enable row level security;
alter table properties enable row level security;
alter table leads enable row level security;
alter table conversations enable row level security;
alter table rate_limits enable row level security;

-- agency_users: an advisor can see their own membership row(s).
-- Required so the subqueries in the policies below can resolve
-- (select auth.uid())'s agency_id — without this, RLS on
-- agency_users would silently blank out every other policy.
create policy "Advisors can view their own membership"
  on agency_users for select
  to authenticated
  using ( user_id = (select auth.uid()) );

-- agencies: advisors can only see their own agency
create policy "Advisors can view their own agency"
  on agencies for select
  to authenticated
  using (
    id in (
      select agency_id from agency_users where user_id = (select auth.uid())
    )
  );

-- properties: advisors can see and manage their agency's properties.
-- A single FOR ALL policy covers SELECT too; a separate SELECT policy
-- with the same condition would be redundant and cost an extra
-- policy evaluation per query (Supabase lint: multiple_permissive_policies).
create policy "Advisors can manage their agency properties"
  on properties for all
  to authenticated
  using (
    agency_id in (
      select agency_id from agency_users where user_id = (select auth.uid())
    )
  )
  with check (
    agency_id in (
      select agency_id from agency_users where user_id = (select auth.uid())
    )
  );

-- leads: advisors can only see their agency's leads
create policy "Advisors can view their agency leads"
  on leads for select
  to authenticated
  using (
    agency_id in (
      select agency_id from agency_users where user_id = (select auth.uid())
    )
  );

-- conversations: advisors can only see their agency's conversations
create policy "Advisors can view their agency conversations"
  on conversations for select
  to authenticated
  using (
    agency_id in (
      select agency_id from agency_users where user_id = (select auth.uid())
    )
  );

-- rate_limits: internal bookkeeping table, not exposed to the admin
-- panel. RLS is enabled with no policies, so anon/authenticated get
-- no access; only the backend's service_role (which bypasses RLS)
-- can read/write it.

-- ============================================================
-- Table grants
-- Separate from RLS: RLS decides which ROWS are visible to a role
-- that already has table access; without these GRANTs, Postgres
-- rejects the query with "permission denied for table" before RLS
-- is ever evaluated (service_role bypasses RLS, but still needs the
-- underlying GRANT). `anon` is deliberately not granted — every
-- policy above targets `authenticated` only, so anon has no path to
-- any row regardless.
-- ============================================================

grant select, insert, update, delete on
  agencies, agency_users, properties, leads, conversations, rate_limits
  to authenticated, service_role;
