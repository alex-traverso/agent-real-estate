/**
 * Jest setupFile for the e2e suite. Runs once before the e2e spec files are
 * loaded (see test/jest-e2e.json → setupFiles).
 *
 * Booting the real AppModule instantiates every provider as a singleton —
 * including services whose constructors read (and some `getOrThrow`) their
 * config: SupabaseService, EmbeddingsService (OPENAI_API_KEY), NotificationsService
 * (RESEND_API_KEY), AgentService (ANTHROPIC_API_KEY), the messaging + auth layers.
 * None of them make a network call at construction, so dummy values are enough
 * to let the container come up. The webhook e2e spec overrides the boundary
 * services it actually exercises, so these dummies are never used to talk to a
 * real backend.
 *
 * META_APP_SECRET is the one value that must be real *to the test*: the webhook
 * spec signs its requests with it, so the spec reads it back from process.env
 * (single source of truth, they cannot drift). Set before ConfigModule runs so
 * these win over any developer `.env` (dotenv never overrides an already-set var).
 */
const TEST_ENV: Record<string, string> = {
  META_APP_SECRET: 'test-app-secret-e2e',
  META_VERIFY_TOKEN: 'test-verify-token',
  META_API_TOKEN: 'test-api-token',
  META_PHONE_NUMBER_ID: 'test-phone-number-id',
  SUPABASE_URL: 'http://localhost:54321',
  SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
  SUPABASE_ANON_KEY: 'test-anon-key',
  ANTHROPIC_API_KEY: 'test-anthropic-key',
  OPENAI_API_KEY: 'test-openai-key',
  OPENAI_EMBEDDING_MODEL: 'text-embedding-3-small',
  RESEND_API_KEY: 'test-resend-key',
};

for (const [key, value] of Object.entries(TEST_ENV)) {
  // Do not clobber a value already exported into the real environment.
  process.env[key] ??= value;
}
