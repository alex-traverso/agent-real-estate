-- create_agency_with_owner's original parameter order (p_name, p_email,
-- p_phone, p_user_id) put phone before user_id. Making phone optional
-- requires DEFAULT NULL, but Postgres requires every parameter with a
-- default to trail every parameter without one — so phone must move after
-- user_id. Drops the original signature and recreates it with the corrected
-- order, so the generated TypeScript types mark p_phone as optional instead
-- of a required non-nullable string.
drop function if exists create_agency_with_owner(TEXT, TEXT, TEXT, UUID);

create or replace function create_agency_with_owner(
  p_name TEXT,
  p_email TEXT,
  p_user_id UUID,
  p_phone TEXT DEFAULT NULL
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

revoke execute on function create_agency_with_owner(TEXT, TEXT, UUID, TEXT) from public;
grant execute on function create_agency_with_owner(TEXT, TEXT, UUID, TEXT) to service_role;
