# BACKLOG.md — Agent Real Estate

This is the single source of truth for what needs to be built. It is organized in 12 dependency-ordered epics. Each task should be delegated by the ORCHESTRATOR following its workflow (Analyze → Break down → Delegate → Validate → Report).

**Legend:**

- `[x]` Done and verified
- `[ ]` Pending

> **Verification pass — 2026-07-08:** every `[~]` item was checked against the real
> repo (migrations in `apps/api/supabase/migrations/`, modules in `apps/api/src/`,
> `ci.yml`, generated types, admin app). Results folded in below. Summary of changes
> is in the commit / chat report, not duplicated here.

---

## Epic 1 — Database Foundation & Multi-tenancy

- [x] `agencies` table created with base columns (id, name, email, phone, created_at)
- [x] `agencies.whatsapp_phone_number_id` column added (required for webhook routing)
- [x] `agency_users` table created (maps `auth.users.id` → `agency_id`, drives admin RLS)
- [x] `properties` table created with enums (`property_type`, `operation_type`, `currency_type`) and `embedding VECTOR(1536)` column
- [x] `leads` table created with `lead_status` enum
- [x] `conversations` table created with `conversation_status` enum, `messages JSONB`, `message_count`
- [x] `rate_limits` table created
- [x] All indexes from `DB.md` created (properties, leads, conversations, rate_limits, HNSW on embedding)
- [x] `pgvector` extension enabled in `extensions` schema (not `public`, per Supabase linter)
- [x] `search_properties_semantic` RPC function created
- [x] RLS policies written for `agencies`, `properties`, `leads`, `conversations` (admin panel access via `agency_users`)
- [x] SECURITY: confirm every table has `agency_id` FK + `created_at`, confirm RLS matches `DB.md` exactly
- [x] Migration files exist for every schema change above (no dashboard-only changes)
- [x] Generated TypeScript types in `packages/types/src/database.types.ts` match current schema

---

## Epic 2 — Webhook Ingestion & Security

- [x] `WebhookGuard` validates `X-Hub-Signature-256` using `crypto.timingSafeEqual` on raw body
- [x] WABA (`1432755248611282`) subscribed to the app via `POST /WABA_ID/subscribed_apps`
- [x] Permanent System User token created in Meta Business Manager (correct scopes, no expiry)
- [x] Webhook verification endpoint (GET, `hub.challenge`) working with `META_VERIFY_TOKEN`
- [x] Webhook receives and parses inbound messages from Meta
- [x] Idempotent handling of duplicate messages (Meta may resend): `IdempotencyService.checkAndMark` (new `idempotency/` module) dedups on `message.id` (wamid) via `processed_messages` (`UNIQUE(agency_id, message_id)` is the atomic barrier), called from `WebhookService.processInbound` right after tenant resolution, before the rate limit — a redelivery is skipped silently (no reply, no rate-limit consumption, no persistence, no Claude call). Fails open on a non-conflict DB error, same posture as `RateLimitService`. Retention (pruning old rows) is a deferred follow-up — `pg_cron` snippet documented in the migration.
- [x] SECURITY: confirm invalid/missing signature returns 403 immediately, before any other processing
- [x] TESTER: unit tests for valid / invalid / missing signature cases (`webhook.guard.spec.ts`)

---

## Epic 3 — Multi-tenant Routing (Agency Resolution)

- [x] `AgencyService` resolves `phone_number_id` (from webhook payload) → `agency_id`
- [x] Resolution result is cached (in-memory `Map`)
- [x] SECURITY: confirm `agency_id` is **never** derived from user input, only from verified webhook `metadata.phone_number_id`
- [x] Fallback behavior defined for unknown/unmapped `phone_number_id` (returns `null`, logs, `continue` — never crashes)
- [x] TESTER: unit tests for known number, unknown number, malformed payload (`agency.service.spec.ts` + `webhook.service.spec.ts`)

---

## Epic 4 — Conversation Management

- [x] `ConversationService` loads existing conversation or creates a new one per `(agency_id, phone)`
- [x] 8-hour inactivity session timeout implemented
- [x] Message history persisted to `conversations.messages` (JSONB, Claude-shaped `{role, content}` + timestamp + `whatsapp_message_id`)
- [x] `message_count` cap at 50 enforced in `WebhookService.replyAndPersist`, checked right after loading the conversation, before the agent (Claude) is ever called
- [x] On reaching 50 messages → `EscalationService` (new shared module: `LeadsService` + `AgencyService` + `NotificationsService`) saves a lead + notifies the advisor, `ConversationService.markEscalated` flips status to `'escalated'` — same escalation path the agent's `escalate_to_advisor` tool uses, not a separate one
- [x] TESTER: new conversation, continued conversation (<8h), expired conversation (>8h) — `conversation.service.spec.ts`; message-count boundary (at cap, past cap, under cap, escalation failure fail-soft) — `webhook.service.spec.ts`; `EscalationService` itself — `escalation.service.spec.ts`
- [x] Per-conversation token usage persisted (`conversations.total_input_tokens` / `total_output_tokens` / `total_cache_creation_tokens` / `total_cache_read_tokens`, `BIGINT NOT NULL DEFAULT 0`): `AgentService.processMessage` accumulates usage across the tool loop and returns `{ reply, usage }`; `ConversationService.appendMessages` folds it into the assistant-turn write; fallback turns (no Claude call) record nothing — for cost-per-lead visibility without scraping logs

