create or replace function public.get_store_staff(target_store uuid)
returns table (
  user_id uuid,
  full_name text,
  email text,
  role public.staff_role,
  joined_at timestamptz,
  sales_count bigint,
  sales_total numeric
)
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null or not private.is_store_member(target_store, auth.uid()) then
    raise exception 'Store access denied';
  end if;
  return query
  select sm.user_id, p.full_name, u.email::text, sm.role, sm.created_at,
    count(s.id) filter (where s.status = 'completed'),
    coalesce(sum(s.total) filter (where s.status = 'completed'), 0)
  from public.store_members sm
  join public.profiles p on p.id = sm.user_id
  join auth.users u on u.id = sm.user_id
  left join public.sales s on s.store_id = sm.store_id and s.cashier_id = sm.user_id
  where sm.store_id = target_store
  group by sm.user_id, p.full_name, u.email, sm.role, sm.created_at
  order by case sm.role when 'owner' then 1 when 'manager' then 2 else 3 end, p.full_name;
end;
$$;

create or replace function public.add_store_staff(
  target_store uuid,
  staff_email text,
  staff_access public.staff_role default 'cashier'
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  actor_role public.staff_role;
  target_user_id uuid;
begin
  select role into actor_role from public.store_members
  where store_id = target_store and user_id = current_user_id;
  if actor_role not in ('owner', 'manager') then raise exception 'Manager access required'; end if;
  if staff_access = 'owner' then raise exception 'Owner role cannot be assigned'; end if;
  if actor_role = 'manager' and staff_access <> 'cashier' then raise exception 'Managers can only add cashiers'; end if;

  select id into target_user_id from auth.users where lower(email) = lower(trim(staff_email));
  if target_user_id is null then raise exception 'No registered account found for this email'; end if;
  if target_user_id = current_user_id then raise exception 'You are already a store member'; end if;

  insert into public.store_members (store_id, user_id, role)
  values (target_store, target_user_id, staff_access)
  on conflict (store_id, user_id) do update set role = excluded.role;
  return target_user_id;
end;
$$;

create or replace function public.update_store_staff_role(
  target_store uuid,
  target_user uuid,
  staff_access public.staff_role
)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  actor_role public.staff_role;
  target_role public.staff_role;
begin
  select role into actor_role from public.store_members where store_id = target_store and user_id = current_user_id;
  select role into target_role from public.store_members where store_id = target_store and user_id = target_user;
  if actor_role not in ('owner', 'manager') then raise exception 'Manager access required'; end if;
  if target_role is null then raise exception 'Staff member not found'; end if;
  if target_role = 'owner' or staff_access = 'owner' then raise exception 'Owner role cannot be changed'; end if;
  if actor_role = 'manager' and (target_role <> 'cashier' or staff_access <> 'cashier') then
    raise exception 'Managers cannot manage other managers';
  end if;
  update public.store_members set role = staff_access where store_id = target_store and user_id = target_user;
end;
$$;

create or replace function public.remove_store_staff(target_store uuid, target_user uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  actor_role public.staff_role;
  target_role public.staff_role;
begin
  select role into actor_role from public.store_members where store_id = target_store and user_id = current_user_id;
  select role into target_role from public.store_members where store_id = target_store and user_id = target_user;
  if actor_role not in ('owner', 'manager') then raise exception 'Manager access required'; end if;
  if target_role is null then raise exception 'Staff member not found'; end if;
  if target_role = 'owner' then raise exception 'Store owner cannot be removed'; end if;
  if actor_role = 'manager' and target_role <> 'cashier' then raise exception 'Managers can only remove cashiers'; end if;
  delete from public.store_members where store_id = target_store and user_id = target_user;
end;
$$;

revoke execute on function public.get_store_staff(uuid) from public, anon;
revoke execute on function public.add_store_staff(uuid, text, public.staff_role) from public, anon;
revoke execute on function public.update_store_staff_role(uuid, uuid, public.staff_role) from public, anon;
revoke execute on function public.remove_store_staff(uuid, uuid) from public, anon;
grant execute on function public.get_store_staff(uuid) to authenticated;
grant execute on function public.add_store_staff(uuid, text, public.staff_role) to authenticated;
grant execute on function public.update_store_staff_role(uuid, uuid, public.staff_role) to authenticated;
grant execute on function public.remove_store_staff(uuid, uuid) to authenticated;
