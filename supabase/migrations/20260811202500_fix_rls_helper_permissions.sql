-- RLS policies execute these private helpers as the authenticated role.
-- The private schema is not exposed by the Data API, so these grants do not
-- make the functions callable as public RPC endpoints.
grant usage on schema private to authenticated;
grant execute on function private.is_store_member(uuid, uuid) to authenticated;
grant execute on function private.can_manage_store(uuid, uuid) to authenticated;
