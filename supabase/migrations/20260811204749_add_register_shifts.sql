create type public.shift_status as enum ('open', 'closed');

create table public.register_shifts (
  id bigint generated always as identity primary key,
  store_id uuid not null references public.stores(id) on delete restrict,
  opened_by uuid not null references auth.users(id) on delete restrict,
  closed_by uuid references auth.users(id) on delete restrict,
  status public.shift_status not null default 'open',
  opening_cash numeric(12,2) not null default 0 check (opening_cash >= 0),
  expected_cash numeric(12,2) check (expected_cash is null or expected_cash >= 0),
  closing_cash numeric(12,2) check (closing_cash is null or closing_cash >= 0),
  cash_difference numeric(12,2),
  opening_note varchar(240),
  closing_note varchar(240),
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  check (
    (status = 'open' and closed_by is null and closed_at is null)
    or (status = 'closed' and closed_by is not null and closed_at is not null)
  )
);

alter table public.sales
  add column shift_id bigint references public.register_shifts(id) on delete restrict;

create unique index register_shifts_one_open_user_idx
  on public.register_shifts (store_id, opened_by) where status = 'open';
create index register_shifts_store_opened_idx
  on public.register_shifts (store_id, opened_at desc);
create index sales_shift_id_idx on public.sales (shift_id) where shift_id is not null;

alter table public.register_shifts enable row level security;

create policy register_shifts_select_store on public.register_shifts
  for select to authenticated
  using (private.is_store_member(store_id, (select auth.uid())));

create or replace function public.open_register_shift(
  target_store uuid,
  opening_amount numeric default 0,
  shift_note text default null
)
returns public.register_shifts
language plpgsql security definer set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  new_shift public.register_shifts;
begin
  if current_user_id is null or not private.is_store_member(target_store, current_user_id) then
    raise exception 'Store access denied';
  end if;
  if opening_amount < 0 then raise exception 'Opening cash cannot be negative'; end if;

  insert into public.register_shifts (store_id, opened_by, opening_cash, opening_note)
  values (target_store, current_user_id, opening_amount, nullif(trim(shift_note), ''))
  returning * into new_shift;
  return new_shift;
exception when unique_violation then
  raise exception 'You already have an open shift';
end;
$$;

create or replace function public.link_sale_shift(target_sale bigint, target_shift bigint)
returns void
language plpgsql security definer set search_path = ''
as $$
declare current_user_id uuid := auth.uid();
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;
  if not exists (
    select 1 from public.sales s
    join public.register_shifts rs on rs.id = target_shift
    where s.id = target_sale
      and s.store_id = rs.store_id
      and s.cashier_id = current_user_id
      and rs.opened_by = current_user_id
      and rs.status = 'open'
  ) then raise exception 'Sale or open shift not found'; end if;
  update public.sales set shift_id = target_shift where id = target_sale and shift_id is null;
end;
$$;

create or replace function public.close_register_shift(
  target_shift bigint,
  closing_amount numeric,
  shift_note text default null
)
returns public.register_shifts
language plpgsql security definer set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  shift_row public.register_shifts;
  cash_sales numeric(12,2);
begin
  if closing_amount < 0 then raise exception 'Closing cash cannot be negative'; end if;
  select * into shift_row from public.register_shifts where id = target_shift for update;
  if not found or shift_row.status <> 'open' then raise exception 'Open shift not found'; end if;
  if current_user_id is null or not private.is_store_member(shift_row.store_id, current_user_id) then
    raise exception 'Store access denied';
  end if;
  if shift_row.opened_by <> current_user_id and not private.can_manage_store(shift_row.store_id, current_user_id) then
    raise exception 'Only the cashier or a manager can close this shift';
  end if;

  select coalesce(sum(p.amount), 0) into cash_sales
  from public.sales s
  join public.payments p on p.sale_id = s.id and p.kind = 'cash'
  where s.shift_id = target_shift and s.status = 'completed';

  update public.register_shifts
  set status = 'closed', closed_by = current_user_id, closed_at = now(),
      expected_cash = opening_cash + cash_sales,
      closing_cash = closing_amount,
      cash_difference = closing_amount - (opening_cash + cash_sales),
      closing_note = nullif(trim(shift_note), '')
  where id = target_shift
  returning * into shift_row;
  return shift_row;
end;
$$;

grant select on public.register_shifts to authenticated;
grant usage, select on sequence public.register_shifts_id_seq to authenticated;
revoke execute on function public.open_register_shift(uuid, numeric, text) from public, anon;
revoke execute on function public.link_sale_shift(bigint, bigint) from public, anon;
revoke execute on function public.close_register_shift(bigint, numeric, text) from public, anon;
grant execute on function public.open_register_shift(uuid, numeric, text) to authenticated;
grant execute on function public.link_sale_shift(bigint, bigint) to authenticated;
grant execute on function public.close_register_shift(bigint, numeric, text) to authenticated;