---

## Epic 5 — WhatsApp Outbound Messaging

- [x] `WhatsAppService` (messaging module) built to send messages via Meta Cloud API
- [x] Fixed Spanish placeholder reply ("Luca en desarrollo") sent for any inbound text
- [x] Outbound `401 / code 190` issue **resolved** — verified with a real live send. Root cause of the persistent send failure was the Argentine mobile `9` (`549…` `wa_id` vs `54…` send format), fixed by `normalizeWhatsAppRecipient` in `phone.util.ts`.
- [x] Generic error handling: outbound send failures logged, never crash the webhook response to Meta (service throws; webhook path swallows via fire-and-forget `.catch`)
- [x] Graph API version pinned in `messaging.constants.ts` and documented

---

## Epic 6 — AI Agent Core (Claude Integration)

> **Built.** The static placeholder reply has been replaced by the real agent (Luca), live end-to-end via the webhook.

- [x] `AgentService` created: orchestrates calls to Claude API (`claude-sonnet-4-6`) with tool calling
- [x] System prompt written in `apps/api/src/agent/prompts/system.prompt.ts` (Spanish, versioned, never inlined)
  - [x] Identity anchoring (Luca's name, tone, "vos", scope)
  - [x] Prompt injection defense instructions
  - [x] Tool usage guidelines
  - [x] Fallback / escalation behavior on failure
- [x] Webhook reply seam switched from static placeholder to `AgentService.processMessage()` (generic Spanish fallback on agent failure)
- [x] Tool-calling loop implemented: Claude → tool_use → execute → tool_result → Claude → final text (bounded by `MAX_TOOL_ITERATIONS`)
- [x] SECURITY: no user message content is interpolated into the system prompt (unit-tested); lead `phone` is taken from conversation context, never from the model
- [ ] SECURITY: confirm injection attempts get polite redirection, never compliance — defense is in the prompt; **behavioral verification pending live E2E** with `SECURITY.md` prompts
- [x] TESTER: tool failure → graceful recovery + normal conversation flow covered (`agent.service.spec.ts`, `webhook.service.spec.ts`); live injection behavior pending E2E

---

## Epic 7 — Agent Tools: Property Search

- [x] `EmbeddingsService` — OpenAI `text-embedding-3-small` integration for generating embeddings
- [x] `PropertiesService.searchByFilters` — structured search (zone, price, rooms, operation, type), always filtered by `agency_id`
- [x] `PropertiesService.searchByAddress` — exact/near-exact address lookup
- [x] Semantic search: `EmbeddingsService` → `search_properties_semantic` RPC → ranked results
- [x] Tool definitions created in `apps/api/src/agent/tools/`:
  - [x] `search-properties-by-filters.tool.ts`
  - [x] `search-properties-semantic.tool.ts`
  - [x] `search-property-by-address.tool.ts`
- [x] Tool execution logic wired into `AgentService` (not in the tool definition files)
- [x] Search strategy from `CLAUDE.md`/`ARCHITECTURE.md` enforced in system prompt (address → filters+semantic rank → semantic-only)
- [ ] `PropertiesController` — CRUD endpoints for admin panel (create, update, toggle availability) — **deferred to Epic 11**
- [x] TESTER: filter search (matches/empty), address search (match/no match) at the service level; tool dispatch covered in `agent.service.spec.ts`

---

## Epic 8 — Agent Tools: Lead Management & Escalation

- [x] `LeadsService.saveLead` — validates required fields, inserts filtered by `agency_id` (links `conversations.lead_id`)
- [x] `LeadsService` / `NotificationsService` — `escalate_to_advisor` (composed in `EscalationService`, shared with the Epic 4 message-cap handoff) saves lead + emails advisor via Resend
- [x] Tool definitions: `save-lead.tool.ts`, `escalate-to-advisor.tool.ts`
- [x] `NotificationsService` — Resend integration, non-blocking (failure logged, doesn't block lead save)
- [ ] `LeadsController` — CRUD/status-update endpoints for admin panel — **deferred to Epic 11**
- [x] TESTER: save_lead happy path + missing fields, escalate_to_advisor with Resend down (non-blocking failure)

---

## Epic 9 — Rate Limiting

- [x] `RateLimitService` — checks/upserts `rate_limits` table per `(agency_id, phone)`
- [x] Called from `WebhookService.processInbound`, **before** `ConversationService`/`AgentService` (Claude) — **not** a NestJS `Guard`: the webhook is fire-and-forget and the phone/`agency_id` are only known after per-message tenant resolution, past the point a `CanActivate` guard could intervene. See `ARCHITECTURE.md` → Full Request Flow.
- [x] Limit: 20 messages/minute per phone → polite Spanish reply, HTTP 200 to Meta (already the default, fire-and-forget), Claude not invoked, nothing persisted to conversation history
- [x] No cleanup job needed: one row per `(agency_id, phone)` (`UNIQUE` constraint added), upserted/reset in place each window instead of inserted per-window
- [x] SECURITY: rate limit state is in Supabase (`rate_limits` table via `SupabaseService`), not in-memory — survives restarts by construction (the service holds no window state itself)
- [x] TESTER: under limit (increments), at boundary (20th allowed), over limit (21st blocked, no increment), window reset, Supabase read error (fails open) — `rate-limit.service.spec.ts`; blocked-phone path (never reaches the agent) — `webhook.service.spec.ts`

---

## Epic 10 — Admin Panel: Auth & Layout

- [ ] Next.js App Router scaffolding confirmed (`(auth)` and `(dashboard)` route groups) — only the default scaffold (`app/layout.tsx` + `app/page.tsx`) exists; no route groups yet
- [ ] Supabase Auth login page (`app/(auth)/login/page.tsx`, Spanish UI)
- [ ] Protected `(dashboard)` layout — server-side session verification, redirect to login if unauthenticated
- [ ] shadcn/ui + Tailwind base setup confirmed working
- [ ] Dashboard home page (`page.tsx`) — basic overview

---

## Epic 11 — Admin Panel: Properties & Leads Management

- [ ] `properties/page.tsx` — property list, CSV upload
- [ ] `properties/[id]/page.tsx` — property detail, availability toggle
- [ ] `leads/page.tsx` — lead list with status filter
- [ ] `leads/[id]/page.tsx` — lead detail + full conversation history view
- [ ] All data fetching in Server Components/Server Actions (no client-side fetching unless justified)
- [ ] RLS confirmed working end-to-end (an advisor from Agency A cannot see Agency B's data)

---

## Epic 12 — CI/CD, Testing & Deployment Hardening

- [x] GitHub Actions CI set up (Node 22, Corepack before `setup-node`, `.nvmrc` in place)
- [x] Typecheck + lint + build steps for both `apps/api` and `apps/admin`
- [ ] E2E test for full webhook flow (signature → rate limit → conversation → agent → reply)
- [ ] Coverage check: 80% on services, 100% on webhook validation + rate limiting
- [ ] Railway production deploy verified (`main` branch)
- [ ] Vercel production deploy verified (`main` branch)
- [x] `.env.example` fully in sync with all variables actually used in code (superset: every var read from `process.env` is present)
- [ ] Final full SECURITY.md checklist pass before considering v1 "done"

---

## Open Questions / Needs Verification

_All three original open questions were resolved during the 2026-07-08 verification pass:_

- ✅ **Migration state for `agencies.whatsapp_phone_number_id` and `agency_users`** — both present. `agency_users` is in `20260702165344_initial_schema.sql`; `whatsapp_phone_number_id` was added by `20260707120000_add_agency_whatsapp_phone_number_id.sql`. Both reflected in the generated types.
- ✅ **Outbound `401 / code 190`** — resolved. It was the Argentine mobile `9` formatting, not a token/`\r` issue. Confirmed with a real live send (Epic 5).
- ✅ **`packages/types` real vs placeholder** — real generated types. `Database` includes `agencies` (with `whatsapp_phone_number_id`), `properties`, `leads`, `conversations`, `rate_limits`, and the `search_properties_semantic` function.

---

## How to use this file

1. Developer tells the ORCHESTRATOR to work on the next pending epic (or a specific one).
2. ORCHESTRATOR reads this file + `CLAUDE.md` + `ARCHITECTURE.md`, picks the next non-completed items respecting dependency order, and outputs its standard breakdown (Analysis / Task List / Open Questions / Security Considerations) **before** delegating anything.
3. Developer approves or adjusts the plan.
4. ORCHESTRATOR delegates to DB / CODER / SECURITY / TESTER / REVIEWER as needed.
5. Once validated, ORCHESTRATOR updates the checkboxes in this file and reports back.
