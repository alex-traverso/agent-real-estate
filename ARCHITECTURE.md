# Architecture — Agent Real Estate

This document describes the technical architecture of Agent Real Estate in full detail. It covers infrastructure, data flow, module structure, security boundaries, and key technical decisions.

All agents must read this document alongside `CLAUDE.md` before working on any task.

---

## Overview

Agent Real Estate is a monorepo containing two applications:

- **`apps/api`** — NestJS backend. Handles the WhatsApp webhook, runs the Claude AI agent, manages conversations, and interacts with the database.
- **`apps/admin`** — Next.js frontend. Admin panel for advisors to manage properties and view leads.

Both applications share a single Supabase project (PostgreSQL + pgvector + Auth), and consume the generated database types from **`packages/types`**.

---

## Infrastructure

```
┌─────────────────────────────────────────────────────────────────┐
│                        GitHub Repository                        │
│                    (agent-real-estate)                          │
│                                                                 │
│   ┌──────────────┐              ┌──────────────┐               │
│   │  apps/api    │              │  apps/admin  │               │
│   │  (NestJS)    │              │  (Next.js)   │               │
│   └──────┬───────┘              └──────┬───────┘               │
│          │ deploy                      │ deploy                 │
└──────────┼─────────────────────────────┼───────────────────────┘
           ↓                             ↓
      Railway                        Vercel
   (NestJS API)                  (Next.js Admin)
           │                             │
           └──────────────┬──────────────┘
                          ↓
                      Supabase
              (PostgreSQL + pgvector + Auth)
```

### Hosting
| Service | Platform | Plan |
|---------|----------|------|
| NestJS API | Railway | Free tier |
| Next.js Admin | Vercel | Hobby (free) |
| Database | Supabase | Free tier |
| Email | Resend | Free tier (3000/month) |
| CI/CD | GitHub Actions | Free tier |

### External APIs
| Service | Purpose |
|---------|---------|
| Meta Cloud API | WhatsApp messaging (send/receive) |
| Anthropic Claude API (`claude-haiku-4-5`) | AI agent (conversation, tool calling) |
| OpenAI API (`text-embedding-3-small`) | Generating property and query embeddings |

---

## Full Request Flow

### Incoming WhatsApp message

```
1. Client sends message via WhatsApp
         ↓
2. Meta Cloud API sends POST to /webhook
         ↓
3. WebhookGuard validates X-Hub-Signature-256
   → Invalid: return 403, stop
   → Valid: continue
         ↓
4. RateLimitGuard checks rate_limits table
   → phone >= 20 messages in last 60s: return polite message + HTTP 200, stop
   → OK: increment counter, continue
         ↓
5. WebhookController extracts message payload
         ↓
6. ConversationService loads or creates conversation
   → New phone or session expired (8h): create new conversation
   → Existing: load full message history
         ↓
7. Check message_count >= 50
   → Yes: escalate to advisor, close conversation
   → No: continue
         ↓
8. AgentService calls Claude API
   → Sends: system prompt + full conversation history + available tools
   → Claude responds with text or tool call
         ↓
9. If Claude calls a tool:
   → search_properties_by_filters   → PropertiesService → Supabase query
   → search_properties_semantic     → EmbeddingsService (OpenAI) → pgvector RPC
   → search_property_by_address     → PropertiesService → Supabase query
   → save_lead                      → LeadsService → Supabase insert
   → escalate_to_advisor            → LeadsService + NotificationsService (Resend)
   → Tool result sent back to Claude
   → Claude generates final response
         ↓
10. ConversationService saves updated history to Supabase
          ↓
11. WebhookService calls WhatsAppService (messaging module) to send the
    response to the client via Meta Cloud API
          ↓
12. Return HTTP 200 to Meta

> **Current state:** the agent (step 8+) is not built yet. The webhook
> receives and verifies messages, resolves the tenant from
> `metadata.phone_number_id` (→ `agencies.whatsapp_phone_number_id`, via
> AgencyService), loads/creates the conversation (ConversationService, 8h
> session timeout) and persists the exchange, then replies to any inbound text
> with a fixed Spanish placeholder ("Luca in development") via WhatsAppService.
> The reply text is the seam where the agent will plug in. History is stored in
> `conversations.messages` as Claude-shaped `{ role, content }` (+ timestamp,
> whatsapp_message_id). The 50-message cap/escalation is not enforced yet.
```

---

## Module Structure — `apps/api`

