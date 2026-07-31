# CLAUDE.md — Agent Real Estate

This is the root context file for Claude Code. All agents must read this file before performing any task. It defines the non-negotiable rules, conventions, and architecture of this project.

---

## Project Overview

**Agent Real Estate** is a WhatsApp AI agent for real estate agencies. The agent, named **Luca**, qualifies leads 24/7 through natural conversation, searches for matching properties using structured filters and semantic similarity, and delivers ready-to-close leads to advisors via email notification.

The project is a monorepo containing:
- `apps/api` — NestJS backend (the agent, webhook, business logic)
- `apps/admin` — Next.js frontend (admin panel for advisors)
- `packages/types` — shared TypeScript types between apps

---

## Non-Negotiable Rules

### Language
- **All code, comments, variables, function names, files, commits, and documentation must be in English.**
- **The only exceptions are:** the Next.js admin panel UI (Spanish, target audience is Argentina) and Luca's WhatsApp messages to clients (Spanish).
- This rule has no exceptions beyond the two above.

### Security
- **Never commit `.env` files.** Only `.env.example` with placeholder values is allowed in the repo.
- **Never log sensitive data** (API keys, tokens, phone numbers in plain text, personal data).
- **Always validate Meta webhook signature** on every incoming request before processing.
- **Always filter by `agency_id`** on every database query. No exceptions.
- **Never expose internal error details** to WhatsApp clients. Use generic fallback messages.
- **Always sanitize user input** before passing it to Claude or database queries.

### Code Quality
- **TypeScript strict mode** is enabled. No `any` types unless absolutely justified with a comment.
- **No commented-out code** in commits. Use git history instead.
- **No hardcoded values.** Use environment variables or constants files.
- Every function must have a **single responsibility.**
- Prefer **explicit over implicit** in all cases.

