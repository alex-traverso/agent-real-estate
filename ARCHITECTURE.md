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
| Anthropic Claude API (`claude-sonnet-4-6`) | AI agent (conversation, tool calling, prompt caching) |
| OpenAI API (`text-embedding-3-small`) | Generating property and query embeddings |

---

## Full Request Flow

### Incoming WhatsApp message

```
1. Client sends message via WhatsApp
         ↓
2. Meta Cloud API sends POST to /webhook
         ↓
3. WebhookSignatureGuard validates X-Hub-Signature-256
   → Invalid: return 403, stop
   → Valid: continue
         ↓
4. WebhookController returns HTTP 200 to Meta immediately (fire-and-forget) and
   dispatches WebhookService.processInbound in the background — a slow or
   non-200 response makes Meta retry the same event, causing duplicate replies
         ↓
5. WebhookService extracts the message payload, resolves the tenant
   (metadata.phone_number_id → agency_id, via AgencyService)
         ↓
6. IdempotencyService checks the processed_messages table (agency_id,
   message.id / wamid)
   → Already processed (Meta redelivery): skip silently — no reply, no
     rate-limit consumption, no persistence, no AgentService/Claude call
   → First delivery: insert the record (UNIQUE constraint is the atomic dedup
     barrier), continue
         ↓
7. RateLimitService checks the rate_limits table (agency_id, phone)
   → phone >= 20 messages in the last 60s: send a polite WhatsApp reply
     directly and stop — no ConversationService, no AgentService/Claude call
   → OK: upsert the window (increment or reset), continue
         ↓
8. ConversationService loads or creates conversation
   → New phone or session expired (8h): create new conversation
   → Existing: load full message history
         ↓
9. Check message_count >= 50 (right after loading the conversation, before
   persisting the inbound turn)
   → Yes: EscalationService saves a lead + notifies the advisor,
     ConversationService.markEscalated flips status to 'escalated', client
     gets a handoff message — no AgentService/Claude call, nothing appended
     to history for this message. Same fail-soft posture as rate limiting:
     if the escalation itself fails, the client gets the generic fallback
     and the conversation stays 'active' so the next message retries.
   → No: continue
         ↓
10. AgentService calls Claude API
   → Sends: system prompt + full conversation history + available tools
   → Claude responds with text or tool call
         ↓
11. If Claude calls a tool:
   → search_properties_by_filters   → PropertiesService → Supabase query
   → search_properties_semantic     → EmbeddingsService (OpenAI) → pgvector RPC
   → search_property_by_address     → PropertiesService → Supabase query
   → save_lead                      → LeadsService → Supabase insert
   → escalate_to_advisor            → EscalationService (LeadsService +
                                       AgencyService + NotificationsService) —
                                       the same service the step-9 cap
                                       handoff uses, one escalation path
   → Tool result sent back to Claude
   → Claude generates final response
         ↓
12. ConversationService saves updated history to Supabase, folding the turn's
    accumulated token usage into the same write (conversations.total_*_tokens,
    for cost-per-lead visibility)
          ↓
13. WebhookService calls WhatsAppService (messaging module) to send the
    response to the client via Meta Cloud API

> **Why rate limiting isn't a `Guard`:** step 4 is fire-and-forget — the
> controller answers Meta before any message is even parsed. The phone number
> and its `agency_id` are only known inside `WebhookService.processInbound`,
> after per-message tenant resolution (step 5). A `CanActivate` guard runs
> before the controller method and has no access to that async, per-message
> state, so `RateLimitService` is a plain injectable called directly from
> `WebhookService`, not an HTTP-level guard.

> **Current state:** the agent is **live**. The webhook receives and verifies
> messages, resolves the tenant from `metadata.phone_number_id` (→
> `agencies.whatsapp_phone_number_id`, via AgencyService), dedups Meta
> redeliveries (`IdempotencyService`, keyed by `message.id` in
> `processed_messages` — see step 6), checks the rate limit (`RateLimitService`,
> 20 msg/min per phone, persisted in `rate_limits` so it survives restarts),
> loads/creates the conversation (ConversationService, 8h session timeout),
> checks the 50-message cap (escalates via `EscalationService` +
> `ConversationService.markEscalated` and returns early if hit — see step 9),
> persists the inbound turn, then delegates the reply to
> `AgentService.processMessage` (Luca) and sends it via WhatsAppService. On any
> agent failure a generic Spanish fallback is sent — the internal error is
> never surfaced to the client. History is stored
> in `conversations.messages` as Claude-shaped `{ role, content }` (+ timestamp,
> whatsapp_message_id).
>
> `AgentService` runs the Claude (`claude-sonnet-4-6`) tool-calling loop with a
> versioned Spanish system prompt (`agent/prompts/system.prompt.ts`) and six
> tools (`agent/tools/*.ts`): `list_available_zones`,
> `search_properties_by_filters`, `search_properties_semantic`,
> `search_property_by_address`, `save_lead`, `escalate_to_advisor`. Search is
> backed by `PropertiesService` / `EmbeddingsService` (the semantic path via
> the `search_properties_semantic` pgvector RPC); leads by `LeadsService`;
> escalation composes `LeadsService` + `AgencyService.getContactEmail` +
> `NotificationsService` (Resend, non-blocking). Every path is scoped by
> `agency_id`, the system prompt never contains client text, and the lead
> `phone` is taken from the conversation, never from the model. The request to
> Claude uses prompt caching (see "Prompt Caching Strategy" below) and
> disables thinking explicitly, since Luca's replies are short and
> conversational. Both admin-facing controllers (`PropertiesController`,
> `LeadsController` — see Auth Boundary above) are live.
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
│   ├── properties.controller.ts    # Admin CRUD (SupabaseAuthGuard-protected)
│   ├── properties.service.ts       # Agent-facing search (filters/semantic/
│   │                                  address) + admin CRUD (list/get/create/
│   │                                  update/setAvailability)
│   └── dto/
│       ├── create-property.dto.ts
│       ├── update-property.dto.ts
│       ├── set-availability.dto.ts
│       └── list-properties-query.dto.ts
│
├── embeddings/
│   ├── embeddings.module.ts
│   └── embeddings.service.ts       # OpenAI embedding generation + pgvector search
│
├── leads/
│   ├── leads.module.ts
│   ├── leads.controller.ts         # Admin read/status-update (SupabaseAuthGuard-
│   │                                  protected); no create route — leads only
│   │                                  come from the agent's save_lead tool
│   ├── leads.service.ts            # Agent-facing saveLead + admin methods
│   │                                  (list/get/getConversationForLead/updateStatus)
│   └── dto/
│       ├── update-lead-status.dto.ts
│       └── list-leads-query.dto.ts
│
├── notifications/
│   ├── notifications.module.ts
│   └── notifications.service.ts    # Resend email notifications to advisors
│
├── escalation/
│   ├── escalation.module.ts
│   └── escalation.service.ts       # Composes Leads + Agency + Notifications;
│                                      shared by the agent's escalate_to_advisor
│                                      tool and the webhook's message-cap handoff
│
├── rate-limit/
│   ├── rate-limit.module.ts
│   ├── rate-limit.service.ts       # Checks/upserts rate_limits; called from
│   │                                 WebhookService (not a Guard — see
│   │                                 Full Request Flow above for why)
│   └── rate-limit.constants.ts     # Max messages (20) + window (60s)
│
├── idempotency/
│   ├── idempotency.module.ts
│   └── idempotency.service.ts      # Dedups on message.id via processed_messages
│                                      (UNIQUE agency_id+message_id); called from
│                                      WebhookService right after tenant
│                                      resolution, before the rate limit
│
├── auth/
│   ├── auth.module.ts
│   ├── supabase-auth.guard.ts      # Admin panel auth: verifies the Supabase
│   │                                  Auth bearer token, resolves agency_id via
│   │                                  agency_users, attaches { userId, agencyId }
│   │                                  to the request — see Auth Boundary above
│   ├── current-agency.decorator.ts # @CurrentAgency() — reads the resolved
│   │                                  agency_id set by SupabaseAuthGuard
│   └── types/authenticated-request.type.ts
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

No `src/` directory — the App Router lives directly under `apps/admin/app/`.

```
proxy.ts                          # Root proxy (formerly "middleware"): refreshes
                                     the Supabase session cookie on every request
                                     via lib/supabase/middleware.ts. Does not
                                     redirect — that's the (dashboard) layout's job.
components.json                   # shadcn/ui config (style: radix-nova, neutral base)
lib/
├── utils.ts                       # shadcn's `cn()` helper
└── supabase/
    ├── client.ts                  # Browser client (Client Components: login, forms)
    ├── server.ts                  # Server client (Server Components, reads/writes
    │                                 cookies via next/headers)
    └── middleware.ts               # updateSession() — called from proxy.ts
components/
└── ui/                            # shadcn/ui primitives (button, input, label, card,
                                     table, badge, select, textarea, switch, …)
lib/api/
└── client.ts                      # Server-only fetch wrapper for apps/api: attaches the
                                     current Supabase session's access token as Bearer.
                                     apiGet() (Server Components, throws/notFound() on
                                     failure) and apiMutate() (Server Actions, returns
                                     {ok,error} instead of throwing). Never called from
                                     the browser — no CORS involved on apps/api.
app/
├── layout.tsx                     # Root layout — fonts, globals.css, {children}
├── globals.css                    # Tailwind v4 + shadcn theme tokens
├── (auth)/
│   ├── layout.tsx                 # Centered shell, no dashboard nav
│   ├── login/
│   │   └── page.tsx               # Login (Spanish UI), no self-signup
│   ├── forgot-password/
│   │   └── page.tsx               # Requests a password-reset email
│   └── reset-password/
│       └── page.tsx               # Sets a new password (landed on via the reset email)
└── (dashboard)/
    ├── layout.tsx                 # Protected layout — Server Component,
    │                                 supabase.auth.getUser() + redirect('/login')
    │                                 if unauthenticated; header + logout button
    ├── actions.ts                 # 'use server' — logout() (signOut + redirect)
    ├── error.tsx                  # Client Component boundary — generic Spanish
    │                                 error + retry, catches apiGet()/action throws
    ├── page.tsx                   # Dashboard home (static welcome, Epic 10)
    ├── properties/
    │   ├── page.tsx                # List (GET /properties, paginated) + Excel upload
    │   ├── actions.ts              # Server Actions: createProperty, updateProperty,
    │   │                             setPropertyAvailability, parsePropertiesExcel,
    │   │                             confirmPropertiesUpload
    │   ├── property-form.tsx       # Shared create/edit form (Client Component)
    │   ├── excel-upload-form.tsx   # Excel bulk upload (Client Component, two-step):
    │   │                             parsePropertiesExcel validates the uploaded
    │   │                             .xlsx (no DB writes, case-insensitive headers,
    │   │                             native Excel numeric types) and renders a
    │   │                             preview table; confirmPropertiesUpload then
    │   │                             POSTs only the valid rows once the user clicks
    │   │                             "Confirmar carga" — no bulk endpoint, loops
    │   │                             POST /properties per row
    │   ├── template/
    │   │   └── route.ts            # GET — streams a downloadable .xlsx template
    │   │                             with the correct headers + an example row
    │   │                             (auth-checked directly, Route Handlers aren't
    │   │                             wrapped by the dashboard layout's auth check)
    │   ├── availability-toggle.tsx # Switch bound directly to setPropertyAvailability
    │   ├── new/
    │   │   └── page.tsx            # Manual create form
    │   └── [id]/
    │       └── page.tsx            # Detail: pre-filled edit form + availability toggle
    └── leads/                     # Epic 11 — not built yet
        ├── page.tsx                # Lead list with status filter
        └── [id]/
            └── page.tsx            # Lead detail + conversation history
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
  ├── rate_limits (agency_id FK)
  └── processed_messages (agency_id FK)
```

### Table Summary

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `agencies` | Root tenant entity | `id`, `name`, `email` |
| `agency_users` | Maps Supabase Auth users to their agency (drives admin panel RLS) | `agency_id`, `user_id` |
| `properties` | Real estate listings | `agency_id`, `type`, `operation`, `price`, `zone`, `embedding` |
| `leads` | Qualified prospects | `agency_id`, `phone`, `status`, `property_id` |
| `conversations` | WhatsApp history | `agency_id`, `phone`, `messages` (JSONB), `message_count`, `total_*_tokens` (accumulated Claude usage) |
| `rate_limits` | Rate limiting state | `agency_id`, `phone`, `window_start`, `message_count` |
| `processed_messages` | Idempotency (Meta redelivery dedup) | `agency_id`, `message_id` (`UNIQUE` together), `created_at` |

`pgvector` is installed in the `extensions` schema (not `public`), per Supabase's security linter recommendations.

Full schema definition is in `.agents/DB.md`. Generated TypeScript types are in `packages/types/src/database.types.ts`.

---

## AI Agent Design

### Claude Tool Calling Flow

```
AgentService.processMessage(history, agencyId)
        ↓
Call Claude API with:
  - system prompt (system.prompt.ts), cached
  - full conversation history, cached up to the newest turn
  - tool definitions (6 tools), cached
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
| `list_available_zones` | (none) | string[] of loaded zones/neighborhoods |
| `search_properties_by_filters` | operation, zone, rooms, max_price, currency, type | Property[] |
| `search_properties_semantic` | query_text, operation, match_count | Property[] with similarity score |
| `search_property_by_address` | address, zone | Property or null |
| `save_lead` | name, phone, operation_type, zone, budget, rooms, property_id, notes | Lead |
| `escalate_to_advisor` | phone, reason, conversation_summary | void (sends email) |

### Prompt Caching Strategy

The API's prompt render order is `tools` → `system` → `messages`, and caching is a prefix match (any change invalidates everything after it). `AgentService` uses this deliberately to keep Sonnet-tier cost down on high-volume WhatsApp traffic:

```
tools (6 defs) + system prompt        ← one cache breakpoint on the last
                                         system block; identical across every
                                         conversation, stays warm continuously
        ↓
conversation history (all prior turns) ← one cache breakpoint on the
                                          second-to-last message, refreshed
                                          on every request
        ↓
newest user turn + Claude's new reply  ← always uncached (unique per request)
```

- **TTL:** 5-minute ephemeral cache (`cache_control: { type: 'ephemeral' }`), the default. The static tools+system prefix gets reused continuously by any traffic; the history breakpoint benefits bursty back-and-forth within a session. Not tied to the 8h session timeout — the cache TTL and the session timeout are independent.
- **Thinking is explicitly disabled** (`thinking: { type: 'disabled' }`), not just omitted — this protects against a silent cost regression if `ANTHROPIC_MODEL` is ever overridden to a model where adaptive thinking is on by default.
- **Token usage is logged per call** (`input`, `output`, `cache_creation_input_tokens`, `cache_read_input_tokens`) for cost visibility, without phone numbers or message content.

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
[1] Meta signature validation (WebhookSignatureGuard)
    ↓
[2] Rate limiting per phone (RateLimitService, called from WebhookService)
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
| Admin panel users | Supabase Auth (email/password), access token sent as `Authorization: Bearer` to the NestJS API | Via NestJS service role — `SupabaseAuthGuard` verifies the token (`supabase.auth.getUser`) and resolves `agency_id` from `agency_users`; every admin route is `agency_id`-scoped in code, same model as the WhatsApp path. RLS policies remain in place as defense in depth, not the primary access path. |
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
API_URL=                        # apps/api base URL. Server-only (no NEXT_PUBLIC_
                                 # prefix) — every call happens in Server Components/
                                 # Server Actions, never the browser, so apps/api
                                 # needs no CORS config for this.
```

---

## Key Technical Decisions

| Decision | Choice | Reason |
|----------|--------|--------|
| Monorepo | Yarn 4 workspaces | Single repo, shared types, simpler CI |
| ORM | Supabase JS client (no ORM) | Simple queries, RLS compatibility, no overhead |
| Rate limit storage | Supabase table | Persists across server restarts |
| Embedding model | OpenAI text-embedding-3-small | Claude has no embedding model; OpenAI free credits available |
| AI model | Claude Sonnet 4.6 | More natural conversational tone than Haiku; cost controlled via prompt caching (see Prompt Caching Strategy) rather than a cheaper model |
| Conversation history | Full history per request, prompt-cached | Better agent context; caching keeps resending full history cheap; 50-message limit is the remaining hard cost bound |
| Session timeout | 8 hours | Balances context retention with DB storage |
| Admin auth | Supabase Auth | Already in stack, email/password out of the box |
| Admin frontend session handling | `@supabase/ssr` (`createBrowserClient`/`createServerClient`), `supabase.auth.getUser()` in Server Components | Official current package for Next.js App Router (supersedes deprecated `@supabase/auth-helpers-nextjs`); `getUser()` revalidates against Supabase Auth instead of trusting an unverified session cookie like `getSession()` would |
| Admin UI components | shadcn/ui (Radix primitives, Tailwind v4) | Already the project's chosen component approach; components are copied into the repo (`components/ui/`), not an opaque dependency |
| Notifications | Resend email | Simpler than WhatsApp-to-advisor; free tier sufficient |