```
src/
├── main.ts                         # Bootstrap, global pipes, validation
├── app.module.ts                   # Root module, imports all feature modules
│
├── webhook/
│   ├── webhook.module.ts
│   ├── webhook.controller.ts       # POST /webhook (Meta verification + messages)
│   ├── webhook.service.ts          # Inbound orchestration (extract, log, trigger reply)
│   ├── webhook.constants.ts        # Placeholder reply text (interim, until agent)
│   └── webhook.guard.ts            # Validates X-Hub-Signature-256
│
├── messaging/
│   ├── messaging.module.ts
│   ├── messaging.constants.ts      # Graph API base URL + pinned version
│   └── whatsapp.service.ts         # Sends messages via Meta Cloud API (reusable)
│
├── agency/
│   ├── agency.module.ts
│   └── agency.service.ts           # Resolves phone_number_id → agency_id (cached)
│
├── conversation/
│   ├── conversation.module.ts
│   ├── conversation.constants.ts   # Session timeout (8h), message cap (50)
│   ├── conversation.service.ts     # Load/create + append history (per agency_id)
│   └── types/stored-message.type.ts
│
├── agent/
│   ├── agent.module.ts
│   ├── agent.service.ts            # Orchestrates Claude API calls and tool execution
│   ├── prompts/
│   │   └── system.prompt.ts        # Versioned system prompt (Spanish)
│   └── tools/
│       ├── search-properties-by-filters.tool.ts
│       ├── search-properties-semantic.tool.ts
│       ├── search-property-by-address.tool.ts
│       ├── save-lead.tool.ts
│       └── escalate-to-advisor.tool.ts
│
├── conversation/
│   ├── conversation.module.ts
│   └── conversation.service.ts     # Session management, history, message count
│
├── properties/
│   ├── properties.module.ts
│   ├── properties.controller.ts    # CRUD endpoints for admin panel
│   ├── properties.service.ts       # Filter search + address search
│   └── dto/
│       ├── create-property.dto.ts
│       └── search-properties.dto.ts
│
├── embeddings/
│   ├── embeddings.module.ts
│   └── embeddings.service.ts       # OpenAI embedding generation + pgvector search
│
├── leads/
│   ├── leads.module.ts
│   ├── leads.controller.ts         # CRUD endpoints for admin panel
│   ├── leads.service.ts            # Lead creation, status updates
│   └── dto/
│       └── create-lead.dto.ts
│
├── notifications/
│   ├── notifications.module.ts
│   └── notifications.service.ts    # Resend email notifications to advisors
│
├── rate-limit/
│   ├── rate-limit.module.ts
│   ├── rate-limit.service.ts       # Check and increment rate_limits table
│   └── rate-limit.guard.ts         # Applied to webhook endpoint
│
└── common/
    ├── supabase/
    │   └── supabase.service.ts     # Singleton Supabase client (service role)
    ├── guards/
    └── interceptors/
        └── logging.interceptor.ts  # Request/response logging
```

---

## Module Structure — `apps/admin`

```
src/
└── app/
    ├── layout.tsx                  # Root layout
    ├── (auth)/
    │   └── login/
    │       └── page.tsx            # Login page (Spanish UI)
    └── (dashboard)/
        ├── layout.tsx              # Protected layout — verifies Supabase Auth session
        ├── page.tsx                # Dashboard home
        ├── properties/
        │   ├── page.tsx            # Property list + CSV upload
        │   └── [id]/
        │       └── page.tsx        # Property detail + availability toggle
        └── leads/
            ├── page.tsx            # Lead list with status filter
            └── [id]/
                └── page.tsx        # Lead detail + conversation history
```

---

## Database Schema

### Entity Relationship

```
agencies
  │
  ├── agency_users (agency_id FK) ── auth.users (user_id FK)
  ├── properties (agency_id FK)
  ├── leads (agency_id FK)
  │     └── properties (property_id FK, optional)
  ├── conversations (agency_id FK)
  │     └── leads (lead_id FK, optional)
  └── rate_limits (agency_id FK)
```

### Table Summary

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `agencies` | Root tenant entity | `id`, `name`, `email` |
| `agency_users` | Maps Supabase Auth users to their agency (drives admin panel RLS) | `agency_id`, `user_id` |
| `properties` | Real estate listings | `agency_id`, `type`, `operation`, `price`, `zone`, `embedding` |
| `leads` | Qualified prospects | `agency_id`, `phone`, `status`, `property_id` |
| `conversations` | WhatsApp history | `agency_id`, `phone`, `messages` (JSONB), `message_count` |
| `rate_limits` | Rate limiting state | `agency_id`, `phone`, `window_start`, `message_count` |

`pgvector` is installed in the `extensions` schema (not `public`), per Supabase's security linter recommendations.

Full schema definition is in `.agents/DB.md`. Generated TypeScript types are in `packages/types/src/database.types.ts`.

---

## AI Agent Design

### Claude Tool Calling Flow

```
AgentService.processMessage(history, agencyId)
        ↓
Call Claude API with:
  - system prompt (system.prompt.ts)
  - full conversation history
  - tool definitions (5 tools)
        ↓
Claude returns: text | tool_use
        ↓
If tool_use:
  → execute tool locally (NestJS service call)
  → append tool_result to messages
  → call Claude API again with updated history
  → Claude returns final text response
        ↓
Return final text to WebhookService
```

