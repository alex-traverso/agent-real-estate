-- Agency onboarding: a Supabase Auth user created outside the WhatsApp/admin
-- flow (e.g. directly in the Supabase dashboard) has no agency_users row and
-- is rejected by SupabaseAuthGuard. This migration adds the pieces needed for
-- that user to create and link their own agency from the admin panel.

-- One user maps to at most one agency. The existing UNIQUE (agency_id,
-- user_id) only prevents a duplicate row for the *same* agency; nothing
-- stopped one user from being linked to two different agencies. Codifies an
-- assumption SupabaseAuthGuard already makes (.maybeSingle() on agency_users
-- by user_id) — without this, a double-submitted onboarding request could
-- link one user to two agencies and the guard would 500 instead of
-- resolving one. Many users -> one agency stays valid; the constraint only
-- forbids one user -> many agencies.
alter table agency_users
  add constraint agency_users_user_id_key unique (user_id);

-- Atomically creates an agency and links the calling user as its owner.
-- Both inserts run in the implicit transaction of the function call: if the
-- second insert fails (e.g. the user already has an agency), the first is
-- rolled back too, so a partial/orphaned agency row is never left behind —
-- important because agencies.email is UNIQUE and would otherwise block a
-- retry with "email already in use".
--
-- SECURITY INVOKER (the default) is deliberate: the API only ever calls this
-- with the service_role client, which already bypasses RLS, so there is no
-- need for SECURITY DEFINER's elevated privilege. EXECUTE is revoked from
-- PUBLIC and granted only to service_role — the browser's anon-key client
-- never calls this directly.
create or replace function create_agency_with_owner(
  p_name TEXT,
  p_email TEXT,
  p_phone TEXT,
  p_user_id UUID
)
returns agencies
language plpgsql
security invoker
set search_path = 'public'
as $$
declare
  v_agency agencies;
begin
  insert into agencies (name, email, phone)
  values (p_name, p_email, p_phone)
  returning * into v_agency;

  insert into agency_users (agency_id, user_id)
  values (v_agency.id, p_user_id);

  return v_agency;
end;
$$;

revoke execute on function create_agency_with_owner(TEXT, TEXT, TEXT, UUID) from public;
grant execute on function create_agency_with_owner(TEXT, TEXT, TEXT, UUID) to service_role;
