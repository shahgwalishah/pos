create or replace function private.store_role(target_store uuid, target_user uuid)
returns public.staff_role
language sql stable security definer set search_path = ''
as $$ select role from public.store_members where store_id = target_store and user_id = target_user $$;

revoke execute on function private.store_role(uuid, uuid) from public, anon, authenticated;
grant execute on function private.store_role(uuid, uuid) to authenticated;

drop policy if exists members_insert_store on public.store_members;
drop policy if exists members_update_store on public.store_members;
drop policy if exists members_delete_store on public.store_members;

create policy members_insert_store on public.store_members
for insert to authenticated
with check (
  private.store_role(store_id, (select auth.uid())) = 'owner'
  and role in ('manager', 'cashier')
  or private.store_role(store_id, (select auth.uid())) = 'manager'
  and role = 'cashier'
);

create policy members_update_store on public.store_members
for update to authenticated
using (
  role <> 'owner' and (
    private.store_role(store_id, (select auth.uid())) = 'owner'
    or private.store_role(store_id, (select auth.uid())) = 'manager' and role = 'cashier'
  )
)
with check (
  role <> 'owner' and (
    private.store_role(store_id, (select auth.uid())) = 'owner'
    or private.store_role(store_id, (select auth.uid())) = 'manager' and role = 'cashier'
  )
);

create policy members_delete_store on public.store_members
for delete to authenticated
using (
  role <> 'owner' and (
    private.store_role(store_id, (select auth.uid())) = 'owner'
    or private.store_role(store_id, (select auth.uid())) = 'manager' and role = 'cashier'
  )
);