### Tool Definitions

| Tool | Input | Output |
|------|-------|--------|
| `search_properties_by_filters` | operation, zone, rooms, max_price, currency, type | Property[] |
| `search_properties_semantic` | query_text, operation, match_count | Property[] with similarity score |
| `search_property_by_address` | address, zone | Property or null |
| `save_lead` | name, phone, operation_type, zone, budget, rooms, property_id, notes | Lead |
| `escalate_to_advisor` | phone, reason, conversation_summary | void (sends email) |

### Search Strategy (enforced in system prompt)

```
Client message
      ↓
Does it contain a specific address or reference?
  YES → search_property_by_address
  NO  ↓
Does it contain structured criteria (zone, price, rooms)?
  YES → search_properties_by_filters
        → rank results with search_properties_semantic
  NO  ↓
Vague description only
      → search_properties_semantic directly
```

### Semantic Search Flow

```
Client description ("something quiet with a garden")
        ↓
EmbeddingsService.generateEmbedding(text)
  → OpenAI API: text-embedding-3-small
  → returns: number[] (1536 dimensions)
        ↓
Supabase RPC: search_properties_semantic(embedding, agency_id, operation)
  → pgvector cosine similarity search
  → returns: properties ordered by similarity score
        ↓
Claude receives results and presents top matches to client
```

---

## Security Architecture

### Security Layers

```
Internet
    ↓
[1] Meta signature validation (WebhookGuard)
    ↓
[2] Rate limiting per phone (RateLimitGuard)
    ↓
[3] Input sanitization
    ↓
[4] Prompt injection defense (system prompt)
    ↓
[5] agency_id enforcement (every DB query)
    ↓
[6] RLS policies (admin panel via Supabase Auth)
    ↓
Database
```

Each layer is independent. A failure at one layer does not bypass the others.

### Auth Boundary

| Client | Auth Method | DB Access |
|--------|------------|-----------|
| WhatsApp clients | None (public webhook) | Via NestJS service role — agency_id enforced in code |
| Admin panel users | Supabase Auth (email/password) | Via anon key — RLS enforced in DB |
| NestJS backend | Service role key | Bypasses RLS — agency_id enforced in every query |

---

## CI/CD Pipeline

```
Push to feature/* or PR to develop
        ↓
GitHub Actions: ci.yml
  ├── check-api
  │   ├── tsc --noEmit (apps/api)
  │   ├── eslint (apps/api)
  │   └── build (apps/api)
  └── check-admin
      ├── tsc --noEmit (apps/admin)
      ├── eslint (apps/admin)
      └── build (apps/admin)
        ↓
All checks pass?
  NO  → PR blocked, cannot merge
  YES → PR can be merged to develop
        ↓
Merge to develop
  → Railway auto-deploys api (staging)
  → Vercel auto-deploys admin (staging)
        ↓
Merge develop to main
  → Railway auto-deploys api (production)
  → Vercel auto-deploys admin (production)
```

---

## Environment Variables

All secrets are managed via Railway (API) and Vercel (Admin) dashboards. Never in code.

### `apps/api` (Railway)
```bash
ANTHROPIC_API_KEY=          # Claude API
OPENAI_API_KEY=             # Embeddings
SUPABASE_URL=               # Supabase project URL
SUPABASE_SERVICE_ROLE_KEY=  # Backend DB access (bypasses RLS)
META_APP_SECRET=            # Webhook signature validation
META_VERIFY_TOKEN=          # Webhook verification token
META_API_TOKEN=             # Sending messages via Meta Cloud API
META_PHONE_NUMBER_ID=       # WhatsApp Business phone number ID
RESEND_API_KEY=             # Email notifications
```

### `apps/admin` (Vercel)
```bash
NEXT_PUBLIC_SUPABASE_URL=       # Supabase project URL (public)
NEXT_PUBLIC_SUPABASE_ANON_KEY=  # Supabase anon key (public, RLS enforced)
```

---

## Key Technical Decisions

| Decision | Choice | Reason |
|----------|--------|--------|
| Monorepo | Yarn 4 workspaces | Single repo, shared types, simpler CI |
| ORM | Supabase JS client (no ORM) | Simple queries, RLS compatibility, no overhead |
| Rate limit storage | Supabase table | Persists across server restarts |
| Embedding model | OpenAI text-embedding-3-small | Claude has no embedding model; OpenAI free credits available |
| AI model | Claude Haiku | Cost-efficient for high-frequency WhatsApp interactions |
| Conversation history | Full history per request | Better agent context; 50-message limit controls cost |
| Session timeout | 8 hours | Balances context retention with DB storage |
| Admin auth | Supabase Auth | Already in stack, email/password out of the box |
| Notifications | Resend email | Simpler than WhatsApp-to-advisor; free tier sufficient |