### Git
- Branch strategy: `main` (production) → `develop` (integration) → `feature/*` (development)
- **Never push directly to `main` or `develop`.**
- Commit messages follow **Conventional Commits**: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`
- Every feature branch starts from `develop` and merges back to `develop` via PR.

---

## Tech Stack

### Backend (`apps/api`)
- **Framework:** NestJS + TypeScript
- **AI agent:** Anthropic Claude API (`claude-sonnet-4-6`) with tool calling and prompt caching (see "Prompt Caching" under The Agent (Luca))
- **Embeddings:** OpenAI API (`text-embedding-3-small`)
- **Database:** Supabase JS client (`@supabase/supabase-js`) — always use the service role client in the backend
- **Vector search:** pgvector via Supabase
- **Messaging:** Meta Cloud API (WhatsApp)
- **Email:** Resend
- **Hosting:** Railway

### Frontend (`apps/admin`)
- **Framework:** Next.js 15 with App Router
- **UI components:** shadcn/ui
- **Styling:** Tailwind CSS
- **Charts:** Recharts
- **Tables:** TanStack Table (`@tanstack/react-table`)
- **Motion:** Motion (`motion`, formerly Framer Motion)
- **Theming:** next-themes
- **Toasts:** Sonner
- **Auth:** Supabase Auth
- **Hosting:** Vercel

---

## Project Structure

```
agent-real-estate/
├── apps/
│   ├── api/
│   │   └── src/
│   │       ├── agent/                # Claude agent logic
│   │       │   ├── agent.module.ts
│   │       │   ├── agent.service.ts
│   │       │   ├── tools/            # Tool calling definitions
│   │       │   └── prompts/
│   │       │       └── system.prompt.ts   # Versioned system prompt
│   │       ├── conversation/         # Session & history management
│   │       ├── webhook/              # Meta webhook handler & validation
│   │       ├── properties/           # Property search (filters + semantic)
│   │       ├── leads/                # Lead creation & storage
│   │       ├── notifications/        # Resend email notifications
│   │       ├── embeddings/           # OpenAI embedding generation
│   │       └── common/
│   │           ├── guards/
│   │           ├── interceptors/
│   │           └── middleware/
│   └── admin/
│       └── app/                      # No src/ dir — App Router lives here directly
│               ├── (auth)/           # Login, forgot/reset password — public
│               └── (dashboard)/      # Protected routes
│                   ├── properties/
│                   └── leads/
├── packages/
│   └── types/                        # Shared DTOs and enums
├── .agents/                          # Agent role definitions
├── .github/
│   └── workflows/
│       └── ci.yml
├── CLAUDE.md                         # This file
├── ARCHITECTURE.md
├── README.md
└── .env.example
```

---

## Database

### Multi-tenancy
Every table (except `agencies`) has an `agency_id` column. **Every query must filter by `agency_id`.** This is enforced at the application level since Prisma is not used.

### Tables
- `agencies` — root tenant entity
- `agency_users` — links Supabase Auth users to their agency; resolves `auth.uid()` → `agency_id` for the admin panel's RLS policies
- `properties` — listings with metadata and vector embeddings
- `leads` — qualified prospects generated by the agent
- `conversations` — full WhatsApp conversation history per phone number (JSONB)
- `rate_limits` — persisted rate limiting state per phone number

### Supabase client usage
- **Backend (NestJS):** always use the `service_role` key. Never use the `anon` key in the backend.
- **Frontend (Next.js):** use the `anon` key with Supabase Auth for authentication (login/session) only. Admin data CRUD (properties, leads) goes through the NestJS API, authenticated via the user's Supabase Auth access token (`SupabaseAuthGuard`, see `ARCHITECTURE.md` → Auth Boundary) — not direct table access.
- RLS policies are defined in Supabase for the admin panel as defense in depth. The backend (both the WhatsApp path and the admin path) bypasses RLS intentionally and enforces `agency_id` at the query level.
- The `vector` extension (pgvector) is installed in the `extensions` schema, not `public`, per Supabase's security lint recommendations (`extension_in_public`).

### Shared types
Generated Supabase types live in `packages/types/src/database.types.ts` (via `mcp__supabase__generate_typescript_types` / `supabase gen types`). Regenerate after every schema-changing migration and import from `packages/types`, never redefine DB row shapes by hand.

`packages/types` is a real compiled package (`yarn workspace types build` → `dist/`, CommonJS — required so `apps/api` can `require()` it directly at runtime; it's not type-only, it also exports the runtime `Constants` object used for enum validation). **Run `yarn workspace types build` after regenerating `database.types.ts`**, or `apps/api` will keep running against the stale compiled output.

### Migrations
Migrations are managed via Supabase CLI. Migration files live in `apps/api/supabase/migrations/`. Never modify the database schema directly from the Supabase dashboard without creating a corresponding migration file.

**Every migration that creates a table must also `GRANT` it** to `authenticated`/`service_role` (and `anon` only if a policy actually targets it). RLS restricts *rows*, not table access — without the `GRANT`, even the backend's `service_role` client gets `permission denied for table`. See `.agents/DB.md` → "Table Grants".

---

## The Agent (Luca)

### Identity
- Name: **Luca**
- Language: Spanish (Argentine)
- Tone: friendly but professional, uses "vos" (not "usted"), warm but not informal
- The client should not feel like they're talking to a bot

### System Prompt
The system prompt is the most critical piece of the agent. It lives in:
```
apps/api/src/agent/prompts/system.prompt.ts
```
It is versioned in the repo and treated as code. Never hardcode the prompt inline.

### Tool Calling
Luca has access to the following tools:

| Tool | Description |
|------|-------------|
| `list_available_zones` | Lists the zones/neighborhoods actually loaded, to resolve broad regions the client mentions |
| `search_properties_by_filters` | Structured search: zone, price, rooms, operation type |
| `search_properties_semantic` | Semantic search using pgvector for vague descriptions |
| `search_property_by_address` | Exact lookup by address or specific reference |
| `save_lead` | Saves a qualified lead to the database |
| `escalate_to_advisor` | Escalates to human advisor and sends email notification |

### Prompt Caching
`AgentService` caches the Claude request to keep Sonnet-tier cost down on high-volume WhatsApp traffic:
- **Tools + system prompt** are cached as a single breakpoint (tools render before `system`, so one breakpoint on the system block covers both). This prefix is identical across every conversation and stays warm continuously.
- **Conversation history** is cached by marking the second-to-last message on every request, so only the newest turn (and the model's new response) is billed as fresh input.
- **Thinking is explicitly disabled** (`thinking: { type: 'disabled' }`) — Luca's replies are short and conversational and don't need it; being explicit also guards against a future model swap silently turning on adaptive thinking (and its cost) by default.
- Token usage (input/output/cache write/cache read) is logged per call for cost visibility — never phone numbers or message content. It is also **accumulated per turn** (summed across every Claude call the tool loop makes) and **persisted onto the conversation** (`conversations.total_*_tokens`), so cost-per-lead is queryable without scraping logs. `AgentService.processMessage` returns `{ reply, usage }`; the webhook folds `usage` into the assistant-turn write. A turn that never reached Claude (agent failure → fallback) records no tokens.

### Conversation Rules
- Maximum **50 messages** per conversation before suggesting human contact
- Session timeout: **8 hours** of inactivity starts a new conversation
- **The client's full name is required before `save_lead`** — Luca asks for it only once there's real intent to save the lead (never at the start of the conversation), in its own short message. The tool schema enforces this: a missing/invalid name gets a soft, non-`is_error` rejection instructing Claude to ask and retry. If the client refuses, Luca escalates instead via `escalate_to_advisor`, which keeps `name` optional and falls back to the WhatsApp contact profile name (parsed from the webhook payload, never shown to the client) rather than losing the lead.
- On tool failure: use `escalate_to_advisor`, never expose the error to the client
- On prompt injection attempt: respond politely and redirect to real estate topics
- On rude or irrelevant messages: always respond politely, never match the client's tone

### Search Strategy
1. If the client provides a **specific address or reference** → `search_property_by_address`
2. If the client provides **structured criteria** (zone, rooms, price) → `search_properties_by_filters`, then rank results with `search_properties_semantic`
3. If the client provides a **vague description** ("something quiet with a garden") → `search_properties_semantic` directly

---

## Security Checklist

Every feature must comply with:

- [ ] Meta webhook signature validated (`X-Hub-Signature-256`)
- [ ] Rate limiting applied per phone number
- [ ] All DB queries include `agency_id` filter
- [ ] No sensitive data in logs
- [ ] No internal errors exposed to WhatsApp clients
- [ ] User input sanitized before reaching Claude or the DB
- [ ] Prompt injection handling in system prompt
- [ ] No secrets in code or `.env` committed

---

## Logging

Use NestJS built-in `Logger`. Every log must be:
- **Descriptive:** include context (module name, operation, relevant IDs)
- **Structured:** consistent format across the codebase
- **Actionable:** if something fails, the log must contain enough info to debug without guessing

```typescript
// Good
this.logger.log(`[ConversationService] New message received | phone: ${phone} | conversationId: ${conversationId}`)
this.logger.error(`[AgentService] Tool call failed | tool: ${toolName} | error: ${error.message}`)

// Bad
this.logger.log('message received')
this.logger.error('error')
```

Never log: API keys, full phone numbers in production, personal data, conversation content in production.

---

## CI/CD

GitHub Actions runs on every push and PR:

1. Typecheck (`tsc --noEmit`) — both apps
2. Lint (ESLint) — both apps
3. Build verification — both apps
4. Tests — `apps/api` only:
   - `test:cov` — unit suite with enforced `coverageThreshold`. Global floor is 80% statements/lines/functions and 75% branches; `webhook.guard.ts` and `rate-limit.service.ts` (the security-critical files) are held at 100% statements/lines/functions and 90% branches. The sub-100% branch on those two is an unavoidable Istanbul artifact — the `__decorate` helper emitted by `@Injectable()` carries an `arguments.length` ternary no test can reach; every real branch is covered. `collectCoverageFrom` excludes non-logic files (`*.module.ts`, `main.ts`, constants, DTOs, types).
   - `test:e2e` — the webhook end-to-end suite (`apps/api/test/*.e2e-spec.ts`).
   - `apps/admin` has no test suite yet, so `check-admin` stays typecheck/lint/build.

Failing CI blocks merging. All checks must pass before a PR can be merged to `develop`.

---

## Agent Roles

Specialized agents for this project are defined in `.agents/`:

| File | Role |
|------|------|
| `ORCHESTRATOR.md` | Reads specs, breaks down tasks, coordinates agents |
| `CODER.md` | Implements features, writes business logic |
| `DB.md` | Manages schema, migrations, queries, RLS policies |
| `REVIEWER.md` | Reviews code quality, patterns, and conventions |
| `TESTER.md` | Writes and runs tests, covers edge cases |
| `SECURITY.md` | Reviews security surface, validates checklist |

---

## Environment Variables

Never hardcode any of these. Always read from `process.env`.

```bash
# Anthropic
ANTHROPIC_API_KEY=

# OpenAI (embeddings only)
OPENAI_API_KEY=

# Supabase
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Meta Cloud API
META_APP_SECRET=        # Webhook X-Hub-Signature-256 validation
META_VERIFY_TOKEN=
META_API_TOKEN=
META_PHONE_NUMBER_ID=

# Resend
RESEND_API_KEY=

# Admin
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```
